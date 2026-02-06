let CONDITIONS = [];

function normalize(s) {
  return (s || "").toLowerCase().trim();
}

function parseCommandQuery(raw) {
  const q = (raw || "").trim();
  const lower = q.toLowerCase();

  // Normalize separators: "dc:8100" -> "dc 8100"
  const normalized = lower.replace(/[:=]/g, " ").replace(/\s+/g, " ").trim();

  // Quick commands (no args)
  if (normalized === "notes" || normalized === "note") {
    return { mode: "jump", jump: "notes", text: "" };
  }
  if (normalized === "evidence" || normalized === "checklist") {
    return { mode: "jump", jump: "evidence", text: "" };
  }

  // dc command
  const dcMatch = normalized.match(/^(dc)\s+(\d{3,5})$/);
  if (dcMatch) {
    return { mode: "jump", jump: dcMatch[2], text: dcMatch[2] };
  }

  // sec / section command (4.124a)
  const secMatch = normalized.match(/^(sec|section|§)\s+([0-9]+\.[0-9]+[a-z]?)$/);
  if (secMatch) {
    return { mode: "jump", jump: secMatch[2], text: secMatch[2] };
  }

  // Allow direct section like "§4.124a" without space
  const directSec = normalized.match(/^§?([0-9]+\.[0-9]+[a-z]?)$/);
  if (directSec && q.includes("§")) {
    return { mode: "jump", jump: directSec[1], text: directSec[1] };
  }

  // system command: "system neurological" or "system:ear"
  const sysMatch = normalized.match(/^(system|sys)\s+(.+)$/);
  if (sysMatch) {
    return { mode: "system", system: sysMatch[2].trim(), text: "" };
  }

  // Default: treat as normal search text
  return { mode: "text", text: q };
}


function escapeHtml(str) {
  return (str ?? "")
    .toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function evidenceKey(conditionId) {
  return `vaCfrEvidence:${conditionId}`;
}

function loadEvidenceState(conditionId) {
  try {
    return JSON.parse(localStorage.getItem(evidenceKey(conditionId)) || "{}");
  } catch {
    return {};
  }
}

function saveEvidenceState(conditionId, stateObj) {
  localStorage.setItem(evidenceKey(conditionId), JSON.stringify(stateObj || {}));
}

function notesKey(conditionId) {
  return `vaCfrNotes:${conditionId}`;
}

function loadNotes(conditionId) {
  return localStorage.getItem(notesKey(conditionId)) || "";
}

function saveNotes(conditionId, text) {
  localStorage.setItem(notesKey(conditionId), (text ?? "").toString());
}



function exportChecklistText(item, state) {
  const lines = [];
  lines.push(`${item.name} — Evidence Checklist`);
  lines.push(`(Educational tool; not legal advice)`);
  lines.push("");
  (item.evidence_checklist || []).forEach((t, i) => {
    const checked = !!state[i];
    lines.push(`${checked ? "[x]" : "[ ]"} ${t}`);
  });
  lines.push("");
  lines.push("");
  lines.push("Notes:");
  const notes = loadNotes(item.id).trim();
  lines.push(notes ? notes : "(none)");
  lines.push("");
  lines.push(`Source links:`);
  (item.cfr || []).forEach(r => {
    lines.push(`- ${r.section} DC ${r.diagnostic_code}: ${r.url}`);
  });
  return lines.join("\n");
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}



function escapeRegExp(str) {
  return (str ?? "").toString().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlight(text, query) {
  const q = normalize(query);
  const t = (text ?? "").toString();
  if (!q) return escapeHtml(t);

  // highlight is based on the raw query, but case-insensitive
  const re = new RegExp(escapeRegExp(q), "ig");
  return escapeHtml(t).replace(re, (m) => `<mark class="hl">${m}</mark>`);
}



function systemClassName(bodySystem) {
  const s = normalize(bodySystem);

  // normalize common variants → stable class names
  if (s.includes("mental")) return "sys-mental-health";
  if (s.includes("neuro")) return "sys-neurological";
  if (s.includes("musculo") || s.includes("ortho")) return "sys-musculoskeletal";
  if (s === "ear" || s.includes("auditory")) return "sys-ear";
  if (s.includes("resp")) return "sys-respiratory";
  if (s.includes("cardio") || s.includes("heart")) return "sys-cardiovascular";

  // fallback: safe kebab-case-ish
  return s ? `sys-${s.replace(/[^a-z0-9]+/g, "-")}` : "";
}


function matches(condition, query) {
  const q = normalize(query);
  if (!q) return true;

  const cfrStrings = (condition.cfr || []).flatMap(r => [
    r.diagnostic_code,      // "8520"
    r.section,              // "38 CFR § 4.124a"
    (r.section || "").replace("38 cfr §", "").trim(), // "4.124a"
    r.title                 // title text
  ]);

  const hay = [
    condition.name,
    condition.id,
    ...(condition.aliases || []),
    ...(cfrStrings || [])
  ].map(normalize);

  return hay.some(x => x.includes(q));
}

function matchReason(condition, query) {
  const q = normalize(query);
  if (!q) return "";

  // DC match
  for (const r of (condition.cfr || [])) {
    const dc = normalize(r.diagnostic_code);
    if (dc === q) return "Diagnostic Code";
    if (dc.includes(q)) return "Diagnostic Code (partial)";
  }

  // CFR section match
  for (const r of (condition.cfr || [])) {
    const section = normalize(r.section);
    const short = normalize((r.section || "").replace("38 cfr §", "").trim());
    if (short === q || section === q) return "CFR Section";
    if (short.includes(q) || section.includes(q)) return "CFR Section (partial)";
  }

  // Name match
  const name = normalize(condition.name);
  if (name === q) return "Name";
  if (name.startsWith(q)) return "Name (starts with)";
  if (name.includes(q)) return "Name (contains)";

  // ID match
  const id = normalize(condition.id);
  if (id === q) return "ID";
  if (id.includes(q)) return "ID (partial)";

  // Alias match
  const aliases = (condition.aliases || []).map(normalize);
  if (aliases.some(a => a === q)) return "Alias";
  if (aliases.some(a => a.startsWith(q))) return "Alias (starts with)";
  if (aliases.some(a => a.includes(q))) return "Alias (contains)";

  // CFR title match
  const titles = (condition.cfr || []).map(r => normalize(r.title));
  if (titles.some(t => t.includes(q))) return "CFR Title";

  return "Match";
}

function cfrSummary(condition) {
  const refs = (condition.cfr || []).slice(0, 2);
  if (!refs.length) return "";

  const parts = refs.map(r => {
    const short = (r.section || "").replace(/38\s*cfr\s*§/i, "").trim();
    const dc = r.diagnostic_code ? `DC ${r.diagnostic_code}` : "";
    const title = r.title || "";
    const sec = short ? `§ ${short}` : (r.section || "");
    return `${sec}${dc ? ` • ${dc}` : ""}${title ? ` • ${title}` : ""}`;
  });

  return parts.join(" | ");
}

function smartJumpAfterDetailRender(query) {
  const q = normalize(query);
  if (!q) return;

  // Notes jump (special)
  if (q === "notes" || q === "note" || q.includes("notes")) {
    const notesAnchor = document.getElementById("jump-notes");
    if (notesAnchor) notesAnchor.scrollIntoView({ behavior: "smooth", block: "start" });

    const notesEl = document.getElementById("notes");
    if (notesEl) {
      // small delay helps after scroll/render
      setTimeout(() => notesEl.focus(), 150);
    }
    return;
  }


  const detail = document.getElementById("detail");
  if (!detail) return;

  // Helper: try to find a CFR <li> that matches DC or section
  function findCfrLiBy(queryNorm) {
    const lis = detail.querySelectorAll("li[data-dc-id], li[data-sec-id]");
    for (const li of lis) {
      const dcId = li.getAttribute("data-dc-id") || "";
      const secId = li.getAttribute("data-sec-id") || "";

      // DC: 8520 -> jump-dc-8520
      if (/^\d{3,5}$/.test(queryNorm) && dcId === `jump-dc-${queryNorm}`) return li;

      // Section: 4.124a -> jump-sec-4.124a
      if (/^\d+\.\d+[a-z]?$/.test(queryNorm)) {
        const clean = queryNorm.replace(/[^a-z0-9.]+/g, "");
        if (secId === `jump-sec-${clean}`) return li;
      }
    }
    return null;
  }

  // 1) DC jump (most specific)
  if (/^\d{3,5}$/.test(q)) {
    const li = findCfrLiBy(q);
    if (li) return li.scrollIntoView({ behavior: "smooth", block: "start" });
    const refs = document.getElementById("jump-refs");
    if (refs) return refs.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // 2) CFR section jump (e.g., 4.124a) to the exact li if possible
  if (/^\d+\.\d+[a-z]?$/.test(q)) {
    const li = findCfrLiBy(q);
    if (li) return li.scrollIntoView({ behavior: "smooth", block: "start" });
    const cfr = document.getElementById("jump-cfr");
    if (cfr) return cfr.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // 3) Keyword-based rating jump (cpap, flare-ups, etc.)
  if (q.includes("cpap") || q.includes("hypersomnol") || q.includes("prostrat") || q.includes("flare")) {
    const rating = document.getElementById("jump-rating");
    if (rating) return rating.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Fallback
  const cfr = document.getElementById("jump-cfr");
  if (cfr) cfr.scrollIntoView({ behavior: "smooth", block: "start" });
}




function scoreMatch(condition, query) {
  const q = normalize(query);
  if (!q) return 0;

  const name = normalize(condition.name);
  const id = normalize(condition.id);
  const aliases = (condition.aliases || []).map(normalize);

  const cfr = (condition.cfr || []).map(r => ({
    section: normalize(r.section),
    sectionShort: normalize((r.section || "").replace("38 cfr §", "").trim()),
    dc: normalize(r.diagnostic_code),
    title: normalize(r.title)
  }));

  let score = 0;

  // DC match
  if (cfr.some(r => r.dc === q)) score += 1000;
  else if (cfr.some(r => r.dc.includes(q))) score += 500;

  // ID match
  if (id === q) score += 450;
  else if (id.includes(q)) score += 200;

  // Name match
  if (name === q) score += 420;
  else if (name.startsWith(q)) score += 260;
  else if (name.includes(q)) score += 160;

  // Alias match
  if (aliases.some(a => a === q)) score += 180;
  else if (aliases.some(a => a.startsWith(q))) score += 120;
  else if (aliases.some(a => a.includes(q))) score += 80;

  // CFR section match (this is what affects "4.124a")
  if (cfr.some(r => r.sectionShort === q)) score += 160;
  else if (cfr.some(r => r.sectionShort.includes(q))) score += 90;
  else if (cfr.some(r => r.section.includes(q))) score += 70;

  // CFR title match
  if (cfr.some(r => r.title.includes(q))) score += 60;

  return score;
}


function renderResults(list) {
  const el = document.getElementById("results");
  if (!el) {
    console.error('Missing element: <div id="results"> in index.html');
    return;
  }

  el.innerHTML = "";

  if (!list || !list.length) {
    el.innerHTML = `<div class="small">No matches. Try “8520”, “5260”, “8100”, or “ptsd”.</div>`;
    return;
  }

  const q = document.getElementById("q")?.value || "";

  list.forEach(item => {
    const div = document.createElement("div");
    div.className = `result ${systemClassName(item.body_system)}`;

    const sys = item.body_system || "";
    const dc = (item.cfr && item.cfr.length) ? item.cfr[0].diagnostic_code : "";

    const nameHTML = highlight(item.name, q);
    const aliasesPreview = (item.aliases || []).slice(0, 3).join(", ");
    const aliasesHTML = highlight(aliasesPreview, q);

    const reason = matchReason(item, q);

    const cfrLine = cfrSummary(item);
    const cfrHTML = cfrLine ? highlight(cfrLine, q) : "";

    div.innerHTML = `
      <div class="metaRow">
        ${sys ? `<span class="systemBadge ${systemClassName(sys)}">${escapeHtml(sys)}</span>` : ""}
        ${dc ? `<span class="dcBadge">${highlight(`DC ${dc}`, q)}</span>` : ""}
      </div>

      <div><strong>${nameHTML}</strong></div>

      ${cfrHTML
        ? `<div class="cfrLine">
         <span class="cfrJump"
           data-dc="${escapeHtml(dc)}"
           data-sec="${escapeHtml((item.cfr?.[0]?.section || "").replace(/38\\s*cfr\\s*§/i, "").trim())}">
           CFR: ${cfrHTML}
         </span>
       </div>`
        : ""
      }


      ${(q || "").trim()
        ? `<div class="matchNote">Matched: <strong>${escapeHtml(reason)}</strong></div>`
        : ""
      }

      <div class="small">Aliases: ${aliasesHTML}${(item.aliases || []).length > 3 ? "…" : ""}</div>
    `;
    const cfrJumpEl = div.querySelector(".cfrJump");
    if (cfrJumpEl) {
      cfrJumpEl.addEventListener("click", (e) => {
        e.stopPropagation();

        const dcHint = (e.currentTarget.dataset.dc || "").trim();
        const secHint = (e.currentTarget.dataset.sec || "").trim();

        // Prefer DC if it exists, otherwise use section
        const hint = dcHint || secHint;
        showDetail(item.id, true, hint);
      });
    }




    div.addEventListener("click", () => {
      const raw = document.getElementById("q")?.value || "";
      const parsed = parseCommandQuery(raw);
      const hint = parsed.mode === "jump" ? parsed.jump : raw;
      showDetail(item.id, true, hint);
    });

    el.appendChild(div);
  });
}



function buildReferencesHTML(item) {
  const primary = (item.cfr && item.cfr[0]) ? item.cfr[0] : null;
  if (!primary) return "";

  const section = primary.section || "";
  const dc = primary.diagnostic_code || "";
  const source = primary.url || "";

  // Sciatic nerve style: severity ladder
  if (item.rating_logic?.type === "severity_ladder" && Array.isArray(item.rating_logic.levels)) {
    return `
      <hr/>
      <h3>References</h3>
      <p class="small"><span class="badge">${section}</span> DC <strong>${dc}</strong>
      ${source ? ` — <a href="${source}" target="_blank" rel="noreferrer">Source</a>` : ""}</p>
      <ul>
        ${item.rating_logic.levels
        .map(l => `<li><strong>${l.level}</strong> → <strong>${l.rating_percent}%</strong></li>`)
        .join("")}
      </ul>
    `;
  }

  // Knee flexion style: thresholds
  if (item.rating_logic?.type === "thresholds" && Array.isArray(item.rating_logic.thresholds)) {
    return `
      <hr/>
      <h3>References</h3>
      <p class="small"><span class="badge">${section}</span> DC <strong>${dc}</strong>
      ${source ? ` — <a href="${source}" target="_blank" rel="noreferrer">Source</a>` : ""}</p>
      <ul>
        ${item.rating_logic.thresholds
        .map(t => `<li>Flexion limited to <strong>${t.flexion_deg}°</strong> → <strong>${t.rating_percent}%</strong></li>`)
        .join("")}
      </ul>
    `;
  }

  // Fallback (tinnitus/hearing loss/PTSD): just show the anchor reference
  return `
    <hr/>
    <h3>References</h3>
    <p class="small"><span class="badge">${section}</span> DC <strong>${dc}</strong>
    ${source ? ` — <a href="${source}" target="_blank" rel="noreferrer">Source</a>` : ""}</p>
    <p class="small">${item.rating_logic?.summary || ""}</p>
  `;
}


function renderDetail(item) {
  const el = document.getElementById("detail");
  el.classList.remove("hidden");

  // --- CFR Excerpts block (optional) ---
  let excerptsHTML = "";
  if (item.excerpts && item.excerpts.length) {
    excerptsHTML = `
      <hr/>
      <h3>CFR Excerpts</h3>
      ${item.excerpts
        .map(
          (e) => `
            <p><strong>${e.label || "Excerpt"}</strong></p>
            <p class="small">${e.text || ""}</p>
            ${e.source_url
              ? `<p><a href="${e.source_url}" target="_blank" rel="noreferrer">View Source</a></p>`
              : ""
            }
          `
        )
        .join("")}
    `;
  }

  // --- CFR links ---
  const cfrLinks = (item.cfr || [])
    .map((r) => {
      const dc = (r.diagnostic_code || "").toString().trim();
      const secShort = (r.section || "")
        .replace(/38\s*cfr\s*§/i, "")
        .trim()
        .toLowerCase();

      const dcId = dc ? `jump-dc-${dc}` : "";
      const secId = secShort ? `jump-sec-${secShort.replace(/[^a-z0-9.]+/g, "")}` : "";

      // Put both ids in data- attributes so we can target either
      return `
      <li data-dc-id="${dcId}" data-sec-id="${secId}">
        <span class="badge">${r.section}</span>
        DC <strong>${r.diagnostic_code}</strong> — ${r.title}
        — <a href="${r.url}" target="_blank" rel="noreferrer">Open source</a>
      </li>
    `;
    })
    .join("");




  const refsHTML = buildReferencesHTML(item);


  // --- Rating block ---
  let ratingBlock = `<p class="small">${item.rating_logic?.summary || ""}</p>`;

  if (
    item.rating_logic?.type === "thresholds" &&
    Array.isArray(item.rating_logic.thresholds)
  ) {
    ratingBlock += `
      <ul>
        ${item.rating_logic.thresholds
        .map(
          (t) =>
            `<li>Flexion limited to <strong>${t.flexion_deg}°</strong> → <strong>${t.rating_percent}%</strong></li>`
        )
        .join("")}
      </ul>
    `;
  }

  if (
    item.rating_logic?.type === "severity_ladder" &&
    Array.isArray(item.rating_logic.levels)
  ) {
    ratingBlock += `
      <ul>
        ${item.rating_logic.levels
        .map(
          (l) =>
            `<li><strong>${l.level}</strong> → <strong>${l.rating_percent}%</strong></li>`
        )
        .join("")}
      </ul>
    `;
  }

  // --- Evidence list ---
  const evidence = (item.evidence_checklist || [])
    .map((x) => `<li>${x}</li>`)
    .join("");

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


  // --- Render ---
  el.innerHTML = `
    <div class="metaRow">
  ${item.body_system
      ? `<span class="systemBadge ${systemClassName(item.body_system)}">${item.body_system}</span>
`
      : ""
    }

  ${item.cfr && item.cfr.length
      ? `<span class="dcBadge">DC ${item.cfr[0].diagnostic_code}</span>`
      : ""
    }
</div>

<h2 style="margin-top:6px">${item.name}</h2>

<div id="jumpIndicator" class="jumpIndicator hidden">
  <span id="jumpIndicatorText"></span>
  <button id="jumpIndicatorClose" class="jumpIndicatorClose" type="button" aria-label="Close">×</button>
</div>


    <div class="small">${item.disclaimer || ""}</div>

    <button id="copyLink" class="copyBtn">Copy link</button>

    <hr/>

    <h3 id="jump-cfr">Where it fits in 38 CFR</h3>
<ul>${cfrLinks}</ul>

${refsHTML ? `<div id="jump-refs"></div>${refsHTML}` : ""}


${excerptsHTML}

<hr/>
<h3 id="jump-rating">How VA rates it (high-level)</h3>

    ${ratingBlock}

    <hr/>

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


    <h3>Get accredited help</h3>
    <p class="small">
      If you want representation or claim-specific advice, use VA’s accredited representative search:
      <a href="https://www.va.gov/ogc/apps/accreditation/" target="_blank" rel="noreferrer">Accredited Rep Directory</a>
    </p>
  `;

  // --- Copy link handler ---
  const btn = document.getElementById("copyLink");
  if (btn) {
    btn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(window.location.href);
      alert("Link copied!");
    });

    // --- Notes behavior (persist per condition) ---
    const notesEl = document.getElementById("notes");
    const notesClearBtn = document.getElementById("notesClear");

    if (notesEl) {
      notesEl.value = loadNotes(item.id);

      // Auto-save while typing (small debounce)
      let t;
      notesEl.addEventListener("input", () => {
        clearTimeout(t);
        t = setTimeout(() => saveNotes(item.id, notesEl.value), 200);
      });
    }

    if (notesClearBtn) {
      notesClearBtn.addEventListener("click", () => {
        saveNotes(item.id, "");
        if (notesEl) notesEl.value = "";
      });
    }

  }

  // --- Evidence checklist behavior (persist per condition) ---
  const evList = document.getElementById("evList");
  const evCountEl = document.getElementById("evCount");



  function updateEvCount() {
    const st = loadEvidenceState(item.id);
    const done = (item.evidence_checklist || []).reduce((acc, _, idx) => acc + (st[idx] ? 1 : 0), 0);
    if (evCountEl) evCountEl.textContent = String(done);
  }

  if (evList) {
    evList.addEventListener("change", (e) => {
      const cb = e.target;
      if (!cb || !cb.classList || !cb.classList.contains("evCheck")) return;

      const idx = Number(cb.dataset.idx);
      const st = loadEvidenceState(item.id);
      st[idx] = cb.checked;
      saveEvidenceState(item.id, st);
      updateEvCount();
    });
  }

  const evCopyBtn = document.getElementById("evCopy");
  if (evCopyBtn) {
    evCopyBtn.addEventListener("click", async () => {
      const st = loadEvidenceState(item.id);
      const text = exportChecklistText(item, st);
      await navigator.clipboard.writeText(text);
      alert("Checklist copied!");
    });
  }

  const evExportBtn = document.getElementById("evExport");
  if (evExportBtn) {
    evExportBtn.addEventListener("click", () => {
      const st = loadEvidenceState(item.id);
      const text = exportChecklistText(item, st);
      const safeName = (item.id || "condition").replace(/[^a-z0-9_-]+/gi, "_");
      downloadText(`${safeName}_evidence_checklist.txt`, text);
    });
  }

  const evClearBtn = document.getElementById("evClear");
  if (evClearBtn) {
    evClearBtn.addEventListener("click", () => {
      saveEvidenceState(item.id, {});
      // uncheck all boxes in UI
      document.querySelectorAll(".evCheck").forEach(cb => (cb.checked = false));
      updateEvCount();
    });
  }


  // --- CFR Jump Highlighter + Indicator ---
  const params = new URLSearchParams(window.location.search);
  const hint = params.get("jump");

  const indicator = document.getElementById("jumpIndicator");
  const indicatorText = document.getElementById("jumpIndicatorText");
  const indicatorClose = document.getElementById("jumpIndicatorClose");

  function showIndicator(msg) {
    if (!indicator || !indicatorText) return;
    indicatorText.textContent = msg;
    indicator.classList.remove("hidden");

    // Auto-hide after 4 seconds
    window.clearTimeout(window.__jumpIndicatorTimer);
    window.__jumpIndicatorTimer = window.setTimeout(() => {
      indicator.classList.add("hidden");
    }, 4000);
  }

  if (indicatorClose) {
    indicatorClose.addEventListener("click", () => {
      indicator?.classList.add("hidden");
    });
  }

  if (hint) {
    const h = hint.toLowerCase().trim();
    showIndicator(`Jumped to: ${hint}`);

    if (hint.toLowerCase().includes("note")) {
      const notesAnchor = document.getElementById("jump-notes");
      if (notesAnchor) notesAnchor.scrollIntoView({ behavior: "smooth", block: "start" });
      const notesEl = document.getElementById("notes");
      if (notesEl) setTimeout(() => notesEl.focus(), 150);
    }


    const rows = el.querySelectorAll("li[data-dc-id], li[data-sec-id]");

    rows.forEach(row => {
      const dc = row.dataset.dcId || "";
      const sec = row.dataset.secId || "";

      if (dc.includes(h) || sec.includes(h)) {
        row.classList.add("cfrFocus");
        row.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });

    history.replaceState(history.state, "", window.location.pathname);

  }

}


async function showDetail(id, pushState = true, jumpHint = "") {
  const hint = (jumpHint || document.getElementById("q")?.value || "").trim();

  // ✅ IMPORTANT: update URL FIRST so renderDetail reads the correct ?jump=
  if (pushState) {
    const url = hint
      ? `/condition/${id}?jump=${encodeURIComponent(hint)}`
      : `/condition/${id}`;

    history.pushState({ id, jump: hint }, "", url);
  }

  const res = await fetch(`/api/conditions/${id}`);
  const item = await res.json();

  renderDetail(item);

  // Jump immediately too (smooth UX)
  smartJumpAfterDetailRender(hint);
}



async function init() {
  const res = await fetch("/api/conditions");
  CONDITIONS = await res.json();

  const input = document.getElementById("q");
  const filter = document.getElementById("systemFilter");
  const clearBtn = document.getElementById("clearBtn");

  if (!input) {
    console.error('Missing search input with id="q" in index.html');
    return;
  }
  if (!filter) {
    console.error('Missing dropdown with id="systemFilter" in index.html');
    return;
  }

  // Populate dropdown
  filter.innerHTML = `<option value="">All body systems</option>`;
  const systems = [...new Set(CONDITIONS.map(c => c.body_system).filter(Boolean))].sort();
  systems.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    filter.appendChild(opt);
  });

  function applyFilters() {
    const parsed = parseCommandQuery(input.value || "");
    const q = parsed.mode === "text" ? parsed.text : (parsed.text || "");

    // If user typed a system command, set the dropdown automatically
    if (parsed.mode === "system" && parsed.system) {
      // best-effort match against dropdown values
      const target = parsed.system.toLowerCase();
      const options = [...filter.options].map(o => o.value).filter(Boolean);

      const found = options.find(v => v.toLowerCase() === target)
        || options.find(v => v.toLowerCase().includes(target))
        || options.find(v => target.includes(v.toLowerCase()));

      if (found) filter.value = found;
    }


    const sys = filter.value || "";


    let filtered = CONDITIONS.filter(c => {
      const sysOk = !sys || c.body_system === sys;
      const textOk = matches(c, q);
      return sysOk && textOk;
    });

    const nq = normalize(q);
    if (nq) {
      filtered = filtered
        .map(c => ({ c, s: scoreMatch(c, q) }))
        .sort((a, b) => b.s - a.s)
        .map(x => x.c);
    } else {
      filtered = filtered.slice().sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }

    renderResults(filtered);
  }

  function clearAll() {
    input.value = "";
    filter.value = "";
    document.querySelectorAll(".legendChip").forEach(c => c.classList.remove("active"));
    applyFilters();
  }

  if (clearBtn) clearBtn.addEventListener("click", clearAll);

  input.addEventListener("input", applyFilters);
  input.addEventListener("keyup", applyFilters);
  input.addEventListener("search", applyFilters);
  filter.addEventListener("change", applyFilters);

  // Build clickable legend chips (if legend exists)
  const legend = document.getElementById("legend");
  if (legend) {
    legend.innerHTML = "";
    systems.forEach(sysName => {
      const chip = document.createElement("span");
      chip.className = `systemBadge legendChip ${systemClassName(sysName)}`;
      chip.textContent = sysName;

      chip.addEventListener("click", () => {
        filter.value = sysName;
        document.querySelectorAll(".legendChip").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        applyFilters();
      });

      legend.appendChild(chip);
    });
  }

  applyFilters();
  tryLoadFromPath(); // load /condition/:id if present
}




window.addEventListener("popstate", (e) => {
  const id = e.state?.id;
  if (id) showDetail(id, false);
});

function tryLoadFromPath() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts[0] === "condition" && parts[1]) {
    showDetail(parts[1], false);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  init();
});
