/**
 * Integration tests for ops_policy (settings API).
 * Requires DATABASE_URL.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
const hasDb = DATABASE_URL && DATABASE_URL.startsWith("postgres");

describe("policy integration", { skip: !hasDb }, () => {
  let pool;
  let originalContentPolicy;

  before(async () => {
    if (!hasDb) return;
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const { rows } = await pool.query(
      "SELECT value FROM ops_policy WHERE key = 'content_policy'"
    );
    originalContentPolicy = rows?.[0]?.value ?? {};
  });

  after(async () => {
    if (pool && originalContentPolicy) {
      await pool.query(
        "UPDATE ops_policy SET value = $1 WHERE key = 'content_policy'",
        [JSON.stringify(originalContentPolicy)]
      );
    }
    if (pool) await pool.end();
  });

  it("reads content_policy", async () => {
    const { rows } = await pool.query(
      "SELECT key, value FROM ops_policy WHERE key = 'content_policy'"
    );
    assert.strictEqual(rows.length, 1);
    assert.ok(rows[0].value);
    assert.ok(typeof rows[0].value.enabled === "boolean");
    assert.ok(typeof rows[0].value.max_drafts_per_day === "number");
  });

  it("updates content_policy with merge", async () => {
    const { rows: before } = await pool.query(
      "SELECT value FROM ops_policy WHERE key = 'content_policy'"
    );
    const prev = before[0].value;
    const newMax = (prev.max_drafts_per_day ?? 8) === 10 ? 8 : 10;

    await pool.query(
      `UPDATE ops_policy SET value = value || $1::jsonb, updated_at = $2 WHERE key = 'content_policy'`,
      [JSON.stringify({ max_drafts_per_day: newMax }), new Date().toISOString()]
    );

    const { rows: after } = await pool.query(
      "SELECT value FROM ops_policy WHERE key = 'content_policy'"
    );
    assert.strictEqual(after[0].value.max_drafts_per_day, newMax);
    assert.strictEqual(after[0].value.enabled, prev.enabled);
  });
});
