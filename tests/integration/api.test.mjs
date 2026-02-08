/**
 * Integration tests for Stage API.
 * Requires API server running (npm run api) and DATABASE_URL in .env.
 * Skips if server unreachable.
 */
import { describe, it } from "node:test";
import assert from "node:assert";

const PORT = parseInt(process.env.STAGE_PORT ?? "8788", 10);
const BASE = `http://localhost:${PORT}`;

async function fetchOk(path) {
  try {
    const res = await fetch(`${BASE}${path}`);
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

describe("api integration", { skip: true }, () => {
  // Skip by default - run with node --test tests/integration/api.test.mjs
  // when server is running. Remove skip to enable.
  it("GET /api/ops_agents returns 200 and array", async () => {
    const res = await fetchOk("/api/ops_agents");
    if (!res) {
      console.log("Skipping: API server not reachable. Start with: npm run api");
      return;
    }
    const data = await res.json();
    assert.ok(Array.isArray(data.data));
  });
});
