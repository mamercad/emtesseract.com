import { sb } from "./supabase.mjs";

// ── Cap Gates ──────────────────────────────────────────────
// Each step kind can have a gate that checks quotas before
// a proposal is accepted.

async function getPolicy(key) {
  const { data } = await sb
    .from("ops_policy")
    .select("value")
    .eq("key", key)
    .single();
  return data?.value ?? {};
}

async function countToday(table, column = "created_at") {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const { count } = await sb
    .from(table)
    .select("*", { count: "exact", head: true })
    .gte(column, startOfDay.toISOString());

  return count ?? 0;
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
    const drafts = await countToday("ops_mission_steps");
    if (drafts >= (policy.max_drafts_per_day ?? 8)) {
      return { ok: false, reason: `Content draft quota full` };
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

/**
 * Single entry point for all proposal creation.
 * Every proposal — from triggers, reactions, initiatives, or
 * direct agent requests — goes through this function.
 */
export async function createProposal({ agentId, title, proposedSteps }) {
  // 1. Check cap gates — reject immediately if quota is full
  const gateResult = await checkGates(proposedSteps);
  if (!gateResult.ok) {
    const { data: rejected } = await sb
      .from("ops_mission_proposals")
      .insert({
        agent_id: agentId,
        title,
        status: "rejected",
        proposed_steps: proposedSteps,
        rejection_reason: gateResult.reason,
      })
      .select("id")
      .single();

    await emitEvent(agentId, "proposal_rejected", title, gateResult.reason);
    return { accepted: false, proposalId: rejected?.id, reason: gateResult.reason };
  }

  // 2. Insert proposal as pending
  const { data: proposal, error: insertErr } = await sb
    .from("ops_mission_proposals")
    .insert({
      agent_id: agentId,
      title,
      status: "pending",
      proposed_steps: proposedSteps,
    })
    .select("id")
    .single();

  if (insertErr) throw new Error(`Proposal insert failed: ${insertErr.message}`);

  // 3. Evaluate auto-approve
  const autoApprove = await shouldAutoApprove(proposedSteps);

  if (autoApprove) {
    // Accept the proposal
    await sb
      .from("ops_mission_proposals")
      .update({ status: "accepted" })
      .eq("id", proposal.id);

    // Create mission + steps
    const mission = await createMissionFromProposal(proposal.id, agentId, title, proposedSteps);

    await emitEvent(agentId, "proposal_accepted", title, `Auto-approved → mission ${mission.id}`);
    return { accepted: true, proposalId: proposal.id, missionId: mission.id };
  }

  // Not auto-approved — stays pending for manual review
  await emitEvent(agentId, "proposal_pending", title, "Awaiting manual approval");
  return { accepted: false, proposalId: proposal.id, reason: "pending_review" };
}

// ── Mission creation ───────────────────────────────────────

async function createMissionFromProposal(proposalId, agentId, title, proposedSteps) {
  const { data: mission, error: missionErr } = await sb
    .from("ops_missions")
    .insert({
      proposal_id: proposalId,
      title,
      status: "approved",
      created_by: agentId,
    })
    .select("id")
    .single();

  if (missionErr) throw new Error(`Mission insert failed: ${missionErr.message}`);

  // Create steps
  const steps = proposedSteps.map((s) => ({
    mission_id: mission.id,
    kind: s.kind,
    payload: s.payload ?? {},
  }));

  const { error: stepsErr } = await sb.from("ops_mission_steps").insert(steps);
  if (stepsErr) throw new Error(`Steps insert failed: ${stepsErr.message}`);

  return mission;
}

// ── Event helper ───────────────────────────────────────────

async function emitEvent(agentId, kind, title, summary) {
  await sb.from("ops_agent_events").insert({
    agent_id: agentId,
    kind,
    title,
    summary,
    tags: [kind],
  });
}
