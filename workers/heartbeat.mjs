/**
 * Heartbeat — the system's pulse.
 * Runs on a schedule (e.g. every 5 minutes via cron) or as a
 * long-running loop. Evaluates triggers, processes reactions,
 * and recovers stuck tasks.
 */
import "./lib/env.mjs";
import { sb } from "./lib/supabase.mjs";
import { createProposal } from "./lib/proposal-service.mjs";

const HEARTBEAT_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS ?? "300000", 10); // default 5 min
const STALE_STEP_MINUTES = 30;

// ── Trigger evaluation ─────────────────────────────────────

async function evaluateTriggers() {
  const { data: rules } = await sb
    .from("ops_trigger_rules")
    .select("*")
    .eq("enabled", true);

  if (!rules?.length) return { evaluated: 0, fired: 0 };

  let fired = 0;

  for (const rule of rules) {
    // Check cooldown
    if (rule.last_fired_at) {
      const elapsed = Date.now() - new Date(rule.last_fired_at).getTime();
      if (elapsed < rule.cooldown_minutes * 60_000) continue;
    }

    // For proactive triggers, apply skip probability (10-15% chance of skip)
    if (rule.trigger_event.startsWith("proactive_")) {
      if (Math.random() < 0.12) continue;
    }

    // Try to fire
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

      // Update fire count and last_fired_at
      await sb
        .from("ops_trigger_rules")
        .update({
          fire_count: (rule.fire_count ?? 0) + 1,
          last_fired_at: new Date().toISOString(),
        })
        .eq("id", rule.id);

      fired++;
    } catch (err) {
      console.error(`Trigger ${rule.name} failed:`, err.message);
    }
  }

  return { evaluated: rules.length, fired };
}

// ── Reaction queue processing ──────────────────────────────

async function processReactionQueue() {
  const { data: reactions } = await sb
    .from("ops_agent_reactions")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(5);

  if (!reactions?.length) return { processed: 0 };

  let processed = 0;

  for (const reaction of reactions) {
    try {
      // Mark as processing
      await sb
        .from("ops_agent_reactions")
        .update({ status: "processing" })
        .eq("id", reaction.id);

      // Create a proposal for the target agent
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

      await sb
        .from("ops_agent_reactions")
        .update({ status: "completed" })
        .eq("id", reaction.id);

      processed++;
    } catch (err) {
      console.error(`Reaction ${reaction.id} failed:`, err.message);
      await sb
        .from("ops_agent_reactions")
        .update({ status: "failed" })
        .eq("id", reaction.id);
    }
  }

  return { processed };
}

// ── Stale step recovery ────────────────────────────────────

async function recoverStaleSteps() {
  const cutoff = new Date(Date.now() - STALE_STEP_MINUTES * 60_000).toISOString();

  const { data: stale } = await sb
    .from("ops_mission_steps")
    .select("id, mission_id")
    .eq("status", "running")
    .lt("updated_at", cutoff);

  if (!stale?.length) return { recovered: 0 };

  for (const step of stale) {
    await sb
      .from("ops_mission_steps")
      .update({
        status: "failed",
        error: `Stale: running for >${STALE_STEP_MINUTES}min with no progress`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", step.id);
  }

  return { recovered: stale.length };
}

// ── Stale roundtable recovery ──────────────────────────────

async function recoverStaleRoundtables() {
  const cutoff = new Date(Date.now() - 30 * 60_000).toISOString();

  const { data: stale } = await sb
    .from("ops_roundtable_queue")
    .select("id")
    .eq("status", "running")
    .lt("started_at", cutoff);

  if (!stale?.length) return { recovered: 0 };

  for (const rt of stale) {
    await sb
      .from("ops_roundtable_queue")
      .update({ status: "failed", completed_at: new Date().toISOString() })
      .eq("id", rt.id);
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

  // Audit log
  await sb.from("ops_action_runs").insert({
    action: "heartbeat",
    status: "succeeded",
    result: results,
    duration_ms: durationMs,
  });

  console.log(`[heartbeat] ${durationMs}ms`, JSON.stringify(results));
}

// ── Main ───────────────────────────────────────────────────

console.log(`Heartbeat starting (interval: ${HEARTBEAT_INTERVAL_MS}ms)`);
await runHeartbeat(); // run once immediately

setInterval(runHeartbeat, HEARTBEAT_INTERVAL_MS);
