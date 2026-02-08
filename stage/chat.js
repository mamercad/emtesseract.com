/**
 * Chat — conversational UI for emTesseract agents.
 * Async: sends message, returns immediately, polls for response. History persists on server.
 */
(function () {
  const { escapeHtml } = window.STAGE_UTILS;
  const config = window.STAGE_CONFIG || {};
  const apiUrl = (config.apiUrl ?? "").replace(/\/$/, "");
  const SESSION_STORAGE_KEY = "emtesseract-chat-sessions";
  const POLL_INTERVAL_MS = 2000;

  const $agentsList = document.getElementById("chat-agents-list");
  const $messages = document.getElementById("chat-messages");
  const $welcome = document.getElementById("chat-welcome");
  const $form = document.getElementById("chat-input-form");
  const $input = document.getElementById("chat-input");
  const $send = document.getElementById("chat-send");

  let agentsCache = [];
  let selectedAgentId = null;
  let sessionId = null;
  let messages = [];
  let isSending = false;
  let pollTimer = null;

  function getSessionIds() {
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function setSessionId(agentId, sid) {
    const data = getSessionIds();
    data[agentId] = sid;
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data));
    } catch (_) {}
  }

  async function fetchApi(path, opts = {}) {
    const url = apiUrl + path;
    const res = await fetch(url, opts);
    if (!res.ok) {
      let msg = res.statusText || `HTTP ${res.status}`;
      try {
        const body = await res.json();
        if (body?.error) msg = body.error;
      } catch (_) {}
      throw new Error(msg);
    }
    return res.json();
  }

  async function loadAgents() {
    try {
      const { data } = await fetchApi("/api/ops_agents");
      agentsCache = data || [];
    } catch (err) {
      console.error("Agents load failed:", err);
      agentsCache = [];
    }
    renderAgents();
  }

  function renderAgents() {
    if (!agentsCache.length) {
      $agentsList.innerHTML = "<p class='chat-empty'>No agents</p>";
      return;
    }
    $agentsList.innerHTML = agentsCache
      .map(
        (a) =>
          `<button type="button" class="chat-agent-btn ${selectedAgentId === a.id ? "chat-agent-btn--active" : ""}" data-id="${a.id}">
            <span class="agent-avatar__pixel"></span>
            <span>${escapeHtml(a.display_name || a.id)}</span>
          </button>`
      )
      .join("");
    $agentsList.querySelectorAll(".chat-agent-btn").forEach((btn) => {
      btn.addEventListener("click", () => selectAgent(btn.dataset.id));
    });
  }

  async function loadSessionMessages(sid) {
    try {
      const { data } = await fetchApi(`/api/chat/session/${sid}`);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  async function selectAgent(id) {
    selectedAgentId = id;
    sessionId = getSessionIds()[id] || null;
    $send.disabled = !id;
    $input.disabled = !id;
    messages = [];
    if (sessionId) {
      messages = await loadSessionMessages(sessionId);
    }
    renderMessages();
    renderAgents();
  }

  function renderMessages() {
    $messages.querySelectorAll(".chat-msg").forEach((el) => el.remove());
    $welcome.hidden = messages.length > 0;
    messages.forEach((m) => {
      const content = m.status === "pending" ? "" : m.content;
      const isTyping = m.role === "assistant" && m.status === "pending";
      appendMessageDom(m.role, content, selectedAgentId, isTyping);
    });
    if (messages.length) $messages.scrollTop = $messages.scrollHeight;
  }

  function appendMessageDom(role, content, agentId, isTyping) {
    const el = document.createElement("div");
    el.className = `chat-msg chat-msg--${role}${isTyping ? " chat-msg--typing" : ""}`;
    el.setAttribute("data-role", role);
    const agentLabel = role === "assistant" && agentId ? escapeHtml(agentId) : "";
    el.innerHTML = isTyping
      ? `
      <div class="chat-msg__bubble">
        <div class="chat-msg__content">
          <span class="chat-typing-dot"></span>
          <span class="chat-typing-dot"></span>
          <span class="chat-typing-dot"></span>
        </div>
      </div>`
      : `
      <div class="chat-msg__bubble">
        ${agentLabel ? `<span class="chat-msg__agent">${agentLabel}</span>` : ""}
        <div class="chat-msg__content">${escapeHtml(content).replace(/\n/g, "<br>")}</div>
      </div>`;
    $welcome.hidden = true;
    $messages.appendChild(el);
    $messages.scrollTop = $messages.scrollHeight;
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function pollForResponse() {
    if (!sessionId || !selectedAgentId) return;
    const msgs = await loadSessionMessages(sessionId);
    messages = msgs;
    renderMessages();
    const hasPending = msgs.some((m) => m.role === "assistant" && m.status === "pending");
    if (!hasPending) {
      stopPolling();
      isSending = false;
      $send.disabled = !selectedAgentId;
    }
  }

  /** @param {string|null} [retryText] — When set, retries with a new session (clears stale session_id). */
  async function sendMessage(retryText = null) {
    const text = retryText ?? ($input?.value ?? "").trim();
    if (!text || !selectedAgentId || isSending) return;

    isSending = true;
    $send.disabled = true;
    const useSessionId = retryText ? null : sessionId;

    try {
      const { session_id: sid } = await fetchApi("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: useSessionId || undefined,
          agent_id: selectedAgentId,
          content: text,
        }),
      });

      $input.value = "";
      sessionId = sid;
      setSessionId(selectedAgentId, sid);

      messages = await loadSessionMessages(sid);
      renderMessages();

      pollTimer = setInterval(pollForResponse, POLL_INTERVAL_MS);
    } catch (err) {
      if (!retryText && err.message?.includes("Invalid session_id")) {
        setSessionId(selectedAgentId, null);
        sessionId = null;
        return sendMessage(text);
      }
      appendMessageDom("assistant", `Error: ${err.message}`, selectedAgentId, false);
      $input.value = text;
      isSending = false;
      $send.disabled = !selectedAgentId;
    }
  }

  function setupForm() {
    $form?.addEventListener("submit", (e) => {
      e.preventDefault();
      sendMessage();
    });
    $input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  async function init() {
    await loadAgents();
    setupForm();
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        stopPolling();
      } else if (isSending && sessionId) {
        pollForResponse();
        pollTimer = setInterval(pollForResponse, POLL_INTERVAL_MS);
      }
    });
  }

  init();
})();
