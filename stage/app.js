/**
 * Stage — Ops dashboard app
 * Fetches events and missions from Supabase
 */
(function () {
  const config = window.STAGE_CONFIG || {};
  const needsSetup =
    !config.supabaseUrl ||
    !config.supabaseAnonKey ||
    config.supabaseUrl.includes("your-project") ||
    config.supabaseAnonKey.includes("your-anon");

  if (needsSetup) {
    document.getElementById("stage-setup").hidden = false;
    document.querySelector(".stage-main").style.opacity = "0.5";
    document.querySelector(".stage-main").style.pointerEvents = "none";
    return;
  }

  const sb = window.supabase?.createClient(config.supabaseUrl, config.supabaseAnonKey);
  if (!sb) {
    console.error("Supabase client not loaded");
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

  // ── Agents ───────────────────────────────────────────────

  async function loadAgents() {
    const { data, error } = await sb.from("ops_agents").select("id, display_name, role").eq("enabled", true);
    if (error) {
      console.error("Agents load failed:", error);
      return;
    }
    agentsCache = data || [];
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
    agentsCache.forEach((a) => {
      const opt = document.createElement("option");
      opt.value = a.id;
      opt.textContent = a.display_name || a.id;
      $filterAgent.appendChild(opt);
    });
  }

  // ── Signal feed ──────────────────────────────────────────

  async function loadEvents() {
    const agentId = $filterAgent?.value || "";
    const kind = $filterKind?.value || "";

    let q = sb
      .from("ops_agent_events")
      .select("id, agent_id, kind, title, summary, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (agentId) q = q.eq("agent_id", agentId);
    if (kind) q = q.eq("kind", kind);

    const { data, error } = await q;
    if (error) {
      console.error("Events load failed:", error);
      return;
    }

    eventKinds = new Set((data || []).map((e) => e.kind));
    populateKindFilter();

    $feedEmpty.hidden = (data || []).length > 0;
    $feedList.querySelectorAll(".feed-item").forEach((el) => el.remove());

    (data || []).forEach((e) => appendFeedItem(e));
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
    const { data: missions, error } = await sb
      .from("ops_missions")
      .select("id, title, status, created_by, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Missions load failed:", error);
      return;
    }

    if (!missions?.length) {
      $missionsEmpty.hidden = false;
      $missionsList.querySelectorAll(".mission-card").forEach((el) => el.remove());
      return;
    }

    $missionsEmpty.hidden = true;

    const missionIds = missions.map((m) => m.id);
    const { data: steps } = await sb
      .from("ops_mission_steps")
      .select("mission_id, kind, status")
      .in("mission_id", missionIds);

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
  }

  // ── Realtime subscription ───────────────────────────────

  function subscribeToEvents() {
    sb.channel("ops_events")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ops_agent_events",
        },
        (payload) => {
          appendFeedItem(payload.new);
          $feedEmpty.hidden = true;
        }
      )
      .subscribe();
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

    subscribeToEvents();

    setInterval(loadMissions, 30000);
  }

  init();
})();
