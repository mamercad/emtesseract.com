/**
 * Roundtable worker — conversation orchestration.
 * Polls ops_roundtable_queue, runs turn-by-turn dialogue, distills memories.
 */
import "./lib/env.mjs";
import { query } from "./lib/db.mjs";
import { complete } from "./lib/llm.mjs";
import { sanitize, hash } from "./lib/utils.mjs";
import { getFormatConfig } from "./lib/format-config.mjs";

const WORKER_ID = process.env.WORKER_ID || "roundtable-worker-1";
const POLL_MS = parseInt(process.env.POLL_INTERVAL_MS || "30000", 10);
const MAX_TURN_CHARS = 120;
const MAX_MEMORIES_PER_CONV = 6;
const MIN_CONFIDENCE = 0.55;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function emitEvent(agentId, kind, title, summary) {
  await query(
    `INSERT INTO ops_agent_events (agent_id, kind, title, summary, tags)
     VALUES ($1, $2, $3, $4, $5)`,
    [agentId, kind, title, summary, [kind]]
  );
}

async function loadAgents(ids) {
  if (!ids?.length) return [];
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
  const { rows } = await query(
    `SELECT id, display_name, system_directive FROM ops_agents WHERE id IN (${placeholders})`,
    ids
  );
  return rows || [];
}

async function runConversation(session) {
  const { id, format, topic, participants } = session;
  const agentIds = Array.isArray(participants) ? participants : [];
  if (agentIds.length < 2) {
    throw new Error("Need at least 2 participants");
  }

  const agents = await loadAgents(agentIds);
  const agentMap = new Map(agents.map((a) => [a.id, a]));

  const formatConfig = {
    watercooler: { minTurns: 2, maxTurns: 5, temperature: 0.9 },
    standup: { minTurns: 4, maxTurns: 8, temperature: 0.6 },
    debate: { minTurns: 4, maxTurns: 8, temperature: 0.8 },
  }[format] || { minTurns: 2, maxTurns: 5, temperature: 0.9 };

  const maxTurns =
    formatConfig.minTurns +
    Math.floor(Math.random() * (formatConfig.maxTurns - formatConfig.minTurns + 1));
  const temperature = formatConfig.temperature;
  const convTopic = topic || "how things are going at emTesseract";

  const history = [];
  let lastSpeaker = null;

  for (let turn = 0; turn < maxTurns; turn++) {
    const available = agentIds.filter((id) => agentMap.has(id));
    let speaker;
    if (turn === 0) {
      speaker = available[Math.floor(Math.random() * available.length)];
    } else {
      const others = available.filter((a) => a !== lastSpeaker);
      speaker = others[Math.floor(Math.random() * others.length)];
    }

    const agent = agentMap.get(speaker);
    const directive = agent?.system_directive || `You are ${agent?.display_name || speaker}. Speak briefly.`;

    const historyText = history
      .map((h) => `${agentMap.get(h.speaker)?.display_name || h.speaker}: ${h.dialogue}`)
      .join("\n");

    const userPrompt =
      turn === 0
        ? `Quick ${format} chat. Topic: ${convTopic}. Say one short thing (max ${MAX_TURN_CHARS} chars).`
        : `Topic: ${convTopic}. Respond briefly to the conversation (max ${MAX_TURN_CHARS} chars).`;

    const systemPrompt = `${directive}\n\nPrevious:\n${historyText || "(none)"}`;

    const reply = await complete(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { temperature }
    );

    const dialogue = sanitize(reply, MAX_TURN_CHARS);
    history.push({ speaker, dialogue, turn, created_at: new Date().toISOString() });
    lastSpeaker = speaker;

    await emitEvent(
      speaker,
      "roundtable_turn",
      `${agent?.display_name || speaker}: ${dialogue}`,
      dialogue
    );

    await sleep(1000 + Math.random() * 2000);
  }

  return history;
}

async function distillMemories(history, sessionId) {
  if (!history?.length) return [];

  const agentIds = [...new Set(history.map((h) => h.speaker))];
  const agents = await loadAgents(agentIds);
  const agentMap = new Map(agents.map((a) => [a.id, a]));

  const convText = history
    .map((h) => `${agentMap.get(h.speaker)?.display_name || h.speaker}: ${h.dialogue}`)
    .join("\n");

  const prompt = `Extract up to ${MAX_MEMORIES_PER_CONV} insights, patterns, or lessons from this conversation.
Return JSON only: {"memories":[{"agent_id":"...","type":"insight|pattern|lesson","content":"...","confidence":0.7}]}
Types: insight (discovery), pattern (observation), lesson (learned).
Confidence 0.55-0.95. Only include what's clearly supported.\n\nConversation:\n${convText}`;

  const reply = await complete([{ role: "user", content: prompt }]);
  let parsed;
  try {
    const json = reply.replace(/```json?\s*/g, "").trim();
    parsed = JSON.parse(json);
  } catch {
    return [];
  }

  const memories = parsed.memories || [];
  const valid = memories.filter(
    (m) => m.agent_id && m.type && m.content && (m.confidence ?? 0.6) >= MIN_CONFIDENCE
  );

  return valid.slice(0, MAX_MEMORIES_PER_CONV).map((m) => ({
    agent_id: m.agent_id,
    type: m.type,
    content: String(m.content).slice(0, 500),
    confidence: Math.min(0.95, Math.max(0.55, m.confidence ?? 0.6)),
    source_trace_id: `roundtable:${sessionId}:${m.agent_id}:${m.type}:${hash(String(m.content))}`,
  }));
}

async function writeMemories(memories) {
  for (const m of memories) {
    try {
      await query(
        `INSERT INTO ops_agent_memory (agent_id, type, content, confidence, source_trace_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (source_trace_id) WHERE source_trace_id IS NOT NULL DO NOTHING`,
        [m.agent_id, m.type, m.content, m.confidence, m.source_trace_id]
      );
    } catch (err) {
      console.error(`Memory write failed:`, err.message);
    }
  }
}

async function runOnce() {
  const { rows: pending } = await query(
    `SELECT id, format, topic, participants
     FROM ops_roundtable_queue
     WHERE status = 'pending'
     ORDER BY created_at ASC LIMIT 1`
  );

  if (!pending?.length) return;

  const session = pending[0];

  const { rowCount } = await query(
    `UPDATE ops_roundtable_queue
     SET status = 'running', started_at = $1
     WHERE id = $2 AND status = 'pending'`,
    [new Date().toISOString(), session.id]
  );

  if (!rowCount) return;

  try {
    const history = await runConversation(session);

    await query(
      `UPDATE ops_roundtable_queue
       SET status = 'succeeded', completed_at = $1, history = $2
       WHERE id = $3`,
      [new Date().toISOString(), JSON.stringify(history), session.id]
    );

    const memories = await distillMemories(history, session.id);
    await writeMemories(memories);

    console.log(`[${WORKER_ID}] Roundtable ${session.id} done, ${memories.length} memories`);
  } catch (err) {
    console.error(`[${WORKER_ID}] Roundtable ${session.id} failed:`, err.message);
    await query(
      `UPDATE ops_roundtable_queue SET status = 'failed', completed_at = $1 WHERE id = $2`,
      [new Date().toISOString(), session.id]
    );
  }
}

async function main() {
  console.log(`[${WORKER_ID}] Starting (poll ${POLL_MS}ms)`);

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
