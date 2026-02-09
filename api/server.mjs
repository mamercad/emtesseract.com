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
import { createProposal, acceptProposal, rejectProposal } from "../workers/lib/proposal-service.mjs";
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
} catch { }

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
  if (pathname === "/api/ops_policy") {
    const { rows } = await pool.query(
      "SELECT key, value, updated_at FROM ops_policy ORDER BY key"
    );
    const policy = {};
    for (const r of rows ?? []) {
      policy[r.key] = { ...r.value, _updated_at: r.updated_at };
    }
    return { data: policy };
  }

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

  /* Step stats — Ollama tasks (analyze, write_content) and crawl */
  if (pathname === "/api/ops_step_stats") {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const today = startOfDay.toISOString();

    const { rows: ollama } = await pool.query(
      `SELECT status, COUNT(*)::int AS c
       FROM ops_mission_steps
       WHERE kind IN ('analyze', 'write_content')
       GROUP BY status`,
      []
    );
    const { rows: ollamaToday } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM ops_mission_steps
       WHERE kind IN ('analyze', 'write_content') AND status = 'succeeded' AND created_at >= $1`,
      [today]
    );
    const { rows: crawl } = await pool.query(
      `SELECT status, COUNT(*)::int AS c
       FROM ops_mission_steps
       WHERE kind = 'crawl'
       GROUP BY status`,
      []
    );
    const { rows: crawlToday } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM ops_mission_steps
       WHERE kind = 'crawl' AND status = 'succeeded' AND created_at >= $1`,
      [today]
    );

    const toMap = (rows) => Object.fromEntries((rows ?? []).map((r) => [r.status, r.c]));
    return {
      data: {
        ollama: {
          queued: toMap(ollama).queued ?? 0,
          running: toMap(ollama).running ?? 0,
          today: ollamaToday?.[0]?.c ?? 0,
        },
        crawl: {
          queued: toMap(crawl).queued ?? 0,
          running: toMap(crawl).running ?? 0,
          today: crawlToday?.[0]?.c ?? 0,
        },
      },
    };
  }

  /* Roundtables — agent-to-agent conversations */
  if (pathname === "/api/roundtables") {
    const { rows } = await pool.query(
      `SELECT id, format, topic, participants, status, created_at, completed_at
       FROM ops_roundtable_queue
       ORDER BY created_at DESC LIMIT 50`
    );
    return { data: rows ?? [] };
  }

  const roundtableMatch = pathname.match(/^\/api\/roundtables\/([0-9a-f-]{36})$/);
  if (roundtableMatch) {
    const id = roundtableMatch[1];
    const { rows } = await pool.query(
      `SELECT id, format, topic, participants, status, history, created_at, completed_at
       FROM ops_roundtable_queue WHERE id = $1`,
      [id]
    );
    if (!rows?.length) return null;
    return { data: rows[0] };
  }

  /* Artifacts — shared markdown documents */
  if (pathname === "/api/artifacts") {
    const missionId = searchParams.get("mission_id") || "";
    let sql = "SELECT id, title, content, mission_id, step_id, updated_by, created_at, updated_at FROM ops_artifacts";
    const params = [];
    if (missionId) {
      sql += " WHERE mission_id = $1";
      params.push(missionId);
    }
    sql += " ORDER BY updated_at DESC LIMIT 50";
    const { rows } = await pool.query(sql, params);
    return { data: rows ?? [] };
  }

  const artifactMatch = pathname.match(/^\/api\/artifacts\/([0-9a-f-]{36})$/);
  if (artifactMatch) {
    const id = artifactMatch[1];
    const { rows } = await pool.query(
      "SELECT id, title, content, mission_id, step_id, updated_by, created_at, updated_at FROM ops_artifacts WHERE id = $1",
      [id]
    );
    if (!rows?.length) return null;
    return { data: rows[0] };
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

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let sessId = sessionId;
    if (!sessId) {
      const { rows: sess } = await client.query(
        `INSERT INTO ops_chat_sessions (agent_id) VALUES ($1) RETURNING id`,
        [agentId]
      );
      sessId = sess?.[0]?.id;
    } else {
      const { rowCount } = await client.query(
        "SELECT 1 FROM ops_chat_sessions WHERE id = $1 AND agent_id = $2",
        [sessId, agentId]
      );
      if (rowCount === 0) {
        await client.query("ROLLBACK");
        return { status: 400, json: { error: "Invalid session_id for agent" } };
      }
    }

    await client.query(
      `INSERT INTO ops_chat_messages (session_id, role, content, status)
       VALUES ($1, 'user', $2, 'done')`,
      [sessId, content]
    );

    const { rows: assistant } = await client.query(
      `INSERT INTO ops_chat_messages (session_id, role, content, status)
       VALUES ($1, 'assistant', '', 'pending') RETURNING id`,
      [sessId]
    );
    const assistantMessageId = assistant?.[0]?.id;

    let systemPrompt =
      "You are part of the emTesseract ops team. Help with missions, content ideas, and analysis. Be concise and friendly.";
    const { rows: agentRows } = await client.query(
      "SELECT system_directive, display_name FROM ops_agents WHERE id = $1 AND enabled = true",
      [agentId]
    );
    if (agentRows?.[0]?.system_directive) {
      systemPrompt = agentRows[0].system_directive;
    } else if (agentRows?.[0]?.display_name) {
      systemPrompt = `You are ${agentRows[0].display_name}. ${systemPrompt}`;
    }

    const { rows: history } = await client.query(
      `SELECT role, content FROM ops_chat_messages
       WHERE session_id = $1 AND (role = 'user' OR (role = 'assistant' AND status = 'done'))
       ORDER BY created_at ASC`,
      [sessId]
    );
    await client.query("COMMIT");

    const llmMessages = [{ role: "system", content: systemPrompt }];
    for (const m of history || []) {
      if (m?.role && typeof m.role === "string") {
        const cx = m.content;
        const contentStr = typeof cx === "string" ? cx : String(cx ?? "");
        llmMessages.push({ role: m.role, content: contentStr });
      }
    }

    const hasUser = llmMessages.some((m) => m.role === "user");
    if (!hasUser || llmMessages.length < 2) {
      await pool.query(
        "UPDATE ops_chat_messages SET content = $1, status = 'failed' WHERE id = $2",
        ["Error: no user message in history", assistantMessageId]
      );
      return { status: 200, json: { session_id: sessId, assistant_message_id: assistantMessageId } };
    }

    setImmediate(() => {
      processChatInBackground(assistantMessageId, llmMessages, pool).catch((err) =>
        console.error("Chat background error:", err)
      );
    });

    return { status: 200, json: { session_id: sessId, assistant_message_id: assistantMessageId } };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => { });
    throw err;
  } finally {
    client.release();
  }
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
    const proposalApproveMatch = pathname.match(/^\/api\/proposals\/([0-9a-f-]{36})\/approve$/);
    const proposalRejectMatch = pathname.match(/^\/api\/proposals\/([0-9a-f-]{36})\/reject$/);

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

    if (req.method === "POST" && proposalApproveMatch) {
      try {
        const proposalId = proposalApproveMatch[1];
        const result = await acceptProposal(proposalId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message || "Approval failed" }));
      }
      return;
    }

    if (req.method === "POST" && proposalRejectMatch) {
      try {
        const proposalId = proposalRejectMatch[1];
        const body = await readJsonBody(req);
        const reason = body?.reason ?? "";
        const result = await rejectProposal(proposalId, reason);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message || "Rejection failed" }));
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

    const policyPatchMatch = pathname.match(/^\/api\/ops_policy\/([a-z_]+)$/);
    if (req.method === "PATCH" && policyPatchMatch) {
      try {
        const key = policyPatchMatch[1];
        const body = await readJsonBody(req);
        const value = body?.value;
        if (!value || typeof value !== "object") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "body.value (object) required" }));
          return;
        }
        const allowKeys = [
          "content_policy",
          "auto_approve",
          "x_daily_quota",
          "roundtable_policy",
          "memory_influence_policy",
          "relationship_drift_policy",
          "initiative_policy",
        ];
        if (!allowKeys.includes(key)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: `Unknown policy key: ${key}` }));
          return;
        }
        const { rowCount } = await pool.query(
          `UPDATE ops_policy SET value = value || $1::jsonb, updated_at = $2 WHERE key = $3`,
          [JSON.stringify(value), new Date().toISOString(), key]
        );
        if (rowCount === 0) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Policy not found" }));
          return;
        }
        const { rows } = await pool.query(
          "SELECT key, value, updated_at FROM ops_policy WHERE key = $1",
          [key]
        );
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ data: rows[0] }));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message || "Update failed" }));
      }
      return;
    }

    const artifactPatchMatch = pathname.match(/^\/api\/artifacts\/([0-9a-f-]{36})$/);
    if (req.method === "PATCH" && artifactPatchMatch) {
      try {
        const id = artifactPatchMatch[1];
        const body = await readJsonBody(req);
        const content = typeof body?.content === "string" ? body.content : "";
        const { rowCount } = await pool.query(
          `UPDATE ops_artifacts SET content = $1, updated_by = 'operator', updated_at = $2 WHERE id = $3`,
          [content, new Date().toISOString(), id]
        );
        if (rowCount === 0) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Artifact not found" }));
          return;
        }
        const { rows } = await pool.query(
          "SELECT id, title, content, mission_id, step_id, updated_by, created_at, updated_at FROM ops_artifacts WHERE id = $1",
          [id]
        );
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ data: rows[0] }));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message || "Update failed" }));
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
