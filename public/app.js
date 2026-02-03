let CONDITIONS = [];

function normalize(s) {
  return (s || "").toLowerCase().trim();
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

  list.forEach(item => {
    const div = document.createElement("div");
    div.className = `result ${systemClassName(item.body_system)}`;

    const dc = (item.cfr && item.cfr.length) ? item.cfr[0].diagnostic_code : "";
    const sys = item.body_system || "";

    div.innerHTML = `
      <div class="metaRow">
        ${sys ? `<span class="systemBadge ${systemClassName(sys)}">${sys}</span>` : ""}
        ${dc ? `<span class="dcBadge">DC ${dc}</span>` : ""}
      </div>
      <div><strong>${item.name}</strong></div>
      <div class="small">Aliases: ${(item.aliases || []).slice(0,3).join(", ")}${(item.aliases||[]).length>3 ? "…" : ""}</div>
    `;

    div.addEventListener("click", () => showDetail(item.id));
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
            ${
              e.source_url
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
    .map(
      (r) =>
        `<li><span class="badge">${r.section}</span> DC <strong>${r.diagnostic_code}</strong> — ${r.title} — <a href="${r.url}" target="_blank" rel="noreferrer">Open source</a></li>`
    )
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

  // --- Render ---
  el.innerHTML = `
    <div class="metaRow">
  ${
    item.body_system
      ? `<span class="systemBadge ${systemClassName(item.body_system)}">${item.body_system}</span>
`
      : ""
  }

  ${
    item.cfr && item.cfr.length
      ? `<span class="dcBadge">DC ${item.cfr[0].diagnostic_code}</span>`
      : ""
  }
</div>

<h2 style="margin-top:6px">${item.name}</h2>



    <div class="small">${item.disclaimer || ""}</div>

    <button id="copyLink" class="copyBtn">Copy link</button>

    <hr/>

    <h3>Where it fits in 38 CFR</h3>
<ul>${cfrLinks}</ul>

${refsHTML}

${excerptsHTML}

<hr/>
<h3>How VA rates it (high-level)</h3>

    ${ratingBlock}

    <hr/>

    <h3>General evidence categories (educational)</h3>
    <ul>${evidence}</ul>

    <hr/>

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
  }
}


async function showDetail(id, pushState = true) {
  const res = await fetch(`/api/conditions/${id}`);
  const item = await res.json();
  renderDetail(item);

  if (pushState) {
    history.pushState({ id }, "", `/condition/${id}`);
  }
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
    const q = input.value || "";
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
