/**
 * Bluesky worker — post_bluesky (write) and scan_bluesky (read).
 * Requires: BLUESKY_HANDLE, BLUESKY_APP_PASSWORD
 * Create app password: Bluesky Settings → App passwords
 */
import "./lib/env.mjs";
import { BskyAgent } from "@atproto/api";
import { query } from "./lib/db.mjs";
import { formatFeedPost, formatNotification } from "./lib/bluesky-format.mjs";

const WORKER_ID = process.env.WORKER_ID || "bluesky-worker-1";
const POLL_MS = parseInt(process.env.POLL_INTERVAL_MS || "15000", 10);

const handle = process.env.BLUESKY_HANDLE;
const appPassword = process.env.BLUESKY_APP_PASSWORD;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getAgent() {
  const agent = new BskyAgent({ service: "https://bsky.social" });
  await agent.login({ identifier: handle, password: appPassword });
  return agent;
}

async function emitEvent(agentId, kind, title, summary) {
  await query(
    `INSERT INTO ops_agent_events (agent_id, kind, title, summary, tags)
     VALUES ($1, $2, $3, $4, $5)`,
    [agentId, kind, title, summary, [kind]]
  );
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

// ── post_bluesky ───────────────────────────────────────────

async function runOncePost() {
  if (!handle || !appPassword) return;

  const { rows: steps } = await query(
    `SELECT id, mission_id, kind, payload FROM ops_mission_steps
     WHERE status = 'queued' AND kind = 'post_bluesky'
     ORDER BY created_at ASC LIMIT 1`,
    []
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
  const text = step.payload?.text || step.payload?.content || m.title || "";

  if (!text.trim()) {
    await query(
      `UPDATE ops_mission_steps SET status = 'failed', error = $1, updated_at = $2 WHERE id = $3`,
      ["Empty post text", new Date().toISOString(), step.id]
    );
    await emitEvent(m.created_by, "step_failed", "Step failed: post_bluesky", "Empty post text");
    await finalizeMission(claimed[0].mission_id);
    return;
  }

  try {
    const agent = await getAgent();
    const response = await agent.post({
      text: text.slice(0, 300),
      createdAt: new Date().toISOString(),
    });
    await query(
      `UPDATE ops_mission_steps SET status = 'succeeded', result = $1, updated_at = $2 WHERE id = $3`,
      [JSON.stringify({ uri: response.uri, cid: response.cid }), new Date().toISOString(), step.id]
    );
    await query(
      `INSERT INTO ops_bluesky_posts (step_id, post_uri, post_cid, agent_id, content, posted_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [step.id, response.uri, response.cid, m.created_by, text, new Date().toISOString()]
    );
    await emitEvent(m.created_by, "post_bluesky_complete", "Posted to Bluesky", text.slice(0, 100));
    await finalizeMission(claimed[0].mission_id);
    console.log(`[${WORKER_ID}] post_bluesky succeeded: ${step.id}`);
  } catch (err) {
    console.error(`[${WORKER_ID}] post_bluesky failed:`, err.message);
    await query(
      `UPDATE ops_mission_steps SET status = 'failed', error = $1, updated_at = $2 WHERE id = $3`,
      [err.message, new Date().toISOString(), step.id]
    );
    await emitEvent(m.created_by, "step_failed", "Step failed: post_bluesky", err.message);
    await finalizeMission(claimed[0].mission_id);
  }
}

// ── scan_bluesky (read) ────────────────────────────────────

async function runOnceScan() {
  if (!handle || !appPassword) return;

  const { rows: steps } = await query(
    `SELECT id, mission_id, kind, payload FROM ops_mission_steps
     WHERE status = 'queued' AND kind = 'scan_bluesky'
     ORDER BY created_at ASC LIMIT 1`,
    []
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
  const mode = step.payload?.mode || "feed";

  try {
    const agent = await getAgent();
    const sections = [];

    if (mode === "feed" || mode === "both") {
      const feedRes = await agent.getAuthorFeed({ actor: handle, limit: 25 });
      const feed = feedRes.data?.feed || [];
      sections.push("# Author feed (our posts)\n\n" + feed.map(formatFeedPost).join("\n"));
    }

    if (mode === "mentions" || mode === "both") {
      const notifRes = await agent.listNotifications({ limit: 50 });
      const notifs = notifRes.data?.notifications || [];
      const mentions = notifs.filter(
        (n) => n.reason === "mention" || n.reason === "reply" || n.reason === "quote"
      );
      sections.push("# Mentions & replies\n\n" + mentions.map(formatNotification).join("\n"));
    }

    const content = sections.join("\n---\n\n");
    const title = `Bluesky scan: ${mode}`.slice(0, 200);

    const { rows: ins } = await query(
      `INSERT INTO ops_artifacts (title, content, mission_id, step_id, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [title, content || "(no items)", step.mission_id, step.id, m.created_by, new Date().toISOString()]
    );
    const artifactId = ins?.[0]?.id;

    await query(
      `UPDATE ops_mission_steps SET status = 'succeeded', result = $1, updated_at = $2 WHERE id = $3`,
      [JSON.stringify({ artifact_id: artifactId, mode }), new Date().toISOString(), step.id]
    );
    await emitEvent(m.created_by, "scan_bluesky_complete", `Scanned Bluesky: ${mode}`, content.slice(0, 150));
    await finalizeMission(claimed[0].mission_id);
    console.log(`[${WORKER_ID}] scan_bluesky succeeded: ${step.id} (${mode})`);
  } catch (err) {
    console.error(`[${WORKER_ID}] scan_bluesky failed:`, err.message);
    await query(
      `UPDATE ops_mission_steps SET status = 'failed', error = $1, updated_at = $2 WHERE id = $3`,
      [err.message, new Date().toISOString(), step.id]
    );
    await emitEvent(m.created_by, "step_failed", "Step failed: scan_bluesky", err.message);
    await finalizeMission(claimed[0].mission_id);
  }
}

// ── Main ───────────────────────────────────────────────────

async function runOnce() {
  await runOncePost();
  await runOnceScan();
}

async function main() {
  if (!handle || !appPassword) {
    console.warn(`[${WORKER_ID}] BLUESKY_HANDLE and BLUESKY_APP_PASSWORD required. Skipping.`);
  } else {
    console.log(`[${WORKER_ID}] Starting (Bluesky @ ${handle}, poll ${POLL_MS}ms)`);
  }

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
