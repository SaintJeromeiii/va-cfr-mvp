(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.VaCfrDetailViewFactory = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createDetailViewApi(deps) {
    const {
      escapeHtml,
      systemClassName,
      loadEvidenceState,
      TIMELINE_TYPES,
      EVIDENCE_LINK_TYPES,
    } = deps;

    function buildReferencesHTML(item) {
      const primary = item.cfr && item.cfr[0] ? item.cfr[0] : null;
      if (!primary) return "";

      const section = primary.section || "";
      const dc = primary.diagnostic_code || "";
      const source = primary.url || "";

      if (item.rating_logic?.type === "severity_ladder" && Array.isArray(item.rating_logic.levels)) {
        return `
          <hr/>
          <h3>References</h3>
          <p class="small"><span class="badge">${section}</span> DC <strong>${dc}</strong>
          ${source ? ` — <a href="${source}" target="_blank" rel="noreferrer">Source</a>` : ""}</p>
          <ul>
            ${item.rating_logic.levels
              .map((level) => `<li><strong>${level.level}</strong> → <strong>${level.rating_percent}%</strong></li>`)
              .join("")}
          </ul>
        `;
      }

      if (item.rating_logic?.type === "thresholds" && Array.isArray(item.rating_logic.thresholds)) {
        return `
          <hr/>
          <h3>References</h3>
          <p class="small"><span class="badge">${section}</span> DC <strong>${dc}</strong>
          ${source ? ` — <a href="${source}" target="_blank" rel="noreferrer">Source</a>` : ""}</p>
          <ul>
            ${item.rating_logic.thresholds
              .map((threshold) => `<li>Flexion limited to <strong>${threshold.flexion_deg}°</strong> → <strong>${threshold.rating_percent}%</strong></li>`)
              .join("")}
          </ul>
        `;
      }

      return `
        <hr/>
        <h3>References</h3>
        <p class="small"><span class="badge">${section}</span> DC <strong>${dc}</strong>
        ${source ? ` — <a href="${source}" target="_blank" rel="noreferrer">Source</a>` : ""}</p>
        <p class="small">${item.rating_logic?.summary || ""}</p>
      `;
    }

    function buildDetailMarkup(item) {
      const excerptsHTML = item.excerpts && item.excerpts.length
        ? `
          <hr/>
          <h3>CFR Excerpts</h3>
          ${item.excerpts
            .map(
              (excerpt) => `
                <p><strong>${excerpt.label || "Excerpt"}</strong></p>
                <p class="small">${excerpt.text || ""}</p>
                ${excerpt.source_url ? `<p><a href="${excerpt.source_url}" target="_blank" rel="noreferrer">View Source</a></p>` : ""}
              `,
            )
            .join("")}
        `
        : "";

      const cfrLinks = (item.cfr || [])
        .map((ref) => {
          const dc = (ref.diagnostic_code || "").toString().trim();
          const secShort = (ref.section || "")
            .replace(/38\s*cfr\s*§/i, "")
            .trim()
            .toLowerCase();
          const dcId = dc ? `jump-dc-${dc}` : "";
          const secId = secShort ? `jump-sec-${secShort.replace(/[^a-z0-9.]+/g, "")}` : "";

          return `
            <li data-dc-id="${dcId}" data-sec-id="${secId}">
              <span class="badge">${ref.section}</span>
              DC <strong>${ref.diagnostic_code}</strong> — ${ref.title}
              — <a href="${ref.url}" target="_blank" rel="noreferrer">Open source</a>
            </li>
          `;
        })
        .join("");

      const refsHTML = buildReferencesHTML(item);
      const strategyHTML = item.strategy && item.strategy.length
        ? `
          <hr/>
          <h3>🧭 Claim Strategy (Educational)</h3>
          <ul>
            ${item.strategy.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
          </ul>
        `
        : "";

      let ratingBlock = `<p class="small">${item.rating_logic?.summary || ""}</p>`;
      if (item.rating_logic?.type === "thresholds" && Array.isArray(item.rating_logic.thresholds)) {
        ratingBlock += `
          <ul>
            ${item.rating_logic.thresholds
              .map((threshold) => `<li>Flexion limited to <strong>${threshold.flexion_deg}°</strong> → <strong>${threshold.rating_percent}%</strong></li>`)
              .join("")}
          </ul>
        `;
      }
      if (item.rating_logic?.type === "severity_ladder" && Array.isArray(item.rating_logic.levels)) {
        ratingBlock += `
          <ul>
            ${item.rating_logic.levels
              .map((level) => `<li><strong>${level.level}</strong> → <strong>${level.rating_percent}%</strong></li>`)
              .join("")}
          </ul>
        `;
      }

      const evidenceState = loadEvidenceState(item.id);
      const evidenceItems = item.evidence_checklist || [];
      const evidenceChecksHTML = evidenceItems
        .map((text, idx) => {
          const checked = evidenceState[idx] ? "checked" : "";
          return `
            <label class="evItem">
              <input type="checkbox" class="evCheck" data-idx="${idx}" ${checked} />
              <span>${escapeHtml(text)}</span>
            </label>
          `;
        })
        .join("");
      const completedCount = evidenceItems.reduce((acc, _, idx) => acc + (evidenceState[idx] ? 1 : 0), 0);

      return `
        <div class="metaRow">
          ${item.body_system ? `<span class="systemBadge ${systemClassName(item.body_system)}">${item.body_system}</span>` : ""}
          ${item.cfr && item.cfr.length ? `<span class="dcBadge">DC ${item.cfr[0].diagnostic_code}</span>` : ""}
        </div>

        <h2 style="margin-top:6px">${item.name}</h2>

        <div id="jumpIndicator" class="jumpIndicator hidden">
          <span id="jumpIndicatorText"></span>
          <button id="jumpIndicatorClose" class="jumpIndicatorClose" type="button" aria-label="Close">×</button>
        </div>

        <div class="small">${item.disclaimer || ""}</div>

        <button id="copyLink" class="copyBtn">Copy link</button>
        <button id="wsAdd" class="miniBtn" type="button">+ Add to Workspace</button>
        <button id="wsAddSecondary" class="miniBtn" type="button">+ Add as Secondary</button>
        <div id="secondaryLinkPanel" class="evRelPanel hidden">
          <div class="small"><strong>Add this condition as a linked secondary</strong></div>
          <div class="healthBtns" style="margin-top:8px">
            <label class="small" style="display:flex;align-items:center;gap:6px">
              Relationship:
              <select id="secondaryLinkType">
                <option value="Secondary to">Secondary to</option>
                <option value="Aggravated by">Aggravated by</option>
                <option value="Due to / Caused by">Due to / Caused by</option>
                <option value="Associated with">Associated with</option>
                <option value="Increase (worsened)">Increase (worsened)</option>
                <option value="Direct (standalone)">Direct (standalone)</option>
              </select>
            </label>
            <button id="secondaryLinkConfirm" class="miniBtn" type="button">Add Link</button>
            <button id="secondaryLinkCancel" class="miniBtn danger" type="button">Cancel</button>
          </div>
        </div>

        <hr/>
        <h3 id="jump-cfr">Where it fits in 38 CFR</h3>
        <ul>${cfrLinks}</ul>

        ${refsHTML ? `<div id="jump-refs"></div>${refsHTML}` : ""}
        ${excerptsHTML}
        ${strategyHTML}

        <hr/>
        <h3>🧩 Related / Secondary Conditions</h3>
        <div id="secondaryList"></div>
        <button id="addSecondaryBtn" class="secondaryBtn">+ Add secondary condition</button>

        <hr/>
        <h3>How VA rates it (high-level)</h3>
        ${ratingBlock}

        <hr/>
        <h3>📈 Evidence Readiness</h3>
        <div class="evScoreRow">
          <div class="evBar"><div id="evBarFill" class="evBarFill"></div></div>
          <div class="small"><span id="evScoreText">0/0</span> complete</div>
        </div>

        <button id="packetCopy" class="miniBtn" type="button">Copy Claim Packet</button>
        <button id="packetExport" class="miniBtn" type="button">Export Claim Packet (.txt)</button>

        <h3 id="jump-evidence">Evidence checklist (trackable)</h3>
        <div class="evHeader">
          <div class="evProgress">
            <strong id="evCount">${completedCount}</strong> / <strong>${evidenceItems.length}</strong> complete
          </div>
          <div class="evBtns">
            <button id="evCopy" class="miniBtn" type="button">Copy</button>
            <button id="evExport" class="miniBtn" type="button">Export .txt</button>
            <button id="evClear" class="miniBtn danger" type="button">Clear</button>
          </div>
        </div>
        <div id="evList" class="evList">
          ${evidenceChecksHTML || `<div class="small">No checklist provided for this condition yet.</div>`}
        </div>

        <hr/>
        <hr/>

        <h3 id="jump-notes">Notes (saved locally)</h3>
        <div class="notesWrap">
          <textarea id="notes" class="notesBox" placeholder="Add your notes here (saved to this browser)…"></textarea>
          <div class="notesBtns">
            <button id="notesClear" class="miniBtn danger" type="button">Clear notes</button>
          </div>
          <div class="small">Notes are stored in your browser (localStorage) for this device.</div>
        </div>

        <hr/>
        <h3>Timeline</h3>
        <div class="small">Add dated events for this condition (educational). Supports YYYY-MM-DD, YYYY-MM, or YYYY.</div>
        <div class="tlForm">
          <input id="tlDate" placeholder="Date (YYYY-MM-DD or YYYY-MM or YYYY)" />
          <select id="tlType">
            ${TIMELINE_TYPES.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join("")}
          </select>
        </div>
        <textarea id="tlNote" rows="3" placeholder="Event details (e.g., first symptoms, diagnosis visit, CPAP issued, ER visit, missed work, etc.)"></textarea>
        <div class="healthBtns" style="margin-top:8px">
          <button id="tlAdd" class="miniBtn" type="button">Add timeline entry</button>
          <button id="tlExport" class="miniBtn" type="button">Download timeline (.txt)</button>
        </div>
        <div id="tlList" class="tlList"></div>

        <hr/>
        <h3>Evidence Links</h3>
        <div class="small">
          Save links to documents (medical records, DBQs, buddy statements, etc.). Stored locally in your browser.
        </div>
        <div class="evLinksForm">
          <input id="evLinksLabel" placeholder="Label (e.g., Sleep study 2023-11-02)" />
          <input id="evLinksUrl" placeholder="URL (https://...)" />
        </div>
        <div class="evLinksForm">
          <select id="evLinksType">
            ${EVIDENCE_LINK_TYPES.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join("")}
          </select>
          <input id="evLinksDate" placeholder="Date (optional: YYYY-MM-DD or YYYY-MM or YYYY)" />
        </div>
        <textarea id="evLinksNote" rows="2" placeholder="Notes (optional: what this proves, key page numbers, etc.)"></textarea>
        <div class="healthBtns" style="margin-top:8px">
          <button id="evLinksAdd" class="miniBtn" type="button">Add evidence link</button>
          <button id="evLinksExport" class="miniBtn" type="button">Download evidence list (.txt)</button>
        </div>

        <hr/>
        <div class="small"><strong>Link evidence ↔ evidence</strong> (pick an evidence item below, then link it to another)</div>
        <div id="evRelPanel" class="evRelPanel hidden">
          <div class="small">
            Relating FROM: <strong id="evRelFromLabel">(none)</strong>
          </div>
          <div class="evForm" style="margin-top:8px">
            <select id="evRelPick"></select>
            <button id="evRelAdd" class="miniBtn" type="button">Link as Related</button>
            <button id="evRelCancel" class="miniBtn" type="button">Cancel</button>
          </div>
        </div>

        <div id="evLinksList" class="evLinksList"></div>

        <h3>Get accredited help</h3>
        <p class="small">
          If you want representation or claim-specific advice, use VA’s accredited representative search:
          <a href="https://www.va.gov/ogc/apps/accreditation/" target="_blank" rel="noreferrer">Accredited Rep Directory</a>
        </p>
      `;
    }

    return {
      buildReferencesHTML,
      buildDetailMarkup,
    };
  }

  return { createDetailViewApi };
});
