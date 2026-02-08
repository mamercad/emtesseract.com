/**
 * Chat — conversational UI for emTesseract agents.
 * Sends messages to /api/chat, streams or displays assistant replies.
 */
(function () {
  const { escapeHtml } = window.STAGE_UTILS;
  const config = window.STAGE_CONFIG || {};
  const apiUrl = (config.apiUrl ?? "").replace(/\/$/, "");

  const $agentsList = document.getElementById("chat-agents-list");
  const $messages = document.getElementById("chat-messages");
  const $welcome = document.getElementById("chat-welcome");
  const $form = document.getElementById("chat-input-form");
  const $input = document.getElementById("chat-input");
  const $send = document.getElementById("chat-send");

  let agentsCache = [];
  let selectedAgentId = null;
  let messages = [];
  let isSending = false;

  async function fetchApi(path, opts = {}) {
    const url = apiUrl + path;
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(res.statusText || `HTTP ${res.status}`);
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

  function selectAgent(id) {
    selectedAgentId = id;
    $send.disabled = !id;
    $input.disabled = !id;
    renderAgents();
  }

  function appendMessage(role, content, agentId) {
    const msg = { role, content, agentId };
    messages.push(msg);
    const el = document.createElement("div");
    el.className = `chat-msg chat-msg--${role}`;
    el.setAttribute("data-role", role);
    const agentLabel = role === "assistant" && agentId ? escapeHtml(agentId) : "";
    el.innerHTML = `
      <div class="chat-msg__bubble">
        ${agentLabel ? `<span class="chat-msg__agent">${agentLabel}</span>` : ""}
        <div class="chat-msg__content">${escapeHtml(content).replace(/\n/g, "<br>")}</div>
      </div>`;
    $welcome.hidden = true;
    $messages.appendChild(el);
    $messages.scrollTop = $messages.scrollHeight;
  }

  function appendPlaceholder() {
    const el = document.createElement("div");
    el.className = "chat-msg chat-msg--assistant chat-msg--typing";
    el.id = "chat-typing";
    el.innerHTML = `
      <div class="chat-msg__bubble">
        <div class="chat-msg__content">
          <span class="chat-typing-dot"></span>
          <span class="chat-typing-dot"></span>
          <span class="chat-typing-dot"></span>
        </div>
      </div>`;
    $messages.appendChild(el);
    $messages.scrollTop = $messages.scrollHeight;
  }

  function removePlaceholder() {
    document.getElementById("chat-typing")?.remove();
  }

  async function sendMessage() {
    const text = ($input?.value || "").trim();
    if (!text || !selectedAgentId || isSending) return;

    $input.value = "";
    appendMessage("user", text);
    appendPlaceholder();
    isSending = true;
    $send.disabled = true;

    try {
      const messagesForApi = messages
        .filter((m) => m.role !== "typing")
        .map((m) => ({ role: m.role, content: m.content }));
      const { content } = await fetchApi("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: messagesForApi,
          agent_id: selectedAgentId,
        }),
      });
      removePlaceholder();
      appendMessage("assistant", content || "(no response)", selectedAgentId);
    } catch (err) {
      removePlaceholder();
      appendMessage("assistant", `Error: ${err.message}`, selectedAgentId);
    } finally {
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
  }

  init();
})();
