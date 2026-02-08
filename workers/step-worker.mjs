/**
 * Step worker — executes queued mission steps via Ollama.
 * Run on Boomer (or wherever Ollama runs): OLLAMA_BASE_URL=http://localhost:11434
 * Run elsewhere: OLLAMA_BASE_URL=http://boomer:11434
 */
import "./lib/env.mjs";
import { query } from "./lib/db.mjs";
import { complete } from "./lib/llm.mjs";

const WORKER_ID = process.env.WORKER_ID || "step-worker-1";
const POLL_MS = parseInt(process.env.POLL_INTERVAL_MS || "15000", 10);
const STEP_KINDS = ["analyze"]; // MVP: only analyze

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function emitEvent(agentId, kind, title, summary) {
  await query(
    `INSERT INTO ops_agent_events (agent_id, kind, title, summary, tags)
     VALUES ($1, $2, $3, $4, $5)`,
    [agentId, kind, title, summary, [kind]]
  );
}

async function executeStep(step, mission) {
  const { kind, payload } = step;
  const agentId = mission.created_by;

  if (kind === "analyze") {
    const topic = payload.topic || payload.source || "general";
    const reply = await complete([
      {
        role: "user",
        content: `You are an analyst at emTesseract (game dev company). In 2–3 sentences, analyze: "${topic}". Be concise.`,
      },
    ]);
    return {
      result: { analysis: reply },
      event: { kind: "analyze_complete", title: `Analyzed: ${topic}`, summary: reply.slice(0, 200) },
    };
  }

  throw new Error(`Unknown step kind: ${kind}`);
}

async function finalizeMission(missionId) {
  const { rows: steps } = await query(
    "SELECT status FROM ops_mission_steps WHERE mission_id = $1",
    [missionId]
  );
  const hasFailed = steps?.some((s) => s.status === "failed");
  const allDone = steps?.every((s) => s.status === "succeeded" || s.status === "failed");

  if (allDone) {
    await query(
      "UPDATE ops_missions SET status = $1, updated_at = $2 WHERE id = $3",
      [hasFailed ? "failed" : "succeeded", new Date().toISOString(), missionId]
    );
  }
}

async function runOnce() {
  for (const kind of STEP_KINDS) {
    const { rows: steps } = await query(
      `SELECT id, mission_id, kind, payload FROM ops_mission_steps
       WHERE status = 'queued' AND kind = $1
       ORDER BY created_at ASC LIMIT 1`,
      [kind]
    );

    if (!steps?.length) continue;

    const step = steps[0];

    const { rows: claimed } = await query(
      `UPDATE ops_mission_steps
       SET status = 'running', reserved_by = $1, updated_at = $2
       WHERE id = $3 AND status = 'queued'
       RETURNING id, mission_id`,
      [WORKER_ID, new Date().toISOString(), step.id]
    );

    if (!claimed?.length) continue;

    const { rows: mission } = await query(
      "SELECT id, created_by, title FROM ops_missions WHERE id = $1",
      [claimed[0].mission_id]
    );
    if (!mission?.length) continue;

    const m = mission[0];

    try {
      const { result, event } = await executeStep(step, m);
      await query(
        `UPDATE ops_mission_steps SET status = 'succeeded', result = $1, updated_at = $2 WHERE id = $3`,
        [JSON.stringify(result), new Date().toISOString(), step.id]
      );
      await emitEvent(m.created_by, event.kind, event.title, event.summary);
      await finalizeMission(claimed[0].mission_id);
      console.log(`[${WORKER_ID}] ${kind} succeeded: ${step.id}`);
    } catch (err) {
      console.error(`[${WORKER_ID}] ${kind} failed:`, err.message);
      await query(
        `UPDATE ops_mission_steps SET status = 'failed', error = $1, updated_at = $2 WHERE id = $3`,
        [err.message, new Date().toISOString(), step.id]
      );
      await emitEvent(m.created_by, "step_failed", `Step failed: ${kind}`, err.message);
      await finalizeMission(claimed[0].mission_id);
    }

    return;
  }
}

async function main() {
  console.log(`[${WORKER_ID}] Starting (Ollama, poll ${POLL_MS}ms)`);

  while (true) {
    try {
      await runOnce();
    } catch (err) {
      console.error(`[${WORKER_ID}] Error:`, err.message);
    }
    await sleep(POLL_MS);
  }
}

main();
