/**
 * Crawl worker — fetches URLs and stores extracted text in ops_artifacts.
 * No LLM required; uses fetch for HTTP.
 */
import "./lib/env.mjs";
import { query } from "./lib/db.mjs";

const WORKER_ID = process.env.WORKER_ID || "crawl-worker-1";
const POLL_MS = parseInt(process.env.POLL_INTERVAL_MS || "15000", 10);
const STEP_KIND = "crawl";
const MAX_CONTENT_LENGTH = 100_000;

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

/** Strip HTML tags and normalize whitespace. */
function extractText(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function executeCrawl(step, mission) {
  const { payload } = step;
  const agentId = mission.created_by;

  const url = payload.url || payload.source_url;
  if (!url || typeof url !== "string") {
    throw new Error("Crawl step requires payload.url");
  }

  let topic = payload.topic;
  if (!topic) {
    try {
      topic = new URL(url).hostname;
    } catch {
      topic = url.slice(0, 50);
    }
  }
  const title = `Crawl: ${topic}`.slice(0, 200);

  const res = await fetch(url, {
    headers: { "User-Agent": "emTesseractOps/1.0 (game dev research)" },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }

  const contentType = res.headers.get("content-type") || "";
  const raw = await res.text();
  const content =
    contentType.includes("html") || raw.trimStart().startsWith("<")
      ? extractText(raw)
      : raw;

  const truncated =
    content.length > MAX_CONTENT_LENGTH
      ? content.slice(0, MAX_CONTENT_LENGTH) + "\n\n[…] truncated"
      : content;

  const { rows: ins } = await query(
    `INSERT INTO ops_artifacts (title, content, mission_id, step_id, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      title,
      truncated,
      step.mission_id,
      step.id,
      agentId,
      new Date().toISOString(),
    ]
  );
  const artifactId = ins?.[0]?.id;

  const summary = truncated.slice(0, 200);
  return {
    result: { artifact_id: artifactId, url, length: truncated.length },
    event: { kind: "crawl_complete", title: `Crawled: ${topic}`, summary },
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
    const { result, event } = await executeCrawl(step, m);
    await query(
      `UPDATE ops_mission_steps SET status = 'succeeded', result = $1, updated_at = $2 WHERE id = $3`,
      [JSON.stringify(result), new Date().toISOString(), step.id]
    );
    await emitEvent(m.created_by, event.kind, event.title, event.summary);
    await finalizeMission(claimed[0].mission_id);
    console.log(`[${WORKER_ID}] ${STEP_KIND} succeeded: ${step.id} (${result.url})`);
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
  console.log(`[${WORKER_ID}] Starting (poll ${POLL_MS}ms)`);

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
