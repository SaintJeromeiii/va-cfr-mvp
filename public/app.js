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

function timelineKey(id) {
  return `vaCfrTimeline:${id}`;
}

function loadTimeline(id) {
  try {
    const raw = localStorage.getItem(timelineKey(id));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveTimeline(id, entries) {
  localStorage.setItem(timelineKey(id), JSON.stringify(entries || []));
}

function addTimelineEntry(id, entry) {
  const items = loadTimeline(id);
  items.push(entry);
  saveTimeline(id, items);
  return items;
}

function removeTimelineEntry(id, entryId) {
  const items = loadTimeline(id).filter(e => e && e.id !== entryId);
  saveTimeline(id, items);
  return items;
}

function toSortableDateKey(dateStr) {
  // Accept: YYYY-MM-DD or YYYY-MM or YYYY
  const s = (dateStr || "").trim();
  if (!s) return "9999-99-99";

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  if (/^\d{4}$/.test(s)) return `${s}-01-01`;

  // fallback: put unknown formats last
  return "9999-99-99";
}

function sortTimeline(entries) {
  return (entries || [])
    .slice()
    .sort((a, b) => toSortableDateKey(a.date).localeCompare(toSortableDateKey(b.date)));
}

const TIMELINE_TYPES = [
  "Onset",
  "Diagnosis",
  "Treatment",
  "C&P Exam",
  "Flare-up",
  "ER/Urgent visit",
  "Work/Functional impact",
  "Other"
];

function evidenceLinksKey(id) {
  return `vaCfrEvidenceLinks:${id}`;
}

function loadEvidenceLinks(id) {
  try {
    const raw = localStorage.getItem(evidenceLinksKey(id));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveEvidenceLinks(id, links) {
  localStorage.setItem(evidenceLinksKey(id), JSON.stringify(links || []));
}

function addEvidenceLink(id, link) {
  const arr = loadEvidenceLinks(id);
  arr.push(link);
  saveEvidenceLinks(id, arr);
  return arr;
}

function removeEvidenceLink(id, linkId) {
  const arr = loadEvidenceLinks(id).filter(x => x && x.id !== linkId);
  saveEvidenceLinks(id, arr);
  return arr;
}

function evidenceRelStoreKey() {
  return "vaCfrEvidenceRelations:v1";
}

// Stored as: { [urlKey]: [urlKey2, urlKey3...] } (undirected)
function loadEvidenceRelations() {
  try {
    const raw = localStorage.getItem(evidenceRelStoreKey());
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

function saveEvidenceRelations(rel) {
  localStorage.setItem(evidenceRelStoreKey(), JSON.stringify(rel || {}));
}

function addEvidenceRelation(urlA, urlB) {
  const a = normalizeUrl(urlA);
  const b = normalizeUrl(urlB);
  if (!a || !b) throw new Error("Both evidence URLs are required.");
  if (a === b) throw new Error("Cannot relate an evidence item to itself.");

  const beforeState = loadEvidenceRelations();
  const rel = { ...beforeState };
  
  rel[a] = Array.isArray(rel[a]) ? [...rel[a]] : [];
  rel[b] = Array.isArray(rel[b]) ? [...rel[b]] : [];

  if (!rel[a].includes(b)) rel[a].push(b);
  if (!rel[b].includes(a)) rel[b].push(a);

  saveEvidenceRelations(rel);
  
  // Track for undo/redo
  pushGraphEdit(`Link ${a} ↔ ${b}`, beforeState, rel);
}

function removeEvidenceRelation(urlA, urlB) {
  const a = normalizeUrl(urlA);
  const b = normalizeUrl(urlB);
  
  const beforeState = loadEvidenceRelations();
  const rel = { ...beforeState };
  
  if (rel[a]) rel[a] = rel[a].filter(x => x !== b);
  if (rel[b]) rel[b] = rel[b].filter(x => x !== a);
  
  saveEvidenceRelations(rel);
  
  // Track for undo/redo
  pushGraphEdit(`Unlink ${a} ↔ ${b}`, beforeState, rel);
}

function relatedEvidenceKeys(url) {
  const key = normalizeUrl(url);
  const rel = loadEvidenceRelations();
  return Array.isArray(rel[key]) ? rel[key] : [];
}

// Auto-suggest evidence relationships based on content analysis
function generateEvidenceSuggestions(conditionName, evidenceLinks) {
  const suggestions = [];
  const condLower = normalize(conditionName);
  
  // Evidence relationship rules
  const rules = [
    // Sleep Apnea
    { condition: /sleep.*apnea|apnea/i, evidence: /cpap|bipap|sleep.*study|polysomnography/i, 
      reason: "CPAP/BiPAP devices and sleep studies typically support Sleep Apnea diagnosis" },
    
    // PTSD
    { condition: /ptsd|post.*traumatic/i, evidence: /mental.*health|psychiatric|therapy|counseling|diagnosis/i,
      reason: "Mental health records typically support PTSD diagnosis" },
    { condition: /ptsd|post.*traumatic/i, evidence: /statement|buddy.*statement|lay.*statement/i,
      reason: "Lay/buddy statements often support PTSD claims by documenting behavior changes" },
    
    // Tinnitus
    { condition: /tinnitus/i, evidence: /audiogram|hearing.*test|audiology/i,
      reason: "Audiograms typically support Tinnitus diagnosis" },
    
    // Hearing Loss
    { condition: /hearing.*loss|deafness/i, evidence: /audiogram|hearing.*test|audiology/i,
      reason: "Audiograms document hearing loss severity" },
    
    // Knee/Joint conditions
    { condition: /knee|joint|arthritis/i, evidence: /mri|x-ray|imaging|radiology/i,
      reason: "Imaging typically supports joint/knee condition diagnosis" },
    
    // Back/Spine
    { condition: /back|spine|lumbar|cervical/i, evidence: /mri|x-ray|imaging|ct.*scan/i,
      reason: "Imaging typically supports back/spine condition diagnosis" },
    
    // General: DBQs support most conditions
    { condition: /.+/, evidence: /dbq|disability.*benefits.*questionnaire/i,
      reason: "DBQs provide medical opinions supporting the condition" },
    
    // General: C&P exams support most conditions
    { condition: /.+/, evidence: /c&p|compensation.*pension.*exam/i,
      reason: "C&P exams provide official medical evaluations" },
    
    // General: Medical records support diagnosis notes
    { condition: /.+/, evidenceA: /medical.*record/i, evidenceB: /diagnosis/i,
      reason: "Medical records often corroborate diagnosis notes" }
  ];
  
  // Check each evidence item against others
  for (let i = 0; i < evidenceLinks.length; i++) {
    const itemA = evidenceLinks[i];
    const labelA = normalize(itemA.label || "");
    const typeA = normalize(itemA.type || "");
    const combinedA = `${labelA} ${typeA}`;
    
    // Skip if already has relationships
    const hasRels = relatedEvidenceKeys(itemA.url).length > 0;
    
    for (let j = i + 1; j < evidenceLinks.length; j++) {
      const itemB = evidenceLinks[j];
      const labelB = normalize(itemB.label || "");
      const typeB = normalize(itemB.type || "");
      const combinedB = `${labelB} ${typeB}`;
      
      // Check rules
      for (const rule of rules) {
        let match = false;
        let reason = rule.reason;
        
        // Two-evidence rules
        if (rule.evidenceA && rule.evidenceB) {
          if (rule.condition.test(condLower)) {
            if (rule.evidenceA.test(combinedA) && rule.evidenceB.test(combinedB)) {
              match = true;
            } else if (rule.evidenceA.test(combinedB) && rule.evidenceB.test(combinedA)) {
              match = true;
            }
          }
        }
        // Single evidence + condition rules
        else if (rule.evidence) {
          if (rule.condition.test(condLower)) {
            if (rule.evidence.test(combinedA) || rule.evidence.test(combinedB)) {
              // Only suggest if at least one is orphaned
              if (!hasRels || relatedEvidenceKeys(itemB.url).length === 0) {
                match = true;
              }
            }
          }
        }
        
        if (match) {
          // Check if this relationship already exists
          const keyA = normalizeUrl(itemA.url);
          const keyB = normalizeUrl(itemB.url);
          const relsA = relatedEvidenceKeys(itemA.url);
          
          if (!relsA.includes(keyB)) {
            suggestions.push({
              fromUrl: itemA.url,
              fromLabel: itemA.label || itemA.url,
              toUrl: itemB.url,
              toLabel: itemB.label || itemB.url,
              reason
            });
            break; // One suggestion per pair
          }
        }
      }
    }
  }
  
  return suggestions;
}

const EVIDENCE_LINK_TYPES = [
  "Medical record",
  "Diagnosis note",
  "Lab result",
  "Imaging",
  "Prescription/Medication",
  "DBQ",
  "C&P exam",
  "Lay statement / Buddy statement",
  "Service record",
  "Other"
];

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

function incomingCount(nodeId, links) {
  return (links || []).reduce((acc, l) => acc + (l.to === nodeId ? 1 : 0), 0);
}

function isOrphan(nodeId, st) {
  if (!nodeId) return false;
  if (nodeId === st.primaryId) return false;
  return incomingCount(nodeId, st.links) === 0;
}

function reachableFromPrimary(st) {
  const start = st.primaryId;
  const seen = new Set();
  if (!start) return seen;

  const adj = buildAdjacencyFromLinks(st.links);
  const stack = [start];

  while (stack.length) {
    const cur = stack.pop();
    if (seen.has(cur)) continue;
    seen.add(cur);
    const kids = adj.get(cur) || [];
    kids.forEach(k => stack.push(k));
  }

  return seen;
}

function listOrphans(st) {
  return (st.nodes || []).filter(id => isOrphan(id, st));
}

function listDisconnected(st) {
  if (!st.primaryId) return [];
  const reachable = reachableFromPrimary(st);
  return (st.nodes || []).filter(id => !reachable.has(id));
}

function countBrokenCfr(items) {
  let broken = 0;
  const examples = [];
  items.forEach(c => {
    if (!Array.isArray(c.cfr) || !c.cfr.length) {
      broken++;
      if (examples.length < 3) examples.push(`${c.name} (missing cfr[])`);
      return;
    }
    c.cfr.forEach(r => {
      if (!r.section || !r.diagnostic_code || !r.title || !r.url) {
        broken++;
        if (examples.length < 3) examples.push(`${c.name} (bad CFR ref)`);
      }
    });
  });
  return { broken, examples };
}

function missingNotes(items) {
  // notes are optional, but helpful. We'll flag linked nodes that have zero notes.
  const st = loadWorkspaceState();
  const linked = new Set((st.links || []).map(l => l.to));
  const misses = [];
  items.forEach(it => {
    if (it.id === st.primaryId) return;
    if (!linked.has(it.id)) return;
    const n = (loadNotes(it.id) || "").trim();
    if (!n) misses.push(it.id);
  });
  return misses;
}

function computeHealthSummary() {
  const st = loadWorkspaceState();
  const items = (st.nodes || []).map(id => CONDITIONS.find(c => c.id === id)).filter(Boolean);

  const orphans = listOrphans(st);
  const disconnected = listDisconnected(st);

  const { done, total, pct } = workspaceCompletion(items);
  const lowReadiness = total ? pct < 50 : false; // threshold (change if you want)

  const cfrCheck = countBrokenCfr(items);
  const notesMiss = missingNotes(items);

  return {
    st,
    items,
    evidence: { done, total, pct, lowReadiness },
    orphans,
    disconnected,
    brokenCfr: cfrCheck,
    notesMissingIds: notesMiss
  };
}

function renderHealthPanel() {
  const el = document.getElementById("wsHealth");
  if (!el) return;

  const h = computeHealthSummary();

  const row = (label, value, tag) => `
    <div class="healthRow">
      <div>${label}</div>
      <div><span class="healthTag">${tag}</span> ${value}</div>
    </div>
  `;

  const primaryName = h.st.primaryId
    ? (CONDITIONS.find(c => c.id === h.st.primaryId)?.name || h.st.primaryId)
    : "(none)";

  el.innerHTML = `
    ${row("Primary", escapeHtml(primaryName), "INFO")}
    ${row("Evidence Readiness", `${h.evidence.done}/${h.evidence.total} (${h.evidence.pct}%)`, h.evidence.lowReadiness ? "LOW" : "OK")}
    ${row("Orphans (no parents)", `${h.orphans.length}`, h.orphans.length ? "WARN" : "OK")}
    ${row("Disconnected from Primary", `${h.disconnected.length}`, h.disconnected.length ? "WARN" : "OK")}
    ${row("Broken CFR refs", `${h.brokenCfr.broken}${h.brokenCfr.examples.length ? ` (e.g., ${escapeHtml(h.brokenCfr.examples.join(", "))})` : ""}`, h.brokenCfr.broken ? "WARN" : "OK")}
    ${row("Linked items missing notes", `${h.notesMissingIds.length}`, h.notesMissingIds.length ? "HINT" : "OK")}
  `;
}

function exportHealthReport() {
  const h = computeHealthSummary();
  const lines = [];
  lines.push("VA CFR Finder — Workspace Health Report");
  lines.push(new Date().toLocaleString());
  lines.push("");

  lines.push(`Primary: ${h.st.primaryId || "(none)"}`);
  lines.push(`Evidence: ${h.evidence.done}/${h.evidence.total} (${h.evidence.pct}%)`);
  lines.push(`Orphans: ${h.orphans.length}`);
  lines.push(`Disconnected: ${h.disconnected.length}`);
  lines.push(`Broken CFR refs: ${h.brokenCfr.broken}`);
  lines.push(`Linked items missing notes: ${h.notesMissingIds.length}`);
  lines.push("");

  if (h.orphans.length) {
    lines.push("Orphans:");
    h.orphans.forEach(id => lines.push(`- ${id}`));
    lines.push("");
  }

  if (h.disconnected.length) {
    lines.push("Disconnected:");
    h.disconnected.forEach(id => lines.push(`- ${id}`));
    lines.push("");
  }

  if (h.brokenCfr.broken) {
    lines.push("Broken CFR examples:");
    h.brokenCfr.examples.forEach(x => lines.push(`- ${x}`));
    lines.push("");
  }

  if (h.notesMissingIds.length) {
    lines.push("Missing notes (linked):");
    h.notesMissingIds.forEach(id => lines.push(`- ${id}`));
    lines.push("");
  }

  downloadText("workspace_health_report.txt", lines.join("\n"));
}

function fixLinkAllOrphansToPrimary() {
  const h = computeHealthSummary();
  if (!h.st.primaryId) return alert("Set a Primary first.");
  let changed = 0;

  h.orphans.forEach(id => {
    try {
      addLink(h.st.primaryId, id, "Secondary to");
      changed++;
    } catch {}
  });

  alert(`Linked ${changed} orphan(s) to Primary.`);
}

function fixAttachDisconnectedToPrimary() {
  const h = computeHealthSummary();
  if (!h.st.primaryId) return alert("Set a Primary first.");
  let changed = 0;

  h.disconnected.forEach(id => {
    if (id === h.st.primaryId) return;
    try {
      addLink(h.st.primaryId, id, "Associated with");
      changed++;
    } catch {}
  });

  alert(`Attached ${changed} disconnected node(s) to Primary.`);
}

function base64UrlEncode(str) {
  const b64 = btoa(unescape(encodeURIComponent(str)));
  return b64.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlDecode(b64url) {
  let b64 = b64url.replaceAll("-", "+").replaceAll("_", "/");
  while (b64.length % 4) b64 += "=";
  const str = decodeURIComponent(escape(atob(b64)));
  return str;
}

function makeSharePayload() {
  const st = loadWorkspaceState();
  // Share ONLY the graph (nodes/links/primary). Notes/evidence remain local unless you want them in URL.
  return { v: 1, nodes: st.nodes || [], primaryId: st.primaryId || "", links: st.links || [] };
}

function applySharePayload(payload) {
  if (!payload || !Array.isArray(payload.nodes) || !Array.isArray(payload.links)) {
    throw new Error("Invalid workspace share payload.");
  }
  saveWorkspaceState({
    nodes: payload.nodes,
    primaryId: payload.primaryId || payload.nodes[0] || "",
    links: payload.links
  });
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

  const orphanItems = items.filter(it => isOrphan(it.id, st));
  if (wsOrphans) wsOrphans.textContent = `Orphans: ${orphanItems.length}`;

  items.forEach(item => {
    const isPrimary = item.id === st.primaryId;
    const orphan = isOrphan(item.id, st);
    const stNow = loadWorkspaceState();
    const parentLinks = parentsOf(item.id, stNow.links);
    const candidates = stNow.nodes.filter(x => x !== item.id);

    const ev = evidenceCompletion(item, loadEvidenceState(item.id));

    const card = document.createElement("div");
    card.className = `wsCard ${systemClassName(item.body_system)}${orphan ? " orphan" : ""}`;

    card.innerHTML = `
      <div class="wsRow">
        <div style="min-width:260px">
          <div>
            <strong>${escapeHtml(item.name)}</strong>
            ${orphan ? `<span class="orphanBadge">Orphan</span>` : ""}
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
          ${orphan && st.primaryId ? `<button class="miniBtn" data-link-primary="${escapeHtml(item.id)}" type="button">Link to Primary</button>` : ""}
          <button class="miniBtn danger" data-rm="${item.id}" type="button">Remove</button>
        </div>
      </div>
    `;

    wsList.appendChild(card);
  });

  // wire buttons
  wsList.querySelectorAll("button[data-open]").forEach(b => b.addEventListener("click", () => showDetail(b.dataset.open)));
  wsList.querySelectorAll("button[data-primary]").forEach(b => b.addEventListener("click", () => { setPrimary(b.dataset.primary); renderWorkspace(); renderClaimTree(); renderHealthPanel(); }));
  wsList.querySelectorAll("button[data-rm]").forEach(b => b.addEventListener("click", () => { removeNode(b.dataset.rm); renderWorkspace(); renderClaimTree(); renderHealthPanel(); }));

  // wire relationship type changes
  wsList.querySelectorAll("select.wsRelSelect").forEach(sel => {
    sel.addEventListener("change", () => {
      const fromId = sel.dataset.from;
      const toId = sel.dataset.to;
      updateLinkType(fromId, toId, sel.value);
      renderWorkspace();
      renderClaimTree();
      renderHealthPanel();
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
      renderHealthPanel();
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
        renderHealthPanel();
      } catch (err) {
        alert(err.message || "That link would create a cycle. Choose a different parent.");
      }
    });
  });

  // wire "Link to Primary" button
  wsList.querySelectorAll("button[data-link-primary]").forEach(btn => {
    btn.addEventListener("click", () => {
      const childId = btn.dataset.linkPrimary;
      const st2 = loadWorkspaceState();
      if (!st2.primaryId) return;

      try {
        addLink(st2.primaryId, childId, "Secondary to");
        renderWorkspace();
        renderClaimTree();
        renderHealthPanel();
      } catch (err) {
        alert(err.message || "Could not link to Primary.");
      }
    });
  });

  // Update tree view
  renderClaimTree();

  // Update health panel
  renderHealthPanel();
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

<hr/>

<h3>Timeline</h3>
<div class="small">Add dated events for this condition (educational). Supports YYYY-MM-DD, YYYY-MM, or YYYY.</div>

<div class="tlForm">
  <input id="tlDate" placeholder="Date (YYYY-MM-DD or YYYY-MM or YYYY)" />
  <select id="tlType">
    ${TIMELINE_TYPES.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("")}
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
    ${EVIDENCE_LINK_TYPES.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("")}
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

  // ---- Timeline wiring ----
  const tlDate = document.getElementById("tlDate");
  const tlType = document.getElementById("tlType");
  const tlNote = document.getElementById("tlNote");
  const tlAdd = document.getElementById("tlAdd");
  const tlList = document.getElementById("tlList");
  const tlExport = document.getElementById("tlExport");

  function renderTimelineList() {
    if (!tlList) return;
    const entries = sortTimeline(loadTimeline(item.id));
    if (!entries.length) {
      tlList.innerHTML = `<div class="small">(No timeline entries yet.)</div>`;
      return;
    }

    tlList.innerHTML = entries.map(e => `
      <div class="tlRow">
        <div class="tlMeta">
          <span class="badge">${escapeHtml(e.date || "Date?")}</span>
          <span class="badge">${escapeHtml(e.type || "Other")}</span>
        </div>
        <div class="small">${escapeHtml(e.note || "")}</div>
        <div style="margin-top:6px">
          <button class="miniBtn danger" data-tlrm="${escapeHtml(e.id)}" type="button">Remove</button>
        </div>
      </div>
    `).join("");

    tlList.querySelectorAll("button[data-tlrm]").forEach(b => {
      b.addEventListener("click", () => {
        removeTimelineEntry(item.id, b.dataset.tlrm);
        renderTimelineList();
      });
    });
  }

  function exportTimelineTxt() {
    const entries = sortTimeline(loadTimeline(item.id));
    const lines = [];
    lines.push(`${item.name} — Timeline (Educational)`);
    lines.push(new Date().toLocaleString());
    lines.push("");

    entries.forEach(e => {
      lines.push(`${e.date || ""} • ${e.type || "Other"}`);
      lines.push(`${e.note || ""}`);
      lines.push("");
    });

    downloadText(`${item.id}_timeline.txt`, lines.join("\\n"));
  }

  if (tlAdd) {
    tlAdd.addEventListener("click", () => {
      const date = (tlDate?.value || "").trim();
      const type = (tlType?.value || "Other").trim();
      const note = (tlNote?.value || "").trim();

      if (!date || !note) {
        alert("Please enter a date and a note.");
        return;
      }

      addTimelineEntry(item.id, {
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        date,
        type,
        note,
        created_at: Date.now()
      });

      if (tlDate) tlDate.value = "";
      if (tlNote) tlNote.value = "";
      renderTimelineList();
    });
  }

  if (tlExport) {
    tlExport.addEventListener("click", exportTimelineTxt);
  }

  renderTimelineList();

  // ---- Evidence Links wiring ----
  const evLinksLabel = document.getElementById("evLinksLabel");
  const evLinksUrl = document.getElementById("evLinksUrl");
  const evLinksType = document.getElementById("evLinksType");
  const evLinksDate = document.getElementById("evLinksDate");
  const evLinksNote = document.getElementById("evLinksNote");
  const evLinksAdd = document.getElementById("evLinksAdd");
  const evLinksList = document.getElementById("evLinksList");
  const evLinksExport = document.getElementById("evLinksExport");

  function renderEvidenceLinks() {
    if (!evLinksList) return;

    // Build index from workspace evidence
    const idx = buildWorkspaceEvidenceIndex("all");
    
    // ALSO include evidence from the current condition
    const currentLinks = loadEvidenceLinks(item.id);
    currentLinks.forEach(l => {
      const key = normalizeUrl(l.url);
      if (!key) return;
      if (!idx.has(key)) {
        idx.set(key, {
          url: l.url,
          label: l.label || "",
          type: l.type || "Other",
          date: l.date || "",
          note: l.note || "",
          conditions: [item.name]
        });
      }
    });

    const links = loadEvidenceLinks(item.id);

    if (!links.length) {
      evLinksList.innerHTML = `<div class="small">(No evidence links yet.)</div>`;
      return;
    }

    // Sort by date-ish then label
    const sorted = links.slice().sort((a, b) => {
      const da = toSortableDateKey(a.date);
      const db = toSortableDateKey(b.date);
      if (da !== db) return da.localeCompare(db);
      return (a.label || "").localeCompare(b.label || "");
    });

    evLinksList.innerHTML = sorted.map(l => {
      const key = normalizeUrl(l.url);
      const relKeys = relatedEvidenceKeys(l.url);
      const relList = relKeys
        .map(k => idx.get(k))
        .filter(Boolean)
        .slice(0, 4); // cap display

      return `
        <div class="evLinksRow">
          <div class="evLinksMeta">
            ${l.date ? `<span class="badge">${escapeHtml(l.date)}</span>` : ""}
            <span class="badge">${escapeHtml(l.type || "Other")}</span>
            ${relKeys.length ? `<span class="relBadge">Related: ${relKeys.length}</span>` : ""}
          </div>

          <div><strong>${escapeHtml(l.label || "Evidence")}</strong></div>

          ${l.url ? `<div class="small"><a href="${escapeHtml(l.url)}" target="_blank" rel="noreferrer">Open link</a></div>` : ""}

          ${l.note ? `<div class="small">${escapeHtml(l.note)}</div>` : ""}

          ${relList.length ? `
            <div class="small" style="margin-top:6px">
              <strong>Related:</strong>
              <ul style="margin:6px 0 0 18px">
                ${relList.map(r => `<li><a href="${escapeHtml(r.url)}" target="_blank" rel="noreferrer">${escapeHtml(evidenceDisplayName(r))}</a></li>`).join("")}
              </ul>
            </div>
          ` : ""}

          <div style="margin-top:6px">
            <button class="miniBtn danger" data-evlinksrm="${escapeHtml(l.id)}" type="button">Remove</button>
          </div>
        </div>
      `;
    }).join("");

    evLinksList.querySelectorAll("button[data-evlinksrm]").forEach(b => {
      b.addEventListener("click", () => {
        removeEvidenceLink(item.id, b.dataset.evlinksrm);
        renderEvidenceLinksWithRelated();
        populateRelateDropdown();
      });
    });
  }

  function exportEvidenceLinksTxt() {
    const links = loadEvidenceLinks(item.id);
    const sorted = links.slice().sort((a, b) => {
      const da = toSortableDateKey(a.date);
      const db = toSortableDateKey(b.date);
      if (da !== db) return da.localeCompare(db);
      return (a.label || "").localeCompare(b.label || "");
    });

    const lines = [];
    lines.push(`${item.name} — Evidence Links (Local list / Educational)`);
    lines.push(new Date().toLocaleString());
    lines.push("");

    if (!sorted.length) {
      lines.push("(No evidence links.)");
    } else {
      sorted.forEach(l => {
        lines.push(`${l.date || ""} • ${l.type || "Other"} • ${l.label || ""}`.trim());
        if (l.url) lines.push(`URL: ${l.url}`);
        if (l.note) lines.push(`Notes: ${l.note}`);
        lines.push("");
      });
    }

    downloadText(`${item.id}_evidence_links.txt`, lines.join("\n"));
  }

  if (evLinksAdd) {
    evLinksAdd.addEventListener("click", () => {
      const label = (evLinksLabel?.value || "").trim();
      const url = (evLinksUrl?.value || "").trim();
      const type = (evLinksType?.value || "Other").trim();
      const date = (evLinksDate?.value || "").trim();
      const note = (evLinksNote?.value || "").trim();

      if (!label || !url) {
        alert("Please enter at least a Label and a URL.");
        return;
      }

      addEvidenceLink(item.id, {
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        label,
        url,
        type,
        date,
        note,
        created_at: Date.now()
      });

      if (evLinksLabel) evLinksLabel.value = "";
      if (evLinksUrl) evLinksUrl.value = "";
      if (evLinksDate) evLinksDate.value = "";
      if (evLinksNote) evLinksNote.value = "";

      renderEvidenceLinksWithRelated();
      populateRelateDropdown();
    });
  }

  if (evLinksExport) {
    evLinksExport.addEventListener("click", exportEvidenceLinksTxt);
  }

  // Use the new renderEvidenceLinksWithRelated instead of the old renderEvidenceLinks
  // renderEvidenceLinks();

  // ---- Evidence ↔ Evidence linking (PER-ROW) ----
  const evRelPanel = document.getElementById("evRelPanel");
  const evRelFromLabel = document.getElementById("evRelFromLabel");
  const evRelPick = document.getElementById("evRelPick");
  const evRelAdd = document.getElementById("evRelAdd");
  const evRelCancel = document.getElementById("evRelCancel");

  let currentRelFromUrl = "";   // the "FROM" evidence URL
  let currentRelFromKey = "";   // normalized key used for filtering
  let currentRelFromRowId = ""; // evidence row id for highlighting

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

  function highlightActiveRelRow() {
    const evLinksList = document.getElementById("evLinksList");
    if (!evLinksList) return;
    evLinksList.querySelectorAll(".evRow").forEach(row => row.classList.remove("activeRel"));
    if (!currentRelFromRowId) return;
    const r = evLinksList.querySelector(`[data-evid="${CSS.escape(currentRelFromRowId)}"]`);
    if (r) r.classList.add("activeRel");
  }

  function populateRelateDropdown() {
    if (!evRelPick) return;

    // Build index from workspace evidence
    const idx = buildWorkspaceEvidenceIndex("all");
    
    // ALSO include evidence from the current condition (even if not in workspace)
    const currentLinks = loadEvidenceLinks(item.id);
    let addedCount = 0;
    let skippedNoUrl = 0;
    currentLinks.forEach(l => {
      const key = normalizeUrl(l.url);
      if (!key) {
        skippedNoUrl++;
        return;
      }
      if (!idx.has(key)) {
        idx.set(key, {
          url: l.url,
          label: l.label || "",
          type: l.type || "Other",
          date: l.date || "",
          note: l.note || "",
          conditions: [item.name]
        });
        addedCount++;
      }
    });

    const opts = [];
    for (const [urlKey, meta] of idx.entries()) {
      // exclude "from" evidence item itself
      if (urlKey === currentRelFromKey) continue;
      opts.push(meta);
    }

    if (!currentRelFromUrl) {
      evRelPick.innerHTML = `<option value="">(Click "Relate…" on an evidence item below)</option>`;
      return;
    }

    if (opts.length === 0) {
      const totalEvidence = currentLinks.length;
      const uniqueUrls = idx.size;
      let msg = "(No other evidence items available";
      if (totalEvidence === 1) {
        msg += " - you only have 1 evidence item. Add more evidence first.)";
      } else if (uniqueUrls === 1) {
        msg += " - your evidence items have duplicate URLs. Each evidence item needs a unique URL.)";
      } else {
        msg += ". Add more evidence first.)";
      }
      evRelPick.innerHTML = `<option value="">${msg}</option>`;
      return;
    }

    evRelPick.innerHTML =
      `<option value="">Select another evidence item… (${opts.length} available)</option>` +
      opts
        .sort((a, b) => evidenceDisplayName(a).localeCompare(evidenceDisplayName(b)))
        .map(m => `<option value="${escapeHtml(m.url)}">${escapeHtml(evidenceDisplayName(m))}</option>`)
        .join("");
  }

  function renderEvidenceLinksWithRelated() {
    const evLinksList = document.getElementById("evLinksList");
    if (!evLinksList) return;

    // Build index from workspace evidence
    const idx = buildWorkspaceEvidenceIndex("all");
    
    // ALSO include evidence from the current condition
    const currentLinks = loadEvidenceLinks(item.id);
    currentLinks.forEach(l => {
      const key = normalizeUrl(l.url);
      if (!key) return;
      if (!idx.has(key)) {
        idx.set(key, {
          url: l.url,
          label: l.label || "",
          type: l.type || "Other",
          date: l.date || "",
          note: l.note || "",
          conditions: [item.name]
        });
      }
    });

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

    evLinksList.innerHTML = sorted.map(l => {
      const relKeys = relatedEvidenceKeys(l.url);
      const relList = relKeys.map(k => idx.get(k)).filter(Boolean).slice(0, 4);
      const isOrphan = relKeys.length === 0;

      return `
        <div class="evRow ${isOrphan ? 'orphan' : ''}" data-evid="${escapeHtml(l.id)}">
          <div class="evMeta">
            ${l.date ? `<span class="badge">${escapeHtml(l.date)}</span>` : ""}
            <span class="badge">${escapeHtml(l.type || "Other")}</span>
            ${relKeys.length ? `<span class="relBadge">Related: ${relKeys.length}</span>` : `<span class="orphanBadge">⚠ No links</span>`}
          </div>

          <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start">
            <div style="flex:1">
              <div><strong>${escapeHtml(l.label || "Evidence")}</strong></div>
              ${l.url ? `<div class="small"><a href="${escapeHtml(l.url)}" target="_blank" rel="noreferrer">Open link</a></div>` : ""}
              ${l.note ? `<div class="small">${escapeHtml(l.note)}</div>` : ""}
            </div>

            <div style="display:flex; flex-direction:column; gap:6px; min-width:120px">
              <button class="miniBtn" data-relfrom="${escapeHtml(l.id)}" type="button">Relate…</button>
              <button class="miniBtn danger" data-evrm="${escapeHtml(l.id)}" type="button">Remove</button>
            </div>
          </div>

          ${relList.length ? `
            <div class="small" style="margin-top:8px">
              <strong>Related:</strong>
              <ul style="margin:6px 0 0 18px">
                ${relList.map(r => `
  <li style="display:flex; gap:8px; align-items:center">
    <a href="${escapeHtml(r.url)}" target="_blank" rel="noreferrer">${escapeHtml(evidenceDisplayName(r))}</a>
    <button class="miniBtn danger" data-unrel-from="${escapeHtml(l.url)}" data-unrel-to="${escapeHtml(r.url)}" type="button">Unlink</button>
  </li>
`).join("")}
              </ul>
            </div>
          ` : ""}
        </div>
      `;
    }).join("");

    // Remove
    evLinksList.querySelectorAll("button[data-evrm]").forEach(b => {
      b.addEventListener("click", () => {
        removeEvidenceLink(item.id, b.dataset.evrm);
        renderEvidenceLinksWithRelated();
        populateRelateDropdown();
      });
    });

    // Relate… (per-row)
    evLinksList.querySelectorAll("button[data-relfrom]").forEach(b => {
      b.addEventListener("click", () => {
        const rowId = b.dataset.relfrom;
        const myLinks = loadEvidenceLinks(item.id);
        const found = myLinks.find(x => x.id === rowId);
        if (!found || !found.url) return alert("This evidence item is missing a URL.");

        const fromLabel = found.label || found.url;
        showRelPanel(found.url, fromLabel, rowId);
      });
    });

    // Unlink related evidence
    evLinksList.querySelectorAll("button[data-unrel-from][data-unrel-to]").forEach(b => {
      b.addEventListener("click", () => {
        const fromUrl = b.dataset.unrelFrom || "";
        const toUrl = b.dataset.unrelTo || "";
        try {
          removeEvidenceRelation(fromUrl, toUrl);
          renderEvidenceLinksWithRelated();
          populateRelateDropdown();
        } catch (e) {
          alert(e.message || "Could not unlink evidence.");
        }
      });
    });

    highlightActiveRelRow();
    renderAutoSuggestions();
  }

  function renderAutoSuggestions() {
    const evLinksList = document.getElementById("evLinksList");
    if (!evLinksList) return;

    const links = loadEvidenceLinks(item.id);
    if (links.length < 2) return; // Need at least 2 items to relate

    const suggestions = generateEvidenceSuggestions(item.name, links);
    
    // Remove old suggestions panel if it exists
    const oldPanel = evLinksList.parentElement?.querySelector(".autoSuggestPanel");
    if (oldPanel) oldPanel.remove();

    // Count orphans
    const orphanCount = links.filter(l => relatedEvidenceKeys(l.url).length === 0).length;

    if (suggestions.length === 0 && orphanCount === 0) return;

    // Create suggestions panel
    const panel = document.createElement("div");
    panel.className = "autoSuggestPanel";
    
    if (suggestions.length > 0) {
      panel.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px">
          <strong>💡 Suggested Relationships</strong>
          <span class="small">(${suggestions.length})</span>
        </div>
        <div class="small" style="margin-bottom:10px">
          Based on your evidence and condition, these relationships might help strengthen your claim:
        </div>
        ${suggestions.map((sug, idx) => `
          <div class="autoSuggestItem" data-suggest-idx="${idx}">
            <div class="suggestion">
              <div><strong>${escapeHtml(sug.fromLabel)}</strong> ↔ <strong>${escapeHtml(sug.toLabel)}</strong></div>
              <div class="small" style="margin-top:4px">${escapeHtml(sug.reason)}</div>
            </div>
            <div style="display:flex; gap:6px">
              <button class="miniBtn" data-accept="${idx}" type="button">✓ Accept</button>
              <button class="miniBtn" data-dismiss="${idx}" type="button">✕ Dismiss</button>
            </div>
          </div>
        `).join("")}
      `;
    } else if (orphanCount > 0) {
      panel.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px">
          <strong>⚠ ${orphanCount} Unlinked Evidence ${orphanCount === 1 ? 'Item' : 'Items'}</strong>
        </div>
        <div class="small">
          You have ${orphanCount} evidence ${orphanCount === 1 ? 'item' : 'items'} with no relationships (marked with red outline above). 
          Consider relating them to other evidence to build a stronger evidence chain. 
          Click "Relate…" on any item to create connections.
        </div>
      `;
    }

    // Insert after evLinksList
    evLinksList.parentElement?.insertBefore(panel, evLinksList.nextSibling);

    // Add event handlers for suggestions
    if (suggestions.length > 0) {
      panel.querySelectorAll("button[data-accept]").forEach(btn => {
        btn.addEventListener("click", () => {
          const idx = parseInt(btn.dataset.accept || "0");
          const sug = suggestions[idx];
          if (sug) {
            try {
              addEvidenceRelation(sug.fromUrl, sug.toUrl);
              renderEvidenceLinksWithRelated();
              populateRelateDropdown();
            } catch (e) {
              alert(e.message || "Could not create relationship");
            }
          }
        });
      });

      panel.querySelectorAll("button[data-dismiss]").forEach(btn => {
        btn.addEventListener("click", () => {
          const idx = parseInt(btn.dataset.dismiss || "0");
          const suggestionItem = panel.querySelector(`[data-suggest-idx="${idx}"]`);
          if (suggestionItem) {
            suggestionItem.style.opacity = "0.3";
            suggestionItem.style.pointerEvents = "none";
            setTimeout(() => {
              suggestionItem.remove();
              // If no more suggestions, remove panel or show orphan warning
              if (panel.querySelectorAll(".autoSuggestItem").length === 0) {
                if (orphanCount > 0) {
                  panel.innerHTML = `
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px">
                      <strong>⚠ ${orphanCount} Unlinked Evidence ${orphanCount === 1 ? 'Item' : 'Items'}</strong>
                    </div>
                    <div class="small">
                      You have ${orphanCount} evidence ${orphanCount === 1 ? 'item' : 'items'} with no relationships (marked with red outline above). 
                      Consider relating them to other evidence to build a stronger evidence chain. 
                      Click "Relate…" on any item to create connections.
                    </div>
                  `;
                } else {
                  panel.remove();
                }
              }
            }, 200);
          }
        });
      });
    }
  }

  if (evRelAdd) {
    evRelAdd.addEventListener("click", () => {
      if (!currentRelFromUrl) return alert("Click \"Relate…\" on an evidence item first.");
      const toUrl = evRelPick?.value || "";
      if (!toUrl) return alert("Pick another evidence item to relate.");

      try {
        addEvidenceRelation(currentRelFromUrl, toUrl);
        alert("Related evidence link created!");
        renderEvidenceLinksWithRelated();
      } catch (e) {
        alert(e.message || "Could not relate evidence.");
      }
    });
  }

  if (evRelCancel) {
    evRelCancel.addEventListener("click", hideRelPanel);
  }

  // Call these instead of your old renderEvidenceLinks()
  renderEvidenceLinksWithRelated();
  populateRelateDropdown();

  
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
      if (!cb || cb.tagName !== "INPUT" || cb.type !== "checkbox") return;
      if (!cb.classList.contains("evCheck")) return;

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



function getConditionById(id) {
  return CONDITIONS.find(c => c.id === id) || null;
}

function parentsOfChild(childId, links) {
  return (links || []).filter(l => l.to === childId);
}

function shortCfrRefs(cond) {
  const refs = (cond?.cfr || []).slice(0, 2);
  if (!refs.length) return "";
  return refs.map(r => {
    const secShort = (r.section || "").replace(/38\s*cfr\s*§/i, "").trim();
    const dc = (r.diagnostic_code || "").toString().trim();
    const title = (r.title || "").trim();
    const parts = [];
    if (secShort) parts.push(`§${secShort}`);
    else if (r.section) parts.push(r.section);
    if (dc) parts.push(`DC ${dc}`);
    if (title) parts.push(title);
    return parts.join(" — ");
  }).join(" | ");
}

function firstLine(s, fallback = "") {
  const t = (s || "").trim();
  if (!t) return fallback;
  const lines = t.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  return lines[0] || fallback;
}

function roleLineForNode(nodeId, st) {
  if (nodeId === st.primaryId) return "Role: Primary";
  const linksToMe = (st.links || []).filter(l => l.to === nodeId);
  if (!linksToMe.length) return "Role: Unlinked (in workspace)";
  return "Role: Linked";
}

function linkedToLines(nodeId, st) {
  if (nodeId === st.primaryId) return [];
  const linksToMe = (st.links || []).filter(l => l.to === nodeId);
  if (!linksToMe.length) return [];

  return linksToMe.map(l => {
    const p = getConditionById(l.from);
    const pName = p ? p.name : l.from;
    const type = l.type || "Secondary to";
    return `- Linked to: ${pName} (${type})`;
  });
}

function isLinkedNode(nodeId, st) {
  if (!nodeId) return false;
  if (nodeId === st.primaryId) return true;
  return (st.links || []).some(l => l.to === nodeId || l.from === nodeId);
}

function relationshipSentence(childId, st) {
  const linksToMe = (st.links || []).filter(l => l.to === childId);
  if (!linksToMe.length) return "";

  // If multiple parents, mention the first two for readability
  const parts = linksToMe.slice(0, 2).map(l => {
    const parent = getConditionById(l.from);
    const pName = parent ? parent.name : l.from;
    const type = l.type || "Secondary to";
    return `${type} ${pName}`;
  });

  if (parts.length === 1) return `This condition is modeled as ${parts[0]}.`;
  return `This condition is modeled as ${parts.join(" and ")}.`;
}

function autoDraftParagraph(cond, st, style = "concise") {
  // Use first line of notes if present
  const notes = (loadNotes(cond.id) || "").trim();
  const opening = firstLine(notes, "");
  if (opening) {
    // style controls whether we add extra context
    if (style === "detailed") {
      const rel = relationshipSentence(cond.id, st);
      return `${opening} ${rel ? rel + " " : ""}Functional impact, frequency/severity, and treatment history can be expanded in Notes.`;
    }
    return opening;
  }

  // If no notes: generate a safe educational template
  const rel = relationshipSentence(cond.id, st);
  const body = cond.body_system ? `within the ${cond.body_system} system` : "within the VA rating system";
  const cfr = shortCfrRefs(cond);
  const cfrPart = cfr ? `Relevant rating reference(s) include ${cfr}.` : "";

  if (cond.id === st.primaryId) {
    if (style === "detailed") {
      return `The Veteran seeks consideration for ${cond.name} ${body}. ${cfrPart} Add Notes describing symptom timeline, frequency/severity, and occupational/social impact, then regenerate this draft.`;
    }
    return `The Veteran seeks consideration for ${cond.name}. Add Notes describing symptoms and functional impact, then regenerate.`;
  }

  if (style === "detailed") {
    return `The Veteran reports ${cond.name} ${body}. ${rel ? rel + " " : ""}${cfrPart}Add Notes describing onset/timeline, current severity, functional impact, and treatment history, then regenerate this draft.`;
  }

  return `The Veteran reports ${cond.name}. ${rel ? rel : ""} Add Notes for timeline, severity, and impact, then regenerate.`;
}

function workspaceTimelineDraft(scope = "all") {
  const st = loadWorkspaceState();
  const primaryId = st.primaryId || "";

  let ids = (st.nodes || []).slice();

  if (scope === "primary") {
    ids = primaryId ? [primaryId] : [];
  } else if (scope === "linked") {
    ids = ids.filter(id => isLinkedNode(id, st));
    if (primaryId && !ids.includes(primaryId)) ids.unshift(primaryId);
  }

  const merged = [];

  ids.forEach(id => {
    const cond = getConditionById(id);
    if (!cond) return;

    const entries = loadTimeline(id);
    entries.forEach(e => {
      merged.push({
        conditionId: id,
        conditionName: cond.name,
        date: e.date,
        type: e.type,
        note: e.note
      });
    });
  });

  merged.sort((a, b) => toSortableDateKey(a.date).localeCompare(toSortableDateKey(b.date)));

  const lines = [];
  lines.push("VA CFR Finder — Workspace Timeline (Educational)");
  lines.push(new Date().toLocaleString());
  lines.push("");

  if (!merged.length) {
    lines.push("(No timeline entries found in this scope.)");
    return lines.join("\\n");
  }

  merged.forEach(e => {
    lines.push(`${e.date || ""} • ${e.type || "Other"} • ${e.conditionName}`);
    lines.push(`${e.note || ""}`);
    lines.push("");
  });

  return lines.join("\\n");
}

function generateNarrativeDraft(options = {}) {
  const linkedOnly = !!options.linkedOnly;
  const style = options.style === "detailed" ? "detailed" : "concise";
  const st = loadWorkspaceState();
  const nodes = (st.nodes || []).slice();

  // Option: only include nodes that are part of the link graph (plus primary)
  let chosenNodes = nodes;
  if (linkedOnly) {
    chosenNodes = nodes.filter(id => isLinkedNode(id, st));
    // Always keep primary
    if (st.primaryId && !chosenNodes.includes(st.primaryId)) chosenNodes.unshift(st.primaryId);
  }

  const primary = st.primaryId ? getConditionById(st.primaryId) : null;
  if (!primary) {
    return "No Primary is set. Set a Primary in the Workspace first, then generate the narrative.";
  }

  // Build items list in a stable order: Primary first, then others alphabetically
  const items = chosenNodes
    .map(id => getConditionById(id))
    .filter(Boolean)
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  const primaryFirst = [
    primary,
    ...items.filter(x => x.id !== primary.id)
  ];

  const lines = [];
  lines.push("VA CFR Finder — Claim Narrative Draft (Educational)");
  lines.push(new Date().toLocaleString());
  lines.push("");
  lines.push("DISCLAIMER: This is an educational draft only. It is not legal advice and not representation. Always verify current CFR language and consult an accredited representative if needed.");
  lines.push("");

  // Primary section
  lines.push(`PRIMARY CONDITION: ${primary.name}`);
  lines.push(`CFR refs (high-level): ${shortCfrRefs(primary) || "(none listed)"}`);
  const pNotes = (loadNotes(primary.id) || "").trim();
  if (pNotes) {
    lines.push("");
    lines.push("Primary notes (user-entered):");
    lines.push(pNotes);
  } else {
    lines.push("");
    lines.push("Primary notes (user-entered): (none)");
  }

  // Relationship summary
  lines.push("");
  lines.push("RELATIONSHIP SUMMARY (from workspace links):");
  if (!(st.links || []).length) {
    lines.push("- (no links yet)");
  } else {
    (st.links || []).forEach(l => {
      const from = getConditionById(l.from);
      const to = getConditionById(l.to);
      const fromName = from ? from.name : l.from;
      const toName = to ? to.name : l.to;
      lines.push(`- ${toName} — ${l.type || "Secondary to"} — ${fromName}`);
    });
  }

  // Workspace timeline (if any exists)
  const mergedTimeline = workspaceTimelineDraft(options.linkedOnly ? "linked" : "all");
  const hasAnyTimeline = !mergedTimeline.includes("(No timeline entries");

  lines.push("");
  lines.push("TIMELINE (if provided):");
  if (hasAnyTimeline) {
    // Include only the body lines (skip header for narrative)
    const tlLines = mergedTimeline.split("\\n").slice(3); // drops title/date/blank
    lines.push(...tlLines);
  } else {
    lines.push("(No timeline entries yet — add timelines in each condition detail view.)");
  }

  // Condition blocks
  lines.push("");
  lines.push("CONDITION-BY-CONDITION DRAFT:");
  lines.push("");

  primaryFirst.forEach(cond => {
    const ev = evidenceCompletion(cond, loadEvidenceState(cond.id));
    const notes = (loadNotes(cond.id) || "").trim();

    lines.push("------------------------------------------------------------");
    lines.push(`${cond.name}`);
    lines.push(roleLineForNode(cond.id, st));
    linkedToLines(cond.id, st).forEach(x => lines.push(x));
    lines.push(`Body system: ${cond.body_system || "(not set)"}`);
    lines.push(`CFR refs (high-level): ${shortCfrRefs(cond) || "(none listed)"}`);
    lines.push(`Evidence readiness: ${ev.done}/${ev.total} (${ev.pct}%)`);
    const evLinksCount = loadEvidenceLinks(cond.id).length;
    lines.push(`Evidence links saved: ${evLinksCount}`);

    // Short "narrative" paragraph using notes if available
    lines.push("");
    lines.push(`Draft paragraph: ${autoDraftParagraph(cond, st, style)}`);

    // Evidence checklist bullets
    if (Array.isArray(cond.evidence_checklist) && cond.evidence_checklist.length) {
      lines.push("");
      lines.push("Evidence categories (educational):");
      cond.evidence_checklist.forEach((e, i) => lines.push(`- ${e}`));
    }

    // Full notes (verbatim)
    lines.push("");
    lines.push("Notes (verbatim):");
    lines.push(notes ? notes : "(none)");
    lines.push("");
  });

  // Closing suggestions
  lines.push("------------------------------------------------------------");
  lines.push("NEXT STEPS (Educational):");
  lines.push("- Fill in missing Notes for each linked condition (timeline, severity, functional impact, treatment).");
  lines.push("- Ensure evidence checklist items are supported by your records or statements.");
  lines.push("- If filing secondary relationships, consider adding clear medical nexus language in notes (from your provider if applicable).");
  lines.push("- Consult an accredited representative for claim-specific guidance.");
  lines.push("");

  return lines.join("\n");
}

function normalizeUrl(u) {
  let normalized = (u || "").trim().toLowerCase();
  // Remove trailing slashes for better matching
  while (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

function buildEvidenceGraphNodes(urlKeys) {
  // urlKeys: array of normalized url keys present in binder scope
  const rel = loadEvidenceRelations();

  // adjacency for only nodes in scope
  const inScope = new Set(urlKeys);
  const adj = new Map();

  urlKeys.forEach(k => adj.set(k, []));

  urlKeys.forEach(k => {
    const nbrs = Array.isArray(rel[k]) ? rel[k] : [];
    nbrs.forEach(n => {
      if (inScope.has(n)) adj.get(k).push(n);
    });
  });

  return adj;
}

function findEvidenceClusters(urlKeys) {
  const adj = buildEvidenceGraphNodes(urlKeys);
  const visited = new Set();
  const clusters = [];

  for (const k of urlKeys) {
    if (visited.has(k)) continue;

    // BFS/DFS
    const stack = [k];
    visited.add(k);
    const comp = [];

    while (stack.length) {
      const cur = stack.pop();
      comp.push(cur);
      const nbrs = adj.get(cur) || [];
      nbrs.forEach(n => {
        if (!visited.has(n)) {
          visited.add(n);
          stack.push(n);
        }
      });
    }

    clusters.push(comp);
  }

  // Sort clusters by size desc
  clusters.sort((a, b) => b.length - a.length);
  return clusters;
}

function freqMap(arr) {
  const m = new Map();
  (arr || []).forEach(x => {
    const k = (x ?? "").toString().trim();
    if (!k) return;
    m.set(k, (m.get(k) || 0) + 1);
  });
  return m;
}

function topKFromFreq(map, k = 2) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, k)
    .map(([name]) => name);
}

const STOP_WORDS = new Set([
  "the","a","an","and","or","of","for","to","in","on","with","without","by",
  "from","at","as","is","are","was","were","be","been","being",
  "note","notes","report","records","record","medical","doc","document",
  "exam","c&p","cp","va","veteran","statement","letter","form","dbq",
  "results","test","tests","visit","clinic","hospital"
]);

function tokenizeLabel(text) {
  const s = (text || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!s) return [];
  return s
    .split(" ")
    .map(t => t.trim())
    .filter(t => t.length >= 3)
    .filter(t => !STOP_WORDS.has(t))
    .filter(t => !/^\d+$/.test(t)); // drop pure numbers
}

function keywordSummaryFromEntries(entries, maxWords = 3) {
  const tokens = [];

  entries.forEach(e => {
    // use label + note for keyword extraction (optional)
    tokenizeLabel(e.label).forEach(t => tokens.push(t));
    tokenizeLabel(e.note).forEach(t => tokens.push(t));
  });

  if (!tokens.length) return "";

  const freq = freqMap(tokens);
  const top = topKFromFreq(freq, maxWords);
  return top.join(" / ");
}

function labelCluster(entries) {
  // entries: {label,type,date,conditions:[...], url, note}
  const allConditions = [];
  const allTypes = [];

  entries.forEach(e => {
    (e.conditions || []).forEach(c => allConditions.push(c));
    if (e.type) allTypes.push(e.type);
  });

  const condTop = topKFromFreq(freqMap(allConditions), 2);
  const typeTop = topKFromFreq(freqMap(allTypes), 1);

  const condLabel = condTop.length ? condTop.join(" + ") : "Mixed conditions";
  const typeLabel = typeTop.length ? typeTop[0] : "Mixed evidence";

  // NEW: keyword label from evidence labels/notes
  const kw = keywordSummaryFromEntries(entries, 3); // e.g., "sleep / study / cpap"
  const kwLabel = kw ? `${kw}` : "";

  // Prefer keywords when available, but keep conditions as backup context
  // Example: "sleep / cpap (Medical record) — PTSD + Sleep Apnea"
  if (kwLabel) {
    return `${kwLabel} (${typeLabel}) — ${condLabel}`;
  }

  return `${condLabel} (${typeLabel})`;
}

function clusterLabelConfidence(entries) {
  const allConditions = [];
  const allTypes = [];

  entries.forEach(e => {
    (e.conditions || []).forEach(c => allConditions.push(c));
    if (e.type) allTypes.push(e.type);
  });

  const condFreq = freqMap(allConditions);
  const typeFreq = freqMap(allTypes);

  const totalCond = allConditions.length || 1;
  const totalType = allTypes.length || 1;

  const topCondCount = [...condFreq.values()].sort((a,b)=>b-a)[0] || 0;
  const topTypeCount = [...typeFreq.values()].sort((a,b)=>b-a)[0] || 0;

  const condPct = Math.round((topCondCount / totalCond) * 100);
  const typePct = Math.round((topTypeCount / totalType) * 100);

  return { condPct, typePct };
}

function buildBinderEntries(scope = "all") {
  const st = loadWorkspaceState();
  const primaryId = st.primaryId || "";

  let ids = (st.nodes || []).slice();
  if (scope === "primary") ids = primaryId ? [primaryId] : [];
  else if (scope === "linked") {
    ids = ids.filter(id => isLinkedNode(id, st));
    if (primaryId && !ids.includes(primaryId)) ids.unshift(primaryId);
  }

  // urlKey -> entry
  const byUrl = new Map();

  ids.forEach(id => {
    const cond = getConditionById(id);
    if (!cond) return;

    const links = loadEvidenceLinks(id);
    links.forEach(l => {
      const key = normalizeUrl(l.url);
      if (!key) return;

      if (!byUrl.has(key)) {
        byUrl.set(key, {
          url: l.url,
          urlKey: key,
          label: l.label || "",
          type: l.type || "Other",
          date: l.date || "",
          note: l.note || "",
          conditions: new Set([cond.name])
        });
      } else {
        const e = byUrl.get(key);
        e.conditions.add(cond.name);
        if (!e.label && l.label) e.label = l.label;
        if ((!e.type || e.type === "Other") && l.type) e.type = l.type;
        if (!e.date && l.date) e.date = l.date;
        if (!e.note && l.note) e.note = l.note;
      }
    });
  });

  const merged = [...byUrl.values()].map(e => ({
    ...e,
    conditions: [...e.conditions].sort()
  }));

  return merged;
}

function sortBinderEntries(merged, sortMode = "date") {
  const out = (merged || []).slice();

  if (sortMode === "type") {
    out.sort((a, b) =>
      (a.type || "").localeCompare(b.type || "") ||
      toSortableDateKey(a.date).localeCompare(toSortableDateKey(b.date)) ||
      (a.label || "").localeCompare(b.label || "")
    );
  } else if (sortMode === "condition") {
    out.sort((a, b) =>
      (a.conditions?.[0] || "").localeCompare(b.conditions?.[0] || "") ||
      toSortableDateKey(a.date).localeCompare(toSortableDateKey(b.date)) ||
      (a.label || "").localeCompare(b.label || "")
    );
  } else {
    out.sort((a, b) =>
      toSortableDateKey(a.date).localeCompare(toSortableDateKey(b.date)) ||
      (a.type || "").localeCompare(b.type || "") ||
      (a.label || "").localeCompare(b.label || "")
    );
  }

  return out;
}

function renderBinderViewer({ scope, sortMode, viewMode }) {
  const host = document.getElementById("wsBinderViewer");
  if (!host) return;

  const show = document.getElementById("wsBinderShowViewer");
  if (show && !show.checked) {
    host.innerHTML = "";
    return;
  }

  const entriesRaw = buildBinderEntries(scope);
  const entries = sortBinderEntries(entriesRaw, sortMode);

  if (!entries.length) {
    host.innerHTML = `<div class="small">(No evidence links found in this scope.)</div>`;
    return;
  }

  // Flat view (clickable list)
  if (viewMode !== "cluster") {
    host.innerHTML = entries.map(e => binderItemHTML(e)).join("");
    return;
  }

  // Cluster view
  const keys = entries.map(e => e.urlKey);
  const clusters = findEvidenceClusters(keys);

  const entryByKey = new Map();
  entries.forEach(e => entryByKey.set(e.urlKey, e));

  host.innerHTML = clusters.map((clusterKeys, idx) => {
    const clusterEntries = clusterKeys.map(k => entryByKey.get(k)).filter(Boolean);
    const clusterName = labelCluster(clusterEntries);

    // Sort inside each cluster like current sortMode
    const sorted = sortBinderEntries(clusterEntries, sortMode);

    return `
      <details class="binderCluster" open>
        <summary>
          <span>Cluster ${idx + 1}: ${escapeHtml(clusterName)}</span>
          <span class="clusterMeta">${sorted.length} item${sorted.length === 1 ? "" : "s"}</span>
        </summary>
        <div>
          ${sorted.map(e => binderItemHTML(e)).join("")}
        </div>
      </details>
    `;
  }).join("");
}

function binderItemHTML(e) {
  const relCount = relatedEvidenceKeys(e.url).length;

  return `
    <div class="binderItem">
      <div class="rowTop">
        <div style="flex:1">
          <div class="title">${escapeHtml(e.label || "Evidence")}</div>
          <div class="small"><a href="${escapeHtml(e.url)}" target="_blank" rel="noreferrer">Open link</a></div>
          ${e.note ? `<div class="small">${escapeHtml(e.note)}</div>` : ""}
          <div class="small" style="margin-top:6px"><strong>Conditions:</strong> ${escapeHtml((e.conditions || []).join(", "))}</div>
        </div>

        <div class="meta">
          ${e.date ? `<span class="badge">${escapeHtml(e.date)}</span>` : ""}
          ${e.type ? `<span class="badge">${escapeHtml(e.type)}</span>` : ""}
          ${relCount ? `<span class="relBadge">Related: ${relCount}</span>` : ""}
        </div>
      </div>
    </div>
  `;
}

function buildEvidenceGraphData(scope = "all", hideOrphans = false) {
  const entries = buildBinderEntries(scope);
  const entryByKey = new Map(entries.map(e => [e.urlKey, e]));

  const rel = loadEvidenceRelations();
  const nodes = [];
  const edges = [];
  const inScope = new Set(entries.map(e => e.urlKey));

  // Build edges undirected, avoid duplicates
  const seenEdge = new Set();
  inScope.forEach(a => {
    const nbrs = Array.isArray(rel[a]) ? rel[a] : [];
    nbrs.forEach(b => {
      if (!inScope.has(b)) return;
      const key = a < b ? `${a}__${b}` : `${b}__${a}`;
      if (seenEdge.has(key)) return;
      seenEdge.add(key);
      edges.push({ source: a, target: b });
    });
  });

  // Degree for orphan filtering + sizing
  const degree = new Map();
  inScope.forEach(k => degree.set(k, 0));
  edges.forEach(e => {
    degree.set(e.source, (degree.get(e.source) || 0) + 1);
    degree.set(e.target, (degree.get(e.target) || 0) + 1);
  });

  // Nodes with orphan scoring
  for (const k of inScope) {
    const d = degree.get(k) || 0;
    if (hideOrphans && d === 0) continue;

    const meta = entryByKey.get(k);
    
    // Calculate orphan score (distance to nearest connected component)
    let orphanScore = 0;
    if (d === 0) {
      orphanScore = 3; // Completely isolated
    } else {
      // Check connectivity to other nodes
      const reachable = computeReachableNodes(k, rel, inScope);
      if (reachable.size === 1) orphanScore = 2; // Only self
      else if (reachable.size < inScope.size / 2) orphanScore = 1; // Small component
    }

    nodes.push({
      id: k,
      url: meta?.url || "",
      label: meta?.label || "(Evidence)",
      type: meta?.type || "Other",
      date: meta?.date || "",
      note: meta?.note || "",
      conditions: meta?.conditions || [],
      degree: d,
      orphanScore
    });
  }

  // Remove edges if hideOrphans removed nodes
  const nodeSet = new Set(nodes.map(n => n.id));
  const edgesFiltered = edges.filter(e => nodeSet.has(e.source) && nodeSet.has(e.target));

  return { nodes, edges: edgesFiltered };
}

// BFS to find reachable nodes (for orphan scoring)
function computeReachableNodes(start, relations, validNodes) {
  const visited = new Set([start]);
  const queue = [start];
  
  while (queue.length) {
    const current = queue.shift();
    const neighbors = Array.isArray(relations[current]) ? relations[current] : [];
    
    for (const nbr of neighbors) {
      if (!validNodes.has(nbr) || visited.has(nbr)) continue;
      visited.add(nbr);
      queue.push(nbr);
    }
  }
  
  return visited;
}

// BFS to find shortest path between two nodes
function findShortestPath(startId, endId, edges) {
  if (startId === endId) return [startId];
  
  // Build adjacency list
  const adj = new Map();
  edges.forEach(e => {
    if (!adj.has(e.source)) adj.set(e.source, []);
    if (!adj.has(e.target)) adj.set(e.target, []);
    adj.get(e.source).push(e.target);
    adj.get(e.target).push(e.source);
  });
  
  // BFS
  const queue = [[startId]];
  const visited = new Set([startId]);
  
  while (queue.length) {
    const path = queue.shift();
    const current = path[path.length - 1];
    
    const neighbors = adj.get(current) || [];
    for (const nbr of neighbors) {
      if (nbr === endId) {
        return [...path, nbr];
      }
      if (!visited.has(nbr)) {
        visited.add(nbr);
        queue.push([...path, nbr]);
      }
    }
  }
  
  return null; // No path found
}

// Undo/Redo stack for graph edits
let __graphEditHistory = [];
let __graphEditIndex = -1;

function pushGraphEdit(description, beforeState, afterState) {
  // Remove any edits after current index (branching)
  __graphEditHistory = __graphEditHistory.slice(0, __graphEditIndex + 1);
  
  __graphEditHistory.push({ description, beforeState, afterState, timestamp: Date.now() });
  __graphEditIndex = __graphEditHistory.length - 1;
  
  // Limit history to 50 edits
  if (__graphEditHistory.length > 50) {
    __graphEditHistory.shift();
    __graphEditIndex--;
  }
}

function canUndoGraph() {
  return __graphEditIndex >= 0;
}

function canRedoGraph() {
  return __graphEditIndex < __graphEditHistory.length - 1;
}

function undoGraphEdit() {
  if (!canUndoGraph()) return false;
  
  const edit = __graphEditHistory[__graphEditIndex];
  saveEvidenceRelations(edit.beforeState);
  __graphEditIndex--;
  return true;
}

function redoGraphEdit() {
  if (!canRedoGraph()) return false;
  
  __graphEditIndex++;
  const edit = __graphEditHistory[__graphEditIndex];
  saveEvidenceRelations(edit.afterState);
  return true;
}

let __graphSim = null;

function renderEvidenceGraph({ scope = "all", hideOrphans = false } = {}) {
  const host = document.getElementById("wsGraph");
  const info = document.getElementById("wsGraphInfo");
  const legendEl = document.getElementById("wsGraphLegend");
  const pathPanel = document.getElementById("wsGraphPath");
  const pathNodeA = document.getElementById("pathNodeA");
  const pathNodeB = document.getElementById("pathNodeB");
  const showLabels = document.getElementById("wsGraphShowLabels")?.checked ?? true;
  
  if (!host) return;

  host.innerHTML = "";
  const { nodes, edges } = buildEvidenceGraphData(scope, hideOrphans);

  if (!nodes.length) {
    host.innerHTML = `<div class="small" style="padding:12px">(No evidence nodes to display for this scope.)</div>`;
    if (info) info.textContent = "No nodes found.";
    if (legendEl) legendEl.innerHTML = "";
    return;
  }

  // Render legend
  if (legendEl) {
    const orphanCount = nodes.filter(n => n.orphanScore > 0).length;
    legendEl.innerHTML = `
      <div class="small"><strong>Legend:</strong></div>
      <div class="legendItem">
        <div style="width:16px;height:16px;border-radius:50%;background:rgba(255,255,255,0.5);border:1.5px solid rgba(255,255,255,0.5)"></div>
        <span class="small">Connected</span>
      </div>
      <div class="legendItem">
        <div style="width:16px;height:16px;border-radius:50%;background:rgba(255,255,255,0.5);border:2.5px solid rgba(255,90,90,0.75)"></div>
        <span class="small">Orphan (${orphanCount})</span>
      </div>
      <div class="legendItem">
        <div style="width:16px;height:16px;border-radius:50%;background:rgba(255,200,100,0.5);border:3px solid rgba(255,200,100,1)"></div>
        <span class="small">Path Highlighted</span>
      </div>
      <div class="small">• Larger nodes = more connections • Click two nodes to find path</div>
    `;
  }

  // Path selection state
  let pathSelectionA = null;
  let pathSelectionB = null;
  let highlightedPath = [];

  const w = host.clientWidth || 900;
  const h = host.clientHeight || 520;

  // SVG + group for pan/zoom
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "graphSvg");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);

  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  svg.appendChild(g);

  // edge layer
  const edgeEls = edges.map(() => {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("class", "edgeLine");
    g.appendChild(line);
    return line;
  });

  // edge label layer
  const edgeLabelEls = showLabels ? edges.map(() => {
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("class", "edgeLabel");
    text.setAttribute("text-anchor", "middle");
    text.textContent = "•"; // Will show "link" or similar
    g.appendChild(text);
    return text;
  }) : null;

  // node layer
  const nodeGroupEls = nodes.map(n => {
    const grp = document.createElementNS("http://www.w3.org/2000/svg", "g");

    const r = Math.max(6, Math.min(18, 6 + n.degree * 2));
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("r", r);
    circle.setAttribute("class", `nodeCircle ${n.orphanScore > 0 ? 'orphan' : ''}`);
    circle.setAttribute("fill", `rgba(255,255,255,${Math.min(0.35 + n.degree * 0.08, 0.80)})`);

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("class", "nodeLabel");
    label.setAttribute("x", r + 6);
    label.setAttribute("y", 4);
    label.textContent = (n.label || "(Evidence)").slice(0, 34);

    // Orphan score indicator
    if (n.orphanScore > 1) {
      const scoreLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
      scoreLabel.setAttribute("class", "nodeLabel");
      scoreLabel.setAttribute("x", r + 6);
      scoreLabel.setAttribute("y", 16);
      scoreLabel.setAttribute("fill", "rgba(255,90,90,0.85)");
      scoreLabel.setAttribute("font-size", "9px");
      scoreLabel.textContent = n.orphanScore === 3 ? "⚠ Isolated" : "⚠ Weak";
      grp.appendChild(scoreLabel);
    }

    grp.appendChild(circle);
    grp.appendChild(label);
    g.appendChild(grp);

    // Click handler for path selection and info
    circle.addEventListener("click", (ev) => {
      ev.stopPropagation();
      
      // Path selection mode
      if (!pathSelectionA || (pathSelectionA && pathSelectionB)) {
        // Start new selection
        pathSelectionA = n.id;
        pathSelectionB = null;
        highlightedPath = [];
        if (pathNodeA) pathNodeA.textContent = n.label || n.id;
        if (pathNodeB) pathNodeB.textContent = "(none)";
        if (pathPanel) pathPanel.classList.remove("hidden");
        
        // Visual feedback
        nodeGroupEls.forEach(ne => ne.circle.classList.remove("pathSelected", "highlighted"));
        edgeEls.forEach(e => e.classList.remove("highlighted"));
        circle.classList.add("pathSelected");
      } else if (pathSelectionA && !pathSelectionB) {
        // Complete selection
        pathSelectionB = n.id;
        if (pathNodeB) pathNodeB.textContent = n.label || n.id;
        
        if (pathSelectionA !== pathSelectionB) {
          // Find and highlight path
          const path = findShortestPath(pathSelectionA, pathSelectionB, edges);
          if (path) {
            highlightedPath = path;
            
            // Highlight nodes in path
            const pathSet = new Set(path);
            nodeGroupEls.forEach((ne, idx) => {
              ne.circle.classList.remove("pathSelected");
              if (pathSet.has(nodes[idx].id)) {
                ne.circle.classList.add("highlighted");
              } else {
                ne.circle.classList.remove("highlighted");
              }
            });
            
            // Highlight edges in path
            const pathEdges = new Set();
            for (let i = 0; i < path.length - 1; i++) {
              const a = path[i];
              const b = path[i + 1];
              pathEdges.add(a < b ? `${a}__${b}` : `${b}__${a}`);
            }
            
            edgeEls.forEach((el, idx) => {
              const e = edges[idx];
              const key = e.source < e.target ? `${e.source}__${e.target}` : `${e.target}__${e.source}`;
              if (pathEdges.has(key)) {
                el.classList.add("highlighted");
              } else {
                el.classList.remove("highlighted");
              }
            });
            
            if (info) {
              info.innerHTML = `✓ Path found: ${path.length} nodes, ${path.length - 1} hops. <span class="small">${path.map(p => {
                const node = nodes.find(n => n.id === p);
                return escapeHtml(node?.label || p);
              }).join(" → ")}</span>`;
            }
          } else {
            if (info) info.innerHTML = "✗ No path found between selected nodes.";
            highlightedPath = [];
          }
        } else {
          if (info) info.innerHTML = "Same node selected.";
        }
      }
      
      // Show node info
      if (info && !highlightedPath.length) {
        info.innerHTML = `
          <strong>${escapeHtml(n.label || "Evidence")}</strong>
          ${n.date ? ` • ${escapeHtml(n.date)}` : ""}
          ${n.type ? ` • ${escapeHtml(n.type)}` : ""}
          ${n.orphanScore > 0 ? ` • <span style="color:rgba(255,90,90,0.95)">Orphan Score: ${n.orphanScore}</span>` : ""}
          <br/>
          <span>Degree:</span> ${n.degree} | <span>Conditions:</span> ${escapeHtml((n.conditions || []).join(", ") || "(none)")}
          <br/>
          <a href="${escapeHtml(n.url)}" target="_blank" rel="noreferrer">Open link</a>
          ${n.note ? `<div style="margin-top:6px">${escapeHtml(n.note)}</div>` : ""}
        `;
      }
    });

    return { grp, circle, label };
  });

  // Clear path button
  const pathClear = document.getElementById("pathClear");
  if (pathClear) {
    pathClear.onclick = () => {
      pathSelectionA = null;
      pathSelectionB = null;
      highlightedPath = [];
      if (pathNodeA) pathNodeA.textContent = "(none)";
      if (pathNodeB) pathNodeB.textContent = "(none)";
      if (pathPanel) pathPanel.classList.add("hidden");
      nodeGroupEls.forEach(ne => ne.circle.classList.remove("pathSelected", "highlighted"));
      edgeEls.forEach(e => e.classList.remove("highlighted"));
      if (info) info.textContent = `Nodes: ${nodes.length} | Links: ${edges.length}. Drag nodes, scroll to zoom, drag background to pan.`;
    };
  }

  host.appendChild(svg);

  // Pan / Zoom
  let scale = 1;
  let panX = 0, panY = 0;

  function applyTransform() {
    g.setAttribute("transform", `translate(${panX},${panY}) scale(${scale})`);
  }

  svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    const delta = Math.sign(e.deltaY);
    const next = scale * (delta > 0 ? 0.92 : 1.08);
    scale = Math.max(0.25, Math.min(2.5, next));
    applyTransform();
  }, { passive: false });

  let panning = false;
  let lastPan = null;

  svg.addEventListener("mousedown", (e) => {
    if (e.target && e.target.tagName === "circle") return;
    panning = true;
    lastPan = { x: e.clientX, y: e.clientY };
  });

  const panHandler = (e) => {
    if (!panning || !lastPan) return;
    panX += (e.clientX - lastPan.x);
    panY += (e.clientY - lastPan.y);
    lastPan = { x: e.clientX, y: e.clientY };
    applyTransform();
  };

  window.addEventListener("mousemove", panHandler);

  const upHandler = () => {
    panning = false;
    lastPan = null;
  };

  window.addEventListener("mouseup", upHandler);

  // Force simulation
  nodes.forEach(n => {
    n.x = w / 2 + (Math.random() - 0.5) * 180;
    n.y = h / 2 + (Math.random() - 0.5) * 180;
    n.vx = 0; n.vy = 0;
    n.fx = null; n.fy = null;
  });

  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const links = edges.map(e => ({
    a: nodeById.get(e.source),
    b: nodeById.get(e.target)
  })).filter(l => l.a && l.b);

  // drag behavior - need to track dragging per node
  const dragState = new Map(); // nodeIndex -> { dragging: bool }
  
  nodeGroupEls.forEach(({ grp, circle }, idx) => {
    const n = nodes[idx];
    dragState.set(idx, { dragging: false });

    circle.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      dragState.get(idx).dragging = true;
      n.fx = n.x; n.fy = n.y;
    });
  });

  const dragMoveHandler = (e) => {
    nodeGroupEls.forEach(({ grp, circle }, idx) => {
      if (!dragState.get(idx).dragging) return;
      const n = nodes[idx];
      const rect = svg.getBoundingClientRect();
      const mx = (e.clientX - rect.left - panX) / scale;
      const my = (e.clientY - rect.top - panY) / scale;
      n.fx = mx; n.fy = my;
    });
  };

  const dragUpHandler = () => {
    let anyDragging = false;
    nodeGroupEls.forEach(({ grp, circle }, idx) => {
      if (dragState.get(idx).dragging) {
        anyDragging = true;
        dragState.get(idx).dragging = false;
        const n = nodes[idx];
        n.fx = null; n.fy = null;
      }
    });
  };

  window.addEventListener("mousemove", dragMoveHandler);
  window.addEventListener("mouseup", dragUpHandler);

  if (__graphSim && __graphSim.stop) __graphSim.stop();

  let running = true;
  let tickCount = 0;

  function tick() {
    if (!running) return;

    const centerX = w / 2;
    const centerY = h / 2;
    const springK = 0.015;
    const restLen = 110;

    links.forEach(l => {
      const dx = l.b.x - l.a.x;
      const dy = l.b.y - l.a.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      const diff = dist - restLen;
      const fx = (dx / dist) * diff * springK;
      const fy = (dy / dist) * diff * springK;

      l.a.vx += fx;
      l.a.vy += fy;
      l.b.vx -= fx;
      l.b.vy -= fy;
    });

    const repK = 1400;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy + 0.01;
        const f = repK / d2;
        const fx = dx * f;
        const fy = dy * f;
        a.vx -= fx; a.vy -= fy;
        b.vx += fx; b.vy += fy;
      }
    }

    const damp = 0.85;
    nodes.forEach(n => {
      n.vx += (centerX - n.x) * 0.0015;
      n.vy += (centerY - n.y) * 0.0015;

      if (n.fx != null && n.fy != null) {
        n.x = n.fx; n.y = n.fy;
        n.vx = 0; n.vy = 0;
      } else {
        n.vx *= damp;
        n.vy *= damp;
        n.x += n.vx;
        n.y += n.vy;
      }

      n.x = Math.max(10, Math.min(w - 10, n.x));
      n.y = Math.max(10, Math.min(h - 10, n.y));
    });

    edges.forEach((e, i) => {
      const a = nodeById.get(e.source);
      const b = nodeById.get(e.target);
      if (!a || !b) return;
      edgeEls[i].setAttribute("x1", a.x);
      edgeEls[i].setAttribute("y1", a.y);
      edgeEls[i].setAttribute("x2", b.x);
      edgeEls[i].setAttribute("y2", b.y);
      
      // Update edge labels
      if (edgeLabelEls && edgeLabelEls[i]) {
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        edgeLabelEls[i].setAttribute("x", mx);
        edgeLabelEls[i].setAttribute("y", my);
      }
    });

    nodes.forEach((n, i) => {
      nodeGroupEls[i].grp.setAttribute("transform", `translate(${n.x},${n.y})`);
    });

    tickCount++;
    if (tickCount > 900) running = false;

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);

  __graphSim = { stop: () => { running = false; } };

  svg.__fit = () => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(n => {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x);
      maxY = Math.max(maxY, n.y);
    });

    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);
    const pad = 40;
    const sx = (w - pad) / bw;
    const sy = (h - pad) / bh;
    scale = Math.max(0.25, Math.min(2.5, Math.min(sx, sy)));

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    panX = w / 2 - cx * scale;
    panY = h / 2 - cy * scale;
    applyTransform();
  };

  setTimeout(() => { svg.__fit && svg.__fit(); }, 120);

  if (info) {
    info.textContent = `Nodes: ${nodes.length} | Links: ${edges.length}. Drag nodes, scroll to zoom, drag background to pan.`;
  }
}

function buildWorkspaceEvidenceIndex(scope = "all") {
  const st = loadWorkspaceState();
  const primaryId = st.primaryId || "";

  let ids = (st.nodes || []).slice();
  if (scope === "primary") ids = primaryId ? [primaryId] : [];
  else if (scope === "linked") {
    ids = ids.filter(id => isLinkedNode(id, st));
    if (primaryId && !ids.includes(primaryId)) ids.unshift(primaryId);
  }

  // urlKey -> { url,label,type,date,note, conditions:Set }
  const byUrl = new Map();

  ids.forEach(id => {
    const cond = getConditionById(id);
    if (!cond) return;

    const links = loadEvidenceLinks(id);
    links.forEach(l => {
      const key = normalizeUrl(l.url);
      if (!key) return;

      if (!byUrl.has(key)) {
        byUrl.set(key, {
          url: l.url,
          label: l.label || "",
          type: l.type || "Other",
          date: l.date || "",
          note: l.note || "",
          conditions: new Set([cond.name])
        });
      } else {
        const e = byUrl.get(key);
        e.conditions.add(cond.name);
        if (!e.label && l.label) e.label = l.label;
        if ((!e.type || e.type === "Other") && l.type) e.type = l.type;
        if (!e.date && l.date) e.date = l.date;
        if (l.note && !e.note) e.note = l.note;
      }
    });
  });

  // finalize sets
  const out = new Map();
  for (const [k, v] of byUrl.entries()) {
    out.set(k, { ...v, conditions: [...v.conditions].sort() });
  }
  return out;
}

function evidenceDisplayName(e) {
  const bits = [];
  if (e.label) bits.push(e.label);
  if (e.date) bits.push(e.date);
  if (e.type) bits.push(e.type);
  return bits.join(" • ") || e.url;
}

function workspaceEvidenceBinderDraft(scope = "all", sortMode = "date", viewMode = "flat") {
  const st = loadWorkspaceState();
  const primaryId = st.primaryId || "";

  let ids = (st.nodes || []).slice();

  if (scope === "primary") {
    ids = primaryId ? [primaryId] : [];
  } else if (scope === "linked") {
    ids = ids.filter(id => isLinkedNode(id, st));
    if (primaryId && !ids.includes(primaryId)) ids.unshift(primaryId);
  }

  // Collect + de-duplicate by URL
  const byUrl = new Map();

  ids.forEach(id => {
    const cond = getConditionById(id);
    if (!cond) return;

    const links = loadEvidenceLinks(id);
    links.forEach(l => {
      const urlKey = normalizeUrl(l.url);
      if (!urlKey) return;

      if (!byUrl.has(urlKey)) {
        byUrl.set(urlKey, {
          url: l.url,
          label: l.label || "",
          type: l.type || "Other",
          date: l.date || "",
          note: l.note || "",
          conditions: new Set([cond.name]),
        });
      } else {
        const existing = byUrl.get(urlKey);
        existing.conditions.add(cond.name);

        // Prefer the "best" metadata if duplicates differ
        if (!existing.label && l.label) existing.label = l.label;
        if ((!existing.type || existing.type === "Other") && l.type) existing.type = l.type;
        if (!existing.date && l.date) existing.date = l.date;

        // Merge notes lightly (avoid huge duplicates)
        if (l.note && existing.note && !existing.note.includes(l.note)) {
          existing.note = `${existing.note} | ${l.note}`.slice(0, 600);
        } else if (l.note && !existing.note) {
          existing.note = l.note;
        }
      }
    });
  });

  const merged = [...byUrl.values()].map(x => ({
    ...x,
    conditions: [...x.conditions].sort()
  }));

  // Sort
  if (sortMode === "type") {
    merged.sort((a, b) => (a.type || "").localeCompare(b.type || "") || toSortableDateKey(a.date).localeCompare(toSortableDateKey(b.date)));
  } else if (sortMode === "condition") {
    merged.sort((a, b) => (a.conditions[0] || "").localeCompare(b.conditions[0] || "") || toSortableDateKey(a.date).localeCompare(toSortableDateKey(b.date)));
  } else {
    merged.sort((a, b) => toSortableDateKey(a.date).localeCompare(toSortableDateKey(b.date)) || (a.type || "").localeCompare(b.type || ""));
  }

  // If clustered view, group by related graph clusters
  if (viewMode === "cluster") {
    const keys = merged.map(e => normalizeUrl(e.url));
    const clusters = findEvidenceClusters(keys);

    // Map key -> entry
    const entryByKey = new Map();
    merged.forEach(e => entryByKey.set(normalizeUrl(e.url), e));

    const lines = [];
    lines.push("VA CFR Finder — Workspace Evidence Binder (Clustered)");
    lines.push(new Date().toLocaleString());
    lines.push(`Scope: ${scope} | Sort: ${sortMode} | View: ${viewMode}`);
    lines.push("");

    clusters.forEach((clusterKeys, idx) => {
      const entries = clusterKeys.map(k => entryByKey.get(k)).filter(Boolean);

      // For readability: sort within cluster using the same sortMode logic
      if (sortMode === "type") {
        entries.sort((a, b) => (a.type || "").localeCompare(b.type || "") || toSortableDateKey(a.date).localeCompare(toSortableDateKey(b.date)));
      } else if (sortMode === "condition") {
        entries.sort((a, b) => (a.conditions?.[0] || "").localeCompare(b.conditions?.[0] || "") || toSortableDateKey(a.date).localeCompare(toSortableDateKey(b.date)));
      } else {
        entries.sort((a, b) => toSortableDateKey(a.date).localeCompare(toSortableDateKey(b.date)) || (a.type || "").localeCompare(b.type || ""));
      }

      const clusterName = labelCluster(entries);
      lines.push(`=== Cluster ${idx + 1}: ${clusterName} (${entries.length} item${entries.length === 1 ? "" : "s"}) ===`);
      const conf = clusterLabelConfidence(entries);
      lines.push(`(Label confidence: Conditions ${conf.condPct}%, Type ${conf.typePct}%)`);

      entries.forEach((e, i) => {
        lines.push(`  #${i + 1} ${e.label || "Evidence"}`);
        if (e.date) lines.push(`  Date: ${e.date}`);
        if (e.type) lines.push(`  Type: ${e.type}`);
        lines.push(`  Conditions: ${(e.conditions || []).join(", ")}`);
        lines.push(`  URL: ${e.url}`);
        if (e.note) lines.push(`  Notes: ${e.note}`);
        lines.push("");
      });

      lines.push("");
    });

    if (!clusters.length) {
      lines.push("(No evidence links found in this scope.)");
    }

    return lines.join("\n");
  }

  const lines = [];
  lines.push("VA CFR Finder — Workspace Evidence Binder (Educational / Local list)");
  lines.push(new Date().toLocaleString());
  lines.push(`Scope: ${scope} | Sort: ${sortMode}`);
  lines.push("");

  if (!merged.length) {
    lines.push("(No evidence links found in this scope.)");
    return lines.join("\n");
  }

  merged.forEach((e, i) => {
    lines.push(`#${i + 1} ${e.label || "Evidence"}`);
    if (e.date) lines.push(`Date: ${e.date}`);
    if (e.type) lines.push(`Type: ${e.type}`);
    lines.push(`Conditions: ${e.conditions.join(", ")}`);
    lines.push(`URL: ${e.url}`);
    const rel = relatedEvidenceKeys(e.url);
    if (rel.length) {
      lines.push(`Related URLs: ${rel.length}`);
    }
    if (e.note) lines.push(`Notes: ${e.note}`);
    lines.push("");
  });

  return lines.join("\n");
}

function binderStats(scope = "all") {
  const st = loadWorkspaceState();
  const primaryId = st.primaryId || "";
  let ids = (st.nodes || []).slice();

  if (scope === "primary") ids = primaryId ? [primaryId] : [];
  else if (scope === "linked") {
    ids = ids.filter(id => isLinkedNode(id, st));
    if (primaryId && !ids.includes(primaryId)) ids.unshift(primaryId);
  }

  let total = 0;
  const uniq = new Set();

  ids.forEach(id => {
    const links = loadEvidenceLinks(id);
    links.forEach(l => {
      if (l?.url) {
        total++;
        uniq.add(normalizeUrl(l.url));
      }
    });
  });

  return { total, unique: uniq.size };
}

async function init() {
  const res = await fetch("/api/conditions");
  CONDITIONS = await res.json();

  // Auto-import workspace from share link
  const params = new URLSearchParams(window.location.search);
  const wsToken = params.get("ws");

  if (wsToken) {
    try {
      const json = base64UrlDecode(wsToken);
      const payload = JSON.parse(json);
      applySharePayload(payload);

      // optional: remove ws param after import (clean URL)
      const clean = new URL(window.location.href);
      clean.searchParams.delete("ws");
      history.replaceState({}, "", clean.toString());

      alert("Workspace imported from link!");
    } catch (e) {
      console.error(e);
      alert("Could not import workspace from link (bad or corrupted token).");
    }
  }

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
      renderClaimTree();
      renderHealthPanel();
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

  // Health panel buttons
  const wsFixOrphans = document.getElementById("wsFixOrphans");
  const wsFixDisconnected = document.getElementById("wsFixDisconnected");
  const wsHealthExport = document.getElementById("wsHealthExport");

  if (wsFixOrphans) {
    wsFixOrphans.addEventListener("click", () => {
      fixLinkAllOrphansToPrimary();
      renderWorkspace();
      renderClaimTree();
      renderHealthPanel();
    });
  }

  if (wsFixDisconnected) {
    wsFixDisconnected.addEventListener("click", () => {
      fixAttachDisconnectedToPrimary();
      renderWorkspace();
      renderClaimTree();
      renderHealthPanel();
    });
  }

  if (wsHealthExport) {
    wsHealthExport.addEventListener("click", () => exportHealthReport());
  }

  // Share link button
  const wsCopyShare = document.getElementById("wsCopyShare");
  if (wsCopyShare) {
    wsCopyShare.addEventListener("click", async () => {
      const payload = makeSharePayload();
      const token = base64UrlEncode(JSON.stringify(payload));

      const url = new URL(window.location.href);
      url.searchParams.set("ws", token);

      await navigator.clipboard.writeText(url.toString());
      alert("Share link copied!");
    });
  }

  // Narrative buttons
  const wsNarrativeBtn = document.getElementById("wsNarrativeBtn");
  const wsNarrativeCopy = document.getElementById("wsNarrativeCopy");
  const wsNarrativeDownload = document.getElementById("wsNarrativeDownload");
  const wsNarrativeClear = document.getElementById("wsNarrativeClear");
  const wsNarrativeOut = document.getElementById("wsNarrativeOut");

  if (wsNarrativeBtn && wsNarrativeOut) {
    wsNarrativeBtn.addEventListener("click", () => {
      const linkedOnly = document.getElementById("wsNarrativeLinkedOnly")?.checked;
      const style = document.getElementById("wsNarrativeStyle")?.value || "concise";
      wsNarrativeOut.value = generateNarrativeDraft({ linkedOnly, style });
    });
  }

  if (wsNarrativeCopy && wsNarrativeOut) {
    wsNarrativeCopy.addEventListener("click", async () => {
      await navigator.clipboard.writeText(wsNarrativeOut.value || "");
      alert("Narrative copied!");
    });
  }

  if (wsNarrativeDownload && wsNarrativeOut) {
    wsNarrativeDownload.addEventListener("click", () => {
      const linkedOnly = document.getElementById("wsNarrativeLinkedOnly")?.checked;
      const style = document.getElementById("wsNarrativeStyle")?.value || "concise";
      downloadText("claim_narrative_draft.txt", wsNarrativeOut.value || generateNarrativeDraft({ linkedOnly, style }));
    });
  }

  if (wsNarrativeClear && wsNarrativeOut) {
    wsNarrativeClear.addEventListener("click", () => {
      wsNarrativeOut.value = "";
    });
  }

  // Auto-regenerate when toggles change (nice UX)
  const narLinkedOnly = document.getElementById("wsNarrativeLinkedOnly");
  const narStyle = document.getElementById("wsNarrativeStyle");

  function regenIfAnyText() {
    if (!wsNarrativeOut) return;
    if (!wsNarrativeOut.value.trim()) return; // only regen after first generation
    const linkedOnly = narLinkedOnly?.checked;
    const style = narStyle?.value || "concise";
    wsNarrativeOut.value = generateNarrativeDraft({ linkedOnly, style });
  }

  if (narLinkedOnly) narLinkedOnly.addEventListener("change", regenIfAnyText);
  if (narStyle) narStyle.addEventListener("change", regenIfAnyText);

  // Workspace timeline buttons
  const wsTimelineBtn = document.getElementById("wsTimelineBtn");
  const wsTimelineCopy = document.getElementById("wsTimelineCopy");
  const wsTimelineDownload = document.getElementById("wsTimelineDownload");
  const wsTimelineOut = document.getElementById("wsTimelineOut");
  const wsTimelineScope = document.getElementById("wsTimelineScope");

  function regenWsTimeline() {
    const scope = wsTimelineScope?.value || "all";
    const text = workspaceTimelineDraft(scope);
    if (wsTimelineOut) wsTimelineOut.value = text;
  }

  if (wsTimelineBtn) wsTimelineBtn.addEventListener("click", regenWsTimeline);

  if (wsTimelineCopy && wsTimelineOut) {
    wsTimelineCopy.addEventListener("click", async () => {
      await navigator.clipboard.writeText(wsTimelineOut.value || "");
      alert("Timeline copied!");
    });
  }

  if (wsTimelineDownload && wsTimelineOut) {
    wsTimelineDownload.addEventListener("click", () => {
      const scope = wsTimelineScope?.value || "all";
      downloadText(`workspace_timeline_${scope}.txt`, wsTimelineOut.value || workspaceTimelineDraft(scope));
    });
  }

  if (wsTimelineScope) wsTimelineScope.addEventListener("change", () => {
    // only regenerate if user already generated once
    if (wsTimelineOut && wsTimelineOut.value.trim()) regenWsTimeline();
  });

  // Workspace evidence binder buttons
  const wsBinderBtn = document.getElementById("wsBinderBtn");
  const wsBinderCopy = document.getElementById("wsBinderCopy");
  const wsBinderDownload = document.getElementById("wsBinderDownload");
  const wsBinderOut = document.getElementById("wsBinderOut");
  const wsBinderScope = document.getElementById("wsBinderScope");
  const wsBinderSort = document.getElementById("wsBinderSort");
  const wsBinderView = document.getElementById("wsBinderView");
  const wsBinderViewer = document.getElementById("wsBinderViewer");
  const wsBinderShowViewer = document.getElementById("wsBinderShowViewer");

  function regenBinder() {
    const scope = wsBinderScope?.value || "all";
    const sortMode = wsBinderSort?.value || "date";
    const viewMode = wsBinderView?.value || "flat";
    const text = workspaceEvidenceBinderDraft(scope, sortMode, viewMode);
    if (wsBinderOut) wsBinderOut.value = text;

    // Render clickable viewer
    renderBinderViewer({ scope, sortMode, viewMode });
  }

  if (wsBinderBtn) wsBinderBtn.addEventListener("click", regenBinder);

  if (wsBinderCopy && wsBinderOut) {
    wsBinderCopy.addEventListener("click", async () => {
      await navigator.clipboard.writeText(wsBinderOut.value || "");
      alert("Binder copied!");
    });
  }

  if (wsBinderDownload && wsBinderOut) {
    wsBinderDownload.addEventListener("click", () => {
      const scope = wsBinderScope?.value || "all";
      const sortMode = wsBinderSort?.value || "date";
      const viewMode = wsBinderView?.value || "flat";
      downloadText(`workspace_evidence_binder_${scope}_${sortMode}_${viewMode}.txt`,
        wsBinderOut.value || workspaceEvidenceBinderDraft(scope, sortMode, viewMode)
      );
    });
  }

  if (wsBinderScope) wsBinderScope.addEventListener("change", () => {
    if (wsBinderOut && wsBinderOut.value.trim()) regenBinder();
  });

  if (wsBinderSort) wsBinderSort.addEventListener("change", () => {
    if (wsBinderOut && wsBinderOut.value.trim()) regenBinder();
  });

  if (wsBinderView) wsBinderView.addEventListener("change", () => {
    if (wsBinderOut && wsBinderOut.value.trim()) regenBinder();
  });

  if (wsBinderShowViewer) wsBinderShowViewer.addEventListener("change", () => {
    if (wsBinderOut && wsBinderOut.value.trim()) regenBinder();
  });

  // Evidence relationship graph buttons
  const wsGraphBuild = document.getElementById("wsGraphBuild");
  const wsGraphFit = document.getElementById("wsGraphFit");
  const wsGraphScope = document.getElementById("wsGraphScope");
  const wsGraphHideOrphans = document.getElementById("wsGraphHideOrphans");
  const wsGraphShowLabels = document.getElementById("wsGraphShowLabels");
  const wsGraphUndo = document.getElementById("wsGraphUndo");
  const wsGraphRedo = document.getElementById("wsGraphRedo");

  function buildGraphNow() {
    const scope = wsGraphScope?.value || "all";
    const hideOrphans = wsGraphHideOrphans?.checked || false;
    renderEvidenceGraph({ scope, hideOrphans });
    updateUndoRedoButtons();
  }

  function updateUndoRedoButtons() {
    if (wsGraphUndo) wsGraphUndo.disabled = !canUndoGraph();
    if (wsGraphRedo) wsGraphRedo.disabled = !canRedoGraph();
  }

  if (wsGraphBuild) wsGraphBuild.addEventListener("click", buildGraphNow);

  if (wsGraphUndo) {
    wsGraphUndo.addEventListener("click", () => {
      if (undoGraphEdit()) {
        buildGraphNow();
        alert("Undid last graph edit");
      }
    });
  }

  if (wsGraphRedo) {
    wsGraphRedo.addEventListener("click", () => {
      if (redoGraphEdit()) {
        buildGraphNow();
        alert("Redid graph edit");
      }
    });
  }

  if (wsGraphFit && wsGraphBuild) {
    wsGraphFit.addEventListener("click", () => {
      const svg = document.querySelector("#wsGraph svg");
      if (svg && svg.__fit) svg.__fit();
    });
  }

  if (wsGraphScope) {
    wsGraphScope.addEventListener("change", () => {
      const svg = document.querySelector("#wsGraph svg");
      if (svg) buildGraphNow(); // rebuild if already exists
    });
  }

  if (wsGraphHideOrphans) {
    wsGraphHideOrphans.addEventListener("change", () => {
      const svg = document.querySelector("#wsGraph svg");
      if (svg) buildGraphNow(); // rebuild if already exists
    });
  }

  if (wsGraphShowLabels) {
    wsGraphShowLabels.addEventListener("change", () => {
      const svg = document.querySelector("#wsGraph svg");
      if (svg) buildGraphNow(); // rebuild if already exists
    });
  }

  // Initialize undo/redo button states
  updateUndoRedoButtons();

  // First render
  renderWorkspace();
  renderClaimTree();
  renderHealthPanel();
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
