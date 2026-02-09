/**
 * Content worker — executes write_content steps via Ollama.
 * Run on Boomer (or wherever Ollama runs): OLLAMA_BASE_URL=http://localhost:11434
 */
import "./lib/env.mjs";
import { query } from "./lib/db.mjs";
import { complete } from "./lib/llm.mjs";

const WORKER_ID = process.env.WORKER_ID || "content-worker-1";
const POLL_MS = parseInt(process.env.POLL_INTERVAL_MS || "15000", 10);
const STEP_KIND = "write_content";

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

async function getAgentMemories(agentId, limit = 5) {
  const { rows } = await query(
    `SELECT type, content FROM ops_agent_memory
     WHERE agent_id = $1 AND confidence >= 0.6
     ORDER BY created_at DESC LIMIT $2`,
    [agentId, limit]
  );
  return rows || [];
}

async function executeWriteContent(step, mission) {
  const { payload } = step;
  const agentId = mission.created_by;

  const memories = await getAgentMemories(agentId);
  const memoryContext =
    memories.length > 0
      ? `\n\nRelevant context from experience:\n${memories.map((m) => `- [${m.type}] ${m.content}`).join("\n")}\n`
      : "";

  const topic = payload.topic || payload.brief || "company update";
  const artifactId = payload.artifact_id || null;
  let prompt = `You are the content writer at emTesseract, a family game development company.${memoryContext}\n`;
  let existingContent = "";

  if (artifactId) {
    const { rows: art } = await query(
      "SELECT content FROM ops_artifacts WHERE id = $1",
      [artifactId]
    );
    if (art?.length && art[0].content) {
      existingContent = art[0].content;
      prompt += `Revise this draft (keep it 2–4 sentences, engaging, on-brand):\n\n---\n${existingContent}\n---\n\nTopic: "${topic}". Write the improved version:`;
    }
  }
  if (!existingContent) {
    prompt += `Write a short draft (2–4 sentences) for: "${topic}". Tone: engaging, clear, on-brand.`;
  }

  const reply = await complete([{ role: "user", content: prompt }]);

  let finalArtifactId = artifactId;
  const missionId = step.mission_id;
  const title = (mission?.title || topic || "Draft").slice(0, 200);

  if (artifactId) {
    await query(
      `UPDATE ops_artifacts SET content = $1, updated_by = $2, updated_at = $3 WHERE id = $4`,
      [reply, agentId, new Date().toISOString(), artifactId]
    );
  } else {
    const { rows: ins } = await query(
      `INSERT INTO ops_artifacts (title, content, mission_id, step_id, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [title, reply, missionId, step.id, agentId, new Date().toISOString()]
    );
    finalArtifactId = ins?.[0]?.id;
  }

  return {
    result: { draft: reply, artifact_id: finalArtifactId },
    event: { kind: "write_content_complete", title: `Draft: ${topic}`, summary: reply.slice(0, 200) },
  };
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
  const { rows: steps } = await query(
    `SELECT id, mission_id, kind, payload FROM ops_mission_steps
     WHERE status = 'queued' AND kind = $1
     ORDER BY created_at ASC LIMIT 1`,
    [STEP_KIND]
  );

  if (!steps?.length) return;

  const step = steps[0];

  const { rows: claimed } = await query(
    `UPDATE ops_mission_steps
     SET status = 'running', reserved_by = $1, updated_at = $2
     WHERE id = $3 AND status = 'queued'
     RETURNING id, mission_id`,
    [WORKER_ID, new Date().toISOString(), step.id]
  );

  if (!claimed?.length) return;

  const { rows: mission } = await query(
    "SELECT id, created_by, title FROM ops_missions WHERE id = $1",
    [claimed[0].mission_id]
  );
  if (!mission?.length) return;

  const m = mission[0];

  try {
    const { result, event } = await executeWriteContent(step, m);
    await query(
      `UPDATE ops_mission_steps SET status = 'succeeded', result = $1, updated_at = $2 WHERE id = $3`,
      [JSON.stringify(result), new Date().toISOString(), step.id]
    );
    await emitEvent(m.created_by, event.kind, event.title, event.summary);
    await finalizeMission(claimed[0].mission_id);
    console.log(`[${WORKER_ID}] ${STEP_KIND} succeeded: ${step.id}`);
  } catch (err) {
    console.error(`[${WORKER_ID}] ${STEP_KIND} failed:`, err.message);
    await query(
      `UPDATE ops_mission_steps SET status = 'failed', error = $1, updated_at = $2 WHERE id = $3`,
      [err.message, new Date().toISOString(), step.id]
    );
    await emitEvent(m.created_by, "step_failed", `Step failed: ${STEP_KIND}`, err.message);
    await finalizeMission(claimed[0].mission_id);
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
