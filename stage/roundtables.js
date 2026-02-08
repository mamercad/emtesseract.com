/**
 * Roundtables — Watch agent-to-agent conversations.
 * Fetches from /api/roundtables and /api/roundtables/:id
 */
(function () {
  const { escapeHtml, formatTime } = window.STAGE_UTILS;
  const config = window.STAGE_CONFIG || {};
  const apiUrl = (config.apiUrl ?? "").replace(/\/$/, "");

  const $list = document.getElementById("roundtables-list");
  const $empty = document.getElementById("roundtables-empty");
  const $transcript = document.getElementById("roundtables-transcript");
  const $welcome = document.getElementById("roundtables-welcome");

  let agentsMap = new Map();
  let selectedId = null;

  async function fetchApi(path) {
    const res = await fetch(`${apiUrl}${path}`);
    if (!res.ok) throw new Error(res.statusText);
    return res.json();
  }

  async function loadAgents() {
    try {
      const { data } = await fetchApi("/api/ops_agents");
      agentsMap = new Map((data || []).map((a) => [a.id, a]));
    } catch {
      agentsMap = new Map();
    }
  }

  function agentName(id) {
    return agentsMap.get(id)?.display_name || id;
  }

  function formatLabel(format) {
    const labels = { watercooler: "Watercooler", standup: "Standup", debate: "Debate" };
    return labels[format] || format;
  }

  function statusClass(status) {
    const map = { succeeded: "ok", failed: "fail", running: "pending", pending: "pending" };
    return map[status] || "pending";
  }

  function renderList(items) {
    if (!items?.length) {
      $empty.hidden = false;
      $list.innerHTML = "";
      return;
    }
    $empty.hidden = true;
    $list.innerHTML = items
      .map(
        (r) =>
          `<button type="button" class="roundtable-card ${selectedId === r.id ? "roundtable-card--active" : ""}" data-id="${escapeHtml(r.id)}" role="listitem">
            <span class="roundtable-card__format roundtable-card__format--${escapeHtml(r.format)}">${escapeHtml(formatLabel(r.format))}</span>
            <span class="roundtable-card__topic">${escapeHtml(r.topic || "—")}</span>
            <span class="roundtable-card__meta">
              ${(r.participants || []).map((p) => escapeHtml(agentName(p))).join(", ")}
            </span>
            <span class="roundtable-card__status roundtable-card__status--${statusClass(r.status)}">${escapeHtml(r.status)}</span>
            <span class="roundtable-card__time">${escapeHtml(formatTime(r.completed_at || r.created_at))}</span>
          </button>`
      )
      .join("");
    $list.querySelectorAll(".roundtable-card").forEach((btn) => {
      btn.addEventListener("click", () => selectRoundtable(btn.dataset.id));
    });
  }

  function renderTranscript(roundtable) {
    if (!roundtable) {
      $welcome.hidden = false;
      $transcript.innerHTML = "";
      return;
    }
    $welcome.hidden = true;
    const history = roundtable.history || [];
    if (!history.length) {
      $transcript.innerHTML = `<div class="roundtables-transcript-empty">No transcript. Conversation may still be running.</div>`;
      return;
    }
    $transcript.innerHTML = `
      <div class="roundtables-transcript-header">
        <span class="roundtables-transcript__format">${escapeHtml(formatLabel(roundtable.format))}</span>
        <span class="roundtables-transcript__topic">${escapeHtml(roundtable.topic || "—")}</span>
        <span class="roundtables-transcript__participants">${(roundtable.participants || []).map((p) => escapeHtml(agentName(p))).join(", ")}</span>
      </div>
      <div class="roundtables-transcript-messages">
        ${history
          .map(
            (h) =>
              `<div class="chat-msg chat-msg--assistant roundtable-msg">
                <div class="chat-msg__bubble">
                  <span class="chat-msg__agent">${escapeHtml(agentName(h.speaker))}</span>
                  <span class="chat-msg__content">${escapeHtml(h.dialogue || "")}</span>
                </div>
              </div>`
          )
          .join("")}
      </div>
    `;
  }

  async function selectRoundtable(id) {
    selectedId = id;
    loadList();
    try {
      const { data } = await fetchApi(`/api/roundtables/${id}`);
      renderTranscript(data);
    } catch (err) {
      renderTranscript(null);
      $transcript.innerHTML = `<div class="roundtables-transcript-error">Failed to load: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function loadList() {
    try {
      const { data } = await fetchApi("/api/roundtables");
      renderList(data || []);
    } catch (err) {
      $empty.hidden = false;
      $empty.textContent = `Failed to load: ${err.message}`;
      $list.innerHTML = "";
    }
  }

  async function init() {
    await loadAgents();
    await loadList();
  }

  init();
})();
