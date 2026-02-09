/**
 * Stage shared utilities.
 * Load before app.js and swimlane.js.
 */
(function () {
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

  function createVisibilityPolling(fn, ms) {
    let id = null;
    return {
      start() {
        if (id) return;
        id = setInterval(fn, ms);
      },
      stop() {
        if (id) clearInterval(id);
        id = null;
      },
    };
  }

  function installVisibilityPolling(fn, ms) {
    const poll = createVisibilityPolling(fn, ms);
    document.addEventListener("visibilitychange", () => {
      document.hidden ? poll.stop() : poll.start();
    });
    poll.start();
    return poll;
  }

  window.STAGE_UTILS = { escapeHtml, formatTime, createVisibilityPolling, installVisibilityPolling };
})();
