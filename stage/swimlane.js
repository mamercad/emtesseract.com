/**
 * Swimlane — workflow board view
 * Fetches work items from /api/ops_work_items, renders cards in columns by stage
 */
(function () {
  const { escapeHtml, formatTime, installVisibilityPolling } = window.STAGE_UTILS;
  const config = window.STAGE_CONFIG || {};
  const apiUrl = (config.apiUrl ?? "").replace(/\/$/, "");

  const $board = document.getElementById("swimlane-board");
  const $empty = document.getElementById("swimlane-empty");

  function roleToColor(agent) {
    const map = { coordinator: "pending", executor: "ok", observer: "muted", writer: "ok" };
    return map[agent] || "muted";
  }

  function renderCard(item) {
    const accent = roleToColor(item.agent);
    const card = document.createElement("article");
    card.className = `swimlane-card swimlane-card--${item.stage} swimlane-card--${item.status}`;
    card.dataset.id = item.id;
    card.dataset.type = item.type;

    let link = "";
    if (item.mission_id) {
      link = `<a href="/stage/#mission-${item.mission_id}" class="swimlane-card__link">View in Stage</a>`;
    }

    let actions = "";
    if (item.type === "proposal") {
      actions = `<div class="swimlane-card__actions">
        <button type="button" class="swimlane-card__btn swimlane-card__btn--approve" data-proposal-id="${item.id}">Approve</button>
        <button type="button" class="swimlane-card__btn swimlane-card__btn--reject" data-proposal-id="${item.id}">Reject</button>
      </div>`;
    }

    const taskId = item.mission_id || item.proposal_id || item.id;
    const shortId = taskId ? String(taskId).slice(0, 8) : "";
    card.innerHTML = `
      <span class="swimlane-card__agent swimlane-card__agent--${accent}">${escapeHtml(item.agent)}</span>
      ${shortId ? `<span class="swimlane-card__id" title="${taskId}">${shortId}</span>` : ""}
      <h4 class="swimlane-card__title">${escapeHtml(item.title)}</h4>
      ${item.steps_summary ? `<span class="swimlane-card__steps">${escapeHtml(item.steps_summary)}</span>` : ""}
      <span class="swimlane-card__time">${formatTime(item.created_at)}</span>
      ${actions}
      ${link}
    `;
    return card;
  }

  async function handleProposalAction(proposalId, action) {
    const base = apiUrl || "";
    const url = action === "approve"
      ? `${base}/api/proposals/${proposalId}/approve`
      : `${base}/api/proposals/${proposalId}/reject`;
    const body = action === "reject" ? JSON.stringify({ reason: prompt("Reject reason (optional):") || "" }) : undefined;
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    loadWorkItems();
  }

  async function loadWorkItems() {
    try {
      const url = apiUrl ? `${apiUrl}/api/ops_work_items` : "/api/ops_work_items";
      const res = await fetch(url);
      const text = await res.text();
      const data = text ? JSON.parse(text) : { data: [] };
      const items = data.data || [];

      if (!items.length) {
        $board.hidden = true;
        $empty.hidden = false;
        return;
      }

      $board.hidden = false;
      $empty.hidden = true;

      const lanes = {
        proposal: document.getElementById("lane-proposal"),
        approved: document.getElementById("lane-approved"),
        in_progress: document.getElementById("lane-in_progress"),
        done: document.getElementById("lane-done"),
      };

      const labelByStage = {
        proposal: "Proposal",
        approved: "Approved",
        in_progress: "In progress",
        done: "Done",
      };

      const counts = { proposal: 0, approved: 0, in_progress: 0, done: 0 };
      for (const item of items) {
        if (counts[item.stage] !== undefined) counts[item.stage]++;
      }
      for (const [stage, count] of Object.entries(counts)) {
        const col = document.querySelector(`.swimlane-column[data-stage="${stage}"]`);
        const title = col?.querySelector(".swimlane-column__title");
        if (title) title.textContent = `${labelByStage[stage]} (${count})`;
      }

      const itemsById = new Map(items.map((it) => [it.id, it]));
      const existingCards = new Map();
      for (const lane of Object.values(lanes)) {
        lane.querySelectorAll("[data-id]").forEach((el) => {
          existingCards.set(el.dataset.id, { card: el, lane });
        });
      }

      for (const item of items) {
        const lane = lanes[item.stage];
        if (!lane) continue;

        const existing = existingCards.get(item.id);
        let card;
        if (existing) {
          card = existing.card;
          if (existing.lane !== lane) {
            existing.lane.removeChild(card);
            lane.appendChild(card);
          }
          card.className = `swimlane-card swimlane-card--${item.stage} swimlane-card--${item.status}`;
          card.innerHTML = renderCard(item).innerHTML;
        } else {
          card = renderCard(item);
          lane.appendChild(card);
        }
      }

      existingCards.forEach(({ card }, id) => {
        if (!itemsById.has(id)) card.remove();
      });
    } catch (err) {
      console.error("Work items load failed:", err);
      $board.hidden = true;
      $empty.hidden = false;
      $empty.textContent = "Failed to load work items.";
    }
  }

  $board?.addEventListener("click", (e) => {
    const btn = e.target.closest(".swimlane-card__btn--approve, .swimlane-card__btn--reject");
    if (!btn) return;
    const proposalId = btn.dataset.proposalId;
    if (!proposalId) return;
    btn.disabled = true;
    const action = btn.classList.contains("swimlane-card__btn--approve") ? "approve" : "reject";
    handleProposalAction(proposalId, action).catch((err) => {
      alert(err.message || "Action failed");
      btn.disabled = false;
    });
  });

  loadWorkItems();
  installVisibilityPolling(loadWorkItems, 15000);
})();
