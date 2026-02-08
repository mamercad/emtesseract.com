/**
 * Heartbeat — the system's pulse.
 * Runs on a schedule (e.g. every 5 minutes via cron) or as a
 * long-running loop. Evaluates triggers, processes reactions,
 * and recovers stuck tasks.
 */
import "./lib/env.mjs";
import { query } from "./lib/db.mjs";
import { createProposal } from "./lib/proposal-service.mjs";

const HEARTBEAT_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS ?? "300000", 10); // default 5 min
const STALE_STEP_MINUTES = 30;

// ── Trigger evaluation ─────────────────────────────────────

async function evaluateTriggers() {
  const { rows: rules, error } = await query(
    "SELECT * FROM ops_trigger_rules WHERE enabled = true"
  );

  if (error || !rules?.length) return { evaluated: 0, fired: 0 };

  let fired = 0;

  for (const rule of rules) {
    if (rule.last_fired_at) {
      const elapsed = Date.now() - new Date(rule.last_fired_at).getTime();
      if (elapsed < rule.cooldown_minutes * 60_000) continue;
    }

    if (rule.trigger_event.startsWith("proactive_")) {
      if (Math.random() < 0.12) continue;
    }

    const target = rule.action_config?.target_agent;
    if (!target) continue;

    try {
      await createProposal({
        agentId: target,
        title: `[trigger] ${rule.name}`,
        proposedSteps: rule.action_config.steps ?? [
          { kind: "analyze", payload: { source: rule.trigger_event } },
        ],
      });

      await query(
        `UPDATE ops_trigger_rules SET fire_count = $1, last_fired_at = $2 WHERE id = $3`,
        [(rule.fire_count ?? 0) + 1, new Date().toISOString(), rule.id]
      );

      fired++;
    } catch (err) {
      console.error(`Trigger ${rule.name} failed:`, err.message);
    }
  }

  return { evaluated: rules.length, fired };
}

// ── Reaction queue processing ──────────────────────────────

async function processReactionQueue() {
  const { rows: reactions, error } = await query(
    `SELECT * FROM ops_agent_reactions WHERE status = 'pending'
     ORDER BY created_at ASC LIMIT 5`
  );

  if (error || !reactions?.length) return { processed: 0 };

  let processed = 0;

  for (const reaction of reactions) {
    try {
      await query(
        "UPDATE ops_agent_reactions SET status = 'processing' WHERE id = $1",
        [reaction.id]
      );

      await createProposal({
        agentId: reaction.target_agent,
        title: `[reaction] ${reaction.reaction_type} from ${reaction.source_agent}`,
        proposedSteps: [
          {
            kind: reaction.reaction_type,
            payload: {
              source_agent: reaction.source_agent,
              source_event_id: reaction.source_event_id,
              ...(reaction.metadata ?? {}),
            },
          },
        ],
      });

      await query(
        "UPDATE ops_agent_reactions SET status = 'completed' WHERE id = $1",
        [reaction.id]
      );

      processed++;
    } catch (err) {
      console.error(`Reaction ${reaction.id} failed:`, err.message);
      await query(
        "UPDATE ops_agent_reactions SET status = 'failed' WHERE id = $1",
        [reaction.id]
      );
    }
  }

  return { processed };
}

// ── Stale step recovery ────────────────────────────────────

async function recoverStaleSteps() {
  const cutoff = new Date(Date.now() - STALE_STEP_MINUTES * 60_000).toISOString();

  const { rows: stale, error } = await query(
    `SELECT id, mission_id FROM ops_mission_steps
     WHERE status = 'running' AND updated_at < $1`,
    [cutoff]
  );

  if (error || !stale?.length) return { recovered: 0 };

  for (const step of stale) {
    await query(
      `UPDATE ops_mission_steps SET status = 'failed', error = $1, updated_at = $2 WHERE id = $3`,
      [
        `Stale: running for >${STALE_STEP_MINUTES}min with no progress`,
        new Date().toISOString(),
        step.id,
      ]
    );
  }

  return { recovered: stale.length };
}

// ── Stale roundtable recovery ──────────────────────────────

async function recoverStaleRoundtables() {
  const cutoff = new Date(Date.now() - 30 * 60_000).toISOString();

  const { rows: stale, error } = await query(
    `SELECT id FROM ops_roundtable_queue WHERE status = 'running' AND started_at < $1`,
    [cutoff]
  );

  if (error || !stale?.length) return { recovered: 0 };

  for (const rt of stale) {
    await query(
      `UPDATE ops_roundtable_queue SET status = 'failed', completed_at = $1 WHERE id = $2`,
      [new Date().toISOString(), rt.id]
    );
  }

  return { recovered: stale.length };
}

// ── Heartbeat loop ─────────────────────────────────────────

async function runHeartbeat() {
  const start = Date.now();
  const results = {};

  const jobs = [
    ["triggers", evaluateTriggers],
    ["reactions", processReactionQueue],
    ["stale_steps", recoverStaleSteps],
    ["stale_roundtables", recoverStaleRoundtables],
  ];

  for (const [name, fn] of jobs) {
    try {
      results[name] = await fn();
    } catch (err) {
      console.error(`Heartbeat job "${name}" failed:`, err.message);
      results[name] = { error: err.message };
    }
  }

  const durationMs = Date.now() - start;

  await query(
    `INSERT INTO ops_action_runs (action, status, result, duration_ms)
     VALUES ('heartbeat', 'succeeded', $1, $2)`,
    [JSON.stringify(results), durationMs]
  );

  console.log(`[heartbeat] ${durationMs}ms`, JSON.stringify(results));
}

// ── Main ───────────────────────────────────────────────────

console.log(`Heartbeat starting (interval: ${HEARTBEAT_INTERVAL_MS}ms)`);
await runHeartbeat();

setInterval(runHeartbeat, HEARTBEAT_INTERVAL_MS);
