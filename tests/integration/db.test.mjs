/**
 * Integration tests for DB connectivity.
 * Requires DATABASE_URL. Run: DATABASE_URL=postgresql://... npm run test:integration
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
const hasDb = DATABASE_URL && DATABASE_URL.startsWith("postgres");

describe("db integration", { skip: !hasDb }, () => {
  let pool;

  before(() => {
    if (!hasDb) return;
    pool = new pg.Pool({ connectionString: DATABASE_URL });
  });

  after(async () => {
    if (pool) await pool.end();
  });

  it("connects and queries ops_policy", async () => {
    const { rows } = await pool.query(
      "SELECT key, value FROM ops_policy LIMIT 5"
    );
    assert.ok(Array.isArray(rows));
    assert.ok(rows.length >= 1, "ops_policy should have at least policy rows");
  });

  it("ops_mission_proposals table exists", async () => {
    const { rows } = await pool.query(
      "SELECT 1 FROM ops_mission_proposals LIMIT 1"
    );
    assert.ok(Array.isArray(rows));
  });

  it("ops_bluesky_posts table exists (migration 020)", async () => {
    const { rows } = await pool.query(
      "SELECT 1 FROM ops_bluesky_posts LIMIT 1"
    );
    assert.ok(Array.isArray(rows));
  });

  it("bluesky_daily_quota and scan_bluesky_policy exist", async () => {
    const { rows } = await pool.query(
      "SELECT key, value FROM ops_policy WHERE key IN ('bluesky_daily_quota', 'scan_bluesky_policy')"
    );
    const keys = (rows || []).map((r) => r.key);
    assert.ok(keys.includes("bluesky_daily_quota"), "bluesky_daily_quota policy");
    assert.ok(keys.includes("scan_bluesky_policy"), "scan_bluesky_policy");
  });
});
