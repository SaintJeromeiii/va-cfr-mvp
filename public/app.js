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

const WORKSPACE_KEY = "vaCfrWorkspace:v4";

const REL_TYPES = [
  "Secondary to",
  "Aggravated by",
  "Due to / Caused by",
  "Associated with",
  "Increase (worsened)",
  "Direct (standalone)"
];

function loadWorkspaceState() {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY);
    if (!raw) return { nodes: [], primaryId: "", links: [] };

    const parsed = JSON.parse(raw);

    // ---- Migration from v3: { ids, primaryId, secondary:[{id,type}] } ----
    if (parsed && Array.isArray(parsed.ids) && Array.isArray(parsed.secondary)) {
      const nodes = parsed.ids;
      const primaryId = parsed.primaryId || nodes[0] || "";
      const links = (parsed.secondary || [])
        .filter(x => x && typeof x.id === "string")
        .map(x => ({ from: primaryId, to: x.id, type: x.type || "Secondary to" }));
      return { nodes, primaryId, links };
    }

    // ---- Migration from v2: { ids, primaryId, secondaryIds } ----
    if (parsed && Array.isArray(parsed.ids) && Array.isArray(parsed.secondaryIds)) {
      const nodes = parsed.ids;
      const primaryId = parsed.primaryId || nodes[0] || "";
      const links = (parsed.secondaryIds || [])
        .filter(Boolean)
        .map(id => ({ from: primaryId, to: id, type: "Secondary to" }));
      return { nodes, primaryId, links };
    }

    // ---- Migration from array: ["a","b","c"] ----
    if (Array.isArray(parsed)) {
      const nodes = parsed;
      const primaryId = nodes[0] || "";
      const links = nodes.slice(1).map(id => ({ from: primaryId, to: id, type: "Secondary to" }));
      return { nodes, primaryId, links };
    }

    // ---- Normal v4 ----
    const nodes = Array.isArray(parsed.nodes) ? parsed.nodes.filter(x => typeof x === "string") : [];
    const primaryId = typeof parsed.primaryId === "string" ? parsed.primaryId : "";
    const links = Array.isArray(parsed.links) ? parsed.links : [];

    const cleanLinks = links
      .filter(l => l && typeof l.from === "string" && typeof l.to === "string")
      .map(l => ({ from: l.from, to: l.to, type: typeof l.type === "string" ? l.type : "Secondary to" }));

    return { nodes, primaryId, links: cleanLinks };
  } catch {
    return { nodes: [], primaryId: "", links: [] };
  }
}

function saveWorkspaceState(st) {
  localStorage.setItem(WORKSPACE_KEY, JSON.stringify(st || { nodes: [], primaryId: "", links: [] }));
}

function buildAdjacencyFromLinks(links) {
  const adj = new Map();
  (links || []).forEach(l => {
    if (!adj.has(l.from)) adj.set(l.from, []);
    adj.get(l.from).push(l.to);
  });
  return adj;
}

// Returns true if there's already a path start -> target in the existing graph
function hasPath(adj, start, target) {
  if (start === target) return true;
  const seen = new Set();
  const stack = [start];

  while (stack.length) {
    const cur = stack.pop();
    if (cur === target) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const kids = adj.get(cur) || [];
    for (const k of kids) stack.push(k);
  }
  return false;
}

// Would adding edge from -> to create a cycle?
// A cycle happens iff there is already a path: to -> from
function wouldCreateCycle(links, fromId, toId) {
  if (!fromId || !toId) return false;
  if (fromId === toId) return true;
  const adj = buildAdjacencyFromLinks(links);
  return hasPath(adj, toId, fromId);
}

function ensureNode(id) {
  const st = loadWorkspaceState();
  if (!st.nodes.includes(id)) st.nodes.push(id);
  if (!st.primaryId) st.primaryId = id;
  saveWorkspaceState(st);
  return st;
}

function setPrimary(id) {
  const st = ensureNode(id);
  st.primaryId = id;

  // optional: remove self-referential links
  st.links = st.links.filter(l => l.from !== l.to);

  saveWorkspaceState(st);
  return st;
}

function addLink(fromId, toId, type = "Secondary to") {
  const st = loadWorkspaceState();
  if (!st.nodes.includes(fromId)) st.nodes.push(fromId);
  if (!st.nodes.includes(toId)) st.nodes.push(toId);
  if (!st.primaryId) st.primaryId = fromId;

  // prevent self-links
  if (fromId === toId) return st;

  // Check for cycle: would adding fromId -> toId create a loop?
  if (wouldCreateCycle(st.links, fromId, toId)) {
    throw new Error(`Cycle blocked: linking "${fromId}" → "${toId}" would create a loop.`);
  }

  // Allow multiple parents: do NOT remove other links to this child.
  // Just prevent exact duplicates (same from -> to).
  st.links = st.links.filter(l => !(l.from === fromId && l.to === toId));

  st.links.push({ from: fromId, to: toId, type });

  saveWorkspaceState(st);
  return st;
}

function removeLink(fromId, toId) {
  const st = loadWorkspaceState();
  st.links = (st.links || []).filter(l => !(l.from === fromId && l.to === toId));
  saveWorkspaceState(st);
  return st;
}

function updateLinkType(fromId, toId, type) {
  const st = loadWorkspaceState();
  const link = (st.links || []).find(l => l.from === fromId && l.to === toId);
  if (link) link.type = type || "Secondary to";
  saveWorkspaceState(st);
  return st;
}

function removeNode(id) {
  const st = loadWorkspaceState();
  st.nodes = st.nodes.filter(x => x !== id);
  st.links = st.links.filter(l => l.from !== id && l.to !== id);

  if (st.primaryId === id) {
    st.primaryId = st.nodes[0] || "";
  }

  saveWorkspaceState(st);
  return st;
}

function clearWorkspace() {
  saveWorkspaceState({ nodes: [], primaryId: "", links: [] });
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

function evidenceCompletion(item, state) {
  const total = (item.evidence_checklist || []).length;
  if (!total) return { done: 0, total: 0, pct: 0 };
  const done = (item.evidence_checklist || []).reduce((acc, _, idx) => acc + (state[idx] ? 1 : 0), 0);
  return { done, total, pct: Math.round((done / total) * 100) };
}

function buildClaimPacketText(item, evState) {
  const lines = [];
  lines.push(`${item.name}`);
  lines.push(`Body system: ${item.body_system || "(unknown)"}`);
  lines.push("");

  // CFR refs
  lines.push("CFR References:");
  (item.cfr || []).forEach(r => {
    lines.push(`- ${r.section || ""} | DC ${r.diagnostic_code || ""} | ${r.title || ""}`);
    if (r.url) lines.push(`  ${r.url}`);
  });
  lines.push("");

  // Strategy
  if (item.strategy && item.strategy.length) {
    lines.push("Claim Strategy (Educational):");
    item.strategy.forEach(s => lines.push(`- ${s}`));
    lines.push("");
  }

  // Evidence checklist
  lines.push("Evidence Checklist:");
  (item.evidence_checklist || []).forEach((e, idx) => {
    const mark = evState[idx] ? "[x]" : "[ ]";
    lines.push(`${mark} ${e}`);
  });
  lines.push("");

  // Notes
  lines.push("Notes:");
  const notes = (loadNotes(item.id) || "").trim();
  lines.push(notes ? notes : "(none)");
  lines.push("");

  lines.push("Disclaimer: Educational only. Not legal advice/representation.");
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

function workspaceCompletion(conditions) {
  let done = 0, total = 0;

  conditions.forEach(item => {
    const st = loadEvidenceState(item.id);
    const t = (item.evidence_checklist || []).length;
    total += t;
    done += (item.evidence_checklist || []).reduce((acc, _, idx) => acc + (st[idx] ? 1 : 0), 0);
  });

  const pct = total ? Math.round((done / total) * 100) : 0;
  return { done, total, pct };
}

function buildWorkspacePacketText(items) {
  const lines = [];
  lines.push("VA CFR Finder — Claim Workspace Packet");
  lines.push(new Date().toLocaleString());
  lines.push("");
  lines.push(`Conditions in workspace: ${items.length}`);
  lines.push("");

  items.forEach((item, i) => {
    const st = loadEvidenceState(item.id);
    const wsState = loadWorkspaceState();
    const linksToMe = (wsState.links || []).filter(l => l.to === item.id);
    
    lines.push("============================================================");
    lines.push(`${i + 1}) ${item.name} (${item.id})`);
    lines.push(`Body system: ${item.body_system || "(unknown)"}`);
    
    if (item.id === wsState.primaryId) {
      lines.push("Role: Primary");
    } else if (linksToMe.length) {
      lines.push("Role: Linked");
      lines.push("Linked to:");
      linksToMe.forEach(l => {
        const pItem = CONDITIONS.find(c => c.id === l.from);
        const pName = pItem ? pItem.name : l.from;
        lines.push(`- ${pName} (${l.type || "Secondary to"})`);
      });
    } else {
      lines.push("Role: Unlinked (in workspace)");
    }
    lines.push("");

    // CFR refs
    lines.push("CFR References:");
    (item.cfr || []).forEach(r => {
      lines.push(`- ${r.section || ""} | DC ${r.diagnostic_code || ""} | ${r.title || ""}`);
      if (r.url) lines.push(`  ${r.url}`);
    });
    lines.push("");

    // Strategy
    if (item.strategy && item.strategy.length) {
      lines.push("Claim Strategy (Educational):");
      item.strategy.forEach(s => lines.push(`- ${s}`));
      lines.push("");
    }

    // Evidence checklist
    lines.push("Evidence Checklist:");
    (item.evidence_checklist || []).forEach((e, idx) => {
      const mark = st[idx] ? "[x]" : "[ ]";
      lines.push(`${mark} ${e}`);
    });
    lines.push("");

    // Notes
    lines.push("Notes:");
    const notes = (loadNotes(item.id) || "").trim();
    lines.push(notes ? notes : "(none)");
    lines.push("");
  });

  lines.push("============================================================");
  lines.push("Disclaimer: Educational only. Not legal advice/representation.");
  return lines.join("\n");
}

function parentsOf(childId, links) {
  return (links || []).filter(l => l.to === childId);
}

function buildAdjacency(links) {
  const childrenBy = new Map();
  (links || []).forEach(l => {
    if (!childrenBy.has(l.from)) childrenBy.set(l.from, []);
    childrenBy.get(l.from).push(l);
  });
  return childrenBy;
}

function renderWorkspace() {
  const wsList = document.getElementById("wsList");
  const wsScore = document.getElementById("wsScore");
  const wsBarFill = document.getElementById("wsBarFill");

  if (!wsList || !wsScore || !wsBarFill) return;

  const st = loadWorkspaceState();
  const items = st.nodes.map(id => CONDITIONS.find(c => c.id === id)).filter(Boolean);

  wsList.innerHTML = "";

  if (!items.length) {
    wsScore.textContent = "Evidence Readiness: 0/0 (0%)";
    wsBarFill.style.width = "0%";
    wsList.innerHTML = `<div class="small">Workspace is empty. Open a condition and click “Add to Workspace”.</div>`;
    return;
  }

  // Compute readiness across ALL workspace items
  const { done, total, pct } = workspaceCompletion(items);
  wsScore.textContent = `Evidence Readiness: ${done}/${total} (${pct}%)`;
  wsBarFill.style.width = `${pct}%`;

  items.forEach(item => {
    const isPrimary = item.id === st.primaryId;
    const stNow = loadWorkspaceState();
    const parentLinks = parentsOf(item.id, stNow.links);
    const candidates = stNow.nodes.filter(x => x !== item.id);

    const ev = evidenceCompletion(item, loadEvidenceState(item.id));

    const card = document.createElement("div");
    card.className = `wsCard ${systemClassName(item.body_system)}`;

    card.innerHTML = `
      <div class="wsRow">
        <div style="min-width:260px">
          <div>
            <strong>${escapeHtml(item.name)}</strong>
            ${isPrimary ? `<span class="wsBadge">Primary</span>` : `<span class="wsBadge">Linked</span>`}
          </div>
          <div class="small">${escapeHtml(item.body_system || "")} • ${ev.done}/${ev.total} (${ev.pct}%)</div>

          ${isPrimary ? "" : `
            <div class="small" style="margin-top:10px"><strong>Linked to (parents):</strong></div>

            <div class="wsLinks">
              ${
                parentLinks.length
                  ? parentLinks.map(l => {
                      const pItem = CONDITIONS.find(c => c.id === l.from);
                      const pName = pItem ? pItem.name : l.from;
                      return `
                        <div class="wsLinkRow">
                          <div class="small">
                            <strong>${escapeHtml(pName)}</strong>
                          </div>

                          <select class="wsRelSelect" data-from="${escapeHtml(l.from)}" data-to="${escapeHtml(item.id)}">
                            ${REL_TYPES.map(t => `<option value="${escapeHtml(t)}" ${t === (l.type || "Secondary to") ? "selected" : ""}>${escapeHtml(t)}</option>`).join("")}
                          </select>

                          <button class="miniBtn danger" data-unlink-from="${escapeHtml(l.from)}" data-unlink-to="${escapeHtml(item.id)}" type="button">
                            Remove link
                          </button>
                        </div>
                      `;
                    }).join("")
                  : `<div class="small">(no parent links yet)</div>`
              }
            </div>

            <div class="small" style="margin-top:10px">Add parent link:</div>
            <div class="wsAddLinkRow">
              <select class="wsAddParentSelect" data-child="${escapeHtml(item.id)}">
                <option value="">Choose parent…</option>
                ${candidates.map(pid => {
                  const pItem = CONDITIONS.find(c => c.id === pid);
                  const label = pItem ? pItem.name : pid;
                  return `<option value="${escapeHtml(pid)}">${escapeHtml(label)}</option>`;
                }).join("")}
              </select>

              <select class="wsAddTypeSelect" data-child="${escapeHtml(item.id)}">
                ${REL_TYPES.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("")}
              </select>

              <button class="miniBtn" data-addlink="${escapeHtml(item.id)}" type="button">Add</button>
            </div>
          `}
        </div>

        <div class="wsRowBtns">
          <button class="miniBtn" data-open="${item.id}" type="button">Open</button>
          ${isPrimary ? "" : `<button class="miniBtn" data-primary="${item.id}" type="button">Set Primary</button>`}
          <button class="miniBtn danger" data-rm="${item.id}" type="button">Remove</button>
        </div>
      </div>
    `;

    wsList.appendChild(card);
  });

  // wire buttons
  wsList.querySelectorAll("button[data-open]").forEach(b => b.addEventListener("click", () => showDetail(b.dataset.open)));
  wsList.querySelectorAll("button[data-primary]").forEach(b => b.addEventListener("click", () => { setPrimary(b.dataset.primary); renderWorkspace(); }));
  wsList.querySelectorAll("button[data-rm]").forEach(b => b.addEventListener("click", () => { removeNode(b.dataset.rm); renderWorkspace(); }));

  // wire relationship type changes
  wsList.querySelectorAll("select.wsRelSelect").forEach(sel => {
    sel.addEventListener("change", () => {
      const fromId = sel.dataset.from;
      const toId = sel.dataset.to;
      updateLinkType(fromId, toId, sel.value);
      renderWorkspace();
      renderClaimTree();
    });
  });

  // wire unlink buttons
  wsList.querySelectorAll("button[data-unlink-from]").forEach(b => {
    b.addEventListener("click", () => {
      const fromId = b.dataset.unlinkFrom;
      const toId = b.dataset.unlinkTo;
      removeLink(fromId, toId);
      renderWorkspace();
      renderClaimTree();
    });
  });

  // wire "add parent link" dropdowns and button
  wsList.querySelectorAll("button[data-addlink]").forEach(btn => {
    btn.addEventListener("click", () => {
      const childId = btn.dataset.addlink;
      const parentSel = wsList.querySelector(`select.wsAddParentSelect[data-child="${CSS.escape(childId)}"]`);
      const typeSel = wsList.querySelector(`select.wsAddTypeSelect[data-child="${CSS.escape(childId)}"]`);

      const parentId = parentSel?.value || "";
      const relType = typeSel?.value || "Secondary to";

      if (!parentId) return;

      try {
        addLink(parentId, childId, relType);
        renderWorkspace();
        renderClaimTree();
      } catch (err) {
        alert(err.message || "That link would create a cycle. Choose a different parent.");
      }
    });
  });

  // Update tree view
  renderClaimTree();
}

function renderClaimTree() {
  const treeEl = document.getElementById("tree");
  if (!treeEl) return;

  const st = loadWorkspaceState();
  const primary = st.primaryId ? CONDITIONS.find(c => c.id === st.primaryId) : null;

  if (!primary) {
    treeEl.innerHTML = `<div class="small treeHint">No Primary set yet. In the Workspace, click "Set Primary".</div>`;
    return;
  }

  const childrenBy = buildAdjacency(st.links);

  // BFS levels
  const levels = [];
  const seen = new Set();
  const q = [{ id: primary.id, depth: 0 }];

  while (q.length) {
    const cur = q.shift();
    if (seen.has(cur.id)) continue;
    seen.add(cur.id);

    if (!levels[cur.depth]) levels[cur.depth] = [];
    levels[cur.depth].push(cur.id);

    const kids = childrenBy.get(cur.id) || [];
    kids.forEach(l => q.push({ id: l.to, depth: cur.depth + 1 }));
  }

  // Layout
  const nodeW = 240, nodeH = 44;
  const padX = 30, padY = 20;
  const gapX = 90, gapY = 18;

  const maxCols = levels.length || 1;
  const maxRows = Math.max(...levels.map(a => a.length), 1);

  const width = padX * 2 + maxCols * nodeW + (maxCols - 1) * gapX;
  const height = padY * 2 + maxRows * nodeH + (maxRows - 1) * gapY;

  const esc = (s) => escapeHtml(s || "");

  // positions: nodeId -> {x,y}
  const pos = new Map();
  levels.forEach((ids, depth) => {
    ids.forEach((id, idx) => {
      const x = padX + depth * (nodeW + gapX);
      const y = padY + idx * (nodeH + gapY);
      pos.set(id, { x, y });
    });
  });

  const node = (id, label, x, y, badge) => `
    <g class="treeNode" data-id="${esc(id)}" transform="translate(${x},${y})">
      <rect width="${nodeW}" height="${nodeH}"></rect>
      <text x="12" y="18" fill="rgba(255,255,255,0.9)">${esc(label)}</text>
      ${badge ? `<text x="12" y="36" fill="rgba(255,255,255,0.55)">${esc(badge)}</text>` : ""}
    </g>
  `;

  const line = (x1, y1, x2, y2) => `
    <line class="treeLine" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"></line>
  `;

  let lines = "";
  let labels = "";
  let nodes = "";

  // draw links
  (st.links || []).forEach(l => {
    const p = pos.get(l.from);
    const c = pos.get(l.to);
    if (!p || !c) return;

    const x1 = p.x + nodeW;
    const y1 = p.y + nodeH / 2;
    const x2 = c.x;
    const y2 = c.y + nodeH / 2;

    lines += line(x1, y1, x2, y2);

    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    labels += `<text x="${mx + 6}" y="${my - 6}" fill="rgba(255,255,255,0.55)">${esc(l.type || "Secondary to")}</text>`;
  });

  // draw nodes
  pos.forEach((p, id) => {
    const item = CONDITIONS.find(c => c.id === id);
    if (!item) return;
    const badge = id === st.primaryId ? `Primary • ${item.body_system || ""}` : `${item.body_system || ""}`;
    nodes += node(id, item.name, p.x, p.y, badge);
  });

  treeEl.innerHTML = `
    <svg class="treeSvg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      ${lines}
      ${labels}
      ${nodes}
    </svg>
  `;

  treeEl.querySelectorAll(".treeNode").forEach(g => {
    g.addEventListener("click", () => {
      const id = g.getAttribute("data-id");
      if (!id) return;
      showDetail(id);
      document.getElementById("detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
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

  // --- Strategy block (NEW) ---
let strategyHTML = "";

if (item.strategy && item.strategy.length) {
  strategyHTML = `
    <hr/>
    <h3>🧭 Claim Strategy (Educational)</h3>
    <ul>
      ${item.strategy.map(s => `<li>${escapeHtml(s)}</li>`).join("")}
    </ul>
  `;
}



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
    <button id="wsAdd" class="miniBtn" type="button">+ Add to Workspace</button>
    <button id="wsAddSecondary" class="miniBtn" type="button">+ Add as Secondary</button>

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

  const wsAdd = document.getElementById("wsAdd");
  if (wsAdd) {
    wsAdd.addEventListener("click", () => {
      ensureNode(item.id);
      renderWorkspace();
      alert("Added to workspace!");
    });
  }

  const wsAddSecondary = document.getElementById("wsAddSecondary");
  if (wsAddSecondary) {
    wsAddSecondary.addEventListener("click", () => {
      const st = loadWorkspaceState();
      ensureNode(item.id);

      const parent = st.primaryId || item.id;

      const choice = prompt(
        `Relationship type for "${item.name}"?\n` +
        REL_TYPES.map((t, i) => `${i + 1}) ${t}`).join("\n") +
        `\n\nType a number (1-${REL_TYPES.length}) or leave blank for "Secondary to".`
      );

      let relType = "Secondary to";
      const n = parseInt(choice, 10);
      if (!Number.isNaN(n) && n >= 1 && n <= REL_TYPES.length) relType = REL_TYPES[n - 1];

      // link to primary by default (user can change parent in workspace UI)
      try {
        addLink(parent, item.id, relType);
        renderWorkspace();
        alert(`Linked as: ${relType}`);
      } catch (err) {
        alert(err.message || "That link would create a cycle.");
      }
    });
  }

    // --- Secondary condition logic ---
const secBtn = document.getElementById("addSecondaryBtn");
const secList = document.getElementById("secondaryList");

if (secBtn && secList) {
  secBtn.addEventListener("click", () => {
    const select = document.createElement("select");
    select.className = "secondarySelect";

    select.innerHTML = `
      <option value="">Choose a condition…</option>
      ${CONDITIONS.map(c => `<option value="${c.id}">${c.name}</option>`).join("")}
    `;

    select.addEventListener("change", () => {
      const chosen = CONDITIONS.find(c => c.id === select.value);
      if (!chosen) return;

      const div = document.createElement("div");
      div.className = "secondaryCard";
      div.textContent = chosen.name;

      div.addEventListener("click", () => showDetail(chosen.id));

      secList.appendChild(div);
    });

    secList.appendChild(select);
  });
}


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
      renderWorkspace();
    });
  }

  // Evidence readiness UI + packet buttons
  function updateEvidenceUI() {
    const st = loadEvidenceState(item.id);
    const { done, total, pct } = evidenceCompletion(item, st);

    const scoreText = document.getElementById("evScoreText");
    const barFill = document.getElementById("evBarFill");
    if (scoreText) scoreText.textContent = `${done}/${total} (${pct}%)`;
    if (barFill) barFill.style.width = `${pct}%`;
  }

  updateEvidenceUI();

  // Recompute when checklist changes
  if (evList) {
    evList.addEventListener("change", () => updateEvidenceUI());
  }

  // Packet buttons
  const packetCopy = document.getElementById("packetCopy");
  const packetExport = document.getElementById("packetExport");

  if (packetCopy) {
    packetCopy.addEventListener("click", async () => {
      const st = loadEvidenceState(item.id);
      const text = buildClaimPacketText(item, st);
      await navigator.clipboard.writeText(text);
      alert("Claim packet copied!");
    });
  }

  if (packetExport) {
    packetExport.addEventListener("click", () => {
      const st = loadEvidenceState(item.id);
      const text = buildClaimPacketText(item, st);
      downloadText(`${item.id}_claim_packet.txt`, text);
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

  // Workspace buttons
  const wsExport = document.getElementById("wsExport");
  const wsClear = document.getElementById("wsClear");

  if (wsClear) {
    wsClear.addEventListener("click", () => {
      clearWorkspace();
      renderWorkspace();
    });
  }

  if (wsExport) {
    wsExport.addEventListener("click", () => {
      const st = loadWorkspaceState();
      const primary = st.primaryId ? CONDITIONS.find(c => c.id === st.primaryId) : null;
      const secondaries = st.links
        .filter(l => l.from === st.primaryId)
        .map(s => CONDITIONS.find(c => c.id === s.to))
        .filter(Boolean);
      const unassigned = st.nodes
        .filter(id => id !== st.primaryId && !st.links.some(l => l.from === st.primaryId && l.to === id))
        .map(id => CONDITIONS.find(c => c.id === id))
        .filter(Boolean);

      const ordered = [
        ...(primary ? [primary] : []),
        ...secondaries,
        ...unassigned
      ];

      const text = buildWorkspacePacketText(ordered);
      downloadText(`claim_workspace_packet.txt`, text);
    });
  }

  // First render
  renderWorkspace();
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
