/**
 * Settings — policy configuration UI
 */
(function () {
  const { escapeHtml } = window.STAGE_UTILS;
  const config = window.STAGE_CONFIG || {};
  const apiUrl = (config.apiUrl ?? "").replace(/\/$/, "");

  const $loading = document.getElementById("settings-loading");
  const $error = document.getElementById("settings-error");
  const $panels = document.getElementById("settings-panels");

  let policy = {};

  async function fetchApi(path) {
    const url = apiUrl ? `${apiUrl}${path}` : path;
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.statusText);
    return res.json();
  }

  async function loadPolicy() {
    try {
      const { data } = await fetchApi("/api/ops_policy");
      policy = data || {};
      $loading.hidden = true;
      $error.hidden = true;
      $panels.hidden = false;
      render();
    } catch (err) {
      $loading.hidden = true;
      $error.hidden = false;
      $error.textContent = err.message || "Failed to load settings";
    }
  }

  async function savePolicy(key, value) {
    try {
      const res = await fetch(`${apiUrl}/api/ops_policy/${key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      policy[key] = { ...(policy[key] || {}), ...value };
      return true;
    } catch (err) {
      return false;
    }
  }

  function renderPanel(key, title, desc, fields) {
    const p = policy[key] || {};
    let html = `
      <section class="settings-panel" data-key="${escapeHtml(key)}">
        <h2 class="settings-panel__title">${escapeHtml(title)}</h2>
        <p class="settings-panel__desc">${escapeHtml(desc)}</p>
        <div class="settings-panel__fields">`;
    for (const f of fields) {
      const val = p[f.key] ?? f.default;
      if (f.type === "checkbox") {
        html += `
          <label class="settings-field settings-field--checkbox">
            <input type="checkbox" data-key="${f.key}" ${val ? "checked" : ""}>
            <span>${escapeHtml(f.label)}</span>
          </label>`;
      } else if (f.type === "number") {
        html += `
          <label class="settings-field">
            <span class="settings-field__label">${escapeHtml(f.label)}</span>
            <input type="number" data-key="${f.key}" value="${escapeHtml(String(val))}" min="${f.min ?? 0}" max="${f.max ?? 999}">
          </label>`;
      }
    }
    html += `
        </div>
        <button type="button" class="settings-panel__save" data-key="${key}">Save</button>
        <span class="settings-panel__status" data-status="${key}"></span>
      </section>`;
    return html;
  }

  function render() {
    const panels = [
      {
        key: "content_policy",
        title: "Content drafts",
        desc: "Limit how many write_content steps can be created per day.",
        fields: [
          { key: "enabled", type: "checkbox", label: "Enable quota", default: true },
          { key: "max_drafts_per_day", type: "number", label: "Max drafts per day", default: 8, min: 1, max: 50 },
        ],
      },
      {
        key: "auto_approve",
        title: "Auto-approve",
        desc: "Proposals with only these step kinds skip manual approval.",
        fields: [
          { key: "enabled", type: "checkbox", label: "Enable auto-approve", default: true },
        ],
      },
      {
        key: "x_daily_quota",
        title: "Tweet quota",
        desc: "Max tweets (post_tweet steps) per day.",
        fields: [
          { key: "limit", type: "number", label: "Limit per day", default: 5, min: 0, max: 50 },
        ],
      },
      {
        key: "roundtable_policy",
        title: "Roundtables",
        desc: "Agent-to-agent conversations.",
        fields: [
          { key: "enabled", type: "checkbox", label: "Enable roundtables", default: true },
          { key: "max_daily_conversations", type: "number", label: "Max per day", default: 5, min: 0, max: 20 },
        ],
      },
    ];

    $panels.innerHTML = panels
      .map((c) => renderPanel(c.key, c.title, c.desc, c.fields))
      .join("");

    $panels.querySelectorAll(".settings-panel__save").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const key = btn.dataset.key;
        const panel = btn.closest(".settings-panel");
        const inputs = panel.querySelectorAll("[data-key]");
        const value = {};
        for (const el of inputs) {
          if (el.dataset.key && el.type === "checkbox") {
            value[el.dataset.key] = el.checked;
          } else if (el.dataset.key && el.type === "number") {
            value[el.dataset.key] = parseInt(el.value, 10) || 0;
          }
        }
        btn.disabled = true;
        const statusEl = panel.querySelector(`[data-status="${key}"]`);
        const ok = await savePolicy(key, value);
        btn.disabled = false;
        statusEl.textContent = ok ? "Saved" : "Failed";
        statusEl.className = `settings-panel__status settings-panel__status--${ok ? "ok" : "error"}`;
        setTimeout(() => { statusEl.textContent = ""; statusEl.className = "settings-panel__status"; }, 2000);
      });
    });
  }

  loadPolicy();
})();
