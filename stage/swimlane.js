/**
 * Swimlane — workflow board view
 * Fetches work items from /api/ops_work_items, renders cards in columns by stage
 */
(function () {
  const config = window.STAGE_CONFIG || {};
  const apiUrl = (config.apiUrl ?? "").replace(/\/$/, "");

  const $board = document.getElementById("swimlane-board");
  const $empty = document.getElementById("swimlane-empty");

  function escapeHtml(s) {
    if (!s) return "";
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function formatTime(iso) {
    const d = new Date(iso);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return "now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

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

    card.innerHTML = `
      <span class="swimlane-card__agent swimlane-card__agent--${accent}">${escapeHtml(item.agent)}</span>
      <h4 class="swimlane-card__title">${escapeHtml(item.title)}</h4>
      ${item.steps_summary ? `<span class="swimlane-card__steps">${escapeHtml(item.steps_summary)}</span>` : ""}
      <span class="swimlane-card__time">${formatTime(item.created_at)}</span>
      ${link}
    `;
    return card;
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

      for (const lane of Object.values(lanes)) {
        lane.innerHTML = "";
      }

      for (const item of items) {
        const lane = lanes[item.stage];
        if (lane) {
          const card = renderCard(item);
          lane.appendChild(card);
        }
      }
    } catch (err) {
      console.error("Work items load failed:", err);
      $board.hidden = true;
      $empty.hidden = false;
      $empty.textContent = "Failed to load work items.";
    }
  }

  loadWorkItems();
  setInterval(loadWorkItems, 15000);
})();
