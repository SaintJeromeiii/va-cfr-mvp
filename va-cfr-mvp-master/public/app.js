let CONDITIONS = [];
let workspaceDraftsApi = null;
let secondaryConditionsApi = null;
let workspaceToolsApi = null;
let searchUiApi = null;
const notifierFactory = window.VaCfrNotifierFactory;
const confirmModalFactory = window.VaCfrConfirmModalFactory;
const parseCommandQuery =
  window.VaCfrCommandQuery?.parseCommandQuery ||
  function fallbackParseCommandQuery(raw) {
    return { mode: "text", text: (raw || "").trim() };
  };
const storageApi = window.VaCfrStorage;
const workspaceExportFactory = window.VaCfrWorkspaceExportFactory;
const evidenceBinderFactory = window.VaCfrEvidenceBinderFactory;
const evidenceGraphFactory = window.VaCfrEvidenceGraphFactory;
const workspaceUiFactory = window.VaCfrWorkspaceUiFactory;
const detailViewFactory = window.VaCfrDetailViewFactory;
const detailInteractionsFactory = window.VaCfrDetailInteractionsFactory;
const workspaceDraftsFactory = window.VaCfrWorkspaceDraftsFactory;
const secondaryConditionsFactory = window.VaCfrSecondaryConditionsFactory;
const workspaceToolsFactory = window.VaCfrWorkspaceToolsFactory;
const searchUiFactory = window.VaCfrSearchUiFactory;
const notifierApi =
  notifierFactory?.createNotifierApi?.() || null;
const confirmModalApi =
  confirmModalFactory?.createConfirmModalApi?.() || null;
const toSortableDateKey =
  window.VaCfrTimeline?.toSortableDateKey ||
  function fallbackSortableDateKey() {
    return "9999-99-99";
  };
const sortTimeline =
  window.VaCfrTimeline?.sortTimeline ||
  function fallbackSortTimeline(entries) {
    return (entries || []).slice();
  };
const loadEvidenceState =
  storageApi?.loadEvidenceState ||
  function fallbackLoadEvidenceState() {
    return {};
  };
const saveEvidenceState =
  storageApi?.saveEvidenceState ||
  function fallbackSaveEvidenceState() {};
const loadNotes =
  storageApi?.loadNotes ||
  function fallbackLoadNotes() {
    return "";
  };
const saveNotes =
  storageApi?.saveNotes ||
  function fallbackSaveNotes() {};
const loadTimeline =
  storageApi?.loadTimeline ||
  function fallbackLoadTimeline() {
    return [];
  };
const saveTimeline =
  storageApi?.saveTimeline ||
  function fallbackSaveTimeline() {};
const loadEvidenceLinks =
  storageApi?.loadEvidenceLinks ||
  function fallbackLoadEvidenceLinks() {
    return [];
  };
const saveEvidenceLinks =
  storageApi?.saveEvidenceLinks ||
  function fallbackSaveEvidenceLinks() {};
const loadEvidenceRelations =
  storageApi?.loadEvidenceRelations ||
  function fallbackLoadEvidenceRelations() {
    return {};
  };
const saveEvidenceRelations =
  storageApi?.saveEvidenceRelations ||
  function fallbackSaveEvidenceRelations() {};
const loadWorkspaceState =
  storageApi?.loadWorkspaceState ||
  function fallbackLoadWorkspaceState() {
    return { nodes: [], primaryId: "", links: [] };
  };
const saveWorkspaceState =
  storageApi?.saveWorkspaceState ||
  function fallbackSaveWorkspaceState() {};
const workspaceExportApi =
  workspaceExportFactory?.createWorkspaceExportApi?.({
    loadWorkspaceState,
    saveWorkspaceState,
    loadNotes,
    loadEvidenceState,
    getConditionById: (id) => CONDITIONS.find((condition) => condition.id === id) || null,
  }) || null;
const base64UrlEncode =
  workspaceExportFactory?.base64UrlEncode ||
  function fallbackBase64UrlEncode(str) {
    return str;
  };
const base64UrlDecode =
  workspaceExportFactory?.base64UrlDecode ||
  function fallbackBase64UrlDecode(str) {
    return str;
  };
const makeSharePayload =
  workspaceExportApi?.makeSharePayload ||
  function fallbackMakeSharePayload() {
    return { v: 1, nodes: [], primaryId: "", links: [] };
  };
const applySharePayload =
  workspaceExportApi?.applySharePayload ||
  function fallbackApplySharePayload() {};
const buildClaimPacketText =
  workspaceExportApi?.buildClaimPacketText ||
  function fallbackBuildClaimPacketText() {
    return "";
  };
const buildWorkspacePacketText =
  workspaceExportApi?.buildWorkspacePacketText ||
  function fallbackBuildWorkspacePacketText() {
    return "";
  };
const downloadText =
  workspaceExportApi?.downloadText ||
  function fallbackDownloadText() {};
const evidenceBinderApi =
  evidenceBinderFactory?.createEvidenceBinderApi?.({
    loadWorkspaceState,
    isLinkedNode,
    getConditionById: (id) => CONDITIONS.find((condition) => condition.id === id) || null,
    loadEvidenceLinks,
    normalizeUrl,
    base64UrlEncode,
    toSortableDateKey,
    relatedEvidenceKeys,
    loadEvidenceRelations,
  }) || null;
const findEvidenceClusters =
  evidenceBinderApi?.findEvidenceClusters ||
  function fallbackFindEvidenceClusters() {
    return [];
  };
const labelCluster =
  evidenceBinderApi?.labelCluster ||
  function fallbackLabelCluster() {
    return "Mixed evidence";
  };
const buildBinderEntries =
  evidenceBinderApi?.buildBinderEntries ||
  function fallbackBuildBinderEntries() {
    return [];
  };
const sortBinderEntries =
  evidenceBinderApi?.sortBinderEntries ||
  function fallbackSortBinderEntries(entries) {
    return (entries || []).slice();
  };
const buildEvidenceGraphData =
  evidenceBinderApi?.buildEvidenceGraphData ||
  function fallbackBuildEvidenceGraphData() {
    return { nodes: [], edges: [] };
  };
const workspaceEvidenceBinderDraft =
  evidenceBinderApi?.workspaceEvidenceBinderDraft ||
  function fallbackWorkspaceEvidenceBinderDraft() {
    return "";
  };
const binderStats =
  evidenceBinderApi?.binderStats ||
  function fallbackBinderStats() {
    return { total: 0, unique: 0 };
  };
const evidenceGraphApi =
  evidenceGraphFactory?.createEvidenceGraphApi?.({
    loadWorkspaceState,
    isLinkedNode,
    getConditionById: (id) => CONDITIONS.find((condition) => condition.id === id) || null,
    loadEvidenceLinks,
    normalizeUrl,
    relatedEvidenceKeys,
    buildEvidenceGraphData,
    escapeHtml,
    toSortableDateKey,
  }) || null;
const buildWorkspaceEvidenceIndex =
  evidenceGraphApi?.buildWorkspaceEvidenceIndex ||
  function fallbackBuildWorkspaceEvidenceIndex() {
    return new Map();
  };
const evidenceDisplayName =
  evidenceGraphApi?.evidenceDisplayName ||
  function fallbackEvidenceDisplayName(entry) {
    return entry?.url || "";
  };
const renderEvidenceGraph =
  evidenceGraphApi?.renderEvidenceGraph ||
  function fallbackRenderEvidenceGraph() {};
const workspaceUiApi =
  workspaceUiFactory?.createWorkspaceUiApi?.({
    loadWorkspaceState,
    saveWorkspaceState,
    loadEvidenceState,
    loadEvidenceLinks,
    loadNotes,
    getConditions: () => CONDITIONS,
    getConditionById: (id) => CONDITIONS.find((condition) => condition.id === id) || null,
    escapeHtml,
    systemClassName,
    REL_TYPES,
    isOrphan,
    showDetail,
    setPrimary,
    removeNode,
    updateLinkType,
    removeLink,
    addLink,
    renderHealthPanel,
    alertFn: notify,
  }) || null;
const evidenceCompletion =
  workspaceUiApi?.evidenceCompletion ||
  function fallbackEvidenceCompletion() {
    return { done: 0, total: 0, pct: 0 };
  };
const workspaceCompletion =
  workspaceUiApi?.workspaceCompletion ||
  function fallbackWorkspaceCompletion() {
    return { done: 0, total: 0, pct: 0 };
  };
const parentsOf =
  workspaceUiApi?.parentsOf ||
  function fallbackParentsOf() {
    return [];
  };
const buildAdjacency =
  workspaceUiApi?.buildAdjacency ||
  function fallbackBuildAdjacency() {
    return new Map();
  };
const renderWorkspace =
  workspaceUiApi?.renderWorkspace ||
  function fallbackRenderWorkspace() {};
const renderClaimTree =
  workspaceUiApi?.renderClaimTree ||
  function fallbackRenderClaimTree() {};
workspaceDraftsApi =
  workspaceDraftsFactory?.createWorkspaceDraftsApi?.({
    loadWorkspaceState,
    getConditionById: (id) => CONDITIONS.find((condition) => condition.id === id) || null,
    loadNotes,
    loadTimeline,
    loadEvidenceLinks,
    loadEvidenceState,
    evidenceCompletion,
    toSortableDateKey,
  }) || null;
secondaryConditionsApi =
  secondaryConditionsFactory?.createSecondaryConditionsApi?.({
    getConditions: () => CONDITIONS,
    getConditionById: (id) => CONDITIONS.find((condition) => condition.id === id) || null,
    loadEvidenceState,
    saveEvidenceState,
    ensureNode,
    renderWorkspace,
    showDetail,
    escapeHtml,
  }) || null;
const detailViewApi =
  detailViewFactory?.createDetailViewApi?.({
    escapeHtml,
    systemClassName,
    loadEvidenceState,
    TIMELINE_TYPES,
    EVIDENCE_LINK_TYPES,
  }) || null;
const buildReferencesHTML =
  detailViewApi?.buildReferencesHTML ||
  function fallbackBuildReferencesHTML() {
    return "";
  };
const buildDetailMarkup =
  detailViewApi?.buildDetailMarkup ||
  function fallbackBuildDetailMarkup() {
    return "";
  };
const detailInteractionsApi =
  detailInteractionsFactory?.createDetailInteractionsApi?.({
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
    alertFn: notify,
    confirmFn: confirmAction,
  }) || null;
const mountDetailInteractions =
  detailInteractionsApi?.mountDetailInteractions ||
  function fallbackMountDetailInteractions() {};
workspaceToolsApi =
  workspaceToolsFactory?.createWorkspaceToolsApi?.({
    getConditions: () => CONDITIONS,
    getConditionById: (id) => CONDITIONS.find((condition) => condition.id === id) || null,
    loadWorkspaceState,
    loadTimeline,
    ensureNode,
    renderWorkspace,
    renderClaimTree,
    renderHealthPanel,
    clearWorkspace,
    buildWorkspacePacketText,
    downloadText,
    exportHealthReport,
    fixLinkAllOrphansToPrimary,
    fixAttachDisconnectedToPrimary,
    makeSharePayload,
    base64UrlEncode,
    generateNarrativeDraft,
    workspaceTimelineDraft,
    isLinkedNode,
    workspaceEvidenceBinderDraft,
    renderBinderViewer,
    renderEvidenceGraph,
    alertFn: notify,
    confirmFn: confirmAction,
  }) || null;
const mountWorkspaceTools =
  workspaceToolsApi?.mountWorkspaceTools ||
  function fallbackMountWorkspaceTools() {};

function normalize(s) {
  return (s || "").toLowerCase().trim();
}

function notify(message, options) {
  const config = typeof options === "string" ? { type: options } : (options || {});
  if (notifierApi?.show) {
    notifierApi.show(message, config);
    return;
  }
  alert(message);
}

async function confirmAction(options) {
  if (confirmModalApi?.confirmAction) {
    return confirmModalApi.confirmAction(options);
  }
  return confirm(typeof options === "string" ? options : (options?.message || "Are you sure?"));
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

function addEvidenceRelation(urlA, urlB) {
  const a = normalizeUrl(urlA);
  const b = normalizeUrl(urlB);
  if (!a || !b) throw new Error("Both evidence URLs are required.");
  if (a === b) throw new Error("Cannot relate an evidence item to itself.");

  const rel = loadEvidenceRelations();
  rel[a] = Array.isArray(rel[a]) ? rel[a] : [];
  rel[b] = Array.isArray(rel[b]) ? rel[b] : [];

  if (!rel[a].includes(b)) rel[a].push(b);
  if (!rel[b].includes(a)) rel[b].push(a);

  saveEvidenceRelations(rel);
}

function removeEvidenceRelation(urlA, urlB) {
  const a = normalizeUrl(urlA);
  const b = normalizeUrl(urlB);
  const rel = loadEvidenceRelations();
  if (rel[a]) rel[a] = rel[a].filter(x => x !== b);
  if (rel[b]) rel[b] = rel[b].filter(x => x !== a);
  saveEvidenceRelations(rel);
}

function relatedEvidenceKeys(url) {
  const key = normalizeUrl(url);
  const rel = loadEvidenceRelations();
  return Array.isArray(rel[key]) ? rel[key] : [];
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

const REL_TYPES = [
  "Secondary to",
  "Aggravated by",
  "Due to / Caused by",
  "Associated with",
  "Increase (worsened)",
  "Direct (standalone)"
];

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
  if (!h.st.primaryId) return notify("Set a Primary first.", "error");
  let changed = 0;

  h.orphans.forEach(id => {
    try {
      addLink(h.st.primaryId, id, "Secondary to");
      changed++;
    } catch {}
  });

  notify(`Linked ${changed} orphan(s) to Primary.`, "success");
}

function fixAttachDisconnectedToPrimary() {
  const h = computeHealthSummary();
  if (!h.st.primaryId) return notify("Set a Primary first.", "error");
  let changed = 0;

  h.disconnected.forEach(id => {
    if (id === h.st.primaryId) return;
    try {
      addLink(h.st.primaryId, id, "Associated with");
      changed++;
    } catch {}
  });

  notify(`Attached ${changed} disconnected node(s) to Primary.`, "success");
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



function escapeRegExp(str) {
  return searchUiApi?.escapeRegExp?.(str) || "";
}

function highlight(text, query) {
  return searchUiApi?.highlight?.(text, query) || escapeHtml(text ?? "");
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
  return !!searchUiApi?.matches?.(condition, query);
}

function matchReason(condition, query) {
  return searchUiApi?.matchReason?.(condition, query) || "";
}

function cfrSummary(condition) {
  return searchUiApi?.cfrSummary?.(condition) || "";
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
  return searchUiApi?.scoreMatch?.(condition, query) || 0;
}

function renderResults(list) {
  return searchUiApi?.renderResults?.(list);
}

// --- Loading / skeleton helpers ---
function showLoadingResults() {
  return searchUiApi?.showLoadingResults?.();
}

function hideLoadingResults() {
  return searchUiApi?.hideLoadingResults?.();
}

function debounce(fn, wait) {
  let t;
  return function(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

searchUiApi =
  searchUiFactory?.createSearchUiApi?.({
    getConditions: () => CONDITIONS,
    parseCommandQuery,
    normalize,
    escapeHtml,
    systemClassName,
    debounce,
    showDetail,
    ensureNode,
    renderWorkspace,
    alertFn: notify,
  }) || null;
const mountSearchUi =
  searchUiApi?.mountSearchUi ||
  function fallbackMountSearchUi() {};



function renderDetail(item) {
  const el = document.getElementById("detail");
  el.classList.remove("hidden");
  el.innerHTML = buildDetailMarkup(item);

  // --- Copy link handler ---
  const btn = document.getElementById("copyLink");
  if (btn) {
    btn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(window.location.href);
      notify("Link copied!", "success");
    });
  }

  const wsAdd = document.getElementById("wsAdd");
  if (wsAdd) {
    wsAdd.addEventListener("click", () => {
      ensureNode(item.id);
      renderWorkspace();
      notify("Added to workspace!", "success");
    });
  }

  const wsAddSecondary = document.getElementById("wsAddSecondary");
  const secondaryLinkPanel = document.getElementById("secondaryLinkPanel");
  const secondaryLinkType = document.getElementById("secondaryLinkType");
  const secondaryLinkConfirm = document.getElementById("secondaryLinkConfirm");
  const secondaryLinkCancel = document.getElementById("secondaryLinkCancel");

  function hideSecondaryLinkPanel() {
    secondaryLinkPanel?.classList.add("hidden");
  }

  if (wsAddSecondary) {
    wsAddSecondary.addEventListener("click", () => {
      secondaryLinkType.value = "Secondary to";
      secondaryLinkPanel?.classList.remove("hidden");
    });
  }

  if (secondaryLinkCancel) {
    secondaryLinkCancel.addEventListener("click", hideSecondaryLinkPanel);
  }

  if (secondaryLinkConfirm) {
    secondaryLinkConfirm.addEventListener("click", () => {
      const st = loadWorkspaceState();
      ensureNode(item.id);

      const parent = st.primaryId || item.id;
      const relType = secondaryLinkType?.value || "Secondary to";

      try {
        addLink(parent, item.id, relType);
        renderWorkspace();
        hideSecondaryLinkPanel();
        notify(`Linked as: ${relType}`, "success");
      } catch (err) {
        notify(err.message || "That link would create a cycle.", "error");
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

      // Add to workspace as a linked secondary as a convenience
      secList.appendChild(renderSecondaryCard(chosen.id));
    });

    secList.appendChild(select);
  });
}

// Populate any existing linked secondary conditions (children) for this item
try {
  const stNow = loadWorkspaceState();
  const children = (stNow.links || []).filter(l => l.from === item.id).map(l => l.to);
  if (Array.isArray(children) && children.length) {
    children.forEach(cid => {
      secList.appendChild(renderSecondaryCard(cid));
    });
  }
} catch (e) {
  // ignore
}

// Helper: render a secondary condition card (with inline checklist) for a given condition id
function renderSecondaryCard(condId) {
  return secondaryConditionsApi?.renderSecondaryCard?.(condId) || document.createElement("div");
}

function COND_EVIDENCE_COUNT(condId) {
  return secondaryConditionsApi?.conditionEvidenceCount?.(condId) || 0;
}

function COND_EVIDENCE_DONE(condId) {
  return secondaryConditionsApi?.conditionEvidenceDone?.(condId) || 0;
}

  mountDetailInteractions(item);


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
  return workspaceDraftsApi?.shortCfrRefs?.(cond) || "";
}

function firstLine(s, fallback = "") {
  return workspaceDraftsApi?.firstLine?.(s, fallback) || fallback;
}

function roleLineForNode(nodeId, st) {
  return workspaceDraftsApi?.roleLineForNode?.(nodeId, st) || "Role: Unlinked (in workspace)";
}

function linkedToLines(nodeId, st) {
  return workspaceDraftsApi?.linkedToLines?.(nodeId, st) || [];
}

function isLinkedNode(nodeId, st) {
  return !!workspaceDraftsApi?.isLinkedNode?.(nodeId, st);
}

function relationshipSentence(childId, st) {
  return workspaceDraftsApi?.relationshipSentence?.(childId, st) || "";
}

function autoDraftParagraph(cond, st, style = "concise") {
  return workspaceDraftsApi?.autoDraftParagraph?.(cond, st, style) || "";
}

function workspaceTimelineDraft(scope = "all") {
  return workspaceDraftsApi?.workspaceTimelineDraft?.(scope) || "";
}

function generateNarrativeDraft(options = {}) {
  return workspaceDraftsApi?.generateNarrativeDraft?.(options) || "";
}

function normalizeUrl(u) {
  return (u || "").trim().toLowerCase();
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
          ${e.url ? `<div class="small"><a href="${escapeHtml(e.url)}" target="_blank" rel="noreferrer">Open link</a></div>` : ""}
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

      notify("Workspace imported from link!", "success");
    } catch (e) {
      console.error(e);
      notify("Could not import workspace from link (bad or corrupted token).", "error");
    }
  }

  if (!document.getElementById("q")) {
    console.error('Missing search input with id="q" in index.html');
    return;
  }
  if (!document.getElementById("systemFilter")) {
    console.error('Missing dropdown with id="systemFilter" in index.html');
    return;
  }

  // --- Help tip dismiss behavior: hide tips the user has dismissed and wire close buttons ---
  (function setupHelpTips() {
    try {
      document.querySelectorAll('.helpTip').forEach(el => {
        const id = el.dataset.tipId || '';
        if (!id) return;
        const key = `vaCfrTipDismissed:${id}`;
        const dismissed = localStorage.getItem(key) === '1';
        if (dismissed) el.style.display = 'none';

        const btn = el.querySelector('.tipClose');
        if (btn) {
          btn.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            try { localStorage.setItem(key, '1'); } catch (err) {}
            el.style.display = 'none';
          });
        }
      });
    } catch (e) { /* ignore */ }
  })();

  mountSearchUi();
  tryLoadFromPath(); // load /condition/:id if present
  mountWorkspaceTools();

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
