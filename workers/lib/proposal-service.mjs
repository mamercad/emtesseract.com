import { query } from "./db.mjs";

// ── Cap Gates ──────────────────────────────────────────────

async function getPolicy(key) {
  const { rows, error } = await query(
    "SELECT value FROM ops_policy WHERE key = $1",
    [key]
  );
  if (error) return {};
  return rows?.[0]?.value ?? {};
}

const ALLOWED_TABLES = ["ops_tweet_metrics", "ops_mission_steps"];
const ALLOWED_DATE_COLS = ["created_at", "posted_at"];

async function countTodayByKind(kind) {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { rows, error } = await query(
    "SELECT COUNT(*)::int FROM ops_mission_steps WHERE kind = $1 AND created_at >= $2",
    [kind, startOfDay.toISOString()]
  );
  return error ? 0 : (rows?.[0]?.count ?? 0);
}

async function countToday(table, column = "created_at") {
  if (!ALLOWED_TABLES.includes(table) || !ALLOWED_DATE_COLS.includes(column)) return 0;
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const { rows, error } = await query(
    `SELECT COUNT(*)::int FROM ${table} WHERE ${column} >= $1`,
    [startOfDay.toISOString()]
  );
  return error ? 0 : (rows?.[0]?.count ?? 0);
}

const STEP_KIND_GATES = {
  post_tweet: async () => {
    const quota = await getPolicy("x_daily_quota");
    const posted = await countToday("ops_tweet_metrics", "posted_at");
    if (posted >= (quota.limit ?? 8)) {
      return { ok: false, reason: `Tweet quota full (${posted}/${quota.limit})` };
    }
    return { ok: true };
  },

  write_content: async () => {
    const policy = await getPolicy("content_policy");
    if (!policy.enabled) return { ok: true };
    const drafts = await countTodayByKind("write_content");
    if (drafts >= (policy.max_drafts_per_day ?? 8)) {
      return { ok: false, reason: `Content draft quota full` };
    }
    return { ok: true };
  },

  crawl: async () => {
    const policy = await getPolicy("crawl_policy");
    if (!policy?.enabled) return { ok: true };
    const crawled = await countTodayByKind("crawl");
    if (crawled >= (policy.max_crawls_per_day ?? 20)) {
      return { ok: false, reason: `Crawl quota full (${crawled}/${policy.max_crawls_per_day})` };
    }
    return { ok: true };
  },
};

async function checkGates(proposedSteps) {
  for (const step of proposedSteps) {
    const gate = STEP_KIND_GATES[step.kind];
    if (gate) {
      const result = await gate();
      if (!result.ok) return result;
    }
  }
  return { ok: true };
}

// ── Auto-approve evaluation ────────────────────────────────

async function shouldAutoApprove(proposedSteps) {
  const policy = await getPolicy("auto_approve");
  if (!policy.enabled) return false;

  const allowed = policy.allowed_step_kinds ?? [];
  return proposedSteps.every((s) => allowed.includes(s.kind));
}

// ── Main entry point ───────────────────────────────────────

export async function createProposal({ agentId, title, proposedSteps }) {
  const gateResult = await checkGates(proposedSteps);
  if (!gateResult.ok) {
    const { rows: inserted } = await query(
      `INSERT INTO ops_mission_proposals (agent_id, title, status, proposed_steps, rejection_reason)
       VALUES ($1, $2, 'rejected', $3, $4)
       RETURNING id`,
      [agentId, title, JSON.stringify(proposedSteps), gateResult.reason]
    );
    await emitEvent(agentId, "proposal_rejected", title, gateResult.reason);
    return { accepted: false, proposalId: inserted?.[0]?.id, reason: gateResult.reason };
  }

  const { rows: proposal, error: insertErr } = await query(
    `INSERT INTO ops_mission_proposals (agent_id, title, status, proposed_steps)
     VALUES ($1, $2, 'pending', $3)
     RETURNING id`,
    [agentId, title, JSON.stringify(proposedSteps)]
  );

  if (insertErr) throw new Error(`Proposal insert failed: ${insertErr.message}`);

  const prop = proposal[0];
  const autoApprove = await shouldAutoApprove(proposedSteps);

  if (autoApprove) {
    await query(
      "UPDATE ops_mission_proposals SET status = 'accepted' WHERE id = $1",
      [prop.id]
    );

    const mission = await createMissionFromProposal(prop.id, agentId, title, proposedSteps);

    await emitEvent(agentId, "proposal_accepted", title, `Auto-approved → mission ${mission.id}`);
    return { accepted: true, proposalId: prop.id, missionId: mission.id };
  }

  await emitEvent(agentId, "proposal_pending", title, "Awaiting manual approval");
  return { accepted: false, proposalId: prop.id, reason: "pending_review" };
}

// ── Manual approval / rejection ────────────────────────────

export async function acceptProposal(proposalId) {
  const { rows: prop, error } = await query(
    "SELECT id, agent_id, title, status, proposed_steps FROM ops_mission_proposals WHERE id = $1",
    [proposalId]
  );
  if (error || !prop?.length) throw new Error("Proposal not found");
  const p = prop[0];
  if (p.status !== "pending") throw new Error(`Proposal not pending (status: ${p.status})`);

  const proposedSteps = typeof p.proposed_steps === "string" ? JSON.parse(p.proposed_steps) : p.proposed_steps ?? [];
  const gateResult = await checkGates(proposedSteps);
  if (!gateResult.ok) {
    await query(
      "UPDATE ops_mission_proposals SET status = 'rejected', rejection_reason = $1, updated_at = $2 WHERE id = $3",
      [gateResult.reason, new Date().toISOString(), proposalId]
    );
    await emitEvent(p.agent_id, "proposal_rejected", p.title, gateResult.reason);
    return { accepted: false, reason: gateResult.reason };
  }

  await query(
    "UPDATE ops_mission_proposals SET status = 'accepted', updated_at = $1 WHERE id = $2",
    [new Date().toISOString(), proposalId]
  );
  const mission = await createMissionFromProposal(p.id, p.agent_id, p.title, proposedSteps);
  await emitEvent(p.agent_id, "proposal_accepted", p.title, `Manual approval → mission ${mission.id}`);
  return { accepted: true, missionId: mission.id };
}

export async function rejectProposal(proposalId, reason = "") {
  const { rows: prop, error } = await query(
    "SELECT id, agent_id, title, status FROM ops_mission_proposals WHERE id = $1",
    [proposalId]
  );
  if (error || !prop?.length) throw new Error("Proposal not found");
  const p = prop[0];
  if (p.status !== "pending") throw new Error(`Proposal not pending (status: ${p.status})`);

  await query(
    "UPDATE ops_mission_proposals SET status = 'rejected', rejection_reason = $1, updated_at = $2 WHERE id = $3",
    [reason || "Rejected by operator", new Date().toISOString(), proposalId]
  );
  await emitEvent(p.agent_id, "proposal_rejected", p.title, reason || "Rejected by operator");
  return { accepted: false, reason: reason || "Rejected by operator" };
}

// ── Mission creation ───────────────────────────────────────

async function createMissionFromProposal(proposalId, agentId, title, proposedSteps) {
  const { rows: mission, error: missionErr } = await query(
    `INSERT INTO ops_missions (proposal_id, title, status, created_by)
     VALUES ($1, $2, 'approved', $3)
     RETURNING id`,
    [proposalId, title, agentId]
  );

  if (missionErr) throw new Error(`Mission insert failed: ${missionErr.message}`);
  const m = mission[0];

  for (const s of proposedSteps) {
    await query(
      `INSERT INTO ops_mission_steps (mission_id, kind, payload)
       VALUES ($1, $2, $3)`,
      [m.id, s.kind, JSON.stringify(s.payload ?? {})]
    );
  }

  return m;
}

// ── Event helper ───────────────────────────────────────────

async function emitEvent(agentId, kind, title, summary) {
  await query(
    `INSERT INTO ops_agent_events (agent_id, kind, title, summary, tags)
     VALUES ($1, $2, $3, $4, $5)`,
    [agentId, kind, title, summary, [kind]]
  );
}
