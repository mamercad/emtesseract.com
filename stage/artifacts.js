/**
 * Artifacts — shared markdown documents
 * List artifacts, edit content, save via PATCH
 */
(function () {
  const { escapeHtml, formatTime, installVisibilityPolling } = window.STAGE_UTILS;
  const config = window.STAGE_CONFIG || {};
  const apiUrl = (config.apiUrl ?? "").replace(/\/$/, "");

  const $list = document.getElementById("artifacts-list");
  const $empty = document.getElementById("artifacts-empty");
  const $editorEmpty = document.getElementById("artifacts-editor-empty");
  const $panel = document.getElementById("artifacts-editor-panel");
  const $title = document.getElementById("artifacts-editor-title");
  const $meta = document.getElementById("artifacts-editor-meta");
  const $textarea = document.getElementById("artifacts-editor-textarea");
  const $save = document.getElementById("artifacts-editor-save");
  const $status = document.getElementById("artifacts-editor-status");

  let currentArtifactId = null;
  let artifactsCache = [];

  function fetchApi(path, params = {}) {
    const qs = new URLSearchParams(params).toString();
    const url = qs ? `${apiUrl}${path}?${qs}` : `${apiUrl}${path}`;
    return fetch(url).then((res) => {
      if (!res.ok) throw new Error(res.statusText);
      return res.json();
    });
  }

  async function loadArtifacts() {
    try {
      const { data } = await fetchApi("/api/artifacts");
      artifactsCache = data || [];
      $empty.hidden = artifactsCache.length > 0;
      $list.innerHTML = "";
      for (const a of artifactsCache) {
        const el = document.createElement("article");
        el.className = "artifact-card";
        el.dataset.id = a.id;
        el.innerHTML = `
          <h4 class="artifact-card__title">${escapeHtml(a.title)}</h4>
          <span class="artifact-card__meta">${escapeHtml(a.updated_by || "—")} · ${formatTime(a.updated_at)}</span>
        `;
        el.addEventListener("click", () => selectArtifact(a.id));
        $list.appendChild(el);
      }
      const idFromUrl = new URLSearchParams(location.search).get("id");
      if (idFromUrl && artifactsCache.some((a) => a.id === idFromUrl)) {
        selectArtifact(idFromUrl);
      } else if (artifactsCache.length > 0 && !currentArtifactId) {
        selectArtifact(artifactsCache[0].id);
      }
    } catch (err) {
      console.error("Artifacts load failed:", err);
      $empty.hidden = false;
      $empty.textContent = "Failed to load artifacts.";
    }
  }

  function selectArtifact(id) {
    currentArtifactId = id;
    history.replaceState(null, "", `${location.pathname}?id=${id}`);
    const a = artifactsCache.find((x) => x.id === id);
    if (!a) {
      $editorEmpty.hidden = false;
      $panel.hidden = true;
      return;
    }
    $editorEmpty.hidden = true;
    $panel.hidden = false;
    $title.textContent = a.title;
    $meta.textContent = `Updated by ${escapeHtml(a.updated_by || "—")} · ${formatTime(a.updated_at)}`;
    $textarea.value = a.content || "";
    $status.textContent = "";
    $list.querySelectorAll(".artifact-card--active").forEach((el) => el.classList.remove("artifact-card--active"));
    const card = $list.querySelector(`[data-id="${id}"]`);
    if (card) card.classList.add("artifact-card--active");
  }

  async function saveArtifact() {
    if (!currentArtifactId) return;
    $save.disabled = true;
    $status.textContent = "Saving…";
    try {
      const res = await fetch(`${apiUrl}/api/artifacts/${currentArtifactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: $textarea.value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      $status.textContent = "Saved";
      $meta.textContent = `Updated by operator · ${formatTime(data.data?.updated_at || new Date().toISOString())}`;
      const idx = artifactsCache.findIndex((a) => a.id === currentArtifactId);
      if (idx >= 0) {
        artifactsCache[idx] = data.data;
      }
      setTimeout(() => { $status.textContent = ""; }, 2000);
    } catch (err) {
      $status.textContent = err.message || "Save failed";
      $status.classList.add("artifacts-editor__status--error");
      setTimeout(() => {
        $status.textContent = "";
        $status.classList.remove("artifacts-editor__status--error");
      }, 3000);
    } finally {
      $save.disabled = false;
    }
  }

  $save?.addEventListener("click", saveArtifact);

  loadArtifacts();
  installVisibilityPolling(loadArtifacts, 20000);
})();
