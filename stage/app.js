/**
 * Stage — Ops dashboard app
 * Fetches events and missions from local API (replaces Supabase)
 */
(function () {
  const { escapeHtml, formatTime, installVisibilityPolling } = window.STAGE_UTILS;
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
  const $giveTaskToggle = document.getElementById("give-task-toggle");
  const $giveTaskForm = document.getElementById("give-task-form");
  const $giveTaskFormInner = document.getElementById("give-task-form-inner");
  const $giveTaskAgent = document.getElementById("give-task-agent");
  const $giveTaskTitle = document.getElementById("give-task-title");
  const $giveTaskKind = document.getElementById("give-task-kind");
  const $giveTaskTopic = document.getElementById("give-task-topic");
  const $giveTaskFeedback = document.getElementById("give-task-feedback");

  let agentsCache = [];
  let eventKinds = new Set();
  let previousMissionIds = new Set();

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
    if ($giveTaskAgent) {
      const current = $giveTaskAgent.value;
      $giveTaskAgent.innerHTML = '<option value="">Select agent</option>';
      agentsCache.forEach((a) => {
        const opt = document.createElement("option");
        opt.value = a.id;
        opt.textContent = a.display_name || a.id;
        if (a.id === current) opt.selected = true;
        $giveTaskAgent.appendChild(opt);
      });
    }
  }

  // ── Signal feed ───────────────────────────────────────────

  async function loadEvents(opts = {}) {
    const fullReplace = opts.fullReplace ?? false;
    const params = {};
    if ($filterAgent?.value) params.agent_id = $filterAgent.value;
    if ($filterKind?.value) params.kind = $filterKind.value;

    try {
      const { data } = await fetchApi("/api/ops_agent_events", params);
      const events = data || [];
      eventKinds = new Set(events.map((e) => e.kind));
      populateKindFilter();

      $feedEmpty.hidden = events.length > 0;

      if (fullReplace) {
        $feedList.querySelectorAll(".feed-item").forEach((el) => el.remove());
        events.forEach((e) => appendFeedItem(e, "append"));
      } else {
        const newEvents = events.filter((e) => !$feedList.querySelector(`[data-id="${e.id}"]`));
        for (let i = newEvents.length - 1; i >= 0; i--) appendFeedItem(newEvents[i], "prepend");
      }
    } catch (err) {
      console.error("Events load failed:", err);
    }
  }

  function appendFeedItem(e, mode) {
    const item = document.createElement("div");
    item.className = "feed-item feed-item--new";
    item.dataset.id = e.id;
    item.innerHTML = `
      <span class="feed-item__kind">${escapeHtml(e.kind)}</span>
      ${e.id ? `<span class="feed-item__id" title="${e.id}">${String(e.id).slice(0, 8)}</span>` : ""}
      <span class="feed-item__agent">${escapeHtml(e.agent_id)}</span>
      <span class="feed-item__content">${escapeHtml(e.title)}${e.summary ? ": " + escapeHtml(e.summary) : ""}</span>
      <span class="feed-item__time">${formatTime(e.created_at)}</span>`;
    if (mode === "prepend") {
      $feedList.insertBefore(item, $feedList.firstChild);
    } else {
      $feedList.appendChild(item);
    }
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

  function missionCardHtml(m, stepsByMission) {
    const steps = stepsByMission[m.id] || [];
    const stepsHtml = steps.length
      ? `
          <div class="mission-card__steps">
            ${steps
              .map((s) => {
                const draft = s.result?.draft;
                const analysis = s.result?.analysis;
                const content = draft ?? analysis;
                const artifactId = s.result?.artifact_id;
                const artifactLink = artifactId
                  ? `<a href="/stage/artifacts.html?id=${artifactId}" class="mission-step__artifact-link">View/Edit doc</a>`
                  : "";
                return `<div class="mission-step">
                <span class="mission-step__status mission-step__status--${s.status}"></span>
                <span class="mission-step__kind">${escapeHtml(s.kind)}</span>
                <span>${s.status}</span>
                ${content ? `<div class="mission-step__result">${escapeHtml(content)}</div>` : ""}
                ${artifactLink}
              </div>`;
              })
              .join("")}
          </div>`
      : "";
    return `
        <h3 class="mission-card__title">${escapeHtml(m.title)}</h3>
        <div class="mission-card__meta">
          <span class="mission-card__status mission-card__status--${m.status}">${m.status}</span>
          <span class="mission-card__id" title="${m.id}">${m.id.slice(0, 8)}</span>
          <span>${escapeHtml(m.created_by)}</span>
          <span>${formatTime(m.created_at)}</span>
        </div>
        ${stepsHtml}`;
  }

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

      const currentMissionIds = new Set(missions.map((m) => m.id));
      const newMissionIds =
        previousMissionIds.size > 0
          ? new Set([...currentMissionIds].filter((id) => !previousMissionIds.has(id)))
          : new Set();
      previousMissionIds = currentMissionIds;

      const existingCards = new Map();
      $missionsList.querySelectorAll(".mission-card").forEach((el) => {
        const id = el.dataset.id;
        if (id) existingCards.set(id, el);
      });

      for (let i = 0; i < missions.length; i++) {
        const m = missions[i];
        const isNew = newMissionIds.has(m.id);
        let card = existingCards.get(m.id);
        if (card) {
          card.className = `mission-card ${isNew ? "mission-card--new" : ""}`;
          card.innerHTML = missionCardHtml(m, stepsByMission);
        } else {
          card = document.createElement("article");
          card.className = `mission-card ${isNew ? "mission-card--new" : ""}`;
          card.id = `mission-${m.id}`;
          card.dataset.id = m.id;
          card.innerHTML = missionCardHtml(m, stepsByMission);
          const nextMission = missions[i + 1];
          const nextCard = nextMission ? existingCards.get(nextMission.id) : null;
          if (nextCard) {
            $missionsList.insertBefore(card, nextCard);
          } else {
            $missionsList.appendChild(card);
          }
        }
      }

      existingCards.forEach((card, id) => {
        if (!currentMissionIds.has(id)) card.remove();
      });
    } catch (err) {
      console.error("Missions load failed:", err);
    }
  }

  // ── Give task ──────────────────────────────────────────────

  function setupGiveTask() {
    if (!$giveTaskToggle || !$giveTaskForm) return;

    $giveTaskToggle.addEventListener("click", () => {
      const isOpen = !$giveTaskForm.hidden;
      $giveTaskForm.hidden = isOpen;
      $giveTaskToggle.setAttribute("aria-expanded", String(!isOpen));
      if (!isOpen) $giveTaskFeedback.hidden = true;
    });

    $giveTaskFormInner?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const agentId = $giveTaskAgent?.value;
      const title = ($giveTaskTitle?.value || "").trim() || "[human] Task";
      const kind = $giveTaskKind?.value || "analyze";
      const topic = ($giveTaskTopic?.value || "").trim();

      if (!agentId || !topic) {
        showGiveTaskFeedback("Agent and topic required", "error");
        return;
      }

      $giveTaskFeedback.hidden = true;
      try {
        const res = await fetch(apiUrl + "/api/proposals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agent_id: agentId,
            title,
            steps: [{ kind, payload: { topic } }],
          }),
        });
        const text = await res.text();
        let data;
        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          showGiveTaskFeedback(res.ok ? "Invalid response" : `Request failed (${res.status})`, "error");
          return;
        }

        if (!res.ok) {
          const msg = data.error || (res.status === 404 ? "API endpoint not found. Restart emtesseract-api." : "Request failed");
          showGiveTaskFeedback(msg, "error");
          return;
        }

        if (data.accepted) {
          showGiveTaskFeedback(`Task created → mission ${data.missionId ?? "pending"}`, "success");
          $giveTaskFormInner.reset();
          loadMissions();
        } else {
          showGiveTaskFeedback(data.reason || "Rejected", "error");
        }
      } catch (err) {
        showGiveTaskFeedback(err.message || "Network error", "error");
      }
    });
  }

  function showGiveTaskFeedback(msg, type) {
    if (!$giveTaskFeedback) return;
    $giveTaskFeedback.textContent = msg;
    $giveTaskFeedback.className = "give-task-feedback give-task-feedback--" + (type || "success");
    $giveTaskFeedback.hidden = false;
  }

  // ── Init ──────────────────────────────────────────────────

  async function init() {
    await loadAgents();
    await loadEvents();
    await loadMissions();

    $filterAgent?.addEventListener("change", () => loadEvents({ fullReplace: true }));
    $filterKind?.addEventListener("change", () => loadEvents({ fullReplace: true }));
    setupGiveTask();

    // Poll when visible; pause when tab hidden (flicker-free incremental updates)
    installVisibilityPolling(() => loadEvents(), 10000);
    installVisibilityPolling(loadMissions, 20000);
  }

  init();
})();
