/**
 * Step worker — executes queued mission steps via Ollama.
 * Run on Boomer (or wherever Ollama runs): OLLAMA_BASE_URL=http://localhost:11434
 * Run elsewhere: OLLAMA_BASE_URL=http://boomer:11434
 */
import "./lib/env.mjs";
import { sb } from "./lib/supabase.mjs";
import { complete } from "./lib/llm.mjs";

const WORKER_ID = process.env.WORKER_ID || "step-worker-1";
const POLL_MS = parseInt(process.env.POLL_INTERVAL_MS || "15000", 10);
const STEP_KINDS = ["analyze"]; // MVP: only analyze

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function emitEvent(agentId, kind, title, summary) {
  await sb.from("ops_agent_events").insert({
    agent_id: agentId,
    kind,
    title,
    summary,
    tags: [kind],
  });
}

async function executeStep(step, mission) {
  const { kind, payload } = step;
  const agentId = mission.created_by;

  if (kind === "analyze") {
    const topic = payload.topic || payload.source || "general";
    const reply = await complete([
      {
        role: "user",
        content: `You are an analyst at emTesseract (game dev company). In 2–3 sentences, analyze: "${topic}". Be concise.`,
      },
    ]);
    return { result: { analysis: reply }, event: { kind: "analyze_complete", title: `Analyzed: ${topic}`, summary: reply.slice(0, 200) } };
  }

  throw new Error(`Unknown step kind: ${kind}`);
}

async function finalizeMission(missionId) {
  const { data: steps } = await sb.from("ops_mission_steps").select("status").eq("mission_id", missionId);
  const hasFailed = steps?.some((s) => s.status === "failed");
  const allDone = steps?.every((s) => s.status === "succeeded" || s.status === "failed");

  if (allDone) {
    await sb
      .from("ops_missions")
      .update({
        status: hasFailed ? "failed" : "succeeded",
        updated_at: new Date().toISOString(),
      })
      .eq("id", missionId);
  }
}

async function runOnce() {
  for (const kind of STEP_KINDS) {
    const { data: steps } = await sb
      .from("ops_mission_steps")
      .select("id, mission_id, kind, payload")
      .eq("status", "queued")
      .eq("kind", kind)
      .order("created_at", { ascending: true })
      .limit(1);

    if (!steps?.length) continue;

    const step = steps[0];

    const { data: claimed } = await sb
      .from("ops_mission_steps")
      .update({ status: "running", reserved_by: WORKER_ID, updated_at: new Date().toISOString() })
      .eq("id", step.id)
      .eq("status", "queued")
      .select("id, mission_id")
      .maybeSingle();

    if (!claimed) continue;

    const { data: mission } = await sb.from("ops_missions").select("id, created_by, title").eq("id", claimed.mission_id).single();
    if (!mission) continue;

    try {
      const { result, event } = await executeStep(step, mission);
      await sb
        .from("ops_mission_steps")
        .update({
          status: "succeeded",
          result,
          updated_at: new Date().toISOString(),
        })
        .eq("id", step.id);
      await emitEvent(mission.created_by, event.kind, event.title, event.summary);
      await finalizeMission(claimed.mission_id);
      console.log(`[${WORKER_ID}] ${kind} succeeded: ${step.id}`);
    } catch (err) {
      console.error(`[${WORKER_ID}] ${kind} failed:`, err.message);
      await sb
        .from("ops_mission_steps")
        .update({
          status: "failed",
          error: err.message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", step.id);
      await emitEvent(mission.created_by, "step_failed", `Step failed: ${kind}`, err.message);
      await finalizeMission(claimed.mission_id);
    }

    return;
  }
}

async function main() {
  console.log(`[${WORKER_ID}] Starting (Ollama, poll ${POLL_MS}ms)`);

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
