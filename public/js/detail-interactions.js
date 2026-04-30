(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.VaCfrDetailInteractionsFactory = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createDetailInteractionsApi(deps) {
    const {
      documentRef = document,
      windowRef = window,
      loadNotes,
      saveNotes,
      sortTimeline,
      loadTimeline,
      addTimelineEntry,
      removeTimelineEntry,
      downloadText,
      loadEvidenceLinks,
      addEvidenceLink,
      removeEvidenceLink,
      buildWorkspaceEvidenceIndex,
      relatedEvidenceKeys,
      evidenceDisplayName,
      addEvidenceRelation,
      removeEvidenceRelation,
      normalizeUrl,
      escapeHtml,
      toSortableDateKey,
      loadEvidenceState,
      saveEvidenceState,
      ensureNode,
      renderWorkspace,
      evidenceCompletion,
      buildClaimPacketText,
      exportChecklistText,
      cryptoRef = typeof crypto !== "undefined" ? crypto : null,
      alertFn = (msg) => alert(msg),
      confirmFn = async () => true,
      cssEscape = (value) => CSS.escape(value),
    } = deps;

    function buildTimelineText(item, entries, now = new Date().toLocaleString()) {
      const lines = [];
      lines.push(`VA CFR Finder — Condition Timeline`);
      lines.push(now);
      lines.push("");
      lines.push(`Condition: ${item.name}`);
      lines.push("");

      (entries || []).forEach((entry) => {
        lines.push(`${entry.date || ""} • ${entry.type || "Other"}`);
        lines.push(`${entry.note || ""}`);
        lines.push("");
      });

      return lines.join("\n");
    }

    function buildEvidenceLinksText(item, links, now = new Date().toLocaleString()) {
      const lines = [];
      lines.push(`VA CFR Finder — Condition Evidence Links`);
      lines.push(now);
      lines.push("");
      lines.push(`Condition: ${item.name}`);
      lines.push("");

      if (!(links || []).length) {
        lines.push("(No evidence links.)");
        return lines.join("\n");
      }

      links.forEach((link) => {
        lines.push(`${link.date || ""} • ${link.type || "Other"} • ${link.label || ""}`.trim());
        if (link.url) lines.push(`URL: ${link.url}`);
        if (link.note) lines.push(`Notes: ${link.note}`);
        lines.push("");
      });

      return lines.join("\n");
    }

    function mountDetailInteractions(item) {
      const notesEl = documentRef.getElementById("notes");
      const notesClearBtn = documentRef.getElementById("notesClear");
      const tlDate = documentRef.getElementById("tlDate");
      const tlType = documentRef.getElementById("tlType");
      const tlNote = documentRef.getElementById("tlNote");
      const tlAdd = documentRef.getElementById("tlAdd");
      const tlList = documentRef.getElementById("tlList");
      const tlExport = documentRef.getElementById("tlExport");
      const evLinksLabel = documentRef.getElementById("evLinksLabel");
      const evLinksUrl = documentRef.getElementById("evLinksUrl");
      const evLinksType = documentRef.getElementById("evLinksType");
      const evLinksDate = documentRef.getElementById("evLinksDate");
      const evLinksNote = documentRef.getElementById("evLinksNote");
      const evLinksList = documentRef.getElementById("evLinksList");
      const evLinksAdd = documentRef.getElementById("evLinksAdd");
      const evLinksExport = documentRef.getElementById("evLinksExport");
      const evRelPanel = documentRef.getElementById("evRelPanel");
      const evRelFromLabel = documentRef.getElementById("evRelFromLabel");
      const evRelPick = documentRef.getElementById("evRelPick");
      const evRelAdd = documentRef.getElementById("evRelAdd");
      const evRelCancel = documentRef.getElementById("evRelCancel");
      const evList = documentRef.getElementById("evList");
      const evCountEl = documentRef.getElementById("evCount");
      const packetCopy = documentRef.getElementById("packetCopy");
      const packetExport = documentRef.getElementById("packetExport");
      const evCopyBtn = documentRef.getElementById("evCopy");
      const evExportBtn = documentRef.getElementById("evExport");
      const evClearBtn = documentRef.getElementById("evClear");

      if (notesEl) {
        notesEl.value = loadNotes(item.id);
        let timer;
        notesEl.addEventListener("input", () => {
          windowRef.clearTimeout(timer);
          timer = windowRef.setTimeout(() => saveNotes(item.id, notesEl.value), 200);
        });
      }

      if (notesClearBtn) {
        notesClearBtn.addEventListener("click", async () => {
          if (!notesEl?.value?.trim()) return;
          const confirmed = await confirmFn({
            title: "Clear notes?",
            message: "This removes the saved notes for this condition from this browser.",
            confirmLabel: "Clear notes",
          });
          if (!confirmed) return;
          saveNotes(item.id, "");
          if (notesEl) notesEl.value = "";
        });
      }

      function renderTimelineList() {
        if (!tlList) return;
        const entries = sortTimeline(loadTimeline(item.id));
        if (!entries.length) {
          tlList.innerHTML = `<div class="small">(No timeline entries yet.)</div>`;
          return;
        }

        tlList.innerHTML = entries
          .map(
            (entry) => `
              <div class="tlRow">
                <div class="tlMeta">
                  <span class="badge">${escapeHtml(entry.date || "Date?")}</span>
                  <span class="badge">${escapeHtml(entry.type || "Other")}</span>
                </div>
                <div class="small">${escapeHtml(entry.note || "")}</div>
                <div style="margin-top:6px">
                  <button class="miniBtn danger" data-tlrm="${escapeHtml(entry.id)}" type="button">Remove</button>
                </div>
              </div>
            `,
          )
          .join("");

        tlList.querySelectorAll("button[data-tlrm]").forEach((button) => {
          button.addEventListener("click", async () => {
            const confirmed = await confirmFn({
              title: "Remove timeline entry?",
              message: "This timeline item will be deleted from this condition.",
              confirmLabel: "Remove entry",
            });
            if (!confirmed) return;
            removeTimelineEntry(item.id, button.dataset.tlrm);
            renderTimelineList();
          });
        });
      }

      function exportTimelineTxt() {
        const entries = sortTimeline(loadTimeline(item.id));
        downloadText(`${item.id}_timeline.txt`, buildTimelineText(item, entries));
      }

      if (tlAdd) {
        tlAdd.addEventListener("click", () => {
          const date = (tlDate?.value || "").trim();
          const type = (tlType?.value || "Other").trim();
          const note = (tlNote?.value || "").trim();

          if (!date || !note) {
            alertFn("Please enter a date and a note.");
            return;
          }

          addTimelineEntry(item.id, {
            id: cryptoRef?.randomUUID ? cryptoRef.randomUUID() : `${Date.now()}-${Math.random()}`,
            date,
            type,
            note,
            created_at: Date.now(),
          });

          if (tlDate) tlDate.value = "";
          if (tlNote) tlNote.value = "";
          renderTimelineList();
        });
      }

      if (tlExport) {
        tlExport.addEventListener("click", exportTimelineTxt);
      }

      function renderEvidenceLinks() {
        if (!evLinksList) return;
        const idx = buildWorkspaceEvidenceIndex("all");
        const links = loadEvidenceLinks(item.id);

        if (!links.length) {
          evLinksList.innerHTML = `<div class="small">(No evidence links yet.)</div>`;
          return;
        }

        const sorted = links.slice().sort((a, b) => {
          const da = toSortableDateKey(a.date);
          const db = toSortableDateKey(b.date);
          if (da !== db) return da.localeCompare(db);
          return (a.label || "").localeCompare(b.label || "");
        });

        evLinksList.innerHTML = sorted
          .map((link) => {
            const relKeys = relatedEvidenceKeys(link.url);
            const relList = relKeys.map((key) => idx.get(key)).filter(Boolean).slice(0, 4);

            return `
              <div class="evLinksRow">
                <div class="evLinksMeta">
                  ${link.date ? `<span class="badge">${escapeHtml(link.date)}</span>` : ""}
                  <span class="badge">${escapeHtml(link.type || "Other")}</span>
                  ${relKeys.length ? `<span class="relBadge">Related: ${relKeys.length}</span>` : ""}
                </div>
                <div><strong>${escapeHtml(link.label || "Evidence")}</strong></div>
                ${link.url ? `<div class="small"><a href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">Open link</a></div>` : ""}
                ${link.note ? `<div class="small">${escapeHtml(link.note)}</div>` : ""}
                ${relList.length ? `
                  <div class="small" style="margin-top:6px">
                    <strong>Related:</strong>
                    <ul style="margin:6px 0 0 18px">
                      ${relList.map((rel) => `<li><a href="${escapeHtml(rel.url)}" target="_blank" rel="noreferrer">${escapeHtml(evidenceDisplayName(rel))}</a></li>`).join("")}
                    </ul>
                  </div>
                ` : ""}
                <div style="margin-top:6px">
                  <button class="miniBtn danger" data-evlinksrm="${escapeHtml(link.id)}" type="button">Remove</button>
                </div>
              </div>
            `;
          })
          .join("");

        evLinksList.querySelectorAll("button[data-evlinksrm]").forEach((button) => {
          button.addEventListener("click", async () => {
            const confirmed = await confirmFn({
              title: "Remove evidence link?",
              message: "This saved evidence link will be removed from the current condition.",
              confirmLabel: "Remove link",
            });
            if (!confirmed) return;
            removeEvidenceLink(item.id, button.dataset.evlinksrm);
            renderEvidenceLinks();
          });
        });
      }

      function exportEvidenceLinksTxt() {
        const sorted = loadEvidenceLinks(item.id).slice().sort((a, b) => {
          const da = toSortableDateKey(a.date);
          const db = toSortableDateKey(b.date);
          if (da !== db) return da.localeCompare(db);
          return (a.label || "").localeCompare(b.label || "");
        });

        downloadText(`${item.id}_evidence_links.txt`, buildEvidenceLinksText(item, sorted));
      }

      if (evLinksAdd) {
        evLinksAdd.addEventListener("click", () => {
          const label = (evLinksLabel?.value || "").trim();
          const url = (evLinksUrl?.value || "").trim();
          const type = (evLinksType?.value || "Other").trim();
          const date = (evLinksDate?.value || "").trim();
          const note = (evLinksNote?.value || "").trim();

          if (!label) {
            alertFn("Please enter at least a Label for this evidence item.");
            return;
          }

          addEvidenceLink(item.id, {
            id: cryptoRef?.randomUUID ? cryptoRef.randomUUID() : `${Date.now()}-${Math.random()}`,
            label,
            url,
            type,
            date,
            note,
            created_at: Date.now(),
          });

          if (evLinksLabel) evLinksLabel.value = "";
          if (evLinksUrl) evLinksUrl.value = "";
          if (evLinksDate) evLinksDate.value = "";
          if (evLinksNote) evLinksNote.value = "";
          renderEvidenceLinks();
        });
      }

      if (evLinksExport) {
        evLinksExport.addEventListener("click", exportEvidenceLinksTxt);
      }

      let currentRelFromUrl = "";
      let currentRelFromKey = "";
      let currentRelFromRowId = "";

      function highlightActiveRelRow() {
        if (!evLinksList) return;
        evLinksList.querySelectorAll(".evRow").forEach((row) => row.classList.remove("activeRel"));
        if (!currentRelFromRowId) return;
        const row = evLinksList.querySelector(`[data-evid="${cssEscape(currentRelFromRowId)}"]`);
        if (row) row.classList.add("activeRel");
      }

      function populateRelateDropdown() {
        if (!evRelPick) return;

        const idx = buildWorkspaceEvidenceIndex("all");
        const options = [];
        for (const [urlKey, meta] of idx.entries()) {
          if (urlKey === currentRelFromKey) continue;
          options.push(meta);
        }

        if (!currentRelFromUrl) {
          evRelPick.innerHTML = `<option value="">(Click "Relate…" on an evidence item below)</option>`;
          return;
        }

        evRelPick.innerHTML =
          `<option value="">Select another evidence item…</option>` +
          options
            .sort((a, b) => evidenceDisplayName(a).localeCompare(evidenceDisplayName(b)))
            .map((meta) => `<option value="${escapeHtml(meta.url)}">${escapeHtml(evidenceDisplayName(meta))}</option>`)
            .join("");
      }

      function showRelPanel(fromUrl, fromLabel, rowId) {
        currentRelFromUrl = fromUrl || "";
        currentRelFromKey = normalizeUrl(fromUrl || "");
        currentRelFromRowId = rowId || "";
        if (evRelFromLabel) evRelFromLabel.textContent = fromLabel || fromUrl || "(unknown)";
        if (evRelPanel) evRelPanel.classList.remove("hidden");
        populateRelateDropdown();
        highlightActiveRelRow();
      }

      function hideRelPanel() {
        currentRelFromUrl = "";
        currentRelFromKey = "";
        currentRelFromRowId = "";
        if (evRelPanel) evRelPanel.classList.add("hidden");
        if (evRelFromLabel) evRelFromLabel.textContent = "(none)";
        if (evRelPick) evRelPick.innerHTML = `<option value="">Select another evidence item…</option>`;
        highlightActiveRelRow();
      }

      function renderEvidenceLinksWithRelated() {
        if (!evLinksList) return;
        const idx = buildWorkspaceEvidenceIndex("all");
        const links = loadEvidenceLinks(item.id);

        if (!links.length) {
          evLinksList.innerHTML = `<div class="small">(No evidence links yet.)</div>`;
          hideRelPanel();
          return;
        }

        const sorted = links.slice().sort((a, b) => {
          const da = toSortableDateKey(a.date);
          const db = toSortableDateKey(b.date);
          if (da !== db) return da.localeCompare(db);
          return (a.label || "").localeCompare(b.label || "");
        });

        evLinksList.innerHTML = sorted
          .map((link) => {
            const relKeys = relatedEvidenceKeys(link.url);
            const relList = relKeys.map((key) => idx.get(key)).filter(Boolean).slice(0, 4);

            return `
              <div class="evRow" data-evid="${escapeHtml(link.id)}">
                <div class="evMeta">
                  ${link.date ? `<span class="badge">${escapeHtml(link.date)}</span>` : ""}
                  <span class="badge">${escapeHtml(link.type || "Other")}</span>
                  ${relKeys.length ? `<span class="relBadge">Related: ${relKeys.length}</span>` : ""}
                </div>
                <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start">
                  <div style="flex:1">
                    <div><strong>${escapeHtml(link.label || "Evidence")}</strong></div>
                    ${link.url ? `<div class="small"><a href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">Open link</a></div>` : ""}
                    ${link.note ? `<div class="small">${escapeHtml(link.note)}</div>` : ""}
                  </div>
                  <div style="display:flex; flex-direction:column; gap:6px; min-width:120px">
                    ${link.url ? `<button class="miniBtn" data-relfrom="${escapeHtml(link.id)}" type="button">Relate…</button>` : ""}
                    <button class="miniBtn danger" data-evrm="${escapeHtml(link.id)}" type="button">Remove</button>
                  </div>
                </div>
                ${relList.length ? `
                  <div class="small" style="margin-top:8px">
                    <strong>Related:</strong>
                    <ul style="margin:6px 0 0 18px">
                      ${relList.map((rel) => `
                        <li style="display:flex; gap:8px; align-items:center">
                          <a href="${escapeHtml(rel.url)}" target="_blank" rel="noreferrer">${escapeHtml(evidenceDisplayName(rel))}</a>
                          <button class="miniBtn danger" data-unrel-from="${escapeHtml(link.url)}" data-unrel-to="${escapeHtml(rel.url)}" type="button">Unlink</button>
                        </li>
                      `).join("")}
                    </ul>
                  </div>
                ` : ""}
              </div>
            `;
          })
          .join("");

        evLinksList.querySelectorAll("button[data-evrm]").forEach((button) => {
          button.addEventListener("click", async () => {
            const confirmed = await confirmFn({
              title: "Remove evidence item?",
              message: "This evidence item will be removed from the current condition.",
              confirmLabel: "Remove item",
            });
            if (!confirmed) return;
            removeEvidenceLink(item.id, button.dataset.evrm);
            renderEvidenceLinksWithRelated();
            populateRelateDropdown();
          });
        });

        evLinksList.querySelectorAll("button[data-relfrom]").forEach((button) => {
          button.addEventListener("click", () => {
            const rowId = button.dataset.relfrom;
            const myLinks = loadEvidenceLinks(item.id);
            const found = myLinks.find((entry) => entry.id === rowId);
            if (!found || !found.url) {
              alertFn("This evidence item is missing a URL.");
              return;
            }
            showRelPanel(found.url, found.label || found.url, rowId);
          });
        });

        evLinksList.querySelectorAll("button[data-unrel-from][data-unrel-to]").forEach((button) => {
          button.addEventListener("click", async () => {
            const confirmed = await confirmFn({
              title: "Unlink related evidence?",
              message: "This removes the relationship between the two evidence items.",
              confirmLabel: "Unlink",
            });
            if (!confirmed) return;
            try {
              removeEvidenceRelation(button.dataset.unrelFrom || "", button.dataset.unrelTo || "");
              renderEvidenceLinksWithRelated();
              populateRelateDropdown();
            } catch (error) {
              alertFn(error.message || "Could not unlink evidence.");
            }
          });
        });

        highlightActiveRelRow();
      }

      if (evRelAdd) {
        evRelAdd.addEventListener("click", () => {
          if (!currentRelFromUrl) {
            alertFn('Click "Relate…" on an evidence item first.');
            return;
          }
          const toUrl = evRelPick?.value || "";
          if (!toUrl) {
            alertFn("Pick another evidence item to relate.");
            return;
          }

          try {
            addEvidenceRelation(currentRelFromUrl, toUrl);
            alertFn("Related evidence link created!");
            renderEvidenceLinksWithRelated();
          } catch (error) {
            alertFn(error.message || "Could not relate evidence.");
          }
        });
      }

      if (evRelCancel) {
        evRelCancel.addEventListener("click", hideRelPanel);
      }

      function updateEvCount() {
        const state = loadEvidenceState(item.id);
        const done = (item.evidence_checklist || []).reduce((acc, _, idx) => acc + (state[idx] ? 1 : 0), 0);
        if (evCountEl) evCountEl.textContent = String(done);
      }

      function updateEvidenceUI() {
        const state = loadEvidenceState(item.id);
        const { done, total, pct } = evidenceCompletion(item, state);
        const scoreText = documentRef.getElementById("evScoreText");
        const barFill = documentRef.getElementById("evBarFill");
        if (scoreText) scoreText.textContent = `${done}/${total} (${pct}%)`;
        if (barFill) barFill.style.width = `${pct}%`;
      }

      if (evList) {
        evList.addEventListener("change", (event) => {
          const cb = event.target;
          if (!cb || cb.tagName !== "INPUT" || cb.type !== "checkbox") return;
          if (!cb.classList.contains("evCheck")) return;

          const idx = Number(cb.dataset.idx);
          const state = loadEvidenceState(item.id);
          state[idx] = cb.checked;
          saveEvidenceState(item.id, state);
          updateEvCount();
          updateEvidenceUI();
          try {
            ensureNode(item.id);
          } catch (_) {}
          renderWorkspace();
        });
      }

      if (packetCopy) {
        packetCopy.addEventListener("click", async () => {
          const state = loadEvidenceState(item.id);
          await navigator.clipboard.writeText(buildClaimPacketText(item, state));
          alertFn("Claim packet copied!");
        });
      }

      if (packetExport) {
        packetExport.addEventListener("click", () => {
          const state = loadEvidenceState(item.id);
          downloadText(`${item.id}_claim_packet.txt`, buildClaimPacketText(item, state));
        });
      }

      if (evCopyBtn) {
        evCopyBtn.addEventListener("click", async () => {
          const state = loadEvidenceState(item.id);
          await navigator.clipboard.writeText(exportChecklistText(item, state));
          alertFn("Checklist copied!");
        });
      }

      if (evExportBtn) {
        evExportBtn.addEventListener("click", () => {
          const state = loadEvidenceState(item.id);
          const safeName = (item.id || "condition").replace(/[^a-z0-9_-]+/gi, "_");
          downloadText(`${safeName}_evidence_checklist.txt`, exportChecklistText(item, state));
        });
      }

      if (evClearBtn) {
        evClearBtn.addEventListener("click", async () => {
          const state = loadEvidenceState(item.id);
          const hasChecked = Object.values(state || {}).some(Boolean);
          if (!hasChecked) return;
          const confirmed = await confirmFn({
            title: "Clear checklist progress?",
            message: "This unchecks all saved evidence checklist items for this condition.",
            confirmLabel: "Clear checklist",
          });
          if (!confirmed) return;
          saveEvidenceState(item.id, {});
          documentRef.querySelectorAll(".evCheck").forEach((cb) => {
            cb.checked = false;
          });
          updateEvCount();
          updateEvidenceUI();
        });
      }

      renderTimelineList();
      renderEvidenceLinks();
      renderEvidenceLinksWithRelated();
      populateRelateDropdown();
      updateEvidenceUI();
    }

    return {
      buildTimelineText,
      buildEvidenceLinksText,
      mountDetailInteractions,
    };
  }

  return { createDetailInteractionsApi };
});
