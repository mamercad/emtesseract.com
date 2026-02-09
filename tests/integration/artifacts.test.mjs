/**
 * Integration tests for ops_artifacts.
 * Requires DATABASE_URL. Run: DATABASE_URL=postgresql://... npm run test:integration
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
const hasDb = DATABASE_URL && DATABASE_URL.startsWith("postgres");

describe("artifacts integration", { skip: !hasDb }, () => {
  let pool;
  let missionId;
  let artifactId;

  before(async () => {
    if (!hasDb) return;
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const { rows: missions } = await pool.query(
      `INSERT INTO ops_missions (title, status, created_by)
       VALUES ('_artifact_test', 'approved', 'test-agent')
       RETURNING id`
    );
    missionId = missions[0].id;
  });

  after(async () => {
    if (pool) {
      if (artifactId) await pool.query("DELETE FROM ops_artifacts WHERE id = $1", [artifactId]);
      if (missionId) await pool.query("DELETE FROM ops_missions WHERE id = $1", [missionId]);
      await pool.end();
    }
  });

  it("ops_artifacts table exists and accepts insert", async () => {
    const { rows } = await pool.query(
      `INSERT INTO ops_artifacts (title, content, mission_id, updated_by)
       VALUES ('[test] Artifact', 'Initial content', $1, 'test-agent')
       RETURNING id, title, content, updated_by`,
      [missionId]
    );
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].title, "[test] Artifact");
    assert.strictEqual(rows[0].content, "Initial content");
    assert.strictEqual(rows[0].updated_by, "test-agent");
    artifactId = rows[0].id;
  });

  it("updates artifact content and updated_by", async () => {
    const newContent = "Revised by operator";
    const { rowCount } = await pool.query(
      `UPDATE ops_artifacts SET content = $1, updated_by = 'operator', updated_at = $2 WHERE id = $3`,
      [newContent, new Date().toISOString(), artifactId]
    );
    assert.strictEqual(rowCount, 1);

    const { rows } = await pool.query(
      "SELECT content, updated_by FROM ops_artifacts WHERE id = $1",
      [artifactId]
    );
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].content, newContent);
    assert.strictEqual(rows[0].updated_by, "operator");
  });

  it("lists artifacts by mission_id", async () => {
    const { rows } = await pool.query(
      "SELECT id, title FROM ops_artifacts WHERE mission_id = $1 ORDER BY updated_at DESC",
      [missionId]
    );
    assert.ok(rows.length >= 1);
    assert.ok(rows.some((r) => r.id === artifactId));
  });
});
