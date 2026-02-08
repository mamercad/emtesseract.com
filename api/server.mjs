/**
 * Stage API server — serves ops data for local hosting.
 * Run on Boomer alongside workers: node api/server.mjs
 * Serves /stage/* and /api/ops_* endpoints.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createProposal } from "../workers/lib/proposal-service.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");

// Load .env
try {
  const envPath = join(ROOT, ".env");
  if (existsSync(envPath)) {
    const contents = readFileSync(envPath, "utf-8");
    for (const line of contents.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  }
} catch {}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl || !dbUrl.startsWith("postgres")) {
  console.error("Missing DATABASE_URL. Add to .env: postgresql://user@localhost:5432/emtesseract_ops");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: dbUrl });

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

async function handleApi(pathname, searchParams) {
  if (pathname === "/api/ops_agents") {
    const { rows } = await pool.query(
      "SELECT id, display_name, role FROM ops_agents WHERE enabled = true"
    );
    return { data: rows ?? [] };
  }

  if (pathname === "/api/ops_agent_events") {
    const agentId = searchParams.get("agent_id") || "";
    const kind = searchParams.get("kind") || "";
    let sql = "SELECT id, agent_id, kind, title, summary, created_at FROM ops_agent_events";
    const params = [];
    const conds = [];
    if (agentId) {
      conds.push(`agent_id = $${params.length + 1}`);
      params.push(agentId);
    }
    if (kind) {
      conds.push(`kind = $${params.length + 1}`);
      params.push(kind);
    }
    if (conds.length) sql += " WHERE " + conds.join(" AND ");
    sql += " ORDER BY created_at DESC LIMIT 100";
    const { rows } = await pool.query(sql, params);
    return { data: rows ?? [] };
  }

  if (pathname === "/api/ops_missions") {
    const { rows } = await pool.query(
      `SELECT id, title, status, created_by, created_at FROM ops_missions
       ORDER BY created_at DESC LIMIT 50`
    );
    return { data: rows ?? [] };
  }

  if (pathname === "/api/ops_mission_steps") {
    const ids = searchParams.get("mission_ids");
    if (!ids) return { data: [] };
    const missionIds = ids.split(",").filter(Boolean);
    if (!missionIds.length) return { data: [] };
    const placeholders = missionIds.map((_, i) => `$${i + 1}`).join(", ");
    const { rows } = await pool.query(
      `SELECT mission_id, kind, status, payload, result FROM ops_mission_steps WHERE mission_id IN (${placeholders})`,
      missionIds
    );
    return { data: rows ?? [] };
  }

  return null;
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

async function handlePostProposals(body) {
  const agentId = body.agent_id;
  const title = body.title || "[human] Task";
  const steps = body.steps;

  if (!agentId || !Array.isArray(steps) || steps.length === 0) {
    return { status: 400, json: { error: "agent_id and steps[] required" } };
  }

  const proposedSteps = steps.map((s) => ({
    kind: s.kind || "analyze",
    payload: s.payload ?? (s.topic ? { topic: s.topic } : {}),
  }));

  try {
    const result = await createProposal({ agentId, title, proposedSteps });
    return { status: 200, json: result };
  } catch (err) {
    return { status: 500, json: { error: err.message } };
  }
}

async function handler(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (pathname.startsWith("/api/")) {
    if (req.method === "POST" && pathname === "/api/proposals") {
      try {
        const body = await readJsonBody(req);
        const { status, json } = await handlePostProposals(body);
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(json));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message || "Bad request" }));
      }
      return;
    }

    const json = await handleApi(pathname, url.searchParams);
    if (json) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(json));
      return;
    }
    res.writeHead(404);
    res.end();
    return;
  }

  // Static files
  let filePath = pathname === "/" ? "/index.html" : pathname;
  if (filePath === "/stage" || filePath === "/stage/") filePath = "/stage/index.html";
  const fullPath = join(ROOT, filePath.replace(/^\//, ""));

  if (!existsSync(fullPath)) {
    const fallback = join(ROOT, "404.html");
    if (existsSync(fallback)) {
      res.writeHead(404, { "Content-Type": "text/html" });
      res.end(readFileSync(fallback));
    } else {
      res.writeHead(404);
      res.end();
    }
    return;
  }

  const ext = extname(fullPath);
  const contentType = MIME[ext] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": contentType });
  res.end(readFileSync(fullPath));
}

const PORT = parseInt(process.env.STAGE_PORT ?? "8788", 10);
console.log(`Stage API server on http://localhost:${PORT}`);
createServer(handler).listen(PORT);
