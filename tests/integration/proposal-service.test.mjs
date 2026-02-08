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

async function createProposalAsync() {
  const mod = await import("../../workers/lib/proposal-service.mjs");
  return mod.createProposal;
}

describe("proposal-service integration", { skip: !hasDb }, () => {
  let pool;
  let createProposal;

  before(async () => {
    if (!hasDb) return;
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    createProposal = await createProposalAsync();
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
});
