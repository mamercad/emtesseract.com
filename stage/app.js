/**
 * Stage — Ops dashboard app
 * Fetches events and missions from local API (replaces Supabase)
 */
(function () {
  const config = window.STAGE_CONFIG || {};
  const apiUrl = (config.apiUrl ?? "").replace(/\/$/, "");
  const needsSetup = false; // empty apiUrl = same origin (relative fetch)

  if (needsSetup) {
    document.getElementById("stage-setup").hidden = false;
    document.querySelector(".stage-main").style.opacity = "0.5";
    document.querySelector(".stage-main").style.pointerEvents = "none";
    return;
  }

  const $agentsGrid = document.getElementById("agents-grid");
  const $feedList = document.getElementById("feed-list");
  const $feedEmpty = document.getElementById("feed-empty");
  const $missionsList = document.getElementById("missions-list");
  const $missionsEmpty = document.getElementById("missions-empty");
  const $filterAgent = document.getElementById("filter-agent");
  const $filterKind = document.getElementById("filter-kind");

  let agentsCache = [];
  let eventKinds = new Set();

  async function fetchApi(path, params = {}) {
    const qs = new URLSearchParams(params).toString();
    const url = qs ? `${apiUrl}${path}?${qs}` : `${apiUrl}${path}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.statusText);
    return res.json();
  }

  // ── Agents ───────────────────────────────────────────────

  async function loadAgents() {
    try {
      const { data } = await fetchApi("/api/ops_agents");
      agentsCache = data || [];
    } catch (err) {
      console.error("Agents load failed:", err);
      agentsCache = [];
    }
    renderAgents();
    populateFilters();
  }

  function renderAgents() {
    if (!agentsCache.length) {
      $agentsGrid.innerHTML = "<p class='feed-empty'>No agents</p>";
      return;
    }
    $agentsGrid.innerHTML = agentsCache
      .map(
        (a) =>
          `<div class="agent-avatar" data-role="${a.role || ""}" data-id="${a.id}">
            <span class="agent-avatar__pixel"></span>
            <span>${escapeHtml(a.display_name || a.id)}</span>
          </div>`
      )
      .join("");
  }

  function populateFilters() {
    if (!$filterAgent) return;
    $filterAgent.innerHTML = '<option value="">All agents</option>';
    agentsCache.forEach((a) => {
      const opt = document.createElement("option");
      opt.value = a.id;
      opt.textContent = a.display_name || a.id;
      $filterAgent.appendChild(opt);
    });
  }

  // ── Signal feed ───────────────────────────────────────────

  async function loadEvents() {
    const params = {};
    if ($filterAgent?.value) params.agent_id = $filterAgent.value;
    if ($filterKind?.value) params.kind = $filterKind.value;

    try {
      const { data } = await fetchApi("/api/ops_agent_events", params);
      eventKinds = new Set((data || []).map((e) => e.kind));
      populateKindFilter();

      $feedEmpty.hidden = (data || []).length > 0;
      $feedList.querySelectorAll(".feed-item").forEach((el) => el.remove());

      (data || []).forEach((e) => appendFeedItem(e));
    } catch (err) {
      console.error("Events load failed:", err);
    }
  }

  function appendFeedItem(e) {
    const existing = $feedList.querySelector(`[data-id="${e.id}"]`);
    if (existing) return;

    const item = document.createElement("div");
    item.className = "feed-item";
    item.dataset.id = e.id;
    item.innerHTML = `
      <span class="feed-item__kind">${escapeHtml(e.kind)}</span>
      <span class="feed-item__agent">${escapeHtml(e.agent_id)}</span>
      <span class="feed-item__content">${escapeHtml(e.title)}${e.summary ? ": " + escapeHtml(e.summary) : ""}</span>
      <span class="feed-item__time">${formatTime(e.created_at)}</span>`;
    $feedList.insertBefore(item, $feedList.firstChild);
  }

  function populateKindFilter() {
    if (!$filterKind) return;
    const current = $filterKind.value;
    $filterKind.innerHTML = '<option value="">All kinds</option>';
    eventKinds.forEach((k) => {
      const opt = document.createElement("option");
      opt.value = k;
      opt.textContent = k;
      if (k === current) opt.selected = true;
      $filterKind.appendChild(opt);
    });
  }

  // ── Missions ─────────────────────────────────────────────

  async function loadMissions() {
    try {
      const { data: missions } = await fetchApi("/api/ops_missions");

      if (!missions?.length) {
        $missionsEmpty.hidden = false;
        $missionsList.querySelectorAll(".mission-card").forEach((el) => el.remove());
        return;
      }

      $missionsEmpty.hidden = true;

      const missionIds = missions.map((m) => m.id);
      const { data: steps } = await fetchApi("/api/ops_mission_steps", {
        mission_ids: missionIds.join(","),
      });

      const stepsByMission = (steps || []).reduce((acc, s) => {
        if (!acc[s.mission_id]) acc[s.mission_id] = [];
        acc[s.mission_id].push(s);
        return acc;
      }, {});

      $missionsList.innerHTML = missions
        .map(
          (m) => `
        <article class="mission-card" data-id="${m.id}">
          <h3 class="mission-card__title">${escapeHtml(m.title)}</h3>
          <div class="mission-card__meta">
            <span class="mission-card__status mission-card__status--${m.status}">${m.status}</span>
            <span>${escapeHtml(m.created_by)}</span>
            <span>${formatTime(m.created_at)}</span>
          </div>
          ${
            stepsByMission[m.id]?.length
              ? `
          <div class="mission-card__steps">
            ${stepsByMission[m.id]
              .map(
                (s) =>
                  `<div class="mission-step">
                <span class="mission-step__status mission-step__status--${s.status}"></span>
                <span class="mission-step__kind">${escapeHtml(s.kind)}</span>
                <span>${s.status}</span>
              </div>`
              )
              .join("")}
          </div>`
              : ""
          }
        </article>`
        )
        .join("");
    } catch (err) {
      console.error("Missions load failed:", err);
    }
  }

  // ── Helpers ───────────────────────────────────────────────

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

  // ── Init ──────────────────────────────────────────────────

  async function init() {
    await loadAgents();
    await loadEvents();
    await loadMissions();

    $filterAgent?.addEventListener("change", loadEvents);
    $filterKind?.addEventListener("change", loadEvents);

    // Poll instead of realtime (no Supabase)
    setInterval(loadEvents, 10000);
    setInterval(loadMissions, 30000);
  }

  init();
})();
