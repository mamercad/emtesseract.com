/**
 * Integration tests for proposal-service.
 * Requires DATABASE_URL pointing to a Postgres DB with migrations applied.
 * Run: DATABASE_URL=postgresql://... npm run test:integration
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
const hasDb = DATABASE_URL && DATABASE_URL.startsWith("postgres");

async function loadProposalService() {
  const mod = await import("../../workers/lib/proposal-service.mjs");
  return mod;
}

describe("proposal-service integration", { skip: !hasDb }, () => {
  let pool;
  let createProposal;
  let acceptProposal;
  let rejectProposal;

  before(async () => {
    if (!hasDb) return;
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const svc = await loadProposalService();
    createProposal = svc.createProposal;
    acceptProposal = svc.acceptProposal;
    rejectProposal = svc.rejectProposal;
  });

  after(async () => {
    if (pool) await pool.end();
  });

  it("creates and auto-approves proposal with analyze step", async () => {
    const result = await createProposal({
      agentId: "test-agent",
      title: "[test] Integration analyze",
      proposedSteps: [{ kind: "analyze", payload: { topic: "test" } }],
    });

    assert.strictEqual(result.accepted, true);
    assert.ok(result.missionId, "missionId should be set");
    assert.ok(result.proposalId, "proposalId should be set");
  });

  it("rejects proposal when write_content quota exceeded", async () => {
    // Insert enough write_content steps today to hit quota (max_drafts_per_day: 8)
    const { rows: policy } = await pool.query(
      "SELECT value FROM ops_policy WHERE key = 'content_policy'"
    );
    const limit = policy?.[0]?.value?.max_drafts_per_day ?? 8;

    // Ensure we're at quota - insert steps (we need a mission first)
    const { rows: missions } = await pool.query(
      `INSERT INTO ops_missions (title, status, created_by)
       VALUES ('_quota_test', 'succeeded', 'test-agent')
       RETURNING id`
    );
    const missionId = missions[0].id;

    for (let i = 0; i < limit; i++) {
      await pool.query(
        `INSERT INTO ops_mission_steps (mission_id, kind, status)
         VALUES ($1, 'write_content', 'succeeded')`,
        [missionId]
      );
    }

    const result = await createProposal({
      agentId: "test-agent",
      title: "[test] Quota exceeded",
      proposedSteps: [{ kind: "write_content", payload: { topic: "test" } }],
    });

    assert.strictEqual(result.accepted, false);
    assert.ok(result.reason?.includes("quota") || result.reason?.includes("Content"), "reason should mention quota");

    // Cleanup
    await pool.query("DELETE FROM ops_mission_steps WHERE mission_id = $1", [missionId]);
    await pool.query("DELETE FROM ops_missions WHERE id = $1", [missionId]);
  });

  it("acceptProposal accepts pending proposal and creates mission", async () => {
    const { rows: inserted } = await pool.query(
      `INSERT INTO ops_mission_proposals (agent_id, title, status, proposed_steps)
       VALUES ('test-agent', '[test] Manual approval', 'pending', $1)
       RETURNING id`,
      [JSON.stringify([{ kind: "analyze", payload: { topic: "accept test" } }])]
    );
    const proposalId = inserted[0].id;

    const result = await acceptProposal(proposalId);

    assert.strictEqual(result.accepted, true);
    assert.ok(result.missionId, "missionId should be set");

    const { rows: missions } = await pool.query(
      "SELECT id FROM ops_missions WHERE proposal_id = $1",
      [proposalId]
    );
    assert.strictEqual(missions.length, 1);
    assert.strictEqual(missions[0].id, result.missionId);

    const { rows: steps } = await pool.query(
      "SELECT kind FROM ops_mission_steps WHERE mission_id = $1",
      [result.missionId]
    );
    assert.strictEqual(steps.length, 1);
    assert.strictEqual(steps[0].kind, "analyze");

    await pool.query("DELETE FROM ops_mission_steps WHERE mission_id = $1", [result.missionId]);
    await pool.query("DELETE FROM ops_missions WHERE id = $1", [result.missionId]);
    await pool.query("DELETE FROM ops_mission_proposals WHERE id = $1", [proposalId]);
  });

  it("rejectProposal rejects pending proposal", async () => {
    const { rows: inserted } = await pool.query(
      `INSERT INTO ops_mission_proposals (agent_id, title, status, proposed_steps)
       VALUES ('test-agent', '[test] Manual reject', 'pending', $1)
       RETURNING id`,
      [JSON.stringify([{ kind: "analyze", payload: { topic: "reject test" } }])]
    );
    const proposalId = inserted[0].id;

    const result = await rejectProposal(proposalId, "Not needed");

    assert.strictEqual(result.accepted, false);
    assert.ok(result.reason?.includes("Not needed") || result.reason?.includes("Rejected"));

    const { rows: prop } = await pool.query(
      "SELECT status, rejection_reason FROM ops_mission_proposals WHERE id = $1",
      [proposalId]
    );
    assert.strictEqual(prop.length, 1);
    assert.strictEqual(prop[0].status, "rejected");
    assert.ok(prop[0].rejection_reason?.includes("Not needed"));

    await pool.query("DELETE FROM ops_mission_proposals WHERE id = $1", [proposalId]);
  });

  it("acceptProposal throws for non-pending proposal", async () => {
    const { rows: inserted } = await pool.query(
      `INSERT INTO ops_mission_proposals (agent_id, title, status, proposed_steps)
       VALUES ('test-agent', '[test] Already accepted', 'accepted', $1)
       RETURNING id`,
      [JSON.stringify([{ kind: "analyze", payload: {} }])]
    );
    const proposalId = inserted[0].id;

    await assert.rejects(
      () => acceptProposal(proposalId),
      /not pending/i
    );

    await pool.query("DELETE FROM ops_mission_proposals WHERE id = $1", [proposalId]);
  });

  it("creates and auto-approves proposal with post_bluesky step", async () => {
    const result = await createProposal({
      agentId: "test-agent",
      title: "[test] Bluesky post",
      proposedSteps: [{ kind: "post_bluesky", payload: { text: "Test post from emTesseract ops" } }],
    });

    assert.strictEqual(result.accepted, true);
    assert.ok(result.missionId, "missionId should be set");
  });

  it("rejects post_bluesky when bluesky quota exceeded", async () => {
    const { rows: policy } = await pool.query(
      "SELECT value FROM ops_policy WHERE key = 'bluesky_daily_quota'"
    );
    const limit = policy?.[0]?.value?.limit ?? 5;

    for (let i = 0; i < limit; i++) {
      await pool.query(
        `INSERT INTO ops_bluesky_posts (agent_id, content, posted_at)
         VALUES ('test-agent', $1, $2)`,
        [`quota test ${i}`, new Date().toISOString()]
      );
    }

    const result = await createProposal({
      agentId: "test-agent",
      title: "[test] Bluesky quota exceeded",
      proposedSteps: [{ kind: "post_bluesky", payload: { text: "Should be rejected" } }],
    });

    assert.strictEqual(result.accepted, false);
    assert.ok(result.reason?.toLowerCase().includes("quota") || result.reason?.toLowerCase().includes("bluesky"));

    await pool.query("DELETE FROM ops_bluesky_posts WHERE agent_id = 'test-agent' AND content LIKE 'quota test%'");
  });

  it("creates and auto-approves proposal with scan_bluesky step", async () => {
    const result = await createProposal({
      agentId: "test-agent",
      title: "[test] Bluesky scan",
      proposedSteps: [{ kind: "scan_bluesky", payload: { mode: "feed" } }],
    });

    assert.strictEqual(result.accepted, true);
    assert.ok(result.missionId, "missionId should be set");
  });

  it("rejects scan_bluesky when scan quota exceeded", async () => {
    const { rows: policy } = await pool.query(
      "SELECT value FROM ops_policy WHERE key = 'scan_bluesky_policy'"
    );
    const limit = policy?.[0]?.value?.max_scans_per_day ?? 10;

    const { rows: missions } = await pool.query(
      `INSERT INTO ops_missions (title, status, created_by)
       VALUES ('_scan_quota_test', 'succeeded', 'test-agent')
       RETURNING id`
    );
    const missionId = missions[0].id;

    for (let i = 0; i < limit; i++) {
      await pool.query(
        `INSERT INTO ops_mission_steps (mission_id, kind, status)
         VALUES ($1, 'scan_bluesky', 'succeeded')`,
        [missionId]
      );
    }

    const result = await createProposal({
      agentId: "test-agent",
      title: "[test] Scan quota exceeded",
      proposedSteps: [{ kind: "scan_bluesky", payload: { mode: "mentions" } }],
    });

    assert.strictEqual(result.accepted, false);
    assert.ok(result.reason?.toLowerCase().includes("quota") || result.reason?.toLowerCase().includes("scan"));

    await pool.query("DELETE FROM ops_mission_steps WHERE mission_id = $1", [missionId]);
    await pool.query("DELETE FROM ops_missions WHERE id = $1", [missionId]);
  });
});
