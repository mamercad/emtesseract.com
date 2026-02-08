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
import { complete } from "../workers/lib/llm.mjs";

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

  /* Chat — async, server-stored history */
  const chatSessionMatch = pathname.match(/^\/api\/chat\/session\/([0-9a-f-]{36})$/);
  if (chatSessionMatch) {
    const sessionId = chatSessionMatch[1];
    const { rows } = await pool.query(
      `SELECT id, role, content, status, created_at FROM ops_chat_messages
       WHERE session_id = $1 ORDER BY created_at ASC`,
      [sessionId]
    );
    return { data: rows ?? [] };
  }

  if (pathname === "/api/chat/sessions") {
    const agentId = searchParams.get("agent_id") || "";
    if (!agentId) return { data: [] };
    const { rows } = await pool.query(
      `SELECT s.id, s.agent_id, s.created_at,
        (SELECT COUNT(*) FROM ops_chat_messages m WHERE m.session_id = s.id) AS message_count
       FROM ops_chat_sessions s
       WHERE s.agent_id = $1
       ORDER BY s.created_at DESC LIMIT 10`,
      [agentId]
    );
    return { data: rows ?? [] };
  }

  if (pathname === "/api/ops_work_items") {
    const { rows: proposals } = await pool.query(
      `SELECT id, agent_id, title, status, created_at FROM ops_mission_proposals
       WHERE status = 'pending' ORDER BY created_at DESC LIMIT 20`
    );

    const { rows: missions } = await pool.query(
      `SELECT m.id, m.title, m.status, m.created_by, m.created_at,
        (SELECT json_agg(json_build_object('kind', s.kind, 'status', s.status))
         FROM ops_mission_steps s WHERE s.mission_id = m.id) AS steps
       FROM ops_missions m ORDER BY m.created_at DESC LIMIT 50`
    );

    const items = [];

    for (const p of proposals ?? []) {
      items.push({
        id: p.id,
        type: "proposal",
        agent: p.agent_id,
        stage: "proposal",
        title: p.title,
        status: p.status,
        created_at: p.created_at,
        proposal_id: p.id,
        mission_id: null,
        steps_summary: null,
      });
    }

    for (const m of missions ?? []) {
      const steps = m.steps ?? [];
      const stepsArr = Array.isArray(steps) ? steps : [];
      const done = stepsArr.filter((s) => s.status === "succeeded" || s.status === "failed").length;
      const total = stepsArr.length;
      const stepsSummary = total > 0 ? `${done}/${total} steps` : null;

      let stage = "approved";
      if (m.status === "running") stage = "in_progress";
      else if (m.status === "succeeded" || m.status === "failed") stage = "done";

      items.push({
        id: m.id,
        type: "mission",
        agent: m.created_by,
        stage,
        title: m.title,
        status: m.status,
        created_at: m.created_at,
        proposal_id: null,
        mission_id: m.id,
        steps_summary: stepsSummary,
      });
    }

    items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return { data: items.slice(0, 50) };
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

async function processChatInBackground(assistantMessageId, llmMessages, pool) {
  try {
    const content = await complete(llmMessages, { temperature: 0.7 });
    await pool.query(
      "UPDATE ops_chat_messages SET content = $1, status = 'done' WHERE id = $2",
      [content, assistantMessageId]
    );
  } catch (err) {
    await pool.query(
      "UPDATE ops_chat_messages SET content = $1, status = 'failed' WHERE id = $2",
      [`Error: ${err.message}`, assistantMessageId]
    );
  }
}

async function handlePostChat(body, pool) {
  const sessionId = body.session_id || null;
  const agentId = body.agent_id || "";
  const content = (body.content || "").trim();

  if (!content || !agentId) {
    return { status: 400, json: { error: "agent_id and content required" } };
  }

  let sessId = sessionId;
  if (!sessId) {
    const { rows: sess } = await pool.query(
      `INSERT INTO ops_chat_sessions (agent_id) VALUES ($1) RETURNING id`,
      [agentId]
    );
    sessId = sess?.[0]?.id;
  } else {
    const { rowCount } = await pool.query(
      "SELECT 1 FROM ops_chat_sessions WHERE id = $1 AND agent_id = $2",
      [sessId, agentId]
    );
    if (rowCount === 0) {
      return { status: 400, json: { error: "Invalid session_id for agent" } };
    }
  }

  await pool.query(
    `INSERT INTO ops_chat_messages (session_id, role, content, status)
     VALUES ($1, 'user', $2, 'done')`,
    [sessId, content]
  );

  const { rows: assistant } = await pool.query(
    `INSERT INTO ops_chat_messages (session_id, role, content, status)
     VALUES ($1, 'assistant', '', 'pending') RETURNING id`,
    [sessId]
  );
  const assistantMessageId = assistant?.[0]?.id;

  let systemPrompt =
    "You are part of the emTesseract ops team. Help with missions, content ideas, and analysis. Be concise and friendly.";
  const { rows: agentRows } = await pool.query(
    "SELECT system_directive, display_name FROM ops_agents WHERE id = $1 AND enabled = true",
    [agentId]
  );
  if (agentRows?.[0]?.system_directive) {
    systemPrompt = agentRows[0].system_directive;
  } else if (agentRows?.[0]?.display_name) {
    systemPrompt = `You are ${agentRows[0].display_name}. ${systemPrompt}`;
  }

  const { rows: history } = await pool.query(
    `SELECT role, content FROM ops_chat_messages
     WHERE session_id = $1 AND (role = 'user' OR (role = 'assistant' AND status = 'done'))
     ORDER BY created_at ASC`,
    [sessId]
  );
  const llmMessages = [{ role: "system", content: systemPrompt }];
  for (const m of history || []) {
    if (m.role && (m.content || m.role === "user")) {
      llmMessages.push({ role: m.role, content: String(m.content || "") });
    }
  }

  setImmediate(() => {
    processChatInBackground(assistantMessageId, llmMessages, pool).catch((err) =>
      console.error("Chat background error:", err)
    );
  });

  return { status: 200, json: { session_id: sessId, assistant_message_id: assistantMessageId } };
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

    if (req.method === "POST" && pathname === "/api/chat") {
      try {
        const body = await readJsonBody(req);
        const { status, json } = await handlePostChat(body, pool);
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(json));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message || "Chat failed" }));
      }
      return;
    }

    const json = await handleApi(pathname, url.searchParams);
    if (json) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(json));
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
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
