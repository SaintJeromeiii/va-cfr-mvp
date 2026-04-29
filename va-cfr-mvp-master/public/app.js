let CONDITIONS = [];
let LAST_INTAKE_ANALYSIS = null;
let PENDING_COVERAGE_FOCUS = null;
let EXTRACTOR_PACKET_COMPARE_STATE = { leftId: "", rightId: "" };
let EXTRACTOR_PACKET_FILTER_STATE = { tag: "", targetId: "" };
let EXTRACTOR_PACKET_SORT_STATE = "newest";
const WS_RATING_STATE_KEY = "vaCfrWorkspaceRatingEstimator:v1";
const WS_THEORY_STATE_KEY = "vaCfrWorkspaceTheories:v1";
const WS_RATING_SCENARIOS_KEY = "vaCfrWorkspaceRatingScenarios:v1";
const DOC_LIBRARY_KEY = "vaCfrDocumentLibrary:v1";
const EVIDENCE_LIBRARY_KEY = "vaCfrEvidenceLibrary:v1";
const EXTRACTOR_HISTORY_KEY = "vaCfrExtractorHistory:v1";
const EXTRACTOR_PACKET_LIBRARY_KEY = "vaCfrExtractorPacketLibrary:v1";
const WS_SNAPSHOT_HISTORY_KEY = "vaCfrWorkspaceSnapshotHistory:v1";
const WS_PANEL_STATE_KEY = "vaCfrWorkspacePanelState:v1";
const WS_PROFILES_KEY = "vaCfrWorkspaceProfiles:v1";
const WS_ACTIVE_PROFILE_KEY = "vaCfrActiveWorkspaceProfile:v1";
const WS_MILESTONES_KEY = "vaCfrClaimMilestones:v1";

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

const WORKSPACE_KEY = "vaCfrWorkspace:v4";
const WORKSPACE_SNAPSHOTS_KEY = "vaCfrWorkspaceSnapshots:v1";
const WORKSPACE_ACTIVITY_KEY = "vaCfrWorkspaceActivity:v1";
const RECENT_CONDITIONS_KEY = "vaCfrRecentConditions:v1";
const FAVORITE_CONDITIONS_KEY = "vaCfrFavoriteConditions:v1";
const ONBOARDING_WIZARD_KEY = "vaCfrOnboardingWizard:v1";
const HOME_USAGE_KEY = "vaCfrHomeUsage:v1";

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

function loadRecentConditions() {
  try {
    const raw = localStorage.getItem(RECENT_CONDITIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch (error) {
    return [];
  }
}

function saveRecentConditions(items) {
  localStorage.setItem(RECENT_CONDITIONS_KEY, JSON.stringify(Array.isArray(items) ? items : []));
}

function pushRecentCondition(id) {
  if (!id) return;
  const next = [id, ...loadRecentConditions().filter((value) => value !== id)].slice(0, 10);
  saveRecentConditions(next);
}

function loadFavoriteConditions() {
  try {
    const raw = localStorage.getItem(FAVORITE_CONDITIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch (error) {
    return [];
  }
}

function saveFavoriteConditions(items) {
  localStorage.setItem(FAVORITE_CONDITIONS_KEY, JSON.stringify(Array.isArray(items) ? items : []));
}

function toggleFavoriteCondition(id) {
  const current = loadFavoriteConditions();
  if (current.includes(id)) {
    saveFavoriteConditions(current.filter((value) => value !== id));
    return false;
  }
  saveFavoriteConditions([id, ...current].slice(0, 16));
  return true;
}

function loadOnboardingWizardState() {
  try {
    const raw = localStorage.getItem(ONBOARDING_WIZARD_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    return null;
  }
}

function saveOnboardingWizardState(state) {
  localStorage.setItem(ONBOARDING_WIZARD_KEY, JSON.stringify(state && typeof state === "object" ? state : {}));
}

function loadHomeUsageStats() {
  try {
    const raw = localStorage.getItem(HOME_USAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object"
      ? {
          conditions: parsed.conditions && typeof parsed.conditions === "object" ? parsed.conditions : {},
          bundles: parsed.bundles && typeof parsed.bundles === "object" ? parsed.bundles : {},
          plans: parsed.plans && typeof parsed.plans === "object" ? parsed.plans : {},
        }
      : { conditions: {}, bundles: {}, plans: {} };
  } catch (error) {
    return { conditions: {}, bundles: {}, plans: {} };
  }
}

function saveHomeUsageStats(stats) {
  localStorage.setItem(HOME_USAGE_KEY, JSON.stringify(stats && typeof stats === "object" ? stats : { conditions: {}, bundles: {}, plans: {} }));
}

function incrementHomeUsage(group, id) {
  if (!group || !id) return;
  const stats = loadHomeUsageStats();
  stats[group] = stats[group] && typeof stats[group] === "object" ? stats[group] : {};
  stats[group][id] = Number(stats[group][id] || 0) + 1;
  saveHomeUsageStats(stats);
}

function saveWorkspaceState(st) {
  localStorage.setItem(WORKSPACE_KEY, JSON.stringify(st || { nodes: [], primaryId: "", links: [] }));
}

function loadWorkspaceSnapshots() {
  try {
    const raw = localStorage.getItem(WORKSPACE_SNAPSHOTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveWorkspaceSnapshots(snapshots) {
  localStorage.setItem(WORKSPACE_SNAPSHOTS_KEY, JSON.stringify(Array.isArray(snapshots) ? snapshots : []));
}

function loadWorkspaceActivity() {
  try {
    const raw = localStorage.getItem(WORKSPACE_ACTIVITY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveWorkspaceActivity(items) {
  localStorage.setItem(WORKSPACE_ACTIVITY_KEY, JSON.stringify(Array.isArray(items) ? items : []));
}

function loadWorkspaceProfiles() {
  try {
    const raw = localStorage.getItem(WS_PROFILES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveWorkspaceProfiles(items) {
  localStorage.setItem(WS_PROFILES_KEY, JSON.stringify(Array.isArray(items) ? items : []));
}

function symptomFormKey(conditionId) {
  return `vaCfrSymptomForm:${conditionId}`;
}

function loadSymptomForm(conditionId) {
  try {
    const raw = localStorage.getItem(symptomFormKey(conditionId));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveSymptomForm(conditionId, value) {
  localStorage.setItem(symptomFormKey(conditionId), JSON.stringify(value && typeof value === "object" ? value : {}));
}

function loadClaimMilestones() {
  try {
    const raw = localStorage.getItem(WS_MILESTONES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveClaimMilestones(items) {
  localStorage.setItem(WS_MILESTONES_KEY, JSON.stringify(Array.isArray(items) ? items : []));
}

function loadActiveWorkspaceProfileId() {
  return localStorage.getItem(WS_ACTIVE_PROFILE_KEY) || "";
}

function saveActiveWorkspaceProfileId(id) {
  if (!id) {
    localStorage.removeItem(WS_ACTIVE_PROFILE_KEY);
    return;
  }
  localStorage.setItem(WS_ACTIVE_PROFILE_KEY, id);
}

function activeWorkspaceProfile() {
  const activeId = loadActiveWorkspaceProfileId();
  if (!activeId) return null;
  return loadWorkspaceProfiles().find((profile) => profile.id === activeId) || null;
}

function conditionNameById(id) {
  return CONDITIONS.find(c => c.id === id)?.name || id;
}

function pushWorkspaceActivity(title, detail) {
  const next = [
    {
      id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: (title || "").toString(),
      detail: (detail || "").toString(),
      createdAt: new Date().toISOString()
    },
    ...loadWorkspaceActivity()
  ].slice(0, 20);
  saveWorkspaceActivity(next);
}

function renderWorkspaceActivity() {
  const host = document.getElementById("wsActivityLog");
  if (!host) return;

  const items = loadWorkspaceActivity();
  host.innerHTML = items.length
    ? items.map(item => `
        <article class="activityItem">
          <strong>${escapeHtml(item.title || "Workspace update")}</strong>
          <div class="small">${escapeHtml(item.detail || "")}</div>
          <div class="small" style="margin-top:6px">${item.createdAt ? escapeHtml(new Date(item.createdAt).toLocaleString()) : ""}</div>
        </article>
      `).join("")
    : `<div class="small">No activity yet. Start adding conditions, links, or snapshots to build a claim timeline.</div>`;
}

function buildWorkspaceBackup() {
  const workspaceState = loadWorkspaceState();
  const conditionIds = new Set([
    ...(workspaceState.nodes || []),
    ...CONDITIONS.map(item => item.id)
  ]);
  const conditions = {};

  conditionIds.forEach(id => {
    const evidenceState = loadEvidenceState(id);
    const notes = loadNotes(id);
    const timeline = loadTimeline(id);
    const evidenceLinks = loadEvidenceLinks(id);
    const symptomForm = loadSymptomForm(id);
    const hasData =
      Object.keys(evidenceState || {}).length ||
      (notes || "").trim() ||
      (timeline || []).length ||
      (evidenceLinks || []).length ||
      Object.keys(symptomForm || {}).some((key) => String(symptomForm[key] || "").trim());

    if (!hasData && !workspaceState.nodes.includes(id)) return;

    conditions[id] = {
      evidenceState,
      notes,
      timeline,
      evidenceLinks,
      symptomForm
    };
  });

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    workspaceState,
    conditions,
    evidenceRelations: loadEvidenceRelations(),
    theories: loadTheoryState(),
    ratingScenarios: loadRatingScenarios(),
    claimMilestones: loadClaimMilestones(),
    documentLibrary: loadDocumentLibrary(),
    evidenceLibrary: loadEvidenceLibrary(),
    extractorPacketLibrary: loadExtractorPacketLibrary(),
    extractorHistory: loadExtractorHistory(),
    snapshots: loadWorkspaceSnapshots(),
    snapshotHistory: loadSnapshotHistory(),
    activity: loadWorkspaceActivity(),
    theme: localStorage.getItem("vaCfrTheme") || ""
  };
}

function applyWorkspaceBackup(backup) {
  if (!backup || typeof backup !== "object") {
    throw new Error("Backup file is not a valid object.");
  }

  const workspaceState = backup.workspaceState;
  if (!workspaceState || !Array.isArray(workspaceState.nodes) || !Array.isArray(workspaceState.links)) {
    throw new Error("Backup is missing a valid workspace state.");
  }

  saveWorkspaceState({
    nodes: workspaceState.nodes.filter(id => typeof id === "string"),
    primaryId: typeof workspaceState.primaryId === "string" ? workspaceState.primaryId : "",
    links: (workspaceState.links || []).filter(link => link && typeof link.from === "string" && typeof link.to === "string")
  });

  const allIds = new Set([
    ...CONDITIONS.map(item => item.id),
    ...Object.keys(backup.conditions || {}),
    ...(workspaceState.nodes || [])
  ]);

  allIds.forEach(id => {
    const item = backup.conditions?.[id] || {};
    saveEvidenceState(id, item.evidenceState || {});
    saveNotes(id, item.notes || "");
    saveTimeline(id, Array.isArray(item.timeline) ? item.timeline : []);
    saveEvidenceLinks(id, Array.isArray(item.evidenceLinks) ? item.evidenceLinks : []);
    saveSymptomForm(id, item.symptomForm && typeof item.symptomForm === "object" ? item.symptomForm : {});
  });

  saveEvidenceRelations(backup.evidenceRelations && typeof backup.evidenceRelations === "object" ? backup.evidenceRelations : {});
  saveTheoryState(Array.isArray(backup.theories) ? backup.theories : []);
  saveRatingScenarios(Array.isArray(backup.ratingScenarios) ? backup.ratingScenarios : []);
  saveClaimMilestones(Array.isArray(backup.claimMilestones) ? backup.claimMilestones : []);
  saveDocumentLibrary(Array.isArray(backup.documentLibrary) ? backup.documentLibrary : []);
  saveEvidenceLibrary(Array.isArray(backup.evidenceLibrary) ? backup.evidenceLibrary : []);
  saveExtractorPacketLibrary(Array.isArray(backup.extractorPacketLibrary) ? backup.extractorPacketLibrary : []);
  saveExtractorHistory(Array.isArray(backup.extractorHistory) ? backup.extractorHistory : []);
  saveWorkspaceSnapshots(Array.isArray(backup.snapshots) ? backup.snapshots : []);
  saveSnapshotHistory(Array.isArray(backup.snapshotHistory) ? backup.snapshotHistory : []);
  saveWorkspaceActivity(Array.isArray(backup.activity) ? backup.activity : []);

  if (typeof backup.theme === "string" && backup.theme) {
    localStorage.setItem("vaCfrTheme", backup.theme);
  }
}

function emptyWorkspaceBackup() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    workspaceState: { nodes: [], primaryId: "", links: [] },
    conditions: {},
    evidenceRelations: {},
    theories: [],
    ratingScenarios: [],
    claimMilestones: [],
    documentLibrary: [],
    evidenceLibrary: [],
    extractorPacketLibrary: [],
    extractorHistory: [],
    snapshots: [],
    snapshotHistory: [],
    activity: [],
    theme: localStorage.getItem("vaCfrTheme") || ""
  };
}

function workspaceProfileSummary(profile) {
  const backup = profile?.backup || {};
  const wsState = backup.workspaceState || { nodes: [], links: [] };
  const nodes = Array.isArray(wsState.nodes) ? wsState.nodes.length : 0;
  const links = Array.isArray(wsState.links) ? wsState.links.length : 0;
  const snapshots = Array.isArray(backup.snapshots) ? backup.snapshots.length : 0;
  return `${nodes} condition${nodes === 1 ? "" : "s"} • ${links} link${links === 1 ? "" : "s"} • ${snapshots} restore point${snapshots === 1 ? "" : "s"}`;
}

function buildWorkspaceProfile(options = {}) {
  const now = new Date().toISOString();
  return {
    id: options.id || `profile-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: (options.name || "").trim() || `Claim Workspace ${new Date().toLocaleString()}`,
    notes: (options.notes || "").trim(),
    createdAt: options.createdAt || now,
    updatedAt: now,
    backup: options.backup || buildWorkspaceBackup()
  };
}

function getConditionGuidedFormSchema(item) {
  const name = `${item?.name || ""} ${(item?.aliases || []).join(" ")}`.toLowerCase();
  const body = (item?.body_system || "").toLowerCase();

  if (/migraine|headache/.test(name)) {
    return {
      title: "Migraine / Headache Form",
      fields: [
        { key: "frequency", label: "Headache frequency", placeholder: "e.g. 3-4 times per week" },
        { key: "prostrating", label: "Prostrating attacks", placeholder: "e.g. 2 times per month and requires lying down" },
        { key: "workImpact", label: "Work / concentration impact", placeholder: "Missed work, reduced focus, dark room, etc." },
        { key: "treatment", label: "Treatment / medication", placeholder: "Neurology visits, meds, ER care, etc." },
      ],
    };
  }

  if (/ptsd|depression|anxiety|mental/.test(name) || /mental/.test(body)) {
    return {
      title: "Mental Health Form",
      fields: [
        { key: "occupationalImpact", label: "Occupational impact", placeholder: "Missed work, isolation, concentration issues, etc." },
        { key: "socialImpact", label: "Social impact", placeholder: "Relationships, crowds, trust, irritability, etc." },
        { key: "sleep", label: "Sleep disruption", placeholder: "Insomnia, nightmares, CPAP issues, fatigue, etc." },
        { key: "treatment", label: "Treatment history", placeholder: "Therapy, medication changes, hospitalization, etc." },
      ],
    };
  }

  if (/back|spine|radicul|sciatic|knee|ankle|hip|shoulder/.test(name) || /musculoskel|neurolog/.test(body)) {
    return {
      title: "Musculoskeletal / Nerve Form",
      fields: [
        { key: "flareUps", label: "Flare-ups", placeholder: "How often, how long, what triggers them" },
        { key: "movementLimits", label: "Movement limits", placeholder: "Bending, lifting, range of motion, numbness, etc." },
        { key: "walkingStanding", label: "Walking / standing limits", placeholder: "Distance, time, cane, brace, falls, etc." },
        { key: "treatment", label: "Treatment / therapy", placeholder: "PT, injections, meds, surgery, etc." },
      ],
    };
  }

  if (/sleep/.test(name)) {
    return {
      title: "Sleep / Fatigue Form",
      fields: [
        { key: "study", label: "Sleep study / diagnosis", placeholder: "Date, provider, key findings" },
        { key: "cpap", label: "CPAP / treatment use", placeholder: "Prescribed, tolerated, difficulties, etc." },
        { key: "daytime", label: "Daytime impact", placeholder: "Fatigue, naps, driving risk, concentration, etc." },
        { key: "worsening", label: "Worsening pattern", placeholder: "How symptoms changed over time" },
      ],
    };
  }

  if (/gerd|reflux|heartburn|ibs|bowel/.test(name) || /digestive/.test(body)) {
    return {
      title: "Digestive Condition Form",
      fields: [
        { key: "frequency", label: "Frequency of episodes", placeholder: "How often reflux, urgency, diarrhea, constipation, etc. happen" },
        { key: "triggerFoods", label: "Food / trigger pattern", placeholder: "Meals, stress, meds, nighttime symptoms, etc." },
        { key: "functionalImpact", label: "Functional impact", placeholder: "Sleep interruption, bathroom urgency, missed work, diet restrictions, etc." },
        { key: "treatment", label: "Treatment / medication", placeholder: "GI meds, diet changes, scopes, specialist visits, etc." },
      ],
    };
  }

  if (/tinnitus|hearing/.test(name) || /auditory/.test(body)) {
    return {
      title: "Auditory Form",
      fields: [
        { key: "noiseExposure", label: "Noise exposure history", placeholder: "Weapons, aircraft, machinery, etc." },
        { key: "onset", label: "Symptom onset / continuity", placeholder: "When ringing or hearing issues began" },
        { key: "dailyImpact", label: "Daily impact", placeholder: "Sleep, focus, conversation, TV, etc." },
        { key: "treatment", label: "Treatment / audiology", placeholder: "Hearing tests, aids, audiology visits, etc." },
      ],
    };
  }

  return {
    title: "General Condition Form",
    fields: [
      { key: "symptoms", label: "Symptoms", placeholder: "What is happening and how often?" },
      { key: "impact", label: "Functional impact", placeholder: "Work, sleep, mobility, concentration, relationships, etc." },
      { key: "treatment", label: "Treatment history", placeholder: "Provider visits, meds, therapy, devices, etc." },
      { key: "timeline", label: "Timeline summary", placeholder: "Onset, worsening, diagnosis, exams, etc." },
    ],
  };
}

function buildSymptomFormSummary(item, values = {}) {
  const schema = getConditionGuidedFormSchema(item);
  const lines = [`[${schema.title}]`];
  schema.fields.forEach((field) => {
    const value = (values[field.key] || "").trim();
    if (value) lines.push(`${field.label}: ${value}`);
  });
  return lines.length > 1 ? lines.join("\n") : "";
}

function analyzeEvidenceConflicts(records = null, workspaceState = loadWorkspaceState()) {
  const library = Array.isArray(records) ? records : loadEvidenceLibrary();
  const byUrl = new Map();
  const byLabel = new Map();
  const findings = [];

  library.forEach((record) => {
    const url = normalizeUrl(record.url || "");
    const label = normalize((record.label || "").replace(/\s+/g, " "));
    if (url) {
      const arr = byUrl.get(url) || [];
      arr.push(record);
      byUrl.set(url, arr);
    }
    if (label) {
      const arr = byLabel.get(label) || [];
      arr.push(record);
      byLabel.set(label, arr);
    }
  });

  for (const [url, rows] of byUrl.entries()) {
    if (rows.length > 1) {
      findings.push({
        type: "duplicate-url",
        severity: "warn",
        title: `Duplicate URL: ${rows[0].url || url}`,
        detail: `${rows.length} evidence records share this same URL.`,
      });
    }
  }

  for (const [label, rows] of byLabel.entries()) {
    if (rows.length > 1) {
      findings.push({
        type: "duplicate-label",
        severity: "warn",
        title: `Possible duplicate label: ${rows[0].label || label}`,
        detail: `${rows.length} evidence records share this same label.`,
      });
    }
  }

  const attached = [];
  (workspaceState.nodes || []).forEach((id) => {
    loadEvidenceLinks(id).forEach((link) => {
      attached.push({ conditionId: id, conditionName: conditionNameById(id), ...link });
    });
  });

  const attachmentByUrl = new Map();
  attached.forEach((entry) => {
    const url = normalizeUrl(entry.url || "");
    if (!url) return;
    const arr = attachmentByUrl.get(url) || [];
    arr.push(entry);
    attachmentByUrl.set(url, arr);
  });

  for (const [, rows] of attachmentByUrl.entries()) {
    const types = [...new Set(rows.map((row) => row.type).filter(Boolean))];
    const dates = [...new Set(rows.map((row) => row.date).filter(Boolean))];
    if (types.length > 1) {
      findings.push({
        type: "conflicting-type",
        severity: "info",
        title: `Conflicting evidence type labels for ${rows[0].label || rows[0].url || "record"}`,
        detail: `Attached with multiple types: ${types.join(", ")}.`,
      });
    }
    if (dates.length > 1) {
      findings.push({
        type: "conflicting-date",
        severity: "warn",
        title: `Conflicting dates for ${rows[0].label || rows[0].url || "record"}`,
        detail: `Attached with multiple dates: ${dates.join(", ")}.`,
      });
    }
  }

  return findings;
}

function buildRepresentativeHandoffText() {
  const dashboard = computeWorkspaceDashboardData();
  const primary = dashboard.st.primaryId ? CONDITIONS.find((condition) => condition.id === dashboard.st.primaryId) : null;
  const conflicts = analyzeEvidenceConflicts();
  const lines = [];
  lines.push("VA CFR Finder — Representative Handoff Workspace");
  lines.push(new Date().toLocaleString());
  lines.push("");
  lines.push(`Primary condition: ${primary ? primary.name : "(not set)"}`);
  lines.push(`Overall packet review: ${dashboard.review.summary.errors} errors, ${dashboard.review.summary.warnings} warnings, ${dashboard.review.summary.infos} info notes`);
  lines.push(`Evidence conflicts: ${conflicts.length}`);
  lines.push("");
  lines.push("Strongest theories / conditions:");
  (dashboard.strongest.length ? dashboard.strongest : []).forEach((row) => lines.push(`- ${row.item.name}: ${row.readiness.overall}% readiness, ${row.strength.label} support`));
  if (!dashboard.strongest.length) lines.push("- No conditions staged yet.");
  lines.push("");
  lines.push("Weakest conditions needing review:");
  (dashboard.weakest.length ? dashboard.weakest : []).forEach((row) => lines.push(`- ${row.item.name}: ${row.readiness.nextAction}`));
  if (!dashboard.weakest.length) lines.push("- No obvious weak spots detected.");
  lines.push("");
  lines.push("Evidence conflict / duplicate review:");
  if (conflicts.length) conflicts.slice(0, 8).forEach((finding) => lines.push(`- ${finding.title}: ${finding.detail}`));
  else lines.push("- No obvious evidence duplicates or conflicts detected.");
  lines.push("");
  lines.push("Top next actions:");
  dashboard.topActions.forEach((finding) => lines.push(`- ${finding.text}`));
  if (!dashboard.topActions.length) lines.push("- No urgent blockers detected.");
  lines.push("");
  lines.push("Use this workspace as a representative-facing summary only. Verify dates, records, CFR references, and rating assumptions before filing or advising.");
  return lines.join("\n");
}

function renderRepresentativeReviewSummary() {
  const host = document.getElementById("wsRepReviewSummary");
  if (!host) return;

  const dashboard = computeWorkspaceDashboardData();
  const conflicts = analyzeEvidenceConflicts();
  host.innerHTML = `
    <article class="builderSuggestionCard">
      <div class="builderSuggestionTop">
        <div>
          <strong>Representative Review Snapshot</strong>
          <div class="small">Use this as a quick triage layer before generating the full handoff text.</div>
        </div>
        <span class="provenanceTag prov-generated">Review mode</span>
      </div>
      <div class="small" style="margin-top:10px"><strong>Strongest issues:</strong> ${dashboard.strongest.length ? escapeHtml(dashboard.strongest.map((row) => row.item.name).join(", ")) : "none staged yet"}</div>
      <div class="small" style="margin-top:6px"><strong>Weakest issues:</strong> ${dashboard.weakest.length ? escapeHtml(dashboard.weakest.map((row) => row.item.name).join(", ")) : "none obvious yet"}</div>
      <div class="small" style="margin-top:6px"><strong>Evidence conflicts:</strong> ${conflicts.length ? escapeHtml(conflicts.slice(0, 2).map((item) => item.title).join(" | ")) : "none obvious"}</div>
      <div class="small" style="margin-top:6px"><strong>Top review items:</strong> ${dashboard.topActions.length ? escapeHtml(dashboard.topActions.map((item) => item.text).join(" | ")) : "no urgent blockers detected"}</div>
    </article>
  `;
}

function computeActionEngine() {
  const dashboard = computeWorkspaceDashboardData();
  const conflicts = analyzeEvidenceConflicts();
  const milestones = loadClaimMilestones();
  const actions = [];
  dashboard.topActions.forEach((finding, index) => {
    actions.push({
      id: `packet-${index}`,
      title: finding.text,
      kind: "review",
      severity: finding.severity,
    });
  });
  if (!milestones.length) {
    actions.push({
      id: "milestone-start",
      title: "Add key claim milestones like intent to file, diagnosis, C&P exam, or decision date.",
      kind: "milestones",
      severity: "info",
    });
  }
  conflicts.slice(0, 3).forEach((finding, index) => {
    actions.push({
      id: `conflict-${index}`,
      title: `${finding.title}: ${finding.detail}`,
      kind: "conflicts",
      severity: finding.severity,
    });
  });
  return actions.slice(0, 6);
}

function buildMilestonesCsv(items = loadClaimMilestones()) {
  const rows = [["date", "stage", "note"]];
  items.forEach((item) => {
    rows.push([item.date || "", item.stage || "", item.note || ""]);
  });
  return rows.map((row) => row.map((cell) => `"${String(cell || "").replaceAll('"', '""')}"`).join(",")).join("\n");
}

function parseEvidenceCsv(text) {
  const lines = (text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].toLowerCase();
  const rows = lines.slice(1);
  return rows.map((line) => {
    const cols = line.match(/("([^"]|"")*"|[^,]+)/g)?.map((cell) => cell.replace(/^"|"$/g, "").replaceAll('""', '"').trim()) || [];
    if (header.includes("label") && cols.length) {
      return createEvidenceLibraryRecord({
        label: cols[0] || "",
        url: cols[1] || "",
        type: cols[2] || "Other",
        excerpt: cols[3] || "",
        tags: (cols[4] || "").replaceAll(";", ","),
      });
    }
    return null;
  }).filter(Boolean);
}

function buildEvidenceLibraryCsv(records = loadEvidenceLibrary()) {
  const rows = [["label", "url", "type", "excerpt", "tags"]];
  records.forEach((record) => {
    rows.push([
      record.label || "",
      record.url || "",
      record.type || "",
      record.excerpt || "",
      Array.isArray(record.tags) ? record.tags.join("; ") : "",
    ]);
  });
  return rows
    .map((row) => row.map((cell) => `"${String(cell || "").replaceAll('"', '""')}"`).join(","))
    .join("\n");
}

function buildAdjacencyFromLinks(links) {
  const adj = new Map();
  (links || []).forEach(l => {
    if (!adj.has(l.from)) adj.set(l.from, []);
    adj.get(l.from).push(l.to);
  });
  return adj;
}

function renderActionEngine() {
  const host = document.getElementById("wsActionEngine");
  if (!host) return;

  const actions = computeActionEngine();
  host.innerHTML = actions.length
    ? actions.map((action) => `
        <article class="builderSuggestionCard">
          <div class="builderSuggestionTop">
            <div>
              <strong>${escapeHtml(action.title)}</strong>
              <div class="small">Priority: ${escapeHtml(action.severity || "info")} • action type: ${escapeHtml(action.kind || "review")}</div>
            </div>
            <button class="miniBtn" data-action-jump="${escapeHtml(action.kind || "review")}" type="button">Open</button>
          </div>
        </article>
      `).join("")
    : `<div class="small">No urgent next actions detected right now.</div>`;

  host.querySelectorAll("[data-action-jump]").forEach((button) => {
    button.addEventListener("click", () => {
      const map = {
        review: "ws-review-panel",
        milestones: "ws-milestones-panel",
        conflicts: "ws-conflicts-panel",
      };
      const targetId = map[button.dataset.actionJump] || "ws-overview-panel";
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function renderEvidenceConflictEngine() {
  const host = document.getElementById("wsConflictsList");
  if (!host) return;

  const findings = analyzeEvidenceConflicts();
  host.innerHTML = findings.length
    ? findings.map((finding) => `
        <article class="builderSuggestionCard">
          <div class="builderSuggestionTop">
            <div>
              <strong>${escapeHtml(finding.title)}</strong>
              <div class="small">${escapeHtml(finding.detail)}</div>
            </div>
            <span class="provenanceTag ${finding.severity === "warn" ? "prov-inferred" : "prov-generated"}">${escapeHtml(finding.severity || "info")}</span>
          </div>
        </article>
      `).join("")
    : `<div class="small">No obvious duplicate or conflict signals were found in the evidence library or attached evidence links.</div>`;
}

function renderClaimMilestones() {
  const host = document.getElementById("wsMilestoneList");
  if (!host) return;

  const items = loadClaimMilestones().slice().sort((a, b) => {
    const da = toSortableDateKey(a.date);
    const db = toSortableDateKey(b.date);
    if (da !== db) return da.localeCompare(db);
    return (a.stage || "").localeCompare(b.stage || "");
  });

  host.innerHTML = items.length
    ? items.map((item) => `
        <article class="snapshotItem">
          <div class="snapshotMeta">
            <strong>${escapeHtml(item.stage || "Milestone")}</strong>
            <div class="small">${escapeHtml(item.date || "(date not set)")}${item.note ? ` • ${escapeHtml(item.note)}` : ""}</div>
          </div>
          <div class="healthBtns" style="margin-top:0">
            <button class="miniBtn danger" data-milestone-rm="${escapeHtml(item.id)}" type="button">Remove</button>
          </div>
        </article>
      `).join("")
    : `<div class="small">No claim-stage milestones saved yet. Track intent to file, diagnosis dates, worsening points, C&P exams, decisions, and appeals here.</div>`;

  host.querySelectorAll("[data-milestone-rm]").forEach((button) => {
    button.addEventListener("click", () => {
      const current = loadClaimMilestones();
      const next = current.filter((item) => item.id !== button.dataset.milestoneRm);
      saveClaimMilestones(next);
      pushWorkspaceActivity("Milestone removed", "A claim-stage milestone was removed from the tracker.");
      renderClaimMilestones();
      renderWorkspaceActivity();
      renderActionEngine();
    });
  });
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
  const lowReadinessIds = items
    .filter((item) => {
      const evidence = evidenceCompletion(item, loadEvidenceState(item.id));
      const strength = evidenceStrength(item, st);
      return evidence.pct < 50 || strength.label === "Weak";
    })
    .map(item => item.id);

  const cfrCheck = countBrokenCfr(items);
  const notesMiss = missingNotes(items);
  const gapCounts = {
    diagnosis: 0,
    severity: 0,
    timeline: 0,
    support: 0,
    checklist: 0
  };

  items.forEach((item) => {
    const gaps = granularGapsForCondition(item, st);
    gaps.forEach((gap) => {
      if (gap.includes("diagnosis")) gapCounts.diagnosis += 1;
      else if (gap.includes("severity")) gapCounts.severity += 1;
      else if (gap.includes("timeline")) gapCounts.timeline += 1;
      else if (gap.includes("relationship")) gapCounts.support += 1;
      else if (gap.includes("checklist")) gapCounts.checklist += 1;
    });
  });

  return {
    st,
    items,
    evidence: { done, total, pct, lowReadiness: lowReadinessIds.length > 0, lowReadinessIds },
    orphans,
    disconnected,
    brokenCfr: cfrCheck,
    notesMissingIds: notesMiss,
    gapCounts
  };
}

function renderHealthPanel() {
  const el = document.getElementById("wsHealth");
  if (!el) return;

  const h = computeHealthSummary();
  const itemName = (id) => CONDITIONS.find(c => c.id === id)?.name || id;

  const row = (label, value, tag) => `
    <div class="healthRow">
      <div>${label}</div>
      <div><span class="healthTag">${tag}</span> ${value}</div>
    </div>
  `;

  const actions = [];
  const pushAction = (priority, kind, id, label, cta) => {
    actions.push({ priority, kind, id, label, cta });
  };

  const primaryName = h.st.primaryId
    ? (CONDITIONS.find(c => c.id === h.st.primaryId)?.name || h.st.primaryId)
    : "(none)";

  if (!h.st.primaryId && h.items.length) {
    const first = h.items[0];
    if (first) {
      pushAction(0, "set-primary", first.id, `Set a Primary condition to anchor the workspace tree. Suggested start: ${first.name}.`, "Set Primary");
    }
  }

  h.orphans.forEach(id => {
    pushAction(
      1,
      h.st.primaryId ? "link-primary" : "open",
      id,
      h.st.primaryId
        ? `${itemName(id)} is orphaned. Link it to the current Primary to bring it into the claim chain.`
        : `${itemName(id)} is orphaned. Open it and decide where it belongs before exporting.`,
      h.st.primaryId ? "Link to Primary" : "Open"
    );
  });

  h.notesMissingIds.forEach(id => {
    pushAction(2, "open", id, `${itemName(id)} is linked but still missing notes about timeline, nexus, or supporting detail.`, "Open Notes");
  });

  h.evidence.lowReadinessIds.forEach(id => {
    pushAction(3, "open", id, `${itemName(id)} still has checklist gaps that are lowering readiness.`, "Open Checklist");
  });

  h.brokenCfr.examples.forEach(id => {
    pushAction(4, "open", id, `${itemName(id)} has CFR reference data that should be reviewed before relying on it.`, "Review");
  });

  const topActions = actions
    .sort((a, b) => a.priority - b.priority || a.label.localeCompare(b.label))
    .slice(0, 6);

  el.innerHTML = `
    ${row("Primary", escapeHtml(primaryName), "INFO")}
    ${row("Evidence Readiness", `${h.evidence.done}/${h.evidence.total} (${h.evidence.pct}%)`, h.evidence.lowReadiness ? "LOW" : "OK")}
    ${row("Orphans (no parents)", `${h.orphans.length}`, h.orphans.length ? "WARN" : "OK")}
    ${row("Disconnected from Primary", `${h.disconnected.length}`, h.disconnected.length ? "WARN" : "OK")}
    ${row("Broken CFR refs", `${h.brokenCfr.broken}${h.brokenCfr.examples.length ? ` (e.g., ${escapeHtml(h.brokenCfr.examples.join(", "))})` : ""}`, h.brokenCfr.broken ? "WARN" : "OK")}
    ${row("Linked items missing notes", `${h.notesMissingIds.length}`, h.notesMissingIds.length ? "HINT" : "OK")}
    ${row("Diagnosis detail gaps", `${h.gapCounts.diagnosis}`, h.gapCounts.diagnosis ? "HINT" : "OK")}
    ${row("Severity / impact gaps", `${h.gapCounts.severity}`, h.gapCounts.severity ? "HINT" : "OK")}
    ${row("Timeline gaps", `${h.gapCounts.timeline}`, h.gapCounts.timeline ? "HINT" : "OK")}
    ${row("Relationship support gaps", `${h.gapCounts.support}`, h.gapCounts.support ? "HINT" : "OK")}
    <div class="healthQueue">
      <div class="healthQueueHead">
        <strong>Action Queue</strong>
        <span class="small">${topActions.length ? `${topActions.length} next step${topActions.length === 1 ? "" : "s"}` : "No urgent blockers"}</span>
      </div>
      ${
        topActions.length
          ? topActions.map((action) => `
              <div class="healthQueueRow">
                <div class="small">${escapeHtml(action.label)}</div>
                <button class="miniBtn" data-health-action="${escapeHtml(action.kind)}" data-health-id="${escapeHtml(action.id)}" type="button">${escapeHtml(action.cta)}</button>
              </div>
            `).join("")
          : `<div class="small">The workspace looks healthy right now. Use the narrative, timeline, or binder tools to keep building.</div>`
      }
    </div>
  `;

  el.querySelectorAll("button[data-health-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const kind = button.dataset.healthAction || "";
      const id = button.dataset.healthId || "";
      if (!id) return;

      if (kind === "set-primary") {
        setPrimary(id);
        renderWorkspace();
        renderClaimTree();
        renderHealthPanel();
        return;
      }

      if (kind === "link-primary") {
        const st = loadWorkspaceState();
        if (!st.primaryId) {
          showDetail(id, true);
          document.getElementById("detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
        try {
          addLink(st.primaryId, id, "Secondary to");
          renderWorkspace();
          renderClaimTree();
          renderHealthPanel();
        } catch (error) {
          alert(error.message || "Could not link this item to the Primary condition.");
        }
        return;
      }

      showDetail(id, true);
      document.getElementById("detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
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
  lines.push(`Diagnosis detail gaps: ${h.gapCounts.diagnosis}`);
  lines.push(`Severity / impact gaps: ${h.gapCounts.severity}`);
  lines.push(`Timeline gaps: ${h.gapCounts.timeline}`);
  lines.push(`Relationship support gaps: ${h.gapCounts.support}`);
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
  const added = !st.nodes.includes(id);
  if (added) st.nodes.push(id);
  if (!st.primaryId) st.primaryId = id;
  saveWorkspaceState(st);
  if (added) pushWorkspaceActivity("Condition added", `${conditionNameById(id)} was added to the workspace.`);
  return st;
}

function setPrimary(id) {
  const st = ensureNode(id);
  st.primaryId = id;

  // optional: remove self-referential links
  st.links = st.links.filter(l => l.from !== l.to);

  saveWorkspaceState(st);
  pushWorkspaceActivity("Primary updated", `${conditionNameById(id)} is now the Primary condition.`);
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
  const existed = (st.links || []).some(l => l.from === fromId && l.to === toId && (l.type || "Secondary to") === type);
  st.links = st.links.filter(l => !(l.from === fromId && l.to === toId));
  st.links.push({ from: fromId, to: toId, type });

  saveWorkspaceState(st);
  if (!existed) {
    pushWorkspaceActivity("Relationship added", `${conditionNameById(toId)} was linked to ${conditionNameById(fromId)} as ${type}.`);
  }
  return st;
}

function removeLink(fromId, toId) {
  const st = loadWorkspaceState();
  st.links = (st.links || []).filter(l => !(l.from === fromId && l.to === toId));
  saveWorkspaceState(st);
  pushWorkspaceActivity("Relationship removed", `${conditionNameById(toId)} was unlinked from ${conditionNameById(fromId)}.`);
  return st;
}

function updateLinkType(fromId, toId, type) {
  const st = loadWorkspaceState();
  const link = (st.links || []).find(l => l.from === fromId && l.to === toId);
  if (link) link.type = type || "Secondary to";
  saveWorkspaceState(st);
  if (link) {
    pushWorkspaceActivity("Relationship updated", `${conditionNameById(toId)} is now marked as ${link.type} ${conditionNameById(fromId)}.`);
  }
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
  saveTheoryState(loadTheoryState().filter((theory) => theory.subjectId !== id && theory.parentId !== id));
  const ratingState = loadRatingEstimatorState();
  if (ratingState.projected && typeof ratingState.projected === "object") {
    delete ratingState.projected[id];
    saveRatingEstimatorState(ratingState);
  }
  saveRatingScenarios(loadRatingScenarios().map((scenario) => ({
    ...scenario,
    state: {
      currentRating: Number(scenario.state?.currentRating || 0) || 0,
      projected: Object.fromEntries(Object.entries(scenario.state?.projected || {}).filter(([key]) => key !== id))
    }
  })));
  pushWorkspaceActivity("Condition removed", `${conditionNameById(id)} was removed from the workspace.`);
  return st;
}

function clearWorkspace() {
  saveWorkspaceState({ nodes: [], primaryId: "", links: [] });
  saveTheoryState([]);
  saveRatingEstimatorState({ currentRating: 0, projected: {} });
  saveRatingScenarios([]);
  saveClaimMilestones([]);
  CONDITIONS.forEach((item) => saveSymptomForm(item.id, {}));
  pushWorkspaceActivity("Workspace cleared", "The workspace tree, links, and readiness state were cleared.");
}

function workspaceSummary(st) {
  const state = st || loadWorkspaceState();
  const items = (state.nodes || []).map(id => CONDITIONS.find(c => c.id === id)).filter(Boolean);
  const primary = state.primaryId ? CONDITIONS.find(c => c.id === state.primaryId) : null;
  const completion = workspaceCompletion(items);
  return {
    primaryName: primary?.name || "",
    nodeCount: items.length,
    linkCount: (state.links || []).length,
    readinessText: `${completion.done}/${completion.total}`
  };
}

function summarizeSnapshot(snapshot) {
  const summary = snapshot?.summary || {};
  const parts = [];
  if (snapshot?.milestone) parts.push(snapshot.milestone);
  if (summary.primaryName) parts.push(`Primary: ${summary.primaryName}`);
  parts.push(`${summary.nodeCount || 0} conditions`);
  parts.push(`${summary.linkCount || 0} links`);
  parts.push(`Readiness ${summary.readinessText || "0/0"}`);
  return parts.join(" • ");
}

function analyzeTimelineConflicts(entriesByCondition = {}) {
  const conflicts = [];
  const datePattern = /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/;

  Object.entries(entriesByCondition).forEach(([conditionName, entries]) => {
    const arr = Array.isArray(entries) ? entries : [];
    const byDate = new Map();

    arr.forEach((entry) => {
      const date = (entry?.date || "").trim();
      if (!date || !datePattern.test(date)) {
        conflicts.push(`${conditionName}: has an entry with a missing or invalid date.`);
        return;
      }

      const compareDate = new Date(`${date.length === 4 ? `${date}-01-01` : date.length === 7 ? `${date}-01` : date}T00:00:00`);
      if (!Number.isNaN(compareDate.valueOf()) && compareDate > new Date()) {
        conflicts.push(`${conditionName}: has a future timeline date (${date}).`);
      }

      const list = byDate.get(date) || [];
      list.push(entry);
      byDate.set(date, list);
    });

    byDate.forEach((sameDateEntries, date) => {
      const types = [...new Set(sameDateEntries.map((entry) => entry?.type || "Other"))];
      if (sameDateEntries.length > 1 && types.length > 1) {
        conflicts.push(`${conditionName}: has multiple event types on ${date} (${types.join(", ")}). Review whether those entries should be merged or clarified.`);
      }
    });
  });

  return conflicts;
}

function filterWorkspaceItems(items, filters = {}, workspaceState = loadWorkspaceState()) {
  const query = normalize(filters.search || "");
  const supportFilter = normalize(filters.support || "");
  const statusFilter = normalize(filters.status || "");
  const systemFilter = normalize(filters.system || "");
  const notesFilter = normalize(filters.notes || "");

  return (items || []).filter((item) => {
    const notes = (loadNotes(item.id) || "").trim();
    const strength = evidenceStrength(item, workspaceState).label.toLowerCase();
    const isPrimaryItem = item.id === workspaceState.primaryId;
    const isLinkedItem = parentsOf(item.id, workspaceState.links).length > 0;
    const orphan = isOrphan(item.id, workspaceState);
    const haystack = [
      item.name,
      item.id,
      item.body_system,
      notes
    ].filter(Boolean).join(" ").toLowerCase();

    if (query && !haystack.includes(query)) return false;
    if (supportFilter && strength !== supportFilter) return false;
    if (systemFilter && normalize(item.body_system || "") !== systemFilter) return false;
    if (notesFilter === "missing" && notes) return false;
    if (notesFilter === "present" && !notes) return false;
    if (statusFilter === "primary" && !isPrimaryItem) return false;
    if (statusFilter === "linked" && !isLinkedItem) return false;
    if (statusFilter === "orphan" && !orphan) return false;
    if (statusFilter === "unlinked" && (isPrimaryItem || isLinkedItem)) return false;
    return true;
  });
}

function linkKey(link) {
  return `${link?.from || ""}->${link?.to || ""}:${link?.type || "Secondary to"}`;
}

function workspaceSnapshotDiff(snapshot) {
  const current = buildWorkspaceSnapshot("Current workspace");
  const saved = snapshot || {};
  const currentState = current.payload?.workspaceState || { nodes: [], primaryId: "", links: [] };
  const savedState = saved.payload?.workspaceState || { nodes: [], primaryId: "", links: [] };

  const currentIds = new Set((currentState.nodes || []).filter(Boolean));
  const savedIds = new Set((savedState.nodes || []).filter(Boolean));
  const currentLinks = new Set((currentState.links || []).map(linkKey));
  const savedLinks = new Set((savedState.links || []).map(linkKey));
  const addedIds = [...savedIds].filter(id => !currentIds.has(id));
  const removedIds = [...currentIds].filter(id => !savedIds.has(id));
  const addedLinks = [...savedLinks].filter(key => !currentLinks.has(key));
  const removedLinks = [...currentLinks].filter(key => !savedLinks.has(key));

  const allIds = new Set([...currentIds, ...savedIds]);
  const contentChanges = [];
  allIds.forEach(id => {
    const currentItem = current.payload?.conditions?.[id] || {};
    const savedItem = saved.payload?.conditions?.[id] || {};
    const deltas = [];

    if ((currentItem.notes || "") !== (savedItem.notes || "")) deltas.push("notes");
    if (JSON.stringify(currentItem.timeline || []) !== JSON.stringify(savedItem.timeline || [])) deltas.push("timeline");
    if (JSON.stringify(currentItem.evidenceLinks || []) !== JSON.stringify(savedItem.evidenceLinks || [])) deltas.push("evidence links");
    if (JSON.stringify(currentItem.evidenceState || {}) !== JSON.stringify(savedItem.evidenceState || {})) deltas.push("checklist");

    if (deltas.length) {
      contentChanges.push({
        id,
        name: CONDITIONS.find(item => item.id === id)?.name || id,
        deltas
      });
    }
  });

  return {
    snapshotName: saved.name || "Workspace snapshot",
    currentPrimary: current.summary?.primaryName || "",
    savedPrimary: saved.summary?.primaryName || "",
    addedIds,
    removedIds,
    addedLinks,
    removedLinks,
    contentChanges,
    theoryChanged: JSON.stringify(current.payload?.theories || []) !== JSON.stringify(saved.payload?.theories || [])
  };
}

function renderSnapshotComparison(snapshot) {
  const host = document.getElementById("wsSnapshotCompare");
  if (!host) return;
  if (!snapshot) {
    host.classList.add("hidden");
    host.innerHTML = "";
    return;
  }

  const diff = workspaceSnapshotDiff(snapshot);
  const nameFor = (id) => CONDITIONS.find(item => item.id === id)?.name || id;
  const rows = [];

  if (diff.currentPrimary !== diff.savedPrimary) {
    rows.push(`<div class="snapshotCompareRow"><strong>Primary condition changes:</strong> ${escapeHtml(diff.currentPrimary || "(none)")} → ${escapeHtml(diff.savedPrimary || "(none)")}</div>`);
  }
  if (diff.addedIds.length) {
    rows.push(`<div class="snapshotCompareRow"><strong>Would add conditions:</strong> ${escapeHtml(diff.addedIds.map(nameFor).join(", "))}</div>`);
  }
  if (diff.removedIds.length) {
    rows.push(`<div class="snapshotCompareRow"><strong>Would remove conditions:</strong> ${escapeHtml(diff.removedIds.map(nameFor).join(", "))}</div>`);
  }
  if (diff.addedLinks.length) {
    rows.push(`<div class="snapshotCompareRow"><strong>Would add links:</strong> ${escapeHtml(diff.addedLinks.join(", "))}</div>`);
  }
  if (diff.removedLinks.length) {
    rows.push(`<div class="snapshotCompareRow"><strong>Would remove links:</strong> ${escapeHtml(diff.removedLinks.join(", "))}</div>`);
  }
  if (diff.contentChanges.length) {
    rows.push(`
      <div class="snapshotCompareRow">
        <strong>Condition data changes:</strong>
        <div class="snapshotCompareTags">
          ${diff.contentChanges.map(change => `<span class="snapshotCompareTag">${escapeHtml(change.name)}: ${escapeHtml(change.deltas.join(", "))}</span>`).join("")}
        </div>
      </div>
    `);
  }

  if (diff.theoryChanged) {
    rows.push(`<div class="snapshotCompareRow"><strong>Structured theory changes:</strong> The saved snapshot has a different theory set than the current workspace.</div>`);
  }

  if (!rows.length) {
    rows.push(`<div class="snapshotCompareRow">This snapshot matches the current workspace.</div>`);
  }

  host.classList.remove("hidden");
  host.innerHTML = `
    <div class="snapshotCompareHeader">
      <div>
        <strong>Snapshot comparison</strong>
        <div class="small">${escapeHtml(diff.snapshotName)}</div>
      </div>
      <button id="wsSnapshotCompareClear" class="miniBtn" type="button">Close</button>
    </div>
    <div class="snapshotCompareList">
      ${rows.join("")}
    </div>
  `;

  document.getElementById("wsSnapshotCompareClear")?.addEventListener("click", () => {
    renderSnapshotComparison(null);
  });
}

function buildWorkspaceSnapshot(name) {
  const st = loadWorkspaceState();
  const milestone = document.getElementById("wsSnapshotMilestone")?.value || "Working draft";
  const payload = {
    workspaceState: st,
    conditions: {},
    evidenceRelations: loadEvidenceRelations(),
    theories: loadTheoryState()
  };

  (st.nodes || []).forEach(id => {
    payload.conditions[id] = {
      evidenceState: loadEvidenceState(id),
      notes: loadNotes(id),
      timeline: loadTimeline(id),
      evidenceLinks: loadEvidenceLinks(id)
    };
  });

  const now = new Date();
  return {
    id: `snapshot-${now.getTime()}`,
    name: (name || "").trim() || `Workspace snapshot ${now.toLocaleString()}`,
    milestone,
    createdAt: now.toISOString(),
    summary: workspaceSummary(st),
    payload
  };
}

function applyWorkspaceSnapshot(snapshot) {
  const payload = snapshot?.payload || {};
  const nextState = payload.workspaceState || { nodes: [], primaryId: "", links: [] };
  const previousIds = new Set((loadWorkspaceState().nodes || []).filter(Boolean));
  const nextIds = new Set((nextState.nodes || []).filter(Boolean));
  const allIds = new Set([...previousIds, ...nextIds]);

  saveWorkspaceState(nextState);

  allIds.forEach(id => {
    const item = payload.conditions?.[id] || {};
    saveEvidenceState(id, item.evidenceState || {});
    saveNotes(id, item.notes || "");
    saveTimeline(id, item.timeline || []);
    saveEvidenceLinks(id, item.evidenceLinks || []);
  });

  saveEvidenceRelations(payload.evidenceRelations || {});
  saveTheoryState(Array.isArray(payload.theories) ? payload.theories : []);
  pushWorkspaceActivity("Snapshot restored", `${snapshot?.name || "Workspace snapshot"} was restored into the current workspace.`);
}

function quickStartPlans() {
  const plans = [
    {
      id: "noise-exposure",
      title: "Noise Exposure Starter",
      description: "Use tinnitus as the anchor and add hearing loss as a related follow-up issue.",
      primaryId: "tinnitus",
      links: [{ to: "hearing_loss", type: "Secondary to" }]
    },
    {
      id: "mental-health-chain",
      title: "Mental Health Chain",
      description: "Start with PTSD and stage depression plus migraines as linked conditions that need supporting detail.",
      primaryId: "ptsd",
      links: [
        { to: "depression", type: "Secondary to" },
        { to: "migraines", type: "Secondary to" }
      ]
    },
    {
      id: "sleep-breathing",
      title: "Sleep and Breathing Starter",
      description: "Set up a sleep-focused workspace and keep asthma visible as a supporting respiratory thread.",
      primaryId: "sleep_apnea",
      links: [{ to: "asthma", type: "Secondary to" }]
    }
  ];

  const available = new Set(CONDITIONS.map(item => item.id));
  return plans
    .filter(plan => available.has(plan.primaryId) && plan.links.every(link => available.has(link.to)))
    .map(plan => ({
      ...plan,
      conditionIds: [plan.primaryId, ...plan.links.map(link => link.to)],
      conditionNames: [plan.primaryId, ...plan.links.map(link => link.to)]
        .map(id => CONDITIONS.find(item => item.id === id)?.name || id)
    }));
}

function applyQuickStartPlan(plan) {
  if (!plan) return;
  const st = loadWorkspaceState();
  plan.conditionIds.forEach(id => ensureNode(id));
  if (!st.primaryId) setPrimary(plan.primaryId);
  plan.links.forEach(link => {
    try {
      addLink(plan.primaryId, link.to, link.type || "Secondary to");
    } catch {
      // Duplicate links or blocked cycles are safe to ignore here.
    }
  });
  pushWorkspaceActivity("Quick Start applied", `${plan.title} scaffolded a starter claim chain in the workspace.`);
  incrementHomeUsage("plans", plan.id);
}

function renderQuickStartPlans() {
  const host = document.getElementById("quickStartPlans");
  if (!host) return;

  const plans = quickStartPlans();
  host.innerHTML = plans.length
    ? plans.map(plan => `
        <article class="quickStartCard">
          <div class="quickStartMeta">Starter plan</div>
          <h3>${escapeHtml(plan.title)}</h3>
          <p class="small">${escapeHtml(plan.description)}</p>
          <div class="quickStartNames">
            ${plan.conditionNames.map(name => `<span class="quickStartTag">${escapeHtml(name)}</span>`).join("")}
          </div>
          <button class="miniBtn" data-quick-start="${escapeHtml(plan.id)}" type="button">Add plan to workspace</button>
        </article>
      `).join("")
    : `<div class="small">Starter plans are unavailable until conditions finish loading.</div>`;

  host.querySelectorAll("button[data-quick-start]").forEach(btn => {
    btn.addEventListener("click", () => {
      const plan = quickStartPlans().find(item => item.id === btn.dataset.quickStart);
      if (!plan) return;
      applyQuickStartPlan(plan);
      renderWorkspace();
      renderClaimTree();
      renderHealthPanel();
      alert(`${plan.title} added to workspace.`);
    });
  });
}

function guidedBuilderPresetMap() {
  return {
    tinnitus: ["hearing_loss"],
    hearing_loss: ["tinnitus"],
    ptsd: ["depression", "migraines", "sleep_apnea"],
    depression: ["ptsd"],
    sleep_apnea: ["asthma", "depression"],
    asthma: ["sleep_apnea"],
    sciatic_nerve: ["knee_flexion"],
    knee_flexion: ["sciatic_nerve"],
    migraines: ["ptsd", "depression"],
  };
}

function relatedBuilderSuggestions(primaryId) {
  const primary = CONDITIONS.find(item => item.id === primaryId);
  if (!primary) return [];

  const presetIds = guidedBuilderPresetMap()[primaryId] || [];
  const presetSet = new Set(presetIds);
  const sameSystem = CONDITIONS
    .filter(item => item.id !== primaryId && item.body_system && item.body_system === primary.body_system)
    .map(item => item.id);

  const combinedIds = [...new Set([...presetIds, ...sameSystem])].slice(0, 5);
  return combinedIds
    .map(id => CONDITIONS.find(item => item.id === id))
    .filter(Boolean)
    .map(item => ({
      id: item.id,
      name: item.name,
      bodySystem: item.body_system || "",
      reason: presetSet.has(item.id) ? "Common paired issue" : "Same body system"
    }));
}

function renderGuidedBuilder() {
  const primaryEl = document.getElementById("builderPrimary");
  const relTypeEl = document.getElementById("builderRelType");
  const suggestionsEl = document.getElementById("builderSuggestions");
  if (!primaryEl || !relTypeEl || !suggestionsEl) return;

  primaryEl.innerHTML = CONDITIONS
    .slice()
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    .map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`)
    .join("");

  relTypeEl.innerHTML = REL_TYPES.map(type => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join("");
  relTypeEl.value = "Secondary to";

  const updateSuggestions = () => {
    const suggestions = relatedBuilderSuggestions(primaryEl.value);
    suggestionsEl.innerHTML = suggestions.length
      ? suggestions.map(item => `
          <article class="builderSuggestionCard">
            <div class="builderSuggestionTop">
              <label>
                <input type="checkbox" data-builder-related="${escapeHtml(item.id)}" checked />
                <span>
                  <strong>${escapeHtml(item.name)}</strong>
                  <span class="small">${escapeHtml(item.bodySystem)} • ${escapeHtml(item.reason)}</span>
                </span>
              </label>
            </div>
          </article>
        `).join("")
      : `<div class="small">No guided related-condition suggestions are available for this primary yet.</div>`;
  };

  primaryEl.addEventListener("change", updateSuggestions);
  updateSuggestions();
}

function applyGuidedBuilderSelection() {
  const primaryEl = document.getElementById("builderPrimary");
  const relTypeEl = document.getElementById("builderRelType");
  const suggestionsEl = document.getElementById("builderSuggestions");
  if (!primaryEl || !relTypeEl || !suggestionsEl) return;

  const primaryId = primaryEl.value;
  const primary = CONDITIONS.find(item => item.id === primaryId);
  if (!primary) return;

  ensureNode(primaryId);
  setPrimary(primaryId);

  const relatedIds = [...suggestionsEl.querySelectorAll("input[data-builder-related]:checked")]
    .map(input => input.dataset.builderRelated)
    .filter(Boolean);

  relatedIds.forEach(id => {
    ensureNode(id);
    try {
      addLink(primaryId, id, relTypeEl.value || "Secondary to");
    } catch (_) {
      // keep moving through the guided plan
    }
  });

  pushWorkspaceActivity(
    "Guided builder applied",
    `${primary.name} was set as Primary with ${relatedIds.length} guided related condition${relatedIds.length === 1 ? "" : "s"}.`
  );
  incrementHomeUsage("conditions", primaryId);
  relatedIds.forEach((id) => incrementHomeUsage("conditions", id));

  renderWorkspace();
  renderClaimTree();
  renderHealthPanel();
}

function renderSnapshotList() {
  const host = document.getElementById("wsSnapshotList");
  if (!host) return;

  const snapshots = loadWorkspaceSnapshots();
  host.innerHTML = snapshots.length
    ? snapshots.map(snapshot => `
        <article class="snapshotCard">
          <div class="snapshotHeader">
            <div>
              <strong>${escapeHtml(snapshot.name || "Workspace snapshot")}</strong>
              <div class="small">${escapeHtml(snapshot.milestone || "Working draft")}</div>
              <div class="small">${escapeHtml(summarizeSnapshot(snapshot))}</div>
            </div>
            <div class="small">${snapshot.createdAt ? escapeHtml(new Date(snapshot.createdAt).toLocaleString()) : ""}</div>
          </div>
          <div class="healthBtns" style="margin-top:8px">
            <button class="miniBtn" data-snapshot-compare="${escapeHtml(snapshot.id)}" type="button">Compare</button>
            <button class="miniBtn" data-snapshot-restore="${escapeHtml(snapshot.id)}" type="button">Restore</button>
            <button class="miniBtn danger" data-snapshot-delete="${escapeHtml(snapshot.id)}" type="button">Delete</button>
          </div>
        </article>
      `).join("")
    : `<div class="small">No snapshots yet. Save one before trying a different claim structure.</div>`;

  host.querySelectorAll("button[data-snapshot-compare]").forEach(btn => {
    btn.addEventListener("click", () => {
      const snapshot = loadWorkspaceSnapshots().find(item => item.id === btn.dataset.snapshotCompare);
      if (!snapshot) return;
      pushSnapshotHistory("Compared", snapshot);
      renderSnapshotComparison(snapshot);
      renderSnapshotHistoryList();
    });
  });

  host.querySelectorAll("button[data-snapshot-restore]").forEach(btn => {
    btn.addEventListener("click", () => {
      const snapshot = loadWorkspaceSnapshots().find(item => item.id === btn.dataset.snapshotRestore);
      if (!snapshot) return;
      if (!confirm(`Restore "${snapshot.name}" and replace the current workspace?`)) return;
      applyWorkspaceSnapshot(snapshot);
      pushSnapshotHistory("Restored", snapshot);
      renderSnapshotComparison(null);
      renderWorkspace();
      renderClaimTree();
      renderHealthPanel();
      renderStickyWorkspaceSummary();
      renderSnapshotHistoryList();
      alert(`Restored ${snapshot.name}.`);
    });
  });

  host.querySelectorAll("button[data-snapshot-delete]").forEach(btn => {
    btn.addEventListener("click", () => {
      const snapshotsNow = loadWorkspaceSnapshots();
      const snapshot = snapshotsNow.find(item => item.id === btn.dataset.snapshotDelete);
      if (!snapshot) return;
      if (!confirm(`Delete "${snapshot.name}"?`)) return;
      saveWorkspaceSnapshots(snapshotsNow.filter(item => item.id !== snapshot.id));
      renderSnapshotComparison(null);
      renderSnapshotList();
      renderStickyWorkspaceSummary();
      alert(`Deleted ${snapshot.name}.`);
    });
  });
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

function loadRatingEstimatorState() {
  try {
    const raw = localStorage.getItem(WS_RATING_STATE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveRatingEstimatorState(state) {
  localStorage.setItem(WS_RATING_STATE_KEY, JSON.stringify(state || {}));
}

function loadTheoryState() {
  try {
    const raw = localStorage.getItem(WS_THEORY_STATE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTheoryState(items) {
  localStorage.setItem(WS_THEORY_STATE_KEY, JSON.stringify(Array.isArray(items) ? items : []));
}

function loadRatingScenarios() {
  try {
    const raw = localStorage.getItem(WS_RATING_SCENARIOS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRatingScenarios(items) {
  localStorage.setItem(WS_RATING_SCENARIOS_KEY, JSON.stringify(Array.isArray(items) ? items : []));
}

function loadDocumentLibrary() {
  try {
    const raw = localStorage.getItem(DOC_LIBRARY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveDocumentLibrary(items) {
  localStorage.setItem(DOC_LIBRARY_KEY, JSON.stringify(Array.isArray(items) ? items : []));
}

function loadEvidenceLibrary() {
  try {
    const raw = localStorage.getItem(EVIDENCE_LIBRARY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveEvidenceLibrary(items) {
  localStorage.setItem(EVIDENCE_LIBRARY_KEY, JSON.stringify(Array.isArray(items) ? items : []));
}

function loadExtractorPacketLibrary() {
  try {
    const raw = localStorage.getItem(EXTRACTOR_PACKET_LIBRARY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveExtractorPacketLibrary(items) {
  localStorage.setItem(EXTRACTOR_PACKET_LIBRARY_KEY, JSON.stringify(Array.isArray(items) ? items : []));
}

function createExtractorPacketRecord(options = {}) {
  const tags = Array.isArray(options.tags)
    ? options.tags
    : String(options.tags || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
  return {
    id: `extractor-packet-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    targetId: (options.targetId || "").trim(),
    targetName: (options.targetName || "").trim() || "Condition",
    sourceName: (options.sourceName || "").trim() || "Document intake",
    title: (options.title || "").trim() || `Extractor Draft Packet ${new Date().toLocaleString()}`,
    tags,
    pinned: !!options.pinned,
    text: (options.text || "").trim(),
    compare: options.compare && typeof options.compare === "object" ? options.compare : {},
    createdAt: new Date().toISOString(),
  };
}

function loadExtractorHistory() {
  try {
    const raw = localStorage.getItem(EXTRACTOR_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveExtractorHistory(items) {
  localStorage.setItem(EXTRACTOR_HISTORY_KEY, JSON.stringify(Array.isArray(items) ? items : []));
}

function createExtractorHistoryEntry(options = {}) {
  const selected = options.selected && typeof options.selected === "object" ? options.selected : {};
  return {
    id: `extractor-history-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    action: (options.action || "notes").trim(),
    targetId: (options.targetId || "").trim(),
    targetName: (options.targetName || "").trim() || "Condition",
    sourceName: (options.sourceName || "").trim() || "Document intake",
    providers: Array.isArray(selected.providers) ? selected.providers : [],
    symptoms: Array.isArray(selected.symptoms) ? selected.symptoms : [],
    dates: Array.isArray(selected.dates) ? selected.dates : [],
    diagnosisPhrases: Array.isArray(selected.diagnosisPhrases) ? selected.diagnosisPhrases : [],
    severityPhrases: Array.isArray(selected.severityPhrases) ? selected.severityPhrases : [],
    nexusPhrases: Array.isArray(selected.nexusPhrases) ? selected.nexusPhrases : [],
    createdAt: new Date().toISOString(),
  };
}

function pushExtractorHistory(entry) {
  saveExtractorHistory([entry, ...loadExtractorHistory()].slice(0, 30));
}

function loadSnapshotHistory() {
  try {
    const raw = localStorage.getItem(WS_SNAPSHOT_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSnapshotHistory(items) {
  localStorage.setItem(WS_SNAPSHOT_HISTORY_KEY, JSON.stringify(Array.isArray(items) ? items : []));
}

function loadWorkspacePanelState() {
  try {
    const raw = localStorage.getItem(WS_PANEL_STATE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveWorkspacePanelState(state) {
  localStorage.setItem(WS_PANEL_STATE_KEY, JSON.stringify(state && typeof state === "object" ? state : {}));
}

function setWorkspacePanelCollapsed(panelId, collapsed) {
  const state = loadWorkspacePanelState();
  state[panelId] = !!collapsed;
  saveWorkspacePanelState(state);
}

function mountWorkspacePanelToggles() {
  if (typeof document === "undefined") return;
  const panels = [...document.querySelectorAll(".workspacePanel[id]")];
  const savedState = loadWorkspacePanelState();
  const defaultOpenPanels = new Set([
    "ws-dashboard-panel",
    "ws-overview-panel",
    "ws-health-panel",
    "ws-conditions-panel",
  ]);

  const applyState = (panel, collapsed) => {
    panel.classList.toggle("collapsed", !!collapsed);
    const button = panel.querySelector(".panelToggle");
    if (button) {
      button.setAttribute("aria-expanded", collapsed ? "false" : "true");
      button.textContent = collapsed ? "Expand" : "Collapse";
    }
  };

  panels.forEach((panel) => {
    const heading = panel.querySelector("h3");
    if (!heading) return;

    let button = heading.querySelector(".panelToggle");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "panelToggle miniBtn";
      heading.appendChild(button);
      heading.classList.add("workspacePanelHeading");
      button.addEventListener("click", () => {
        const nextCollapsed = !panel.classList.contains("collapsed");
        applyState(panel, nextCollapsed);
        setWorkspacePanelCollapsed(panel.id, nextCollapsed);
      });
    }

    const isSaved = Object.prototype.hasOwnProperty.call(savedState, panel.id);
    const collapsed = isSaved ? !!savedState[panel.id] : !defaultOpenPanels.has(panel.id);
    applyState(panel, collapsed);
  });

  const collapseAll = document.getElementById("wsCollapseAll");
  const expandAll = document.getElementById("wsExpandAll");

  if (collapseAll && !collapseAll.dataset.bound) {
    collapseAll.dataset.bound = "1";
    collapseAll.addEventListener("click", () => {
      panels.forEach((panel) => {
        applyState(panel, true);
        setWorkspacePanelCollapsed(panel.id, true);
      });
    });
  }

  if (expandAll && !expandAll.dataset.bound) {
    expandAll.dataset.bound = "1";
    expandAll.addEventListener("click", () => {
      panels.forEach((panel) => {
        applyState(panel, false);
        setWorkspacePanelCollapsed(panel.id, false);
      });
    });
  }
}

function pushSnapshotHistory(action, snapshot) {
  const next = [
    {
      id: `snapshot-history-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      action: action || "Compared",
      snapshotId: snapshot?.id || "",
      snapshotName: snapshot?.name || "Workspace snapshot",
      milestone: snapshot?.milestone || "",
      createdAt: new Date().toISOString()
    },
    ...loadSnapshotHistory()
  ].slice(0, 20);
  saveSnapshotHistory(next);
}

function buildRatingScenarioSnapshot(state = loadRatingEstimatorState()) {
  return {
    currentRating: Math.max(0, Math.min(100, Number(state.currentRating || 0) || 0)),
    projected: Object.fromEntries(
      Object.entries(state.projected || {}).filter(([, value]) => Number.isFinite(Number(value)) && Number(value) >= 0)
    )
  };
}

function estimateScenarioSnapshot(snapshot, workspaceItems = null) {
  const state = snapshot || { currentRating: 0, projected: {} };
  const items = Array.isArray(workspaceItems)
    ? workspaceItems
    : (loadWorkspaceState().nodes || []).map(id => CONDITIONS.find(c => c.id === id)).filter(Boolean);
  const projectedSelections = items
    .map((item) => Number(state.projected?.[item.id] || 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  return combineRatings([Number(state.currentRating || 0), ...projectedSelections]);
}

function saveCurrentRatingScenario(name) {
  const trimmed = (name || "").trim();
  const snapshot = buildRatingScenarioSnapshot();
  return {
    id: `rating-scenario-${Date.now()}`,
    name: trimmed || `Scenario ${new Date().toLocaleString()}`,
    createdAt: new Date().toISOString(),
    state: snapshot
  };
}

function applyRatingScenario(scenario) {
  if (!scenario?.state) return;
  saveRatingEstimatorState({
    currentRating: Number(scenario.state.currentRating || 0) || 0,
    projected: scenario.state.projected && typeof scenario.state.projected === "object" ? scenario.state.projected : {}
  });
}

function buildNexusDraft(options = {}) {
  const child = options.childName || "This condition";
  const parent = options.parentName || "the primary condition";
  const relation = options.relationType || "Secondary service connection";
  const mechanism = (options.mechanism || "").trim();
  const symptoms = (options.symptoms || "").trim();
  const treatment = (options.treatment || "").trim();
  const support = (options.support || "").trim();
  const rationale = (options.rationale || "").trim();

  const lines = [];
  lines.push("[Guided Nexus Draft]");
  lines.push(`Theory: ${relation}`);
  lines.push(`Condition: ${child}`);
  lines.push(`Related condition: ${parent}`);
  lines.push("");
  lines.push(`The current theory is that ${child} is connected to ${parent}.`);
  if (mechanism) lines.push(`Mechanism: ${mechanism}`);
  if (symptoms) lines.push(`Symptoms / functional impact: ${symptoms}`);
  if (treatment) lines.push(`Treatment / timeline support: ${treatment}`);
  if (support) lines.push(`Supporting evidence or records: ${support}`);
  if (rationale) lines.push(`Nexus language / rationale: ${rationale}`);
  lines.push("");
  lines.push("Use this as a working draft only. Replace broad statements with record-specific dates, providers, DBQs, treatment notes, and medical rationale when available.");
  return lines.join("\n");
}

function createDocumentRecord({ name, type, tags, text, sourceType, sourceName, fileName }) {
  const normalizedTags = Array.isArray(tags)
    ? tags
    : String(tags || "")
        .split(",")
        .map(tag => tag.trim())
        .filter(Boolean);

  return {
    id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: (name || "").trim() || `Document ${new Date().toLocaleString()}`,
    type: (type || "").trim() || "General",
    sourceType: (sourceType || "").trim() || "user-entered",
    sourceName: (sourceName || "").trim(),
    fileName: (fileName || "").trim(),
    tags: normalizedTags,
    text: (text || "").trim(),
    createdAt: new Date().toISOString()
  };
}

function createEvidenceLibraryRecord({ label, url, type, excerpt, tags }) {
  const normalizedTags = Array.isArray(tags)
    ? tags
    : String(tags || "")
        .split(",")
        .map(tag => tag.trim())
        .filter(Boolean);

  return {
    id: `evidence-library-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    label: (label || "").trim() || "Evidence record",
    url: (url || "").trim(),
    type: (type || "").trim() || "Other",
    sourceType: "user-entered",
    excerpt: (excerpt || "").trim(),
    tags: normalizedTags,
    createdAt: new Date().toISOString()
  };
}

function provenanceMeta(sourceType) {
  const normalized = (sourceType || "user-entered").toString().trim().toLowerCase();
  if (normalized === "generated") {
    return {
      type: "generated",
      label: "Generated by app",
      className: "prov-generated"
    };
  }
  if (normalized === "inferred") {
    return {
      type: "inferred",
      label: "Inferred from intake",
      className: "prov-inferred"
    };
  }
  return {
    type: "user-entered",
    label: "User-entered",
    className: "prov-user"
  };
}

function readinessTone(pct) {
  if (pct >= 80) return { label: "Strong", className: "strength-strong" };
  if (pct >= 55) return { label: "Moderate", className: "strength-moderate" };
  return { label: "Weak", className: "strength-weak" };
}

function computeConditionReadinessSnapshot(item, snapshot = {}) {
  const notes = (snapshot.notes || "").trim();
  const noteText = notes.toLowerCase();
  const evidenceLinks = Array.isArray(snapshot.evidenceLinks) ? snapshot.evidenceLinks : [];
  const timeline = Array.isArray(snapshot.timeline) ? snapshot.timeline : [];
  const evidenceState = snapshot.evidenceState || {};
  const theories = Array.isArray(snapshot.theories) ? snapshot.theories : [];
  const st = snapshot.workspaceState || { primaryId: "", links: [] };
  const checklist = Array.isArray(item?.evidence_checklist) ? item.evidence_checklist : [];
  const checklistCompletion = evidenceCompletion(item, evidenceState);
  const parentCount = parentsOf(item?.id, st.links || []).length;
  const linked = item?.id === st.primaryId || parentCount > 0;
  const hasRelationshipLanguage = /\bnexus\b|\bsecondary\b|\bdue to\b|\baggravat|\bcaused by\b|\brelated to\b/i.test(notes);
  const linkedTheory = theories.some((theory) => theory.subjectId === item?.id || theory.parentId === item?.id);
  const diagnosisSignals = evidenceLinks.length > 0 || /\bdiagnos|dbq|exam|treatment|record|provider|medical\b/i.test(notes);
  const severitySignals = /\bsever|frequency|impact|work|sleep|flare|pain|symptom|panic|missed work|functional\b/i.test(noteText);
  const timelineSignals = timeline.length > 0;
  const evidenceSignals = evidenceLinks.length > 0 || checklistCompletion.pct > 0;
  const diagnosis = diagnosisSignals ? Math.min(100, 40 + Math.min(evidenceLinks.length, 3) * 15 + (notes ? 20 : 0)) : (notes ? 25 : 0);
  const severity = severitySignals ? Math.min(100, 55 + (timelineSignals ? 15 : 0) + (checklistCompletion.pct >= 50 ? 15 : 0)) : (notes ? 30 : 0);
  const nexusBase = item?.id === st.primaryId ? 80 : linked ? 40 : 20;
  const nexus = Math.min(100, nexusBase + (hasRelationshipLanguage ? 25 : 0) + (linkedTheory ? 20 : 0));
  const timelineScore = timelineSignals ? Math.min(100, 50 + Math.min(timeline.length, 3) * 15 + (notes ? 10 : 0)) : 0;
  const evidence = Math.min(100, Math.round(checklistCompletion.pct * 0.65) + Math.min(evidenceLinks.length, 3) * 12 + (notes ? 10 : 0));
  const scores = { diagnosis, severity, nexus, timeline: timelineScore, evidence };
  const overall = Math.round((diagnosis + severity + nexus + timelineScore + evidence) / 5);
  const nextGap = Object.entries(scores).sort((a, b) => a[1] - b[1])[0]?.[0] || "evidence";
  return {
    scores,
    overall,
    overallTone: readinessTone(overall),
    checklistCompletion,
    nextGap,
    nextAction: nextGap === "diagnosis"
      ? "Add diagnosis-level support like a DBQ, treatment note, exam, or medical record reference."
      : nextGap === "severity"
        ? "Add frequency, flare, work, sleep, or functional-impact detail to strengthen severity support."
        : nextGap === "nexus"
          ? "Write the relationship logic more explicitly so the theory and supporting rationale are easier to review."
          : nextGap === "timeline"
            ? "Add dated onset, treatment, worsening, or exam events to make the chronology easier to follow."
            : "Attach more evidence links or finish the checklist so support is easier to verify."
  };
}

function conditionReadiness(item, st = loadWorkspaceState()) {
  return computeConditionReadinessSnapshot(item, {
    notes: loadNotes(item.id),
    evidenceLinks: loadEvidenceLinks(item.id),
    timeline: loadTimeline(item.id),
    evidenceState: loadEvidenceState(item.id),
    theories: loadTheoryState(),
    workspaceState: st,
  });
}

function conditionSpecificCoaching(item, st = loadWorkspaceState(), snapshot = {}) {
  const notes = ((snapshot.notes ?? loadNotes(item.id)) || "").trim();
  const evidenceLinks = Array.isArray(snapshot.evidenceLinks) ? snapshot.evidenceLinks : loadEvidenceLinks(item.id);
  const timeline = Array.isArray(snapshot.timeline) ? snapshot.timeline : loadTimeline(item.id);
  const readiness = computeConditionReadinessSnapshot(item, {
    notes,
    evidenceLinks,
    timeline,
    evidenceState: snapshot.evidenceState || loadEvidenceState(item.id),
    theories: snapshot.theories || loadTheoryState(),
    workspaceState: st,
  });
  const parents = parentsOf(item.id, st.links);
  const tips = [];

  if (readiness.scores.diagnosis < 60) {
    tips.push("Add a diagnosis-level source like a DBQ, treatment note, exam report, or provider record reference.");
  }
  if (readiness.scores.severity < 60) {
    tips.push("Describe frequency, flare pattern, daily impact, missed work, sleep disruption, or functional loss more explicitly.");
  }
  if (readiness.scores.timeline < 60) {
    tips.push("Add dated onset, treatment, worsening, or exam events so the chronology reads more clearly.");
  }
  if (parents.length && readiness.scores.nexus < 65) {
    tips.push("Spell out why this condition is linked to the parent condition, not just that it exists alongside it.");
  }

  const lowerName = `${item.name} ${(item.aliases || []).join(" ")}`.toLowerCase();
  if (/migraine|headache/.test(lowerName)) {
    tips.push("For headaches, document frequency, whether attacks are prostrating, and how they affect work or concentration.");
  } else if (/ptsd|depression|anxiety|mental/.test(lowerName) || /mental/i.test(item.body_system || "")) {
    tips.push("For mental-health claims, describe occupational and social impact, sleep disruption, panic, treatment changes, and symptom patterns over time.");
  } else if (/sleep apnea|sleep/.test(lowerName)) {
    tips.push("For sleep-related claims, capture the sleep study, CPAP or treatment history, and daytime fatigue or functional consequences.");
  } else if (/tinnitus|hearing/.test(lowerName) || /auditory/i.test(item.body_system || "")) {
    tips.push("For auditory claims, describe onset, noise exposure history, continuity of symptoms, and practical communication impact.");
  } else if (/knee|back|spine|ankle|hip|shoulder|musculoskeletal|radiculopathy|sciatic/.test(lowerName) || /musculoskel|neurolog/i.test(item.body_system || "")) {
    tips.push("For musculoskeletal or nerve claims, add range-of-motion loss, flare-up behavior, walking or standing limits, and treatment history.");
  }

  if (evidenceLinks.length >= 2 && notes) {
    tips.push("You already have source material here. Tighten the note so it tells the reviewer exactly which record proves diagnosis, severity, and nexus.");
  } else if (!evidenceLinks.length && notes) {
    tips.push("The note exists, but it will read stronger once at least one supporting record or statement is attached.");
  } else if (!notes && timeline.length) {
    tips.push("Turn the existing dated events into one short narrative note so the condition story is easier to follow.");
  }

  tips.push(readiness.nextAction);
  return [...new Set(tips)].slice(0, 4);
}

function buildSubmissionPrepSnapshot(snapshot = {}) {
  const items = Array.isArray(snapshot.items) ? snapshot.items : [];
  const review = snapshot.review || { findings: [], summary: { errors: 0, warnings: 0, infos: 0 } };
  const strongest = snapshot.strongest || [];
  const weakest = snapshot.weakest || [];
  const theories = Array.isArray(snapshot.theories) ? snapshot.theories : [];
  const primary = snapshot.primary || null;
  const status = review.summary.errors
    ? "Needs major review"
    : review.summary.warnings > 3
      ? "Needs focused cleanup"
      : items.length && theories.length && primary
        ? "Reasonably staged for handoff"
        : "Still building core structure";

  const verify = [];
  if (!primary) verify.push("Pick and confirm the strongest primary condition.");
  if (!theories.length) verify.push("Save at least one structured theory before handoff.");
  if (review.findings.some((finding) => /timeline/i.test(finding.text))) verify.push("Check chronology for missing or conflicting dates.");
  if (review.findings.some((finding) => /evidence link/i.test(finding.text))) verify.push("Attach at least one concrete supporting record to thin conditions.");
  if (review.findings.some((finding) => /rating/i.test(finding.text))) verify.push("Review rating scenarios and make sure the estimate is not driving the theory.");

  return {
    status,
    verify: [...new Set(verify)].slice(0, 5),
    strongest: strongest.slice(0, 3),
    weakest: weakest.slice(0, 3),
  };
}

function generateSubmissionPrepText() {
  const dashboard = computeWorkspaceDashboardData();
  const primary = dashboard.st.primaryId ? CONDITIONS.find((condition) => condition.id === dashboard.st.primaryId) : null;
  const prep = buildSubmissionPrepSnapshot({
    items: dashboard.items,
    review: dashboard.review,
    strongest: dashboard.strongest,
    weakest: dashboard.weakest,
    theories: loadTheoryState(),
    primary,
  });

  const lines = [];
  lines.push("VA CFR Finder — Submission Prep Mode");
  lines.push(new Date().toLocaleString());
  lines.push("");
  lines.push(`Overall handoff status: ${prep.status}`);
  lines.push(`Primary condition: ${primary ? primary.name : "(not set)"}`);
  lines.push(`Workspace size: ${dashboard.items.length} condition${dashboard.items.length === 1 ? "" : "s"}`);
  lines.push(`Packet review summary: ${dashboard.review.summary.errors} error(s), ${dashboard.review.summary.warnings} warning(s), ${dashboard.review.summary.infos} info note(s)`);
  lines.push("");
  lines.push("Strongest conditions to lead with:");
  (prep.strongest.length
    ? prep.strongest.map((row) => `${row.item.name} (${row.readiness.overall}% readiness, ${row.strength.label} support)`)
    : ["No workspace conditions yet."]).forEach((line) => lines.push(`- ${line}`));
  lines.push("");
  lines.push("Conditions needing more work:");
  (prep.weakest.length
    ? prep.weakest.map((row) => `${row.item.name}: ${row.readiness.nextAction}`)
    : ["No obvious weak conditions detected."]).forEach((line) => lines.push(`- ${line}`));
  lines.push("");
  lines.push("Verify before handing this to a VSO or representative:");
  (prep.verify.length ? prep.verify : ["Review all theory summaries, dates, and supporting links one more time."]).forEach((line) => lines.push(`- ${line}`));
  lines.push("");
  lines.push("Assumptions to review:");
  lines.push("- Generated summaries and coaching text are drafting aids, not legal advice.");
  lines.push("- Intake matches and evidence suggestions are inferred and may be wrong.");
  lines.push("- Rating projections remain estimates only and should not replace claim theory review.");
  lines.push("");
  lines.push("Recommended next exports:");
  lines.push("- Quick Review packet for fast triage");
  lines.push("- Representative packet for handoff");
  lines.push("- Full backup JSON before major edits or external review");
  return lines.join("\n");
}

function suggestEvidenceTargets(record, workspaceItems = []) {
  const haystack = [
    record?.label || "",
    record?.excerpt || "",
    record?.type || "",
    ...(Array.isArray(record?.tags) ? record.tags : []),
  ].join(" ").toLowerCase();
  if (!haystack.trim()) return [];

  return workspaceItems
    .map((item) => {
      let score = 0;
      const reasons = [];
      const terms = [item.name, item.id, ...(item.aliases || [])].filter(Boolean);
      terms.forEach((term) => {
        const normalized = term.toLowerCase();
        if (haystack.includes(normalized)) {
          score += normalized === item.id.toLowerCase() ? 5 : 4;
          reasons.push(`mentions ${term}`);
        }
      });
      if (item.body_system && haystack.includes(item.body_system.toLowerCase())) {
        score += 2;
        reasons.push(`matches ${item.body_system}`);
      }
      if (/\bdbq\b/.test(haystack) && /mental|respir|neurolog|musculoskel|auditory/i.test(item.body_system || "")) {
        score += 1;
        reasons.push("looks like a structured medical record");
      }
      return {
        id: item.id,
        name: item.name,
        score,
        reasons: [...new Set(reasons)],
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 3);
}

function buildPacketReviewSnapshot(snapshot = {}) {
  const items = Array.isArray(snapshot.items) ? snapshot.items : [];
  const primaryId = snapshot.primaryId || "";
  const links = Array.isArray(snapshot.links) ? snapshot.links : [];
  const theories = Array.isArray(snapshot.theories) ? snapshot.theories : [];
  const notesById = snapshot.notesById || {};
  const evidenceLinksById = snapshot.evidenceLinksById || {};
  const timelineById = snapshot.timelineById || {};
  const evidenceStateById = snapshot.evidenceStateById || {};
  const currentRating = Math.max(0, Math.min(100, Number(snapshot.currentRating || 0) || 0));
  const projected = snapshot.projected || {};
  const findings = [];
  const timelineConflicts = analyzeTimelineConflicts(
    Object.fromEntries(items.map((item) => [item.name, timelineById[item.id] || []])),
  );

  if (!items.length) {
    return {
      findings: [{ severity: "warn", text: "No workspace items exist yet, so there is nothing to review." }],
      summary: { errors: 0, warnings: 1, infos: 0 },
      timelineConflicts,
    };
  }

  if (!primaryId) {
    findings.push({ severity: "error", text: "No primary condition is set. Pick the strongest anchor condition before final packet review." });
  }

  if (!theories.length) {
    findings.push({ severity: "warn", text: "No structured claim theory is saved yet. The packet is easier to review when the theory is explicit." });
  }

  items.forEach((item) => {
    const notes = (notesById[item.id] || "").trim();
    const evidenceLinks = Array.isArray(evidenceLinksById[item.id]) ? evidenceLinksById[item.id] : [];
    const timeline = Array.isArray(timelineById[item.id]) ? timelineById[item.id] : [];
    const readiness = computeConditionReadinessSnapshot(item, {
      notes,
      evidenceLinks,
      timeline,
      evidenceState: evidenceStateById[item.id] || {},
      theories,
      workspaceState: { primaryId, links },
    });
    const parents = parentsOf(item.id, links);
    const projectedPct = Number(projected[item.id] || 0);

    if (parents.length && !/\bnexus\b|\bsecondary\b|\bdue to\b|\baggravat|\bcaused by\b/i.test(notes) && !theories.some((theory) => theory.subjectId === item.id)) {
      findings.push({ severity: "warn", text: `${item.name} is linked as a secondary-style condition but still lacks clear nexus or relationship language.` });
    }
    if (!evidenceLinks.length) {
      findings.push({ severity: "warn", text: `${item.name} has no supporting evidence links attached yet.` });
    }
    if (!timeline.length) {
      findings.push({ severity: "info", text: `${item.name} has no timeline entries, so chronology may be harder to explain.` });
    }
    if (readiness.overall < 55) {
      findings.push({ severity: "warn", text: `${item.name} is still in the weak readiness tier. Next focus: ${readiness.nextAction}` });
    }
    if (projectedPct >= 70 && readiness.overall < 60) {
      findings.push({ severity: "warn", text: `${item.name} is modeled at ${projectedPct}% in the estimator, but the current support is still fairly thin.` });
    }
  });

  timelineConflicts.forEach((text) => findings.push({ severity: "warn", text }));

  const summary = findings.reduce((acc, finding) => {
    if (finding.severity === "error") acc.errors += 1;
    else if (finding.severity === "warn") acc.warnings += 1;
    else acc.infos += 1;
    return acc;
  }, { errors: 0, warnings: 0, infos: 0 });

  return { findings, summary, timelineConflicts };
}

function buildPacketReviewText() {
  const st = loadWorkspaceState();
  const items = (st.nodes || []).map((id) => CONDITIONS.find((condition) => condition.id === id)).filter(Boolean);
  const ratingState = loadRatingEstimatorState();
  const review = buildPacketReviewSnapshot({
    items,
    primaryId: st.primaryId,
    links: st.links,
    theories: loadTheoryState(),
    notesById: Object.fromEntries(items.map((item) => [item.id, loadNotes(item.id) || ""])),
    evidenceLinksById: Object.fromEntries(items.map((item) => [item.id, loadEvidenceLinks(item.id)])),
    timelineById: Object.fromEntries(items.map((item) => [item.id, loadTimeline(item.id)])),
    evidenceStateById: Object.fromEntries(items.map((item) => [item.id, loadEvidenceState(item.id)])),
    currentRating: ratingState.currentRating,
    projected: ratingState.projected || {},
  });

  const lines = [];
  lines.push("VA CFR Finder — Packet Review");
  lines.push(new Date().toLocaleString());
  lines.push("");
  lines.push("This review is generated by the app from current workspace data.");
  lines.push("User-entered data includes notes, timelines, evidence links, theories, and saved document text.");
  lines.push("Inferred data includes intake matches and evidence-target suggestions.");
  lines.push("");
  lines.push(`Review summary: ${review.summary.errors} error(s), ${review.summary.warnings} warning(s), ${review.summary.infos} info note(s).`);
  lines.push("");
  lines.push("Findings:");
  if (!review.findings.length) {
    lines.push("- No obvious packet blockers were detected.");
  } else {
    review.findings.forEach((finding) => {
      lines.push(`- [${finding.severity.toUpperCase()}] ${finding.text}`);
    });
  }
  lines.push("");
  lines.push("Assumptions to review:");
  lines.push("- Rating projections are estimates only.");
  lines.push("- CFR references should be checked for freshness before relying on them.");
  lines.push("- Weak timeline or nexus support may still need record-specific detail even when a checklist looks complete.");
  return lines.join("\n");
}

function granularGapsForCondition(item, st = loadWorkspaceState()) {
  const notes = (loadNotes(item.id) || "").trim();
  const links = loadEvidenceLinks(item.id);
  const timeline = loadTimeline(item.id);
  const evidence = evidenceCompletion(item, loadEvidenceState(item.id));
  const linked = item.id === st.primaryId || parentsOf(item.id, st.links).length > 0;
  const lowerNotes = notes.toLowerCase();
  const gaps = [];

  if (!links.length && !/\bdiagnos|dbq|exam|treatment|record|provider|medical\b/i.test(notes)) gaps.push("missing diagnosis / record detail");
  if (!links.length) gaps.push("missing supporting evidence");
  if (!timeline.length) gaps.push("missing timeline");
  if (!notes) gaps.push("missing notes");
  if (linked && !/\bnexus\b|\bsecondary\b|\bdue to\b|\baggravat/i.test(notes)) gaps.push("missing relationship explanation");
  if (!/\bsever|frequency|impact|work|sleep|flare|pain|symptom/i.test(lowerNotes)) gaps.push("missing severity / functional impact detail");
  if (evidence.pct < 50) gaps.push("checklist coverage is still light");

  return gaps;
}

function topWorkspaceBlockers(limit = 3) {
  const st = loadWorkspaceState();
  const items = (st.nodes || []).map(id => CONDITIONS.find(c => c.id === id)).filter(Boolean);
  const gaps = [];
  items.forEach((item) => {
    granularGapsForCondition(item, st).forEach((gap) => {
      gaps.push(`${item.name}: ${gap}`);
    });
  });
  return gaps.slice(0, limit);
}

function computeWorkspaceDashboardData() {
  const st = loadWorkspaceState();
  const items = (st.nodes || []).map((id) => CONDITIONS.find((condition) => condition.id === id)).filter(Boolean);
  const ratingState = loadRatingEstimatorState();
  const review = buildPacketReviewSnapshot({
    items,
    primaryId: st.primaryId,
    links: st.links,
    theories: loadTheoryState(),
    notesById: Object.fromEntries(items.map((item) => [item.id, loadNotes(item.id) || ""])),
    evidenceLinksById: Object.fromEntries(items.map((item) => [item.id, loadEvidenceLinks(item.id)])),
    timelineById: Object.fromEntries(items.map((item) => [item.id, loadTimeline(item.id)])),
    evidenceStateById: Object.fromEntries(items.map((item) => [item.id, loadEvidenceState(item.id)])),
    currentRating: ratingState.currentRating,
    projected: ratingState.projected || {},
  });
  const readinessRows = items.map((item) => ({
    item,
    readiness: conditionReadiness(item, st),
    strength: evidenceStrength(item, st),
  })).sort((a, b) => b.readiness.overall - a.readiness.overall || a.item.name.localeCompare(b.item.name));
  const projectedRatings = Object.values(ratingState.projected || {}).map(Number).filter((value) => Number.isFinite(value) && value > 0);
  const currentRating = Math.max(0, Math.min(100, Number(ratingState.currentRating || 0) || 0));
  const projected = projectedRatings.length ? combineRatings([currentRating, ...projectedRatings]) : null;
  const topActions = [
    ...review.findings.filter((finding) => finding.severity === "error"),
    ...review.findings.filter((finding) => finding.severity === "warn"),
    ...review.findings.filter((finding) => finding.severity === "info"),
  ].slice(0, 3);

  return {
    items,
    st,
    review,
    strongest: readinessRows.slice(0, 3),
    weakest: readinessRows.slice(-3).reverse(),
    projected,
    currentRating,
    restoreCount: loadWorkspaceSnapshots().length,
    theoryCount: loadTheoryState().length,
    topActions,
  };
}

function renderWorkspaceDashboard() {
  const host = document.getElementById("wsDashboard");
  if (!host) return;

  const data = computeWorkspaceDashboardData();
  const primary = data.st.primaryId ? CONDITIONS.find((condition) => condition.id === data.st.primaryId) : null;
  host.innerHTML = `
    <div class="dashboardSummaryGrid">
      <article class="dashboardMetricCard">
        <div class="small">Primary condition</div>
        <strong>${escapeHtml(primary?.name || "(not set)")}</strong>
        <div class="small">${escapeHtml(primary?.body_system || "Choose the strongest anchor condition to tighten the claim theory.")}</div>
      </article>
      <article class="dashboardMetricCard">
        <div class="small">Projected rating</div>
        <strong>${escapeHtml(data.projected ? `${data.currentRating}% -> ${data.projected.rounded}%` : data.currentRating ? `${data.currentRating}% current only` : "Not modeled")}</strong>
        <div class="small">Saved scenarios use estimate math only.</div>
      </article>
      <article class="dashboardMetricCard">
        <div class="small">Saved structure</div>
        <strong>${data.restoreCount} restore point${data.restoreCount === 1 ? "" : "s"}</strong>
        <div class="small">${data.theoryCount} structured theor${data.theoryCount === 1 ? "y" : "ies"} saved</div>
      </article>
      <article class="dashboardMetricCard">
        <div class="small">Packet review</div>
        <strong>${data.review.summary.errors} error(s) • ${data.review.summary.warnings} warning(s)</strong>
        <div class="small">${data.review.summary.infos} info note(s)</div>
      </article>
    </div>
    <div class="dashboardSplit">
      <article class="dashboardPane">
        <h4>Strongest conditions</h4>
        ${data.strongest.length
          ? data.strongest.map((row) => `<div class="small"><strong>${escapeHtml(row.item.name)}</strong> • ${row.readiness.overall}% readiness • ${escapeHtml(row.strength.label)} support</div>`).join("")
          : `<div class="small">No workspace conditions yet.</div>`}
      </article>
      <article class="dashboardPane">
        <h4>Weakest conditions</h4>
        ${data.weakest.length
          ? data.weakest.map((row) => `<div class="small"><strong>${escapeHtml(row.item.name)}</strong> • ${row.readiness.overall}% readiness • next: ${escapeHtml(row.readiness.nextAction)}</div>`).join("")
          : `<div class="small">No weak spots detected yet.</div>`}
      </article>
      <article class="dashboardPane">
        <h4>Next best actions</h4>
        ${data.topActions.length
          ? data.topActions.map((finding) => `<div class="small"><span class="healthTag">${escapeHtml(finding.severity.toUpperCase())}</span> ${escapeHtml(finding.text)}</div>`).join("")
          : `<div class="small">No urgent blockers. Use the coach, narrative, or binder tools to refine the packet.</div>`}
      </article>
    </div>
  `;
}

function ratingOptionsForCondition(item) {
  if (!item?.rating_logic) return [0, 10, 20, 30, 40, 50];

  if (item.rating_logic.type === "max_schedular") {
    return [0, 10];
  }

  if (item.rating_logic.type === "thresholds" && Array.isArray(item.rating_logic.thresholds)) {
    return [...new Set(item.rating_logic.thresholds.map(level => Number(level.rating_percent)).filter(Number.isFinite))].sort((a, b) => a - b);
  }

  if (item.rating_logic.type === "severity_ladder" && Array.isArray(item.rating_logic.levels)) {
    return [...new Set(item.rating_logic.levels.map(level => Number(level.rating_percent)).filter(Number.isFinite))].sort((a, b) => a - b);
  }

  if (item.rating_logic.type === "general_formula") {
    return [0, 10, 30, 50, 70, 100];
  }

  if (item.rating_logic.type === "table_method") {
    return [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  }

  return [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
}

function combineRatings(ratings) {
  const values = (ratings || []).map(Number).filter(value => Number.isFinite(value) && value > 0).sort((a, b) => b - a);
  if (!values.length) return { raw: 0, rounded: 0 };

  let combined = values[0];
  for (let i = 1; i < values.length; i += 1) {
    combined = combined + values[i] * (100 - combined) / 100;
  }

  const raw = Math.round(combined * 10) / 10;
  const rounded = Math.min(100, Math.round(raw / 10) * 10);
  return { raw, rounded };
}

function renderRatingEstimator() {
  const rowsEl = document.getElementById("wsRatingRows");
  const currentInput = document.getElementById("wsCurrentRating");
  const summaryEl = document.getElementById("wsRatingSummary");
  if (!rowsEl || !currentInput || !summaryEl) return;

  const state = loadRatingEstimatorState();
  const st = loadWorkspaceState();
  const items = (st.nodes || []).map(id => CONDITIONS.find(c => c.id === id)).filter(Boolean);

  currentInput.value = Number.isFinite(Number(state.currentRating)) ? String(state.currentRating) : "";

  if (!items.length) {
    rowsEl.innerHTML = `<div class="small">Add conditions to the workspace to model new or increased ratings.</div>`;
    summaryEl.textContent = "";
    renderRatingScenarioList();
    return;
  }

  rowsEl.innerHTML = items.map((item) => {
    const options = ratingOptionsForCondition(item);
    const saved = Number(state.projected?.[item.id] || 0);
    const strength = evidenceStrength(item, st);
    return `
      <article class="ratingRow">
        <div class="ratingRowTop">
          <div>
            <strong>${escapeHtml(item.name)}</strong>
            <span class="strengthBadge ${escapeHtml(strength.className)}">${escapeHtml(strength.label)} support</span>
            <div class="small">${escapeHtml(item.body_system || "")}</div>
          </div>
          <label class="builderField" style="min-width:150px">
            <span class="small">Projected rating</span>
            <select data-rating-condition="${escapeHtml(item.id)}">
              ${options.map(value => `<option value="${value}"${value === saved ? " selected" : ""}>${value}%</option>`).join("")}
            </select>
          </label>
        </div>
        <div class="small" style="margin-top:8px">${escapeHtml(item.rating_logic?.summary || "Use the condition details and evidence to choose a realistic scenario rating.")}</div>
      </article>
    `;
  }).join("");

  rowsEl.querySelectorAll("select[data-rating-condition]").forEach((select) => {
    select.addEventListener("change", () => {
      const next = loadRatingEstimatorState();
      next.projected = next.projected || {};
      next.projected[select.dataset.ratingCondition] = Number(select.value || 0);
      saveRatingEstimatorState(next);
      renderStickyWorkspaceSummary();
    });
  });

  summaryEl.textContent = "This estimate uses standard VA combined-rating math. It does not account for bilateral factor issues, pyramiding, effective dates, or whether a condition is already part of the current combined rating.";
  renderRatingScenarioList();
}

function generateScenarioComparisons() {
  const currentInput = document.getElementById("wsCurrentRating");
  const st = loadWorkspaceState();
  const items = (st.nodes || []).map(id => CONDITIONS.find(c => c.id === id)).filter(Boolean);
  const current = Math.max(0, Math.min(100, Number(currentInput?.value || 0) || 0));
  const estimatorState = loadRatingEstimatorState();

  const scenarioFor = (mode) => {
    const values = items.map((item) => {
      const options = ratingOptionsForCondition(item);
      const selected = Number(estimatorState.projected?.[item.id] || 0);
      const idx = options.indexOf(selected);
      if (mode === "moderate") return selected || 0;
      if (mode === "conservative") return idx > 0 ? (options[idx - 1] || 0) : (selected || 0);
      return idx >= 0 && idx < options.length - 1 ? (options[idx + 1] || selected || 0) : (selected || 0);
    }).filter((value) => value > 0);
    return combineRatings([current, ...values]);
  };

  const conservative = scenarioFor("conservative");
  const moderate = scenarioFor("moderate");
  const aggressive = scenarioFor("aggressive");

  return [
    `Conservative scenario: ${conservative.rounded}% combined (${conservative.raw}% raw)`,
    `Moderate scenario: ${moderate.rounded}% combined (${moderate.raw}% raw)`,
    `Aggressive scenario: ${aggressive.rounded}% combined (${aggressive.raw}% raw)`,
  ].join("\n");
}

function timelineNarrativeDraft(scope = "all") {
  const raw = workspaceTimelineDraft(scope);
  if (raw.includes("(No timeline entries")) {
    return "No timeline entries were found in this scope yet. Add dated events in condition detail views, then try again.";
  }

  const entries = raw.split("\n").slice(3).filter(Boolean);
  if (!entries.length) return "No timeline entries were found in this scope yet.";

  const narrativeBits = entries.slice(0, 8).map((line) => {
    const parts = line.split("•").map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 3) {
      return `On ${parts[0]}, ${parts[2]} was documented as ${parts[1].toLowerCase()}.`;
    }
    return line;
  });

  return `The current timeline shows a progression of events: ${narrativeBits.join(" ")} This sequence can be used to describe onset, treatment, worsening, and functional impact in a more narrative form.`;
}

function renderStickyWorkspaceSummary() {
  const host = document.getElementById("wsStickySummary");
  if (!host) return;

  const st = loadWorkspaceState();
  const primary = st.primaryId ? CONDITIONS.find(c => c.id === st.primaryId) : null;
  const ratingState = loadRatingEstimatorState();
  const snapshots = loadWorkspaceSnapshots();
  const activeProfile = activeWorkspaceProfile();
  const blockers = topWorkspaceBlockers(3);
  const currentRating = Math.max(0, Math.min(100, Number(ratingState.currentRating || 0) || 0));
  const projectedRatings = Object.values(ratingState.projected || {}).map(Number).filter((value) => Number.isFinite(value) && value > 0);
  const projected = projectedRatings.length ? combineRatings([currentRating, ...projectedRatings]) : null;

  host.innerHTML = `
    <div class="quickStartNames">
      <span class="quickStartTag">Profile: ${escapeHtml(activeProfile?.name || "unsaved workspace")}</span>
      <span class="quickStartTag">Primary: ${escapeHtml(primary?.name || "(not set)")}</span>
      <span class="quickStartTag">Projected rating: ${escapeHtml(projected ? `${currentRating}% -> ${projected.rounded}%` : currentRating ? `${currentRating}% current entered` : "not modeled")}</span>
      <span class="quickStartTag">Last snapshot: ${escapeHtml(snapshots[0]?.name || "none saved")}</span>
    </div>
    <div class="small">${blockers.length ? `Top blockers: ${blockers.join(" | ")}` : "Top blockers: none detected right now."}</div>
  `;
}

function renderStartHereSteps() {
  const host = document.getElementById("startHereSteps");
  if (!host) return;
  const st = loadWorkspaceState();
  const theories = loadTheoryState();
  const steps = [
    {
      title: "Choose a primary condition",
      done: !!st.primaryId,
      action: "builder-open",
      cta: "Open Builder",
      detail: "Use the Guided Claim Builder or search results to choose the strongest anchor condition first."
    },
    {
      title: "Link related conditions",
      done: (st.links || []).length > 0,
      action: "scroll-workspace",
      cta: "Open Workspace",
      detail: "Add secondaries, aggravation, or increase pathways so the claim chain is visible."
    },
    {
      title: "Capture at least one claim theory",
      done: theories.length > 0,
      action: "scroll-theory",
      cta: "Open Theory Builder",
      detail: "Write the actual theory in plain language so the packet and coach use the same logic."
    },
    {
      title: "Fill evidence and notes gaps",
      done: !topWorkspaceBlockers(1).length,
      action: "scroll-health",
      cta: "Open Health",
      detail: "Use the health queue and document intake to cover diagnosis, severity, timeline, and relationship support."
    },
  ];

  host.innerHTML = steps.map((step) => `
    <article class="builderSuggestionCard">
      <div class="builderSuggestionTop">
        <div>
          <strong>${step.done ? "Done" : "Next"}: ${escapeHtml(step.title)}</strong>
          <div class="small">${escapeHtml(step.detail)}</div>
        </div>
        <button class="miniBtn" data-start-action="${escapeHtml(step.action)}" type="button">${escapeHtml(step.cta)}</button>
      </div>
    </article>
  `).join("");

  host.querySelectorAll("[data-start-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.startAction;
      if (action === "builder-open") {
        document.getElementById("builderPrimary")?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (action === "scroll-workspace") {
        document.getElementById("workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (action === "scroll-theory") {
        document.getElementById("theoryType")?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (action === "scroll-health") {
        document.getElementById("wsHealth")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });
}

function computeHomepageNextAction() {
  const st = loadWorkspaceState();
  const theories = loadTheoryState();
  const blockers = topWorkspaceBlockers(3);
  const review = computeWorkspaceDashboardData();

  if (!st.primaryId) {
    return {
      title: "Choose a primary condition",
      detail: "Start with the issue that feels most central or best documented so the rest of the claim chain has a clear anchor.",
      cta: "Open Guided Claim Builder",
      targetId: "start-zone",
    };
  }

  if (!(st.links || []).length) {
    return {
      title: "Stage at least one related condition or claim path",
      detail: "Use a common bundle, browse related conditions, or add a secondary issue so the workspace shows the overall theory instead of a single node.",
      cta: "Open Browse Conditions",
      targetId: "search-zone",
    };
  }

  if (!theories.length) {
    return {
      title: "Save a structured claim theory",
      detail: "Turn the current workspace into a clear direct, secondary, aggravation, or increase theory so exports and coaching stay aligned.",
      cta: "Open Theory Builder",
      targetId: "ws-theory-panel",
    };
  }

  if (blockers.length) {
    return {
      title: "Work the top blocker",
      detail: blockers[0],
      cta: "Open Workspace Health",
      targetId: "ws-health-panel",
    };
  }

  if ((review.review.summary.warnings || 0) + (review.review.summary.errors || 0) > 0) {
    return {
      title: "Run packet review before export",
      detail: "The workspace is close, but a final review pass can catch unsupported assumptions or weak areas before you hand it off.",
      cta: "Open Packet Review",
      targetId: "ws-review-panel",
    };
  }

  return {
    title: "Generate a handoff or packet",
    detail: "The workspace looks reasonably staged. Generate a printable packet, submission-prep review, or representative handoff next.",
    cta: "Open Packet Tools",
    targetId: "ws-assembler-panel",
  };
}

function renderHomepageNextAction() {
  const host = document.getElementById("homeActionCard");
  if (!host) return;

  const action = computeHomepageNextAction();
  host.innerHTML = `
    <article class="builderSuggestionCard">
      <div class="builderSuggestionTop">
        <div>
          <strong>${escapeHtml(action.title)}</strong>
          <div class="small">${escapeHtml(action.detail)}</div>
        </div>
        <span class="provenanceTag prov-generated">Live guidance</span>
      </div>
      <div class="healthBtns" style="margin-top:12px">
        <button id="homeActionJump" class="miniBtn" type="button">${escapeHtml(action.cta)}</button>
      </div>
    </article>
  `;

  document.getElementById("homeActionJump")?.addEventListener("click", () => {
    document.getElementById(action.targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function renderHomepageUsageSummary() {
  const host = document.getElementById("homeUsageSummary");
  if (!host) return;

  const stats = loadHomeUsageStats();
  const topConditions = Object.entries(stats.conditions || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([id, count]) => ({ name: CONDITIONS.find((item) => item.id === id)?.name || id, count }));
  const topBundles = Object.entries(stats.bundles || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, count]) => ({ name: commonSecondaryBundles().find((item) => item.id === id)?.title || id, count }));
  const topPlans = Object.entries(stats.plans || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, count]) => ({ name: quickStartPlans().find((item) => item.id === id)?.title || id, count }));

  host.innerHTML = `
    <article class="builderSuggestionCard">
      <div class="builderSuggestionTop">
        <div>
          <strong>Most-used conditions</strong>
          <div class="small">${topConditions.length ? topConditions.map((item) => `${item.name} (${item.count})`).join(" • ") : "No condition usage history yet."}</div>
        </div>
        <span class="provenanceTag prov-generated">Local only</span>
      </div>
      <div class="small" style="margin-top:10px"><strong>Most common bundles:</strong> ${topBundles.length ? topBundles.map((item) => `${item.name} (${item.count})`).join(" • ") : "none yet"}</div>
      <div class="small" style="margin-top:6px"><strong>Most common quick-start plans:</strong> ${topPlans.length ? topPlans.map((item) => `${item.name} (${item.count})`).join(" • ") : "none yet"}</div>
    </article>
  `;
}

function renderTheoryBuilder() {
  const subjectEl = document.getElementById("theorySubject");
  const parentEl = document.getElementById("theoryParent");
  const listEl = document.getElementById("theoryList");
  if (!subjectEl || !parentEl || !listEl) return;

  const st = loadWorkspaceState();
  const items = (st.nodes || []).map(id => CONDITIONS.find(c => c.id === id)).filter(Boolean);
  subjectEl.innerHTML = items.length
    ? items.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("")
    : `<option value="">Add workspace conditions first</option>`;
  parentEl.innerHTML = `<option value="">None / not needed</option>${items.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("")}`;

  const theories = loadTheoryState();
  listEl.innerHTML = theories.length
    ? theories.map((theory) => {
        const subject = items.find((item) => item.id === theory.subjectId) || null;
        const parent = items.find((item) => item.id === theory.parentId) || null;
        const score = scoreTheoryRecord(theory, { subject, parent });
        return `
        <article class="builderSuggestionCard">
          <div class="builderSuggestionTop">
            <div>
              <strong>${escapeHtml(theory.type)}</strong>
              <div class="small">${escapeHtml(theory.subjectName)}${theory.parentName ? ` • linked to ${escapeHtml(theory.parentName)}` : ""}</div>
              <div class="small" style="margin-top:6px">${escapeHtml(theory.summary || "(no summary)")}</div>
              <div class="small" style="margin-top:6px"><strong>Theory review:</strong> ${escapeHtml(score.tier)} • ${score.score}/100</div>
              ${score.feedback.length ? `<div class="small" style="margin-top:4px">${escapeHtml(score.feedback.join(" "))}</div>` : ""}
            </div>
            <button class="miniBtn danger" data-theory-remove="${escapeHtml(theory.id)}" type="button">Remove</button>
          </div>
        </article>
      `;
      }).join("")
    : `<div class="small">No structured theories yet. Add one to tie the workspace, coach, and exports together.</div>`;

  listEl.querySelectorAll("[data-theory-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      const theoriesNow = loadTheoryState();
      const removed = theoriesNow.find((item) => item.id === button.dataset.theoryRemove);
      saveTheoryState(theoriesNow.filter((item) => item.id !== button.dataset.theoryRemove));
      if (removed) {
        pushWorkspaceActivity("Theory removed", `${removed.subjectName || "A claim theory"} was removed from the structured theory list.`);
      }
      renderTheoryBuilder();
      renderStartHereSteps();
      renderStickyWorkspaceSummary();
      renderWorkspaceActivity();
    });
  });
}

function generateRatingEstimateText() {
  const currentInput = document.getElementById("wsCurrentRating");
  const st = loadWorkspaceState();
  const items = (st.nodes || []).map(id => CONDITIONS.find(c => c.id === id)).filter(Boolean);
  const current = Math.max(0, Math.min(100, Number(currentInput?.value || 0) || 0));
  const projectedSelections = [...document.querySelectorAll("select[data-rating-condition]")]
    .map((select) => ({
      id: select.dataset.ratingCondition,
      percent: Number(select.value || 0),
    }))
    .filter((entry) => Number.isFinite(entry.percent) && entry.percent > 0);

  const combined = combineRatings([current, ...projectedSelections.map(entry => entry.percent)]);
  const increase = Math.max(0, combined.rounded - current);

  const lines = [];
  lines.push("VA CFR Finder — Combined Rating Projection (Estimate)");
  lines.push(new Date().toLocaleString());
  lines.push("");
  lines.push(`Current combined rating entered: ${current}%`);
  lines.push(`Projected combined rating: ${combined.rounded}%`);
  lines.push(`Estimated increase: ${increase}%`);
  lines.push(`Raw combined math result before VA rounding: ${combined.raw}%`);
  lines.push("");
  lines.push("Scenario rows included:");
  if (!projectedSelections.length) {
    lines.push("- No projected condition ratings selected yet.");
  } else {
    projectedSelections.forEach((entry) => {
      const item = items.find(condition => condition.id === entry.id);
      lines.push(`- ${item ? item.name : entry.id}: ${entry.percent}%`);
    });
  }
  lines.push("");
  lines.push("Important limits:");
  lines.push("- This is an estimate only.");
  lines.push("- It assumes the percentages entered here are new or increased ratings to model on top of the current combined rating.");
  lines.push("- It does not account for bilateral factor rules, pyramiding, effective dates, protected ratings, or grant/denial outcomes.");
  return lines.join("\n");
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

function evidenceStrength(item, st = loadWorkspaceState()) {
  const evidence = evidenceCompletion(item, loadEvidenceState(item.id));
  const notes = (loadNotes(item.id) || "").trim();
  const timelineCount = loadTimeline(item.id).length;
  const linkCount = loadEvidenceLinks(item.id).length;
  const parentCount = parentsOf(item.id, st.links).length;
  let score = 0;

  if (evidence.pct >= 80) score += 4;
  else if (evidence.pct >= 50) score += 2;
  else if (evidence.pct > 0) score += 1;

  if (notes) score += 2;
  if (timelineCount) score += 1;
  if (linkCount >= 2) score += 2;
  else if (linkCount === 1) score += 1;
  if (item.id === st.primaryId || parentCount) score += 1;

  if (score >= 7) return { label: "Strong", className: "strength-strong", score };
  if (score >= 4) return { label: "Moderate", className: "strength-moderate", score };
  return { label: "Weak", className: "strength-weak", score };
}

function generateStrategyCoachText() {
  const st = loadWorkspaceState();
  const items = (st.nodes || []).map(id => CONDITIONS.find(c => c.id === id)).filter(Boolean);
  if (!items.length) {
    return "No workspace items yet. Add a primary condition, then generate a strategy summary.";
  }

  const primary = st.primaryId ? CONDITIONS.find(c => c.id === st.primaryId) : null;
  const theories = loadTheoryState();
  const strengths = [];
  const weakSpots = [];

  items.forEach(item => {
    const strength = evidenceStrength(item, st);
    const readiness = conditionReadiness(item, st);
    const notes = (loadNotes(item.id) || "").trim();
    const links = loadEvidenceLinks(item.id).length;
    const timeline = loadTimeline(item.id).length;
    const rel = item.id === st.primaryId ? "Primary" : (parentsOf(item.id, st.links).length ? "Linked" : "Unlinked");
    const gaps = granularGapsForCondition(item, st);
    const line = `${item.name}: ${strength.label} support, ${readiness.overall}% readiness, ${rel.toLowerCase()}, ${links} evidence link${links === 1 ? "" : "s"}, ${timeline} timeline entr${timeline === 1 ? "y" : "ies"}, ${notes ? "notes present" : "notes missing"}${gaps.length ? `, biggest gaps: ${gaps.slice(0, 2).join("; ")}` : ""}.`;
    if (strength.label === "Strong") strengths.push(line);
    else weakSpots.push(line);
  });

  const health = computeHealthSummary();
  const nextSteps = [];
  if (!primary) nextSteps.push("Set a primary condition to anchor the claim theory.");
  if (health.orphans.length) nextSteps.push(`Link ${health.orphans.length} orphaned workspace item${health.orphans.length === 1 ? "" : "s"} into the claim chain.`);
  if (health.notesMissingIds.length) nextSteps.push(`Add notes for ${health.notesMissingIds.length} linked item${health.notesMissingIds.length === 1 ? "" : "s"} to explain timeline, severity, and nexus/support.`);
  if (health.evidence.lowReadinessIds.length) nextSteps.push(`Improve checklist coverage for ${health.evidence.lowReadinessIds.length} item${health.evidence.lowReadinessIds.length === 1 ? "" : "s"} with the weakest readiness.`);
  if (!nextSteps.length) nextSteps.push("Use the narrative, binder, and timeline tools to turn this organized workspace into a cleaner claim packet.");

  const lines = [];
  lines.push("VA CFR Finder — Claim Strategy Coach");
  lines.push(new Date().toLocaleString());
  lines.push("");
  lines.push(`Primary theory: ${primary ? primary.name : "(not set)"}`);
  lines.push(`Workspace scope: ${items.length} condition${items.length === 1 ? "" : "s"} with ${st.links.length} relationship link${st.links.length === 1 ? "" : "s"}.`);
  lines.push(`Overall readiness: ${health.evidence.done}/${health.evidence.total} (${health.evidence.pct}%).`);
  lines.push("Provenance: notes, timelines, evidence links, and saved theories are user-entered; intake matches and evidence suggestions are inferred; this coach summary is generated by the app.");
  lines.push("");
  lines.push("Structured theories:");
  (theories.length
    ? theories.slice(0, 4).map((theory) => `${theory.type}: ${theory.subjectName}${theory.parentName ? ` linked to ${theory.parentName}` : ""}${theory.summary ? ` — ${theory.summary}` : ""}`)
    : ["No structured theory has been saved yet. Use the Claim Theory Builder to make the workspace logic explicit."])
    .forEach((line) => lines.push(`- ${line}`));
  lines.push("");
  lines.push("Current strategy view:");
  lines.push(primary
    ? `Use ${primary.name} as the anchor condition, then support each linked issue with notes, evidence links, and a clear relationship explanation.`
    : "Choose the strongest-supported condition as the primary anchor, then link related issues underneath it.");
  lines.push("");
  lines.push("Strongest supported conditions:");
  (strengths.length ? strengths : ["No conditions are in the strong-support tier yet."]).forEach(line => lines.push(`- ${line}`));
  lines.push("");
  lines.push("Weak or incomplete areas:");
  (weakSpots.length ? weakSpots : ["No obvious weak spots detected."]).forEach(line => lines.push(`- ${line}`));
  lines.push("");
  lines.push("Recommended next actions:");
  nextSteps.slice(0, 5).forEach(step => lines.push(`- ${step}`));
  lines.push("");
  lines.push("Assumptions to review:");
  lines.push("- CFR references should be checked for freshness before relying on them.");
  lines.push("- Strong checklist completion does not replace condition-specific diagnosis, severity, and nexus detail.");
  lines.push("");
  lines.push("Educational use only. Verify facts, records, and current CFR language before relying on this summary.");
  return lines.join("\n");
}

function analyzeDocumentIntake(rawText) {
  const text = (rawText || "").trim();
  if (!text) {
    return { text: "", dates: [], matches: [] };
  }

  const lower = text.toLowerCase();
  const dates = [...new Set((text.match(/\b(?:19|20)\d{2}(?:-\d{2}(?:-\d{2})?)?\b/g) || []).slice(0, 10))];
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const matches = [];

  CONDITIONS.forEach(item => {
    const terms = [item.name, item.id, ...(item.aliases || [])].map(value => (value || "").toLowerCase()).filter(Boolean);
    const hit = terms.find(term => lower.includes(term));
    if (!hit) return;
    const supportingSentence = sentences.find(sentence => sentence.toLowerCase().includes(hit)) || "";
    matches.push({
      id: item.id,
      name: item.name,
      bodySystem: item.body_system || "",
      sentence: supportingSentence.trim(),
      hit
    });
  });

  return { text, dates, matches };
}

function extractRecordExcerpts(text, terms, maxCount = 3) {
  const sentences = (text || "").split(/(?<=[.!?])\s+/).filter(Boolean);
  const excerpts = [];
  sentences.forEach((sentence) => {
    const lower = sentence.toLowerCase();
    if (terms.some((term) => term && lower.includes(term.toLowerCase())) && !excerpts.includes(sentence.trim())) {
      excerpts.push(sentence.trim());
    }
  });
  return excerpts.slice(0, maxCount);
}

function detectClaimElements(text) {
  const lower = (text || "").toLowerCase();
  const elements = [];
  if (/\bdiagnos|dbq|exam|provider|treatment|record|assessment\b/.test(lower)) elements.push("diagnosis");
  if (/\bsever|frequency|impact|work|sleep|panic|flare|functional|missed work|prostrating\b/.test(lower)) elements.push("severity");
  if (/\b(?:19|20)\d{2}\b|\bonset\b|\bsince\b|\bafter\b|\bbefore\b|\bwhen\b/.test(lower)) elements.push("timeline");
  if (/\bnexus\b|\bdue to\b|\bcaused by\b|\bsecondary\b|\baggravat|\brelated to\b/.test(lower)) elements.push("nexus");
  return elements;
}

function analyzeRecordToClaimMapper(rawText, workspaceItems = CONDITIONS) {
  const text = (rawText || "").trim();
  if (!text) {
    return { text: "", conditions: [], globalElements: [], followUps: [] };
  }

  const globalElements = detectClaimElements(text);
  const items = (workspaceItems || []).filter(Boolean);
  const conditions = items.map((item) => {
    const terms = [item.name, item.id, ...(item.aliases || [])].filter(Boolean);
    const excerpts = extractRecordExcerpts(text, terms, 3);
    const claimElements = detectClaimElements(excerpts.join(" ") || text);
    let confidence = 0;
    const lower = text.toLowerCase();
    terms.forEach((term) => {
      if (!term) return;
      const normalized = term.toLowerCase();
      if (lower.includes(normalized)) {
        confidence += normalized === item.id.toLowerCase() ? 0.22 : 0.35;
      }
    });
    if (item.body_system && lower.includes(item.body_system.toLowerCase())) confidence += 0.1;
    if (claimElements.length) confidence += Math.min(0.25, claimElements.length * 0.06);
    confidence = Math.max(0, Math.min(0.98, confidence));
    const followUps = [];
    if (!claimElements.includes("diagnosis")) followUps.push("This record may mention the condition, but diagnosis support is still unclear.");
    if (!claimElements.includes("severity")) followUps.push("Add detail about symptom frequency, flare pattern, or functional impact.");
    if (!claimElements.includes("timeline")) followUps.push("Capture when symptoms started, worsened, or were treated.");
    if (!claimElements.includes("nexus") && /\bsecondary|aggravat|caused by|due to\b/i.test(text) === false) followUps.push("If this supports a relationship theory, explain the mechanism more directly.");
    return {
      id: item.id,
      name: item.name,
      confidence,
      claimElements,
      excerpts,
      followUps: followUps.slice(0, 2),
    };
  }).filter((entry) => entry.confidence >= 0.2 || entry.excerpts.length)
    .sort((a, b) => b.confidence - a.confidence || a.name.localeCompare(b.name))
    .slice(0, 6);

  const followUps = [];
  if (!globalElements.includes("diagnosis")) followUps.push("Diagnosis evidence is still not obvious in this record.");
  if (!globalElements.includes("severity")) followUps.push("This record needs stronger severity or functional-impact detail.");
  if (!globalElements.includes("timeline")) followUps.push("Add or extract clearer dates before relying on this as chronology support.");
  if (!globalElements.includes("nexus")) followUps.push("If this record supports a secondary or aggravation theory, add clearer nexus wording.");

  return {
    text,
    conditions,
    globalElements,
    followUps: [...new Set(followUps)].slice(0, 4),
  };
}

function extractEvidenceSignals(rawText, workspaceItems = CONDITIONS) {
  const text = (rawText || "").trim();
  if (!text) {
    return {
      text: "",
      dates: [],
      providers: [],
      symptoms: [],
      diagnosisPhrases: [],
      severityPhrases: [],
      nexusPhrases: [],
      likelyTargets: [],
    };
  }

  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const dates = [...new Set((text.match(/\b(?:19|20)\d{2}(?:-\d{2}(?:-\d{2})?)?\b/g) || []).slice(0, 12))];
  const providerMatches = text.match(/\b(?:Dr\.?\s+[A-Z][a-z]+|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+(?:Clinic|Medical Center|Hospital|Neurology|Psychiatry|Audiology|ENT|Primary Care|Sleep Medicine))\b/g) || [];
  const providers = [...new Set(providerMatches.map((item) => item.trim()))].slice(0, 8);

  const symptomTerms = [
    "pain", "headache", "migraine", "insomnia", "sleep disruption", "nightmares", "panic", "anxiety",
    "depression", "fatigue", "numbness", "tingling", "weakness", "dizziness", "congestion", "reflux",
    "heartburn", "diarrhea", "constipation", "missed work", "flare", "prostrating", "shortness of breath",
  ];
  const lower = text.toLowerCase();
  const symptoms = symptomTerms.filter((term) => lower.includes(term)).slice(0, 10);

  const diagnosisPhrases = sentences.filter((sentence) => /\bdiagnos|assessment|impression|dbq|examiner diagnosed|medical opinion\b/i.test(sentence)).slice(0, 4);
  const severityPhrases = sentences.filter((sentence) => /\bsever|frequency|impact|functional|missed work|prostrating|flare|worsen|sleep disruption\b/i.test(sentence)).slice(0, 4);
  const nexusPhrases = sentences.filter((sentence) => /\bdue to\b|\bcaused by\b|\bsecondary\b|\baggravat|\brelated to\b|\bworsen(?:ed|ing)? by\b/i.test(sentence)).slice(0, 4);

  const mapping = analyzeRecordToClaimMapper(text, workspaceItems);
  return {
    text,
    dates,
    providers,
    symptoms,
    diagnosisPhrases,
    severityPhrases,
    nexusPhrases,
    likelyTargets: mapping.conditions.slice(0, 4),
  };
}

function buildExtractorNoteSummary(extractor, targetName = "Condition") {
  const lines = [`[Extracted evidence summary for ${targetName}]`];
  if (extractor.providers?.length) lines.push(`Providers / sources: ${extractor.providers.join(", ")}`);
  if (extractor.dates?.length) lines.push(`Dates mentioned: ${extractor.dates.join(", ")}`);
  if (extractor.symptoms?.length) lines.push(`Symptoms / issues: ${extractor.symptoms.join(", ")}`);
  if (extractor.diagnosisPhrases?.length) lines.push(`Diagnosis phrases: ${extractor.diagnosisPhrases.join(" ")}`);
  if (extractor.severityPhrases?.length) lines.push(`Severity / impact phrases: ${extractor.severityPhrases.join(" ")}`);
  if (extractor.nexusPhrases?.length) lines.push(`Nexus / relationship phrases: ${extractor.nexusPhrases.join(" ")}`);
  return lines.join("\n");
}

function normalizeExtractorPhrase(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function dedupeExtractorValues(items = []) {
  const seen = new Set();
  return items
    .map((item) => normalizeExtractorPhrase(item))
    .filter((item) => {
      if (!item) return false;
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function buildExtractorDraft(extractor = {}) {
  return {
    providers: dedupeExtractorValues(extractor.providers || []),
    symptoms: dedupeExtractorValues(extractor.symptoms || []),
    dates: dedupeExtractorValues(extractor.dates || []),
    diagnosisPhrases: dedupeExtractorValues(extractor.diagnosisPhrases || []),
    severityPhrases: dedupeExtractorValues(extractor.severityPhrases || []),
    nexusPhrases: dedupeExtractorValues(extractor.nexusPhrases || []),
  };
}

function pruneExtractorDraft(draft = {}) {
  return {
    providers: dedupeExtractorValues(draft.providers || []),
    symptoms: dedupeExtractorValues(draft.symptoms || []),
    dates: dedupeExtractorValues(draft.dates || []),
    diagnosisPhrases: dedupeExtractorValues(draft.diagnosisPhrases || []),
    severityPhrases: dedupeExtractorValues(draft.severityPhrases || []),
    nexusPhrases: dedupeExtractorValues(draft.nexusPhrases || []),
  };
}

function extractorReviewSummary(draft = {}) {
  const groups = [
    draft.providers || [],
    draft.symptoms || [],
    draft.dates || [],
    draft.diagnosisPhrases || [],
    draft.severityPhrases || [],
    draft.nexusPhrases || [],
  ];
  return groups.reduce((sum, group) => sum + group.length, 0);
}

function buildExtractorTimelinePreview(extractor = {}, targetName = "Condition") {
  const dates = Array.isArray(extractor.dates) ? extractor.dates.filter(Boolean).slice(0, 4) : [];
  return dates.map((date) => ({
    date,
    type: "Other",
    note: `Document extractor imported date for ${targetName}${extractor.providers?.[0] ? ` (${extractor.providers[0]})` : ""}.`,
  }));
}

function buildExtractorEvidencePreview(extractor = {}, options = {}) {
  const targetName = (options.targetName || "").trim();
  const labelBase = (options.labelBase || "").trim() || "Extracted record evidence";
  const excerpt = [
    ...(extractor.diagnosisPhrases || []).slice(0, 1),
    ...(extractor.severityPhrases || []).slice(0, 1),
    ...(extractor.nexusPhrases || []).slice(0, 1),
  ].join(" ").trim() || String(options.fallbackText || "").slice(0, 240).trim();

  return {
    label: targetName ? `${labelBase} — ${targetName}` : labelBase,
    type: (options.type || "").trim() || "General",
    excerpt,
    tags: dedupeExtractorValues([
      ...(Array.isArray(options.tags) ? options.tags : []),
      ...((extractor.symptoms || []).slice(0, 4)),
    ]),
    date: (extractor.dates || [])[0] || "",
  };
}

function compareExtractorPreview(preview = {}, existing = {}) {
  const existingNotes = normalizeExtractorPhrase(existing.notes || "");
  const noteSummary = normalizeExtractorPhrase(preview.noteSummary || "");
  const noteStatus = !noteSummary
    ? { status: "empty", detail: "No note summary will be generated." }
    : existingNotes.toLowerCase().includes(noteSummary.toLowerCase())
      ? { status: "duplicate", detail: "This summary already appears in the target notes." }
      : { status: "new", detail: "This summary will append new note content." };

  const existingTimeline = Array.isArray(existing.timeline) ? existing.timeline : [];
  const previewTimeline = Array.isArray(preview.timelineEntries) ? preview.timelineEntries : [];
  const duplicateTimeline = previewTimeline.filter((entry) =>
    existingTimeline.some((saved) =>
      normalizeExtractorPhrase(saved.date || "") === normalizeExtractorPhrase(entry.date || "") &&
      normalizeExtractorPhrase(saved.note || "") === normalizeExtractorPhrase(entry.note || "")
    )
  );
  const timelineStatus = !previewTimeline.length
    ? { status: "empty", detail: "No timeline entries will be added." }
    : duplicateTimeline.length
      ? { status: "mixed", detail: `${duplicateTimeline.length} of ${previewTimeline.length} timeline entr${previewTimeline.length === 1 ? "y is" : "ies are"} already present.` }
      : { status: "new", detail: `All ${previewTimeline.length} timeline entr${previewTimeline.length === 1 ? "y is" : "ies are"} new.` };

  const evidenceRecord = preview.evidenceRecord || {};
  const existingEvidence = Array.isArray(existing.evidenceLinks) ? existing.evidenceLinks : [];
  const duplicateEvidence = existingEvidence.some((entry) =>
    normalizeExtractorPhrase(entry.label || "") === normalizeExtractorPhrase(evidenceRecord.label || "") &&
    normalizeExtractorPhrase(entry.note || "") === normalizeExtractorPhrase(evidenceRecord.excerpt || "") &&
    normalizeExtractorPhrase(entry.date || "") === normalizeExtractorPhrase(evidenceRecord.date || "")
  );
  const evidenceStatus = !evidenceRecord.label && !evidenceRecord.excerpt
    ? { status: "empty", detail: "No evidence record will be created." }
    : duplicateEvidence
      ? { status: "duplicate", detail: "A matching evidence link already exists on this condition." }
      : { status: "new", detail: "This evidence record looks new for the target condition." };

  return {
    noteStatus,
    timelineStatus,
    evidenceStatus,
    duplicateTimelineCount: duplicateTimeline.length,
    duplicateTimeline,
    duplicateEvidence,
  };
}

function computeExtractorApplyNewPlan(preview = {}, existing = {}) {
  const compare = compareExtractorPreview(preview, existing);
  const newTimelineEntries = (Array.isArray(preview.timelineEntries) ? preview.timelineEntries : []).filter((entry) =>
    !compare.duplicateTimeline.some((duplicate) =>
      normalizeExtractorPhrase(duplicate.date || "") === normalizeExtractorPhrase(entry.date || "") &&
      normalizeExtractorPhrase(duplicate.note || "") === normalizeExtractorPhrase(entry.note || "")
    )
  );

  return {
    noteSummary: compare.noteStatus.status === "new" ? String(preview.noteSummary || "").trim() : "",
    timelineEntries: newTimelineEntries,
    evidenceRecord: compare.evidenceStatus.status === "new" ? (preview.evidenceRecord || null) : null,
    compare,
  };
}

function buildExtractorDraftPacketText(preview = {}, options = {}) {
  const targetName = preview.target?.name || options.targetName || "Condition";
  const sourceName = (options.sourceName || "").trim() || "Document intake";
  const lines = [];
  lines.push(`[Extractor Draft Packet: ${targetName}]`);
  lines.push(`Source: ${sourceName}`);
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push("");
  lines.push("[Notes Summary]");
  lines.push((preview.noteSummary || "").trim() || "No notes summary generated.");
  lines.push("");
  lines.push("[Timeline Draft]");
  if (Array.isArray(preview.timelineEntries) && preview.timelineEntries.length) {
    preview.timelineEntries.forEach((entry) => {
      lines.push(`${entry.date} • ${entry.type}`);
      lines.push(entry.note || "");
      lines.push("");
    });
  } else {
    lines.push("No timeline entries generated.");
    lines.push("");
  }
  lines.push("[Evidence Draft]");
  const evidence = preview.evidenceRecord || {};
  lines.push(`Label: ${evidence.label || "No evidence label"}`);
  lines.push(`Type: ${evidence.type || "General"}`);
  if (evidence.date) lines.push(`Date: ${evidence.date}`);
  if (Array.isArray(evidence.tags) && evidence.tags.length) lines.push(`Tags: ${evidence.tags.join(", ")}`);
  lines.push(`Excerpt: ${evidence.excerpt || "(no excerpt available)"}`);
  lines.push("");
  lines.push("[Duplicate Check]");
  lines.push(`Notes: ${preview.compare?.noteStatus?.detail || "No comparison available."}`);
  lines.push(`Timeline: ${preview.compare?.timelineStatus?.detail || "No comparison available."}`);
  lines.push(`Evidence: ${preview.compare?.evidenceStatus?.detail || "No comparison available."}`);
  return lines.join("\n");
}

function parseExtractorDraftPacketSections(text = "") {
  const lines = String(text || "").split("\n");
  const sections = {};
  let current = "header";
  sections[current] = [];
  lines.forEach((line) => {
    const match = line.match(/^\[(.+)\]$/);
    if (match) {
      current = match[1];
      sections[current] = sections[current] || [];
      return;
    }
    sections[current] = sections[current] || [];
    sections[current].push(line);
  });
  return sections;
}

function compareExtractorPacketRecords(left = {}, right = {}) {
  const leftSections = parseExtractorDraftPacketSections(left.text || "");
  const rightSections = parseExtractorDraftPacketSections(right.text || "");
  const sectionNames = [...new Set([...Object.keys(leftSections), ...Object.keys(rightSections)])];
  const findings = sectionNames.map((name) => {
    const leftText = (leftSections[name] || []).join("\n").trim();
    const rightText = (rightSections[name] || []).join("\n").trim();
    if (leftText === rightText) {
      return { section: name, status: "same", detail: "No meaningful change." };
    }
    if (!leftText) {
      return { section: name, status: "added", detail: `${right.title || "Right packet"} adds content in this section.` };
    }
    if (!rightText) {
      return { section: name, status: "removed", detail: `${right.title || "Right packet"} removes content from this section.` };
    }
    return {
      section: name,
      status: "changed",
      detail: `${Math.abs(leftText.length - rightText.length)} character difference and changed section content.`,
    };
  });

  const lines = [];
  lines.push(`[Extractor Draft Packet Compare]`);
  lines.push(`Left: ${(left.title || "Packet A").trim()}`);
  lines.push(`Right: ${(right.title || "Packet B").trim()}`);
  lines.push("");
  findings.forEach((finding) => {
    lines.push(`${finding.section}: ${finding.detail}`);
  });

  return {
    findings,
    text: lines.join("\n"),
  };
}

function parseExtractorTimelineDraft(text = "") {
  const lines = String(text || "").split("\n");
  const entries = [];
  let current = null;
  lines.forEach((line) => {
    const trimmed = line.trim();
    const match = trimmed.match(/^(\d{4}(?:-\d{2}(?:-\d{2})?)?)\s+•\s+(.+)$/);
    if (match) {
      if (current) entries.push(current);
      current = { date: match[1], type: match[2].trim(), note: "" };
      return;
    }
    if (!trimmed) {
      if (current) {
        entries.push(current);
        current = null;
      }
      return;
    }
    if (current) {
      current.note = current.note ? `${current.note}\n${trimmed}` : trimmed;
    }
  });
  if (current) entries.push(current);
  return entries;
}

function parseExtractorEvidenceDraft(text = "") {
  const lines = String(text || "").split("\n");
  const record = { label: "", type: "General", date: "", tags: [], excerpt: "" };
  let excerptMode = false;
  lines.forEach((line) => {
    if (line.startsWith("Label: ")) {
      record.label = line.slice(7).trim();
      excerptMode = false;
      return;
    }
    if (line.startsWith("Type: ")) {
      record.type = line.slice(6).trim() || "General";
      excerptMode = false;
      return;
    }
    if (line.startsWith("Date: ")) {
      record.date = line.slice(6).trim();
      excerptMode = false;
      return;
    }
    if (line.startsWith("Tags: ")) {
      record.tags = line.slice(6).split(",").map((item) => item.trim()).filter(Boolean);
      excerptMode = false;
      return;
    }
    if (line.startsWith("Excerpt: ")) {
      record.excerpt = line.slice(9).trim();
      excerptMode = true;
      return;
    }
    if (excerptMode && line.trim()) {
      record.excerpt = record.excerpt ? `${record.excerpt}\n${line.trim()}` : line.trim();
    }
  });
  return record;
}

function buildExtractorPacketPreview(packet = {}) {
  const sections = parseExtractorDraftPacketSections(packet.text || "");
  return {
    target: { id: packet.targetId || "", name: packet.targetName || "Condition" },
    noteSummary: ((sections["Notes Summary"] || []).join("\n")).trim(),
    timelineEntries: parseExtractorTimelineDraft((sections["Timeline Draft"] || []).join("\n")),
    evidenceRecord: parseExtractorEvidenceDraft((sections["Evidence Draft"] || []).join("\n")),
    compare: packet.compare && typeof packet.compare === "object" ? packet.compare : {},
  };
}

function selectedExtractorValues(container, name) {
  if (!container) return [];
  return [...container.querySelectorAll(`input[data-extractor-${name}]:checked`)]
    .map((input) => input.value || "")
    .filter(Boolean);
}

function extractorSourceLabel(analysis) {
  const sourceName = (analysis?.sourceName || "").trim();
  return sourceName || "Document intake";
}

function inferDocumentSourceType(file) {
  const extension = `.${(file?.name || "").split(".").pop() || ""}`.toLowerCase();
  if (extension === ".pdf" || extension === ".docx") return "inferred";
  return "user-entered";
}

async function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error || new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

async function extractStructuredDocument(file) {
  const base64 = await readFileAsBase64(file);
  const response = await fetch("/api/extract-document", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      mimeType: file.type || "",
      base64,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Could not extract that document.");
  }

  return payload;
}

function computeEvidenceCoverageMatrix(items, st = loadWorkspaceState()) {
  const rows = (items || []).map((item) => {
    const notes = (loadNotes(item.id) || "").trim();
    const evidenceLinks = loadEvidenceLinks(item.id);
    const timeline = loadTimeline(item.id);
    const readiness = conditionReadiness(item, st);
    const combinedText = [
      notes,
      ...evidenceLinks.map((link) => `${link.label || ""} ${link.note || ""} ${link.type || ""}`),
    ].join(" ");
    const elements = new Set(detectClaimElements(combinedText));
    if (timeline.length) elements.add("timeline");
    if (evidenceLinks.length) elements.add("diagnosis");
    const hasParent = parentsOf(item.id, st.links).length > 0;
    if (hasParent && /\bnexus\b|\bsecondary\b|\bdue to\b|\bcaused by\b|\baggravat|\brelated to\b/i.test(notes)) {
      elements.add("nexus");
    }
    if (/\bimpact\b|\bfrequency\b|\bflare\b|\bwork\b|\bsleep\b|\bpanic\b|\bprostrating\b|\bfunctional\b/i.test(combinedText)) {
      elements.add("severity");
    }

    const cells = {
      diagnosis: readiness.scores.diagnosis >= 60 || elements.has("diagnosis"),
      severity: readiness.scores.severity >= 60 || elements.has("severity"),
      timeline: readiness.scores.timeline >= 60 || elements.has("timeline"),
      nexus: item.id === st.primaryId ? true : (readiness.scores.nexus >= 60 || elements.has("nexus")),
    };

    const missing = Object.entries(cells)
      .filter(([, covered]) => !covered)
      .map(([key]) => key);

    return {
      id: item.id,
      name: item.name,
      cells,
      missing,
      nextAction: missing.length
        ? `Add ${missing.slice(0, 2).join(" and ")} support next.`
        : "Coverage looks balanced across the core claim elements.",
    };
  });

  const totals = rows.reduce((acc, row) => {
    Object.entries(row.cells).forEach(([key, covered]) => {
      acc[key] = acc[key] || { covered: 0, total: 0 };
      acc[key].total += 1;
      if (covered) acc[key].covered += 1;
    });
    return acc;
  }, {});

  return { rows, totals };
}

function buildCoverageStarter(itemId, element, st = loadWorkspaceState()) {
  const item = CONDITIONS.find((condition) => condition.id === itemId) || { id: itemId, name: conditionNameById(itemId) };
  const parentLink = parentsOf(itemId, st.links)[0] || null;
  const parentName = parentLink ? conditionNameById(parentLink.from) : "the related condition";

  if (element === "timeline") {
    return {
      jump: "timeline",
      timelineTemplate: `Document the first clear dated event for ${item.name}: symptom onset, diagnosis, treatment, worsening, or exam milestone.`,
    };
  }

  if (element === "nexus") {
    return {
      jump: "notes",
      noteTemplate: `[Nexus starter]\nTheory: ${item.name} is related to ${parentName}.\nMechanism:\nSupporting records:\nFunctional impact:\nWhy this relationship makes sense:\n`,
    };
  }

  if (element === "severity") {
    return {
      jump: "notes",
      noteTemplate: `[Severity starter]\nFrequency / flare pattern:\nHow symptoms affect work, sleep, concentration, mobility, or daily life:\nWorst days / bad periods:\nTreatment changes or worsening since:\n`,
    };
  }

  return {
    jump: "notes",
    noteTemplate: `[Diagnosis support starter]\nDiagnosis source / provider:\nRecord or DBQ date:\nKey symptoms documented:\nWhy this record matters for ${item.name}:\n`,
  };
}

function queueCoverageFocus(itemId, element) {
  PENDING_COVERAGE_FOCUS = {
    itemId,
    element,
    createdAt: Date.now(),
  };
}

function applyCoverageFocusAction(item) {
  if (!PENDING_COVERAGE_FOCUS || PENDING_COVERAGE_FOCUS.itemId !== item?.id) return;
  const pending = PENDING_COVERAGE_FOCUS;
  PENDING_COVERAGE_FOCUS = null;
  const starter = buildCoverageStarter(item.id, pending.element, loadWorkspaceState());

  if (starter.jump === "timeline") {
    const timelineHeading = document.getElementById("jump-timeline");
    if (timelineHeading) timelineHeading.scrollIntoView({ behavior: "smooth", block: "start" });
    const tlDate = document.getElementById("tlDate");
    const tlNote = document.getElementById("tlNote");
    if (tlNote && !tlNote.value.trim()) {
      tlNote.value = starter.timelineTemplate || "";
    }
    setTimeout(() => {
      tlDate?.focus();
    }, 150);
    return;
  }

  const notesAnchor = document.getElementById("jump-notes");
  if (notesAnchor) notesAnchor.scrollIntoView({ behavior: "smooth", block: "start" });
  const notesEl = document.getElementById("notes");
  if (notesEl && starter.noteTemplate) {
    const current = (notesEl.value || "").trim();
    if (!current) {
      notesEl.value = starter.noteTemplate;
      saveNotes(item.id, notesEl.value);
    } else if (!current.includes(starter.noteTemplate.split("\n")[0])) {
      notesEl.value = `${notesEl.value.trim()}\n\n${starter.noteTemplate}`;
      saveNotes(item.id, notesEl.value);
    }
    setTimeout(() => {
      notesEl.focus();
      notesEl.setSelectionRange(notesEl.value.length, notesEl.value.length);
    }, 150);
  }
}

function renderEvidenceCoverageMatrix() {
  const host = document.getElementById("wsCoverageMatrix");
  const summary = document.getElementById("wsCoverageSummary");
  if (!host || !summary) return;

  const st = loadWorkspaceState();
  const items = (st.nodes || []).map((id) => CONDITIONS.find((condition) => condition.id === id)).filter(Boolean);
  if (!items.length) {
    summary.textContent = "";
    host.innerHTML = `<div class="small">Add workspace conditions to see claim-element coverage across diagnosis, severity, timeline, and nexus.</div>`;
    return;
  }

  const matrix = computeEvidenceCoverageMatrix(items, st);
  const totalsText = ["diagnosis", "severity", "timeline", "nexus"]
    .map((key) => `${key}: ${matrix.totals[key]?.covered || 0}/${matrix.totals[key]?.total || 0}`)
    .join(" • ");
  const weakestRows = matrix.rows.filter((row) => row.missing.length).sort((a, b) => b.missing.length - a.missing.length).slice(0, 3);
  summary.textContent = `Coverage totals — ${totalsText}${weakestRows.length ? ` • biggest gaps: ${weakestRows.map((row) => `${row.name} (${row.missing.join(", ")})`).join(" | ")}` : ""}`;

  const cell = (covered, label, rowId, element) => covered
    ? `<span class="coverageCell coverage-yes" title="${escapeHtml(label)}">Yes</span>`
    : `<button class="coverageCell coverage-no" data-coverage-open="${escapeHtml(rowId)}" data-coverage-element="${escapeHtml(element)}" title="${escapeHtml(label)}" type="button">Fix</button>`;
  host.innerHTML = `
    <div class="coverageMatrix">
      <div class="coverageHeader">Condition</div>
      <div class="coverageHeader">Diagnosis</div>
      <div class="coverageHeader">Severity</div>
      <div class="coverageHeader">Timeline</div>
      <div class="coverageHeader">Nexus</div>
      <div class="coverageHeader">Next move</div>
      ${matrix.rows.map((row) => `
        <div class="coverageName"><strong>${escapeHtml(row.name)}</strong></div>
        <div>${cell(row.cells.diagnosis, `${row.name} diagnosis coverage`, row.id, "diagnosis")}</div>
        <div>${cell(row.cells.severity, `${row.name} severity coverage`, row.id, "severity")}</div>
        <div>${cell(row.cells.timeline, `${row.name} timeline coverage`, row.id, "timeline")}</div>
        <div>${cell(row.cells.nexus, `${row.name} nexus coverage`, row.id, "nexus")}</div>
        <div class="small">${escapeHtml(row.nextAction)}</div>
      `).join("")}
    </div>
  `;

  host.querySelectorAll("[data-coverage-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.coverageOpen || "";
      const element = button.dataset.coverageElement || "notes";
      if (!id) return;
      queueCoverageFocus(id, element);
      showDetail(id, true, element === "timeline" ? "timeline" : "notes");
      document.getElementById("detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function scoreTheoryRecord(theory, context = {}) {
  const summary = (theory?.summary || "").trim();
  const item = context.subject || null;
  const parent = context.parent || null;
  let score = 0;
  const feedback = [];

  if (summary) score += 25;
  else feedback.push("Add a plain-language summary so the theory is understandable outside the workspace.");

  if (theory?.subjectId) score += 15;
  if (theory?.type) score += 10;

  if (/direct/i.test(theory?.type || "")) {
    if (/\bin service\b|\bservice\b|\bonset\b|\bdeployment\b|\bexposure\b/i.test(summary)) score += 20;
    else feedback.push("Direct theories read stronger when they explain the in-service event, exposure, or onset.");
  }

  if (/secondary|aggravation|increase/i.test(theory?.type || "")) {
    if (theory?.parentId) score += 15;
    else feedback.push("Link the theory to a parent condition so the relationship is explicit.");
    if (/\bdue to\b|\bcaused by\b|\baggravat|\brelated to\b|\bworsen/i.test(summary)) score += 15;
    else feedback.push("Use clearer relationship language like caused by, aggravated by, or worsened by.");
  }

  if (/\bimpact\b|\bwork\b|\bsleep\b|\bpanic\b|\bpain\b|\bfrequency\b|\bflare\b/i.test(summary)) score += 10;
  else feedback.push("Add symptom, severity, or functional-impact language so the reviewer understands why the claim matters.");

  if (item?.body_system && summary.toLowerCase().includes((item.body_system || "").toLowerCase())) score += 5;
  if (parent && /\bsecondary|aggravation|increase/i.test(theory?.type || "")) score += 5;

  const tier = score >= 75 ? "Strong" : score >= 50 ? "Moderate" : "Needs work";
  return { score, tier, feedback: [...new Set(feedback)].slice(0, 3) };
}

function buildPrintablePacketHtml(items, options = {}) {
  const audience = options.audience || "review";
  const primary = options.primary || null;
  const theories = options.theories || [];
  const audienceTitle = audience === "veteran"
    ? "Veteran Packet"
    : audience === "representative"
      ? "Representative Packet"
      : "Quick Review Packet";
  const generatedAt = new Date().toLocaleString();
  const readinessRows = (items || []).map((item) => conditionReadiness(item, loadWorkspaceState()));
  const avgReadiness = readinessRows.length
    ? Math.round(readinessRows.reduce((sum, row) => sum + row.overall, 0) / readinessRows.length)
    : 0;
  const renderedItems = (items || []).map((item) => {
    const readiness = conditionReadiness(item, loadWorkspaceState());
    const notes = escapeHtml((loadNotes(item.id) || "").trim() || "(none)");
    const evidenceLinks = loadEvidenceLinks(item.id);
    const timeline = loadTimeline(item.id);
    return `
      <section class="packetSection">
        <h3>${escapeHtml(item.name)}</h3>
        <p><strong>Body system:</strong> ${escapeHtml(item.body_system || "(unknown)")}</p>
        <p><strong>Readiness:</strong> ${readiness.overall}% | Diagnosis ${readiness.scores.diagnosis}% | Severity ${readiness.scores.severity}% | Nexus ${readiness.scores.nexus}% | Timeline ${readiness.scores.timeline}% | Evidence ${readiness.scores.evidence}%</p>
        <p><strong>Next action:</strong> ${escapeHtml(readiness.nextAction)}</p>
        <p><strong>Notes:</strong><br/>${notes.replaceAll("\n", "<br/>")}</p>
        <p><strong>Evidence links:</strong> ${evidenceLinks.length ? evidenceLinks.map((link) => escapeHtml(link.label || link.url || "Evidence")).join(", ") : "(none)"}</p>
        <p><strong>Timeline entries:</strong> ${timeline.length ? timeline.map((entry) => `${escapeHtml(entry.date || "")} ${escapeHtml(entry.type || "")}`).join(" | ") : "(none)"}</p>
      </section>
    `;
  }).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>VA CFR Finder Printable Packet</title>
  <style>
    body { font-family: Georgia, "Times New Roman", serif; margin: 32px auto; max-width: 920px; color: #111; line-height: 1.5; background: #faf8f2; }
    h1, h2, h3 { margin-bottom: 8px; }
    .coverSheet { background: linear-gradient(180deg, #f7f0d7 0%, #fff 100%); border: 1px solid #d7d1bb; border-radius: 16px; padding: 28px; margin-bottom: 20px; }
    .packetMeta, .packetSection { border: 1px solid #d7d7d7; border-radius: 12px; padding: 16px; margin-bottom: 16px; background: #fff; }
    .packetGrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .summaryStrip { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 16px; }
    .summaryCard { border: 1px solid #e3e0d4; border-radius: 12px; padding: 12px; background: #fffdfa; }
    .tag { display: inline-block; padding: 4px 8px; border-radius: 999px; background: #f2f2f2; margin-right: 8px; font-size: 0.9rem; }
    .coverIntro { max-width: 56rem; }
    .assumptionList li { margin-bottom: 6px; }
    .pageBreak { page-break-before: always; break-before: page; }
    @media print {
      button { display: none; }
      body { margin: 0.5in; background: #fff; }
      .coverSheet { page-break-after: always; }
      .pageBreak { page-break-before: always; break-before: page; }
    }
  </style>
</head>
<body>
  <section class="coverSheet">
    <div class="tag">VA CFR Finder Printable Packet</div>
    <h1>${escapeHtml(audienceTitle)}</h1>
    <p class="coverIntro">This printable packet is an educational claim-planning summary assembled from your saved workspace notes, evidence links, timelines, theories, and app-generated readiness guidance.</p>
    <div class="packetGrid" style="margin-top:16px">
      <div><strong>Audience:</strong> ${escapeHtml(audience)}</div>
      <div><strong>Generated:</strong> ${escapeHtml(generatedAt)}</div>
      <div><strong>Primary:</strong> ${escapeHtml(primary?.name || "(not set)")}</div>
      <div><strong>Conditions:</strong> ${items.length}</div>
    </div>
    <div class="summaryStrip">
      <div class="summaryCard">
        <strong>Readiness average</strong>
        <div style="font-size:1.3rem; margin-top:6px">${avgReadiness}%</div>
      </div>
      <div class="summaryCard">
        <strong>Saved theories</strong>
        <div style="font-size:1.3rem; margin-top:6px">${theories.length}</div>
      </div>
      <div class="summaryCard">
        <strong>Packet focus</strong>
        <div style="font-size:1.05rem; margin-top:6px">${escapeHtml(audienceTitle)}</div>
      </div>
    </div>
  </section>
  <div class="packetMeta">
    <div class="packetGrid">
      <div><strong>Audience:</strong> ${escapeHtml(audience)}</div>
      <div><strong>Generated:</strong> ${escapeHtml(generatedAt)}</div>
      <div><strong>Primary:</strong> ${escapeHtml(primary?.name || "(not set)")}</div>
      <div><strong>Conditions:</strong> ${items.length}</div>
    </div>
    <p><strong>Structured theories:</strong> ${theories.length ? theories.map((theory) => escapeHtml(`${theory.type}: ${theory.subjectName}${theory.parentName ? ` linked to ${theory.parentName}` : ""}`)).join(" • ") : "No saved theory yet."}</p>
    <p><strong>Provenance:</strong> Notes, timelines, evidence links, and theories are user-entered. Intake matches and mapper suggestions are inferred. Packet layout and summaries are generated by the app.</p>
  </div>
  <div class="packetMeta">
    <h2>Reviewer Summary Sheet</h2>
    <p>${audience === "representative"
      ? "Use this version to scan the strongest theories, the thinnest evidence areas, and the follow-up work that should happen before representative review or filing."
      : audience === "veteran"
        ? "Use this version to review what your claim theory currently says, what evidence is already staged, and what should be strengthened next."
        : "Use this version for a compact readiness check before sharing or exporting a more complete packet."}</p>
    <ul class="assumptionList">
      <li>Confirm every timeline date and provider reference before relying on this printout.</li>
      <li>Review any rating scenarios as estimates only, not guaranteed outcomes.</li>
      <li>Separate user-entered facts from app-generated suggestions during final review.</li>
    </ul>
  </div>
  <div class="pageBreak"></div>
  ${renderedItems}
  <div class="packetMeta">
    <h2>Assumptions To Review</h2>
    <p>Verify CFR references, timeline dates, and rating assumptions before relying on this packet. This is an educational drafting aid, not legal advice or representation.</p>
  </div>
</body>
</html>`;
}

function renderDocumentIntakeResults() {
  const summaryEl = document.getElementById("docIntakeSummary");
  const resultsEl = document.getElementById("docIntakeResults");
  const mapperEl = document.getElementById("docMapperResults");
  const extractorEl = document.getElementById("docExtractorResults");
  if (!summaryEl || !resultsEl) return;

  const analysis = LAST_INTAKE_ANALYSIS;
  if (!analysis || !analysis.text) {
    summaryEl.textContent = "";
    resultsEl.innerHTML = `<div class="small">No intake analysis yet.</div>`;
    if (mapperEl) mapperEl.innerHTML = `<div class="small">No record-to-claim mapping yet.</div>`;
    if (extractorEl) extractorEl.innerHTML = `<div class="small">No evidence extractor output yet.</div>`;
    renderExtractorHistory();
    return;
  }

  summaryEl.textContent = `${analysis.matches.length} possible condition match${analysis.matches.length === 1 ? "" : "es"} detected${analysis.dates.length ? ` • dates found: ${analysis.dates.join(", ")}` : ""}${analysis.sourceName ? ` • source: ${analysis.sourceName}` : ""}`;
  resultsEl.innerHTML = analysis.matches.length
    ? analysis.matches.map(match => `
        <article class="builderSuggestionCard">
          <label>
            <input type="checkbox" data-intake-condition="${escapeHtml(match.id)}" checked />
            <span>
              <strong>${escapeHtml(match.name)}</strong>
              <span class="small">${escapeHtml(match.bodySystem)} • matched on "${escapeHtml(match.hit)}" <span class="provenanceTag prov-inferred">Inferred from intake</span></span>
              ${match.sentence ? `<div class="small" style="margin-top:6px">${escapeHtml(match.sentence)}</div>` : ""}
            </span>
          </label>
        </article>
      `).join("")
    : `<div class="small">No known conditions were detected in that text. Try pasting a longer record summary or more specific symptom language.</div>`;

  if (mapperEl) {
    const mapping = analysis.mapper || analyzeRecordToClaimMapper(analysis.text, CONDITIONS);
    mapperEl.innerHTML = `
      <article class="builderSuggestionCard">
        <div class="builderSuggestionTop">
          <div>
            <strong>Record-to-Claim Mapper</strong>
            <div class="small">Claim elements detected: ${mapping.globalElements.length ? escapeHtml(mapping.globalElements.join(", ")) : "none obvious yet"}</div>
          </div>
          <span class="provenanceTag prov-generated">Generated by app</span>
        </div>
        ${mapping.conditions.length
          ? mapping.conditions.map((entry) => `
              <div class="small" style="margin-top:10px">
                <strong>${escapeHtml(entry.name)}</strong> • confidence ${Math.round(entry.confidence * 100)}% • supports ${entry.claimElements.length ? escapeHtml(entry.claimElements.join(", ")) : "general mention only"}
                ${entry.excerpts.length ? `<div style="margin-top:4px">${entry.excerpts.map((excerpt) => `“${escapeHtml(excerpt)}”`).join("<br/>")}</div>` : ""}
                ${entry.followUps.length ? `<div style="margin-top:4px"><em>${escapeHtml(entry.followUps.join(" "))}</em></div>` : ""}
              </div>
            `).join("")
          : `<div class="small" style="margin-top:10px">No strong condition mapping was detected yet.</div>`}
        ${mapping.followUps.length ? `<div class="small" style="margin-top:10px"><strong>Follow-up prompts:</strong> ${escapeHtml(mapping.followUps.join(" "))}</div>` : ""}
      </article>
    `;
  }

  if (extractorEl) {
    const extractor = analysis.extractor || extractEvidenceSignals(analysis.text, CONDITIONS);
    const reviewDraft = pruneExtractorDraft(analysis.extractorDraft || buildExtractorDraft(extractor));
    analysis.extractorDraft = reviewDraft;
    const targetOptions = extractor.likelyTargets.length
      ? extractor.likelyTargets
      : analysis.matches.map((match) => ({ id: match.id, name: match.name }));
    const reviewRow = (group, value, index) => `
      <div class="extractorReviewRow">
        <label class="extractorCheckRow">
          <input type="checkbox" data-extractor-${group} data-extractor-index="${index}" checked />
          <span class="small">Keep</span>
        </label>
        <textarea class="extractorEditInput small" data-extractor-edit="${group}" data-extractor-index="${index}" rows="${group === "date" || group === "symptom" || group === "provider" ? 1 : 2}">${escapeHtml(value)}</textarea>
      </div>
    `;
    extractorEl.innerHTML = `
      <article class="builderSuggestionCard">
        <div class="builderSuggestionTop">
          <div>
            <strong>Evidence Extractor</strong>
            <div class="small">Review extracted details before applying them. You can trim, edit, reject, or de-duplicate phrases so only the useful excerpts move into notes, timelines, and evidence.</div>
          </div>
          <span class="provenanceTag prov-generated">Generated by app</span>
        </div>
        <div class="builderGrid" style="margin-top:12px">
          <label class="builderField">
            <span class="small">Apply extracted details to</span>
            <select id="docExtractorTarget">
              <option value="">Choose target condition</option>
              ${targetOptions.map((item, index) => `<option value="${escapeHtml(item.id)}"${index === 0 ? " selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
            </select>
          </label>
          <div class="small" style="align-self:end">Likely targets: ${extractor.likelyTargets.length ? escapeHtml(extractor.likelyTargets.map((item) => item.name).join(", ")) : "none obvious yet"}</div>
        </div>
        <div class="extractorReviewToolbar">
          <div class="small"><strong>Review queue:</strong> ${extractorReviewSummary(reviewDraft)} excerpt item${extractorReviewSummary(reviewDraft) === 1 ? "" : "s"} ready</div>
          <div class="healthBtns" style="margin-top:0">
            <button id="docExtractorDedupe" class="miniBtn" type="button">Merge Duplicates</button>
            <button id="docExtractorSelectAll" class="miniBtn" type="button">Keep All</button>
            <button id="docExtractorClearAll" class="miniBtn" type="button">Reject All</button>
          </div>
        </div>
        <div class="healthBtns" style="margin-top:12px">
          <button id="docExtractorPreview" class="miniBtn" type="button">Preview Output</button>
          <button id="docExtractorDraftPacket" class="miniBtn" type="button">Build Draft Packet</button>
          <button id="docExtractorApplyNew" class="miniBtn" type="button">Apply Only New Items</button>
          <button id="docExtractorNotes" class="miniBtn" type="button">Append Summary to Notes</button>
          <button id="docExtractorTimeline" class="miniBtn" type="button">Add Dates to Timeline</button>
          <button id="docExtractorEvidence" class="miniBtn" type="button">Save Extracted Evidence</button>
        </div>
        <div id="docExtractorPreviewBox" class="extractorPreviewBox hidden" style="margin-top:12px"></div>
        <div class="extractorGrid" style="margin-top:12px">
          <div>
            <div class="small"><strong>Providers / sources</strong></div>
            <div class="extractorCheckList">${reviewDraft.providers.length ? reviewDraft.providers.map((line, index) => reviewRow("provider", line, index)).join("") : `<div class="small">none clearly detected</div>`}</div>
          </div>
          <div>
            <div class="small"><strong>Symptoms / issues</strong></div>
            <div class="extractorCheckList">${reviewDraft.symptoms.length ? reviewDraft.symptoms.map((line, index) => reviewRow("symptom", line, index)).join("") : `<div class="small">none clearly detected</div>`}</div>
          </div>
          <div>
            <div class="small"><strong>Dates</strong></div>
            <div class="extractorCheckList">${reviewDraft.dates.length ? reviewDraft.dates.map((line, index) => reviewRow("date", line, index)).join("") : `<div class="small">none clearly detected</div>`}</div>
          </div>
          <div>
            <div class="small"><strong>Diagnosis phrases</strong></div>
            <div class="extractorCheckList">${reviewDraft.diagnosisPhrases.length ? reviewDraft.diagnosisPhrases.map((line, index) => reviewRow("diagnosis", line, index)).join("") : `<div class="small">none clearly detected</div>`}</div>
          </div>
          <div>
            <div class="small"><strong>Severity / impact phrases</strong></div>
            <div class="extractorCheckList">${reviewDraft.severityPhrases.length ? reviewDraft.severityPhrases.map((line, index) => reviewRow("severity", line, index)).join("") : `<div class="small">none clearly detected</div>`}</div>
          </div>
          <div>
            <div class="small"><strong>Nexus / relationship phrases</strong></div>
            <div class="extractorCheckList">${reviewDraft.nexusPhrases.length ? reviewDraft.nexusPhrases.map((line, index) => reviewRow("nexus", line, index)).join("") : `<div class="small">none clearly detected</div>`}</div>
          </div>
        </div>
      </article>
    `;

    const getTargetId = () => document.getElementById("docExtractorTarget")?.value || "";
    const getTarget = () => CONDITIONS.find((item) => item.id === getTargetId());
    const getSelectedExtractor = () => {
      const groups = {
        provider: "providers",
        symptom: "symptoms",
        date: "dates",
        diagnosis: "diagnosisPhrases",
        severity: "severityPhrases",
        nexus: "nexusPhrases",
      };
      const selected = {};
      Object.entries(groups).forEach(([group, key]) => {
        const kept = [...extractorEl.querySelectorAll(`input[data-extractor-${group}]`)]
          .filter((input) => input.checked)
          .map((input) => {
            const index = Number(input.dataset.extractorIndex || -1);
            const field = extractorEl.querySelector(`textarea[data-extractor-edit="${group}"][data-extractor-index="${index}"]`);
            return normalizeExtractorPhrase(field?.value || "");
          })
          .filter(Boolean);
        selected[key] = dedupeExtractorValues(kept);
      });
      analysis.extractorDraft = pruneExtractorDraft({
        providers: [...extractorEl.querySelectorAll(`textarea[data-extractor-edit="provider"]`)].map((field) => field.value),
        symptoms: [...extractorEl.querySelectorAll(`textarea[data-extractor-edit="symptom"]`)].map((field) => field.value),
        dates: [...extractorEl.querySelectorAll(`textarea[data-extractor-edit="date"]`)].map((field) => field.value),
        diagnosisPhrases: [...extractorEl.querySelectorAll(`textarea[data-extractor-edit="diagnosis"]`)].map((field) => field.value),
        severityPhrases: [...extractorEl.querySelectorAll(`textarea[data-extractor-edit="severity"]`)].map((field) => field.value),
        nexusPhrases: [...extractorEl.querySelectorAll(`textarea[data-extractor-edit="nexus"]`)].map((field) => field.value),
      });
      return selected;
    };
    const buildPreviewState = () => {
      const target = getTarget();
      const selected = getSelectedExtractor();
      const existing = target ? {
        notes: loadNotes(target.id),
        timeline: loadTimeline(target.id),
        evidenceLinks: loadEvidenceLinks(target.id),
      } : {
        notes: "",
        timeline: [],
        evidenceLinks: [],
      };
      const noteSummary = buildExtractorNoteSummary(selected, target?.name || getTargetId() || "Condition");
      const timelineEntries = buildExtractorTimelinePreview(selected, target?.name || getTargetId() || "Condition");
      const evidenceRecord = buildExtractorEvidencePreview(selected, {
        targetName: target?.name || "",
        labelBase: (document.getElementById("docLibraryName")?.value || "").trim() || "Extracted record evidence",
        type: document.getElementById("docLibraryType")?.value || "General",
        tags: (document.getElementById("docLibraryTags")?.value || "").split(",").map((item) => item.trim()).filter(Boolean),
        fallbackText: analysis.text || "",
      });
      return {
        target,
        selected,
        noteSummary,
        timelineEntries,
        evidenceRecord,
        compare: compareExtractorPreview({
          noteSummary,
          timelineEntries,
          evidenceRecord,
        }, existing),
      };
    };
    const renderPreviewBox = () => {
      const host = document.getElementById("docExtractorPreviewBox");
      if (!host) return;
      const preview = buildPreviewState();
      const draftPacket = buildExtractorDraftPacketText(preview, {
        sourceName: extractorSourceLabel(analysis),
        targetName: preview.target?.name || getTargetId() || "Condition",
      });
      host.classList.remove("hidden");
      host.innerHTML = `
        <div class="small"><strong>Preview target:</strong> ${escapeHtml(preview.target?.name || "No target selected yet")}</div>
        <div class="extractorDiffSummary">
          <div class="extractorDiffCard">
            <strong>Notes</strong>
            <div class="small">${escapeHtml(preview.compare.noteStatus.detail)}</div>
          </div>
          <div class="extractorDiffCard">
            <strong>Timeline</strong>
            <div class="small">${escapeHtml(preview.compare.timelineStatus.detail)}</div>
          </div>
          <div class="extractorDiffCard">
            <strong>Evidence</strong>
            <div class="small">${escapeHtml(preview.compare.evidenceStatus.detail)}</div>
          </div>
        </div>
        <div class="extractorPreviewGrid" style="margin-top:10px">
          <div>
            <div class="small"><strong>Notes summary preview</strong></div>
            <textarea class="wsNarrativeOut" rows="8" readonly>${escapeHtml(preview.noteSummary)}</textarea>
          </div>
          <div>
            <div class="small"><strong>Timeline preview</strong></div>
            <textarea class="wsNarrativeOut" rows="8" readonly>${escapeHtml(
              preview.timelineEntries.length
                ? preview.timelineEntries.map((entry) => `${entry.date} • ${entry.type}\n${entry.note}`).join("\n\n")
                : "No timeline entries will be added until at least one date is kept."
            )}</textarea>
          </div>
          <div>
            <div class="small"><strong>Evidence record preview</strong></div>
            <textarea class="wsNarrativeOut" rows="8" readonly>${escapeHtml(
              [
                `Label: ${preview.evidenceRecord.label}`,
                `Type: ${preview.evidenceRecord.type}`,
                preview.evidenceRecord.date ? `Date: ${preview.evidenceRecord.date}` : "",
                preview.evidenceRecord.tags.length ? `Tags: ${preview.evidenceRecord.tags.join(", ")}` : "",
                `Excerpt: ${preview.evidenceRecord.excerpt || "(no excerpt available)"}`,
              ].filter(Boolean).join("\n")
            )}</textarea>
          </div>
        </div>
        <div class="small" style="margin-top:12px"><strong>Draft packet bundle</strong></div>
        <div class="healthBtns" style="margin-top:8px">
          <select id="docExtractorPacketPurpose" class="miniBtn">
            <option value="rep handoff candidate">Rep handoff candidate</option>
            <option value="nexus draft">Nexus draft</option>
            <option value="timeline-heavy">Timeline-heavy</option>
            <option value="severity-focused">Severity-focused</option>
            <option value="evidence gap review">Evidence gap review</option>
          </select>
          <button id="docExtractorPacketSave" class="miniBtn" type="button">Save Draft Packet</button>
          <button id="docExtractorPacketCopy" class="miniBtn" type="button">Copy Draft Packet</button>
          <button id="docExtractorPacketDownload" class="miniBtn" type="button">Download Draft Packet</button>
        </div>
        <textarea id="docExtractorPacketOut" class="wsNarrativeOut" rows="12" readonly style="margin-top:10px">${escapeHtml(draftPacket)}</textarea>
      `;

      document.getElementById("docExtractorPacketSave")?.addEventListener("click", () => {
        const purpose = document.getElementById("docExtractorPacketPurpose")?.value || "rep handoff candidate";
        const packet = createExtractorPacketRecord({
          targetId: preview.target?.id || getTargetId() || "",
          targetName: preview.target?.name || getTargetId() || "Condition",
          sourceName: extractorSourceLabel(analysis),
          title: `${preview.target?.name || "Condition"} Draft Packet`,
          tags: [purpose],
          text: draftPacket,
          compare: preview.compare,
        });
        saveExtractorPacketLibrary([packet, ...loadExtractorPacketLibrary()].slice(0, 40));
        pushWorkspaceActivity("Extractor draft packet saved", `${packet.title} was saved to the packet library.`);
        renderExtractorPacketLibrary();
        renderWorkspaceActivity();
        alert("Draft packet saved to library.");
      });

      document.getElementById("docExtractorPacketCopy")?.addEventListener("click", async () => {
        await navigator.clipboard.writeText(draftPacket);
        alert("Draft packet copied.");
      });

      document.getElementById("docExtractorPacketDownload")?.addEventListener("click", () => {
        const slug = (preview.target?.name || "condition").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
        downloadText(`extractor_draft_packet_${slug || "condition"}.txt`, draftPacket);
      });
    };

    document.getElementById("docExtractorDedupe")?.addEventListener("click", () => {
      analysis.extractorDraft = pruneExtractorDraft(getSelectedExtractor());
      renderDocumentIntakeResults();
      alert("Duplicate and empty extractor phrases were merged.");
    });

    document.getElementById("docExtractorPreview")?.addEventListener("click", () => {
      renderPreviewBox();
    });

    document.getElementById("docExtractorDraftPacket")?.addEventListener("click", () => {
      renderPreviewBox();
      document.getElementById("docExtractorPacketOut")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });

    document.getElementById("docExtractorApplyNew")?.addEventListener("click", () => {
      const targetId = getTargetId();
      if (!targetId) return alert("Choose a target condition first.");
      const preview = buildPreviewState();
      const plan = computeExtractorApplyNewPlan(preview, {
        notes: loadNotes(targetId),
        timeline: loadTimeline(targetId),
        evidenceLinks: loadEvidenceLinks(targetId),
      });

      if (!plan.noteSummary && !plan.timelineEntries.length && !plan.evidenceRecord) {
        renderPreviewBox();
        return alert("No new extractor content was found for this condition.");
      }

      const target = preview.target || CONDITIONS.find((item) => item.id === targetId);

      if (plan.noteSummary) {
        const existingNotes = (loadNotes(targetId) || "").trim();
        saveNotes(targetId, existingNotes ? `${existingNotes}\n\n${plan.noteSummary}` : plan.noteSummary);
      }

      if (plan.timelineEntries.length) {
        const entries = loadTimeline(targetId);
        plan.timelineEntries.forEach((previewEntry) => {
          entries.push({
            id: `extractor-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            date: previewEntry.date,
            type: previewEntry.type,
            note: previewEntry.note,
          });
        });
        saveTimeline(targetId, entries);
      }

      if (plan.evidenceRecord) {
        const record = createEvidenceLibraryRecord({
          label: plan.evidenceRecord.label,
          type: plan.evidenceRecord.type,
          excerpt: plan.evidenceRecord.excerpt,
          tags: plan.evidenceRecord.tags,
        });
        saveEvidenceLibrary([record, ...loadEvidenceLibrary()].slice(0, 60));
        const links = loadEvidenceLinks(targetId);
        links.unshift({
          id: `extractor-ev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          label: record.label,
          url: "",
          type: record.type || "Other",
          date: plan.evidenceRecord.date || "",
          note: record.excerpt || "",
          created_at: Date.now(),
        });
        saveEvidenceLinks(targetId, links);
      }

      pushExtractorHistory(createExtractorHistoryEntry({
        action: "apply_new",
        targetId,
        targetName: target?.name || targetId,
        sourceName: extractorSourceLabel(analysis),
        selected: preview.selected,
      }));
      pushWorkspaceActivity(
        "Extractor applied only new items",
        `${target?.name || targetId} received ${[
          plan.noteSummary ? "new notes" : "",
          plan.timelineEntries.length ? `${plan.timelineEntries.length} new timeline entr${plan.timelineEntries.length === 1 ? "y" : "ies"}` : "",
          plan.evidenceRecord ? "a new evidence record" : "",
        ].filter(Boolean).join(", ")}.`
      );
      renderDocumentIntakeResults();
      renderEvidenceLibrary();
      renderExtractorPacketLibrary();
      renderWorkspace();
      renderWorkspaceActivity();
      alert("Only new extractor items were applied.");
    });

    document.getElementById("docExtractorSelectAll")?.addEventListener("click", () => {
      extractorEl.querySelectorAll('input[data-extractor-provider], input[data-extractor-symptom], input[data-extractor-date], input[data-extractor-diagnosis], input[data-extractor-severity], input[data-extractor-nexus]').forEach((input) => {
        input.checked = true;
      });
    });

    document.getElementById("docExtractorClearAll")?.addEventListener("click", () => {
      extractorEl.querySelectorAll('input[data-extractor-provider], input[data-extractor-symptom], input[data-extractor-date], input[data-extractor-diagnosis], input[data-extractor-severity], input[data-extractor-nexus]').forEach((input) => {
        input.checked = false;
      });
    });

    document.getElementById("docExtractorNotes")?.addEventListener("click", () => {
      const targetId = getTargetId();
      if (!targetId) return alert("Choose a target condition first.");
      const { target, selected, noteSummary: summary } = buildPreviewState();
      const existing = (loadNotes(targetId) || "").trim();
      saveNotes(targetId, existing ? `${existing}\n\n${summary}` : summary);
      pushExtractorHistory(createExtractorHistoryEntry({
        action: "notes",
        targetId,
        targetName: target?.name || targetId,
        sourceName: extractorSourceLabel(analysis),
        selected,
      }));
      pushWorkspaceActivity("Extractor summary applied", `Extracted record details were appended to ${target?.name || targetId}.`);
      renderWorkspace();
      renderWorkspaceActivity();
      renderExtractorHistory();
      alert("Extracted summary appended to notes.");
    });

    document.getElementById("docExtractorTimeline")?.addEventListener("click", () => {
      const targetId = getTargetId();
      if (!targetId) return alert("Choose a target condition first.");
      const { target, selected, timelineEntries } = buildPreviewState();
      if (!selected.dates.length) return alert("Select at least one extracted date first.");
      const entries = loadTimeline(targetId);
      timelineEntries.forEach((previewEntry) => {
        if (!entries.some((entry) => entry.date === previewEntry.date && (entry.note || "").includes("Document extractor"))) {
          entries.push({
            id: `extractor-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            date: previewEntry.date,
            type: previewEntry.type,
            note: previewEntry.note,
          });
        }
      });
      saveTimeline(targetId, entries);
      pushExtractorHistory(createExtractorHistoryEntry({
        action: "timeline",
        targetId,
        targetName: target?.name || targetId,
        sourceName: extractorSourceLabel(analysis),
        selected,
      }));
      pushWorkspaceActivity("Extractor dates applied", `Extracted record dates were added to the timeline for ${target?.name || targetId}.`);
      renderWorkspace();
      renderWorkspaceActivity();
      renderExtractorHistory();
      alert("Extracted dates added to timeline.");
    });

    document.getElementById("docExtractorEvidence")?.addEventListener("click", () => {
      const targetId = getTargetId();
      const { target, selected, evidenceRecord: previewRecord } = buildPreviewState();
      const record = createEvidenceLibraryRecord({
        label: previewRecord.label,
        type: previewRecord.type,
        excerpt: previewRecord.excerpt,
        tags: previewRecord.tags,
      });
      saveEvidenceLibrary([record, ...loadEvidenceLibrary()].slice(0, 60));
      if (targetId) {
        const links = loadEvidenceLinks(targetId);
        links.unshift({
          id: `extractor-ev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          label: record.label,
          url: "",
          type: record.type || "Other",
          date: previewRecord.date || "",
          note: record.excerpt || "",
          created_at: Date.now(),
        });
        saveEvidenceLinks(targetId, links);
      }
      pushExtractorHistory(createExtractorHistoryEntry({
        action: "evidence",
        targetId,
        targetName: target?.name || targetId || "Evidence library only",
        sourceName: extractorSourceLabel(analysis),
        selected,
      }));
      pushWorkspaceActivity("Extractor evidence saved", `${record.label} was added to the evidence library${target ? ` and attached to ${target.name}` : ""}.`);
      renderEvidenceLibrary();
      renderWorkspace();
      renderWorkspaceActivity();
      renderExtractorPacketLibrary();
      renderExtractorHistory();
      alert("Extracted evidence saved.");
    });
  }

  renderExtractorHistory();
  renderExtractorPacketLibrary();
}

function renderExtractorHistory() {
  const host = document.getElementById("docExtractorHistory");
  if (!host) return;

  const history = loadExtractorHistory();
  if (!history.length) {
    host.innerHTML = `<div class="small">No extractor actions yet. When you apply notes, dates, or evidence from a document, the app will log the exact target and phrases used here.</div>`;
    return;
  }

  const actionLabel = {
    apply_new: "Only new items applied",
    notes: "Notes appended",
    timeline: "Timeline updated",
    evidence: "Evidence saved",
  };
  const phraseList = (items) => (Array.isArray(items) ? items.filter(Boolean).slice(0, 3) : []);

  host.innerHTML = `<div class="extractorHistoryList">${history.map((entry) => {
    const chips = [
      ...phraseList(entry.providers),
      ...phraseList(entry.dates),
      ...phraseList(entry.symptoms),
      ...phraseList(entry.diagnosisPhrases),
      ...phraseList(entry.severityPhrases),
      ...phraseList(entry.nexusPhrases),
    ].slice(0, 7);

    return `
      <article class="builderSuggestionCard">
        <div class="builderSuggestionTop">
          <div>
            <strong>${escapeHtml(actionLabel[entry.action] || "Extractor update")}</strong>
            <div class="extractorHistoryMeta small">
              <span><strong>Target:</strong> ${escapeHtml(entry.targetName || "Condition")}</span>
              <span><strong>Source:</strong> ${escapeHtml(entry.sourceName || "Document intake")}</span>
              <span>${entry.createdAt ? escapeHtml(new Date(entry.createdAt).toLocaleString()) : ""}</span>
            </div>
            ${chips.length ? `<div class="extractorHistoryChips">${chips.map((chip) => `<span class="extractorHistoryChip">${escapeHtml(chip)}</span>`).join("")}</div>` : `<div class="small" style="margin-top:8px">No excerpt snippets were saved on this action.</div>`}
          </div>
          <div class="healthBtns" style="margin-top:0">
            ${entry.targetId ? `<button class="miniBtn" data-extractor-open="${escapeHtml(entry.targetId)}" type="button">Open Condition</button>` : ""}
          </div>
        </div>
      </article>
    `;
  }).join("")}</div>`;

  host.querySelectorAll("[data-extractor-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.extractorOpen;
      if (!id) return;
      showDetail(id, true);
      document.getElementById("detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function renderExtractorPacketLibrary() {
  const host = document.getElementById("docExtractorPacketLibrary");
  if (!host) return;

  const allPackets = loadExtractorPacketLibrary();
  if (!allPackets.length) {
    host.innerHTML = `<div class="small">No saved draft packets yet. Build a draft packet from the extractor preview, then save it here for later review.</div>`;
    return;
  }

  const allTags = [...new Set(allPackets.flatMap((packet) => Array.isArray(packet.tags) ? packet.tags : []))].sort();
  const allTargets = [...new Set(allPackets.map((packet) => packet.targetId).filter(Boolean))];
  if (EXTRACTOR_PACKET_FILTER_STATE.tag && !allTags.includes(EXTRACTOR_PACKET_FILTER_STATE.tag)) {
    EXTRACTOR_PACKET_FILTER_STATE.tag = "";
  }
  if (EXTRACTOR_PACKET_FILTER_STATE.targetId && !allTargets.includes(EXTRACTOR_PACKET_FILTER_STATE.targetId)) {
    EXTRACTOR_PACKET_FILTER_STATE.targetId = "";
  }
  const packets = allPackets.filter((packet) => {
    const tagOk = !EXTRACTOR_PACKET_FILTER_STATE.tag || (packet.tags || []).includes(EXTRACTOR_PACKET_FILTER_STATE.tag);
    const targetOk = !EXTRACTOR_PACKET_FILTER_STATE.targetId || packet.targetId === EXTRACTOR_PACKET_FILTER_STATE.targetId;
    return tagOk && targetOk;
  });
  packets.sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) {
      return a.pinned ? -1 : 1;
    }
    if (EXTRACTOR_PACKET_SORT_STATE === "target") {
      return (a.targetName || "").localeCompare(b.targetName || "") || (b.createdAt || "").localeCompare(a.createdAt || "");
    }
    if (EXTRACTOR_PACKET_SORT_STATE === "tag") {
      const aTag = (a.tags || [])[0] || "";
      const bTag = (b.tags || [])[0] || "";
      return aTag.localeCompare(bTag) || (a.targetName || "").localeCompare(b.targetName || "");
    }
    return (b.createdAt || "").localeCompare(a.createdAt || "");
  });

  if (!packets.length) {
    host.innerHTML = `
      <article class="builderSuggestionCard">
        <div class="builderGrid">
          <label class="builderField">
            <span class="small">Filter by purpose tag</span>
            <select id="docPacketFilterTag">
              <option value="">All tags</option>
              ${allTags.map((tag) => `<option value="${escapeHtml(tag)}"${tag === EXTRACTOR_PACKET_FILTER_STATE.tag ? " selected" : ""}>${escapeHtml(tag)}</option>`).join("")}
            </select>
          </label>
          <label class="builderField">
            <span class="small">Filter by target condition</span>
            <select id="docPacketFilterTarget">
              <option value="">All conditions</option>
              ${allTargets.map((targetId) => `<option value="${escapeHtml(targetId)}"${targetId === EXTRACTOR_PACKET_FILTER_STATE.targetId ? " selected" : ""}>${escapeHtml(conditionNameById(targetId))}</option>`).join("")}
            </select>
          </label>
          <label class="builderField">
            <span class="small">Sort packets</span>
            <select id="docPacketSort">
              <option value="newest"${EXTRACTOR_PACKET_SORT_STATE === "newest" ? " selected" : ""}>Newest first</option>
              <option value="target"${EXTRACTOR_PACKET_SORT_STATE === "target" ? " selected" : ""}>Target condition</option>
              <option value="tag"${EXTRACTOR_PACKET_SORT_STATE === "tag" ? " selected" : ""}>Purpose tag</option>
            </select>
          </label>
        </div>
        <div class="small" style="margin-top:10px">No saved packets match the current filters.</div>
      </article>
    `;
    host.querySelector("#docPacketFilterTag")?.addEventListener("change", (event) => {
      EXTRACTOR_PACKET_FILTER_STATE.tag = event.target.value || "";
      renderExtractorPacketLibrary();
    });
    host.querySelector("#docPacketFilterTarget")?.addEventListener("change", (event) => {
      EXTRACTOR_PACKET_FILTER_STATE.targetId = event.target.value || "";
      renderExtractorPacketLibrary();
    });
    host.querySelector("#docPacketSort")?.addEventListener("change", (event) => {
      EXTRACTOR_PACKET_SORT_STATE = event.target.value || "newest";
      renderExtractorPacketLibrary();
    });
    return;
  }

  const leftId = EXTRACTOR_PACKET_COMPARE_STATE.leftId && packets.some((packet) => packet.id === EXTRACTOR_PACKET_COMPARE_STATE.leftId)
    ? EXTRACTOR_PACKET_COMPARE_STATE.leftId
    : (packets[0]?.id || "");
  const rightId = EXTRACTOR_PACKET_COMPARE_STATE.rightId && packets.some((packet) => packet.id === EXTRACTOR_PACKET_COMPARE_STATE.rightId)
    ? EXTRACTOR_PACKET_COMPARE_STATE.rightId
    : (packets[1]?.id || packets[0]?.id || "");
  EXTRACTOR_PACKET_COMPARE_STATE = { leftId, rightId };
  const leftPacket = packets.find((packet) => packet.id === leftId) || null;
  const rightPacket = packets.find((packet) => packet.id === rightId) || null;
  const compare = leftPacket && rightPacket ? compareExtractorPacketRecords(leftPacket, rightPacket) : null;

  host.innerHTML = `
    <article class="builderSuggestionCard">
      <div class="builderGrid">
        <label class="builderField">
          <span class="small">Filter by purpose tag</span>
          <select id="docPacketFilterTag">
            <option value="">All tags</option>
            ${allTags.map((tag) => `<option value="${escapeHtml(tag)}"${tag === EXTRACTOR_PACKET_FILTER_STATE.tag ? " selected" : ""}>${escapeHtml(tag)}</option>`).join("")}
          </select>
        </label>
        <label class="builderField">
          <span class="small">Filter by target condition</span>
          <select id="docPacketFilterTarget">
            <option value="">All conditions</option>
            ${allTargets.map((targetId) => `<option value="${escapeHtml(targetId)}"${targetId === EXTRACTOR_PACKET_FILTER_STATE.targetId ? " selected" : ""}>${escapeHtml(conditionNameById(targetId))}</option>`).join("")}
          </select>
        </label>
        <label class="builderField">
          <span class="small">Sort packets</span>
          <select id="docPacketSort">
            <option value="newest"${EXTRACTOR_PACKET_SORT_STATE === "newest" ? " selected" : ""}>Newest first</option>
            <option value="target"${EXTRACTOR_PACKET_SORT_STATE === "target" ? " selected" : ""}>Target condition</option>
            <option value="tag"${EXTRACTOR_PACKET_SORT_STATE === "tag" ? " selected" : ""}>Purpose tag</option>
          </select>
        </label>
      </div>
    </article>
  ` + packets.map((packet) => `
    <article class="builderSuggestionCard">
      <div class="builderSuggestionTop">
        <div>
          <strong>${escapeHtml(packet.title || "Extractor Draft Packet")}</strong>
          <div class="small">Target: ${escapeHtml(packet.targetName || "Condition")} • Source: ${escapeHtml(packet.sourceName || "Document intake")}${packet.pinned ? " • pinned" : ""}</div>
          ${packet.tags?.length ? `<div class="extractorHistoryChips" style="margin-top:6px">${packet.tags.map((tag) => `<span class="extractorHistoryChip">${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
          <div class="small" style="margin-top:6px">${packet.createdAt ? escapeHtml(new Date(packet.createdAt).toLocaleString()) : ""}</div>
          <div class="small" style="margin-top:6px">${escapeHtml((packet.text || "").slice(0, 200))}${(packet.text || "").length > 200 ? "..." : ""}</div>
        </div>
        <div class="healthBtns" style="margin-top:0">
          <button class="miniBtn" data-packet-pin="${escapeHtml(packet.id)}" type="button">${packet.pinned ? "Unpin" : "Pin"}</button>
          <button class="miniBtn" data-packet-copy="${escapeHtml(packet.id)}" type="button">Copy</button>
          <button class="miniBtn" data-packet-download="${escapeHtml(packet.id)}" type="button">Download</button>
          ${packet.targetId ? `<button class="miniBtn" data-packet-apply="${escapeHtml(packet.id)}" type="button">Apply Packet</button>` : ""}
          <button class="miniBtn" data-packet-compare-left="${escapeHtml(packet.id)}" type="button">Set Left</button>
          <button class="miniBtn" data-packet-compare-right="${escapeHtml(packet.id)}" type="button">Set Right</button>
          ${packet.targetId ? `<button class="miniBtn" data-packet-open="${escapeHtml(packet.id)}" type="button">Open Condition</button>` : ""}
          <button class="miniBtn danger" data-packet-delete="${escapeHtml(packet.id)}" type="button">Delete</button>
        </div>
      </div>
    </article>
  `).join("") + `
    <article class="builderSuggestionCard" style="margin-top:12px">
      <div class="builderSuggestionTop">
        <div>
          <strong>Draft Packet Compare</strong>
          <div class="small">Compare two saved extractor draft packets by section.</div>
        </div>
      </div>
      <div class="builderGrid" style="margin-top:12px">
        <label class="builderField">
          <span class="small">Left packet</span>
          <select id="docPacketCompareLeft">
            ${packets.map((packet) => `<option value="${escapeHtml(packet.id)}"${packet.id === leftId ? " selected" : ""}>${escapeHtml(packet.title || packet.targetName || "Packet")}</option>`).join("")}
          </select>
        </label>
        <label class="builderField">
          <span class="small">Right packet</span>
          <select id="docPacketCompareRight">
            ${packets.map((packet) => `<option value="${escapeHtml(packet.id)}"${packet.id === rightId ? " selected" : ""}>${escapeHtml(packet.title || packet.targetName || "Packet")}</option>`).join("")}
          </select>
        </label>
      </div>
      <div class="extractorDiffSummary" style="margin-top:12px">
        ${(compare?.findings || []).map((finding) => `
          <div class="extractorDiffCard">
            <strong>${escapeHtml(finding.section)}</strong>
            <div class="small">${escapeHtml(finding.detail)}</div>
          </div>
        `).join("") || `<div class="small">Choose two saved packets to compare.</div>`}
      </div>
      <textarea id="docPacketCompareOut" class="wsNarrativeOut" rows="10" readonly style="margin-top:12px">${escapeHtml(compare?.text || "")}</textarea>
    </article>
  `;

  host.querySelector("#docPacketFilterTag")?.addEventListener("change", (event) => {
    EXTRACTOR_PACKET_FILTER_STATE.tag = event.target.value || "";
    renderExtractorPacketLibrary();
  });

  host.querySelector("#docPacketFilterTarget")?.addEventListener("change", (event) => {
    EXTRACTOR_PACKET_FILTER_STATE.targetId = event.target.value || "";
    renderExtractorPacketLibrary();
  });

  host.querySelector("#docPacketSort")?.addEventListener("change", (event) => {
    EXTRACTOR_PACKET_SORT_STATE = event.target.value || "newest";
    renderExtractorPacketLibrary();
  });

  host.querySelectorAll("[data-packet-pin]").forEach((button) => {
    button.addEventListener("click", () => {
      const packetsNow = loadExtractorPacketLibrary();
      const packet = packetsNow.find((item) => item.id === button.dataset.packetPin);
      if (!packet) return;
      packet.pinned = !packet.pinned;
      saveExtractorPacketLibrary(packetsNow);
      pushWorkspaceActivity(
        packet.pinned ? "Extractor draft packet pinned" : "Extractor draft packet unpinned",
        `${packet.title || "A draft packet"} was ${packet.pinned ? "pinned to the top of" : "removed from"} the packet library priority list.`
      );
      renderExtractorPacketLibrary();
      renderWorkspaceActivity();
    });
  });

  host.querySelectorAll("[data-packet-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      const packet = loadExtractorPacketLibrary().find((item) => item.id === button.dataset.packetCopy);
      if (!packet) return;
      await navigator.clipboard.writeText(packet.text || "");
      alert("Draft packet copied.");
    });
  });

  host.querySelectorAll("[data-packet-download]").forEach((button) => {
    button.addEventListener("click", () => {
      const packet = loadExtractorPacketLibrary().find((item) => item.id === button.dataset.packetDownload);
      if (!packet) return;
      const slug = (packet.targetName || "condition").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      downloadText(`extractor_draft_packet_${slug || "condition"}.txt`, packet.text || "");
    });
  });

  host.querySelectorAll("[data-packet-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const packet = loadExtractorPacketLibrary().find((item) => item.id === button.dataset.packetOpen);
      if (!packet?.targetId) return;
      showDetail(packet.targetId, true);
      document.getElementById("detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  host.querySelectorAll("[data-packet-apply]").forEach((button) => {
    button.addEventListener("click", () => {
      const packet = loadExtractorPacketLibrary().find((item) => item.id === button.dataset.packetApply);
      if (!packet?.targetId) return;
      const preview = buildExtractorPacketPreview(packet);
      const plan = computeExtractorApplyNewPlan(preview, {
        notes: loadNotes(packet.targetId),
        timeline: loadTimeline(packet.targetId),
        evidenceLinks: loadEvidenceLinks(packet.targetId),
      });

      if (!plan.noteSummary && !plan.timelineEntries.length && !plan.evidenceRecord) {
        return alert("No new packet content was found for this condition.");
      }

      if (plan.noteSummary) {
        const existingNotes = (loadNotes(packet.targetId) || "").trim();
        saveNotes(packet.targetId, existingNotes ? `${existingNotes}\n\n${plan.noteSummary}` : plan.noteSummary);
      }

      if (plan.timelineEntries.length) {
        const entries = loadTimeline(packet.targetId);
        plan.timelineEntries.forEach((previewEntry) => {
          entries.push({
            id: `extractor-packet-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            date: previewEntry.date,
            type: previewEntry.type,
            note: previewEntry.note,
          });
        });
        saveTimeline(packet.targetId, entries);
      }

      if (plan.evidenceRecord) {
        const record = createEvidenceLibraryRecord({
          label: plan.evidenceRecord.label,
          type: plan.evidenceRecord.type,
          excerpt: plan.evidenceRecord.excerpt,
          tags: plan.evidenceRecord.tags,
        });
        saveEvidenceLibrary([record, ...loadEvidenceLibrary()].slice(0, 60));
        const links = loadEvidenceLinks(packet.targetId);
        links.unshift({
          id: `extractor-packet-ev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          label: record.label,
          url: "",
          type: record.type || "Other",
          date: plan.evidenceRecord.date || "",
          note: record.excerpt || "",
          created_at: Date.now(),
        });
        saveEvidenceLinks(packet.targetId, links);
      }

      pushWorkspaceActivity(
        "Extractor packet applied",
        `${packet.title || "Draft packet"} applied ${[
          plan.noteSummary ? "new notes" : "",
          plan.timelineEntries.length ? `${plan.timelineEntries.length} new timeline entr${plan.timelineEntries.length === 1 ? "y" : "ies"}` : "",
          plan.evidenceRecord ? "a new evidence record" : "",
        ].filter(Boolean).join(", ")} to ${packet.targetName || packet.targetId}.`
      );
      renderEvidenceLibrary();
      renderExtractorPacketLibrary();
      renderWorkspace();
      renderWorkspaceActivity();
      alert("Draft packet applied to the target condition.");
    });
  });

  host.querySelectorAll("[data-packet-compare-left]").forEach((button) => {
    button.addEventListener("click", () => {
      EXTRACTOR_PACKET_COMPARE_STATE.leftId = button.dataset.packetCompareLeft || "";
      renderExtractorPacketLibrary();
    });
  });

  host.querySelectorAll("[data-packet-compare-right]").forEach((button) => {
    button.addEventListener("click", () => {
      EXTRACTOR_PACKET_COMPARE_STATE.rightId = button.dataset.packetCompareRight || "";
      renderExtractorPacketLibrary();
    });
  });

  host.querySelectorAll("[data-packet-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      const packetsNow = loadExtractorPacketLibrary();
      const packet = packetsNow.find((item) => item.id === button.dataset.packetDelete);
      if (!packet) return;
      saveExtractorPacketLibrary(packetsNow.filter((item) => item.id !== packet.id));
      pushWorkspaceActivity("Extractor draft packet removed", `${packet.title || "A draft packet"} was removed from the packet library.`);
      renderExtractorPacketLibrary();
      renderWorkspaceActivity();
      alert("Draft packet removed.");
    });
  });

  host.querySelector("#docPacketCompareLeft")?.addEventListener("change", (event) => {
    EXTRACTOR_PACKET_COMPARE_STATE.leftId = event.target.value || "";
    renderExtractorPacketLibrary();
  });

  host.querySelector("#docPacketCompareRight")?.addEventListener("change", (event) => {
    EXTRACTOR_PACKET_COMPARE_STATE.rightId = event.target.value || "";
    renderExtractorPacketLibrary();
  });
}

function renderDocumentLibrary() {
  const host = document.getElementById("docLibraryList");
  if (!host) return;

  const docs = loadDocumentLibrary();
  host.innerHTML = docs.length
    ? docs.map((doc) => {
        const provenance = provenanceMeta(doc.sourceType);
        return `
        <article class="builderSuggestionCard">
          <div class="builderSuggestionTop">
            <div>
              <strong>${escapeHtml(doc.name)}</strong>
              <div class="small">${escapeHtml(doc.type || "General")} <span class="provenanceTag ${escapeHtml(provenance.className)}">${escapeHtml(provenance.label)}</span>${doc.fileName ? ` • file: ${escapeHtml(doc.fileName)}` : ""}${doc.tags?.length ? ` • tags: ${escapeHtml(doc.tags.join(", "))}` : ""}</div>
              <div class="small" style="margin-top:6px">${escapeHtml((doc.text || "").slice(0, 180))}${(doc.text || "").length > 180 ? "..." : ""}</div>
            </div>
            <div class="healthBtns" style="margin-top:0">
              <button class="miniBtn" data-doc-load="${escapeHtml(doc.id)}" type="button">Load</button>
              <button class="miniBtn" data-doc-analyze="${escapeHtml(doc.id)}" type="button">Analyze</button>
              <button class="miniBtn danger" data-doc-delete="${escapeHtml(doc.id)}" type="button">Delete</button>
            </div>
          </div>
        </article>
      `;
      }).join("")
    : `<div class="small">No saved documents yet. Save DBQ text, lay statements, or medical note summaries here so you can reuse them across claims.</div>`;

  host.querySelectorAll("[data-doc-load]").forEach((button) => {
    button.addEventListener("click", () => {
      const doc = loadDocumentLibrary().find((item) => item.id === button.dataset.docLoad);
      if (!doc) return;
      const input = document.getElementById("docIntakeInput");
      if (input) {
        input.value = doc.text || "";
        input.dataset.sourceType = doc.sourceType || "user-entered";
        input.dataset.sourceName = doc.name || doc.fileName || "Saved document";
        input.dataset.fileName = doc.fileName || "";
      }
      alert(`Loaded ${doc.name} into Document Intake.`);
    });
  });

  host.querySelectorAll("[data-doc-analyze]").forEach((button) => {
    button.addEventListener("click", () => {
      const doc = loadDocumentLibrary().find((item) => item.id === button.dataset.docAnalyze);
      if (!doc) return;
      const input = document.getElementById("docIntakeInput");
      if (input) {
        input.value = doc.text || "";
        input.dataset.sourceType = doc.sourceType || "user-entered";
        input.dataset.sourceName = doc.name || doc.fileName || "Saved document";
        input.dataset.fileName = doc.fileName || "";
      }
      LAST_INTAKE_ANALYSIS = analyzeDocumentIntake(doc.text || "");
      LAST_INTAKE_ANALYSIS.sourceName = doc.name || doc.fileName || "Saved document";
      LAST_INTAKE_ANALYSIS.mapper = analyzeRecordToClaimMapper(doc.text || "", CONDITIONS);
      LAST_INTAKE_ANALYSIS.extractor = extractEvidenceSignals(doc.text || "", CONDITIONS);
      renderDocumentIntakeResults();
      alert(`Analyzed ${doc.name}.`);
    });
  });

  host.querySelectorAll("[data-doc-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      const docsNow = loadDocumentLibrary();
      const doc = docsNow.find((item) => item.id === button.dataset.docDelete);
      if (!doc) return;
      saveDocumentLibrary(docsNow.filter((item) => item.id !== doc.id));
      pushWorkspaceActivity("Document removed", `${doc.name} was removed from the document library.`);
      renderDocumentLibrary();
      renderWorkspaceActivity();
      alert(`Deleted ${doc.name}.`);
    });
  });
}

function renderEvidenceLibrary() {
  const host = document.getElementById("evLibraryList");
  const targetEl = document.getElementById("evLibraryTarget");
  if (!host || !targetEl) return;

  const workspaceItems = (loadWorkspaceState().nodes || []).map(id => CONDITIONS.find(c => c.id === id)).filter(Boolean);
  const priorTarget = targetEl.value || "";
  targetEl.innerHTML = `<option value="">Choose workspace condition</option>${workspaceItems.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("")}`;
  if (priorTarget && workspaceItems.some((item) => item.id === priorTarget)) targetEl.value = priorTarget;

  const records = loadEvidenceLibrary();
  host.innerHTML = records.length
    ? records.map((record) => {
        const provenance = provenanceMeta(record.sourceType);
        const suggestions = suggestEvidenceTargets(record, workspaceItems);
        return `
        <article class="builderSuggestionCard">
          <div class="builderSuggestionTop">
            <div>
              <strong>${escapeHtml(record.label)}</strong>
              <div class="small">${escapeHtml(record.type || "Other")} <span class="provenanceTag ${escapeHtml(provenance.className)}">${escapeHtml(provenance.label)}</span>${record.tags?.length ? ` • ${escapeHtml(record.tags.join(", "))}` : ""}</div>
              ${record.url ? `<div class="small" style="margin-top:6px">${escapeHtml(record.url)}</div>` : ""}
              ${record.excerpt ? `<div class="small" style="margin-top:6px">${escapeHtml(record.excerpt)}</div>` : ""}
              ${suggestions.length ? `<div class="small" style="margin-top:6px"><strong>Suggested targets:</strong> ${suggestions.map((suggestion) => `${escapeHtml(suggestion.name)} (${escapeHtml(suggestion.reasons[0] || "best match")})`).join(" • ")}</div>` : `<div class="small" style="margin-top:6px">No clear workspace match detected yet.</div>`}
            </div>
            <div class="healthBtns" style="margin-top:0">
              <button class="miniBtn" data-ev-attach="${escapeHtml(record.id)}" type="button">Attach</button>
              <button class="miniBtn" data-ev-open="${escapeHtml(record.id)}" type="button">Open</button>
              <button class="miniBtn danger" data-ev-delete="${escapeHtml(record.id)}" type="button">Delete</button>
            </div>
          </div>
          ${suggestions.length ? `<div class="healthBtns" style="margin-top:8px">${suggestions.map((suggestion) => `<button class="miniBtn" data-ev-suggested-attach="${escapeHtml(record.id)}" data-ev-suggested-target="${escapeHtml(suggestion.id)}" type="button">Attach to ${escapeHtml(suggestion.name)}</button>`).join("")}</div>` : ""}
        </article>
      `;
      }).join("")
    : `<div class="small">No evidence records yet. Save a reusable medical note, DBQ, or statement link here, then attach it across multiple conditions.</div>`;

  host.querySelectorAll("[data-ev-attach]").forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = targetEl.value || "";
      if (!targetId) {
        alert("Choose a workspace condition to attach this evidence record.");
        return;
      }
      const record = loadEvidenceLibrary().find((item) => item.id === button.dataset.evAttach);
      if (!record) return;
      const links = loadEvidenceLinks(targetId);
      links.push({
        id: `evidence-link-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        url: record.url || "",
        label: record.label || "",
        type: record.type || "Other",
        date: "",
        note: record.excerpt || ""
      });
      saveEvidenceLinks(targetId, links);
      if (record.excerpt) {
        const existing = (loadNotes(targetId) || "").trim();
        if (!existing.includes(record.excerpt)) {
          saveNotes(targetId, existing ? `${existing}\n\n[Evidence library excerpt]\n${record.excerpt}` : `[Evidence library excerpt]\n${record.excerpt}`);
        }
      }
      pushWorkspaceActivity("Evidence attached", `${record.label} was attached to ${conditionNameById(targetId)} from the evidence library.`);
      renderWorkspace();
      renderHealthPanel();
      renderWorkspaceActivity();
      alert(`Attached ${record.label} to ${conditionNameById(targetId)}.`);
    });
  });

  host.querySelectorAll("[data-ev-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const record = loadEvidenceLibrary().find((item) => item.id === button.dataset.evOpen);
      if (record?.url) window.open(record.url, "_blank", "noopener,noreferrer");
    });
  });

  host.querySelectorAll("[data-ev-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      const recordsNow = loadEvidenceLibrary();
      const record = recordsNow.find((item) => item.id === button.dataset.evDelete);
      if (!record) return;
      saveEvidenceLibrary(recordsNow.filter((item) => item.id !== record.id));
      pushWorkspaceActivity("Evidence record removed", `${record.label} was removed from the evidence library.`);
      renderEvidenceLibrary();
      renderWorkspaceActivity();
      alert(`Deleted ${record.label}.`);
    });
  });

  host.querySelectorAll("[data-ev-suggested-attach]").forEach((button) => {
    button.addEventListener("click", () => {
      const record = loadEvidenceLibrary().find((item) => item.id === button.dataset.evSuggestedAttach);
      const targetId = button.dataset.evSuggestedTarget || "";
      if (!record || !targetId) return;
      targetEl.value = targetId;
      const attachButton = host.querySelector(`[data-ev-attach="${CSS.escape(record.id)}"]`);
      attachButton?.click();
    });
  });
}

function renderSnapshotHistoryList() {
  const host = document.getElementById("wsSnapshotHistory");
  if (!host) return;

  const items = loadSnapshotHistory();
  host.innerHTML = items.length
    ? items.map((item) => `
        <article class="snapshotCard">
          <div class="snapshotHeader">
            <div>
              <strong>${escapeHtml(item.action || "Compared")}: ${escapeHtml(item.snapshotName || "Workspace snapshot")}</strong>
              <div class="small">${escapeHtml(item.milestone || "No milestone label")}</div>
            </div>
            <div class="small">${item.createdAt ? escapeHtml(new Date(item.createdAt).toLocaleString()) : ""}</div>
          </div>
        </article>
      `).join("")
    : `<div class="small">No compare or restore history yet. Compare or restore a restore point to build a version trail.</div>`;
}

function renderWorkspaceProfiles() {
  const host = document.getElementById("wsProfileList");
  const currentEl = document.getElementById("wsProfileCurrent");
  if (!host || !currentEl) return;

  const profiles = loadWorkspaceProfiles().sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
  const activeId = loadActiveWorkspaceProfileId();
  const active = profiles.find((profile) => profile.id === activeId) || null;
  currentEl.innerHTML = active
    ? `<strong>Current profile:</strong> ${escapeHtml(active.name)} <span class="small">• ${escapeHtml(workspaceProfileSummary(active))}</span>`
    : `<strong>Current profile:</strong> none selected yet`;

  host.innerHTML = profiles.length
    ? profiles.map((profile) => `
        <article class="snapshotCard ${profile.id === activeId ? "profileActiveCard" : ""}">
          <div class="snapshotHeader">
            <div>
              <strong>${escapeHtml(profile.name)}</strong>
              <div class="small">${escapeHtml(profile.notes || "No profile notes yet")}</div>
              <div class="small">${escapeHtml(workspaceProfileSummary(profile))}</div>
            </div>
            <div class="small">${profile.updatedAt ? escapeHtml(new Date(profile.updatedAt).toLocaleString()) : ""}</div>
          </div>
          <div class="healthBtns" style="margin-top:8px">
            <button class="miniBtn" data-profile-load="${escapeHtml(profile.id)}" type="button">Load</button>
            <button class="miniBtn" data-profile-saveover="${escapeHtml(profile.id)}" type="button">Save Over</button>
            <button class="miniBtn" data-profile-duplicate="${escapeHtml(profile.id)}" type="button">Duplicate</button>
            <button class="miniBtn danger" data-profile-delete="${escapeHtml(profile.id)}" type="button">Delete</button>
          </div>
        </article>
      `).join("")
    : `<div class="small">No saved claim workspaces yet. Save the current workspace as a profile to manage multiple veterans or claim versions cleanly.</div>`;

  host.querySelectorAll("[data-profile-load]").forEach((button) => {
    button.addEventListener("click", () => {
      const profile = loadWorkspaceProfiles().find((item) => item.id === button.dataset.profileLoad);
      if (!profile) return;
      if (!confirm(`Load "${profile.name}" and replace the current local workspace?`)) return;
      applyWorkspaceBackup(profile.backup || emptyWorkspaceBackup());
      saveActiveWorkspaceProfileId(profile.id);
      pushWorkspaceActivity("Profile loaded", `${profile.name} was loaded as the active claim workspace.`);
      renderWorkspaceProfiles();
      renderSnapshotComparison(null);
      renderDocumentLibrary();
      renderExtractorHistory();
      renderExtractorPacketLibrary();
      renderEvidenceLibrary();
      renderSnapshotHistoryList();
      renderWorkspace();
      renderClaimTree();
      renderHealthPanel();
      renderWorkspaceActivity();
      alert(`Loaded ${profile.name}.`);
    });
  });

  host.querySelectorAll("[data-profile-saveover]").forEach((button) => {
    button.addEventListener("click", () => {
      const profilesNow = loadWorkspaceProfiles();
      const index = profilesNow.findIndex((item) => item.id === button.dataset.profileSaveover);
      if (index < 0) return;
      const existing = profilesNow[index];
      profilesNow[index] = {
        ...existing,
        updatedAt: new Date().toISOString(),
        backup: buildWorkspaceBackup()
      };
      saveWorkspaceProfiles(profilesNow);
      saveActiveWorkspaceProfileId(existing.id);
      renderWorkspaceProfiles();
      alert(`Saved current workspace into ${existing.name}.`);
    });
  });

  host.querySelectorAll("[data-profile-duplicate]").forEach((button) => {
    button.addEventListener("click", () => {
      const profile = loadWorkspaceProfiles().find((item) => item.id === button.dataset.profileDuplicate);
      if (!profile) return;
      const duplicate = buildWorkspaceProfile({
        name: `${profile.name} Copy`,
        notes: profile.notes || "",
        backup: JSON.parse(JSON.stringify(profile.backup || emptyWorkspaceBackup()))
      });
      saveWorkspaceProfiles([duplicate, ...loadWorkspaceProfiles()].slice(0, 20));
      renderWorkspaceProfiles();
      alert(`Duplicated ${profile.name}.`);
    });
  });

  host.querySelectorAll("[data-profile-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      const profilesNow = loadWorkspaceProfiles();
      const profile = profilesNow.find((item) => item.id === button.dataset.profileDelete);
      if (!profile) return;
      if (!confirm(`Delete "${profile.name}"?`)) return;
      saveWorkspaceProfiles(profilesNow.filter((item) => item.id !== profile.id));
      if (loadActiveWorkspaceProfileId() === profile.id) {
        saveActiveWorkspaceProfileId("");
      }
      renderWorkspaceProfiles();
      alert(`Deleted ${profile.name}.`);
    });
  });
}

function renderNexusBuilder() {
  const childEl = document.getElementById("nexusChild");
  const parentEl = document.getElementById("nexusParent");
  const relationEl = document.getElementById("nexusRelation");
  const previewEl = document.getElementById("nexusDraftOut");
  if (!childEl || !parentEl || !relationEl || !previewEl) return;

  const st = loadWorkspaceState();
  const items = (st.nodes || []).map(id => CONDITIONS.find(c => c.id === id)).filter(Boolean);
  const linkedItems = items.filter((item) => parentsOf(item.id, st.links).length > 0);
  const childOptions = linkedItems.length ? linkedItems : items.filter((item) => item.id !== st.primaryId);
  const priorChild = childEl.value;
  const priorParent = parentEl.value;

  childEl.innerHTML = childOptions.length
    ? childOptions.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("")
    : `<option value="">Add linked or secondary workspace conditions first</option>`;
  if (priorChild && childOptions.some((item) => item.id === priorChild)) childEl.value = priorChild;

  const selectedChild = childEl.value || childOptions[0]?.id || "";
  const parentCandidates = selectedChild
    ? parentsOf(selectedChild, st.links).map((link) => CONDITIONS.find(c => c.id === link.from)).filter(Boolean)
    : [];
  const fallbackParents = items.filter((item) => item.id !== selectedChild);
  const parentItems = parentCandidates.length ? parentCandidates : fallbackParents;

  parentEl.innerHTML = parentItems.length
    ? parentItems.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("")
    : `<option value="">Select a related condition</option>`;
  if (priorParent && parentItems.some((item) => item.id === priorParent)) parentEl.value = priorParent;

  if (!previewEl.value.trim() && childOptions.length && parentItems.length) {
    const child = CONDITIONS.find((item) => item.id === (childEl.value || childOptions[0]?.id));
    const parent = CONDITIONS.find((item) => item.id === (parentEl.value || parentItems[0]?.id));
    previewEl.value = buildNexusDraft({
      childName: child?.name || "",
      parentName: parent?.name || "",
      relationType: relationEl.value || "Secondary service connection"
    });
  }
}

function renderRatingScenarioList() {
  const host = document.getElementById("wsRatingScenarioList");
  if (!host) return;

  const scenarios = loadRatingScenarios();
  const items = (loadWorkspaceState().nodes || []).map(id => CONDITIONS.find(c => c.id === id)).filter(Boolean);
  host.innerHTML = scenarios.length
    ? scenarios.map((scenario) => {
        const estimate = estimateScenarioSnapshot(scenario.state, items);
        return `
          <article class="builderSuggestionCard">
            <div class="builderSuggestionTop">
              <div>
                <strong>${escapeHtml(scenario.name)}</strong>
                <div class="small">${escapeHtml(scenario.state?.currentRating || 0)}% current • ${escapeHtml(estimate.rounded)}% projected</div>
                <div class="small">${scenario.createdAt ? escapeHtml(new Date(scenario.createdAt).toLocaleString()) : ""}</div>
              </div>
              <div class="healthBtns" style="margin-top:0">
                <button class="miniBtn" data-rating-scenario-load="${escapeHtml(scenario.id)}" type="button">Load</button>
                <button class="miniBtn danger" data-rating-scenario-delete="${escapeHtml(scenario.id)}" type="button">Delete</button>
              </div>
            </div>
          </article>
        `;
      }).join("")
    : `<div class="small">No saved rating scenarios yet. Save a conservative, moderate, or aggressive estimate to compare later.</div>`;

  host.querySelectorAll("[data-rating-scenario-load]").forEach((button) => {
    button.addEventListener("click", () => {
      const scenario = loadRatingScenarios().find((item) => item.id === button.dataset.ratingScenarioLoad);
      if (!scenario) return;
      applyRatingScenario(scenario);
      renderRatingEstimator();
      renderStickyWorkspaceSummary();
      alert(`Loaded ${scenario.name}.`);
    });
  });

  host.querySelectorAll("[data-rating-scenario-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      const scenariosNow = loadRatingScenarios();
      const scenario = scenariosNow.find((item) => item.id === button.dataset.ratingScenarioDelete);
      if (!scenario) return;
      saveRatingScenarios(scenariosNow.filter((item) => item.id !== scenario.id));
      pushWorkspaceActivity("Rating scenario removed", `${scenario.name} was removed from saved rating scenarios.`);
      renderRatingScenarioList();
      renderWorkspaceActivity();
      alert(`Deleted ${scenario.name}.`);
    });
  });
}

function buildWorkspacePacketText(items, options = {}) {
  const audience = options.audience || "review";
  const lines = [];
  const health = computeHealthSummary();
  const st = loadWorkspaceState();
  const primary = st.primaryId ? CONDITIONS.find(c => c.id === st.primaryId) : null;
  const theories = loadTheoryState();

  lines.push(`VA CFR Finder — ${audience === "veteran" ? "Veteran" : audience === "representative" ? "Representative" : "Quick Review"} Workspace Packet`);
  lines.push(new Date().toLocaleString());
  lines.push("");
  lines.push(`Audience: ${audience}`);
  lines.push(`Primary condition: ${primary ? primary.name : "(not set)"}`);
  lines.push(`Conditions in workspace: ${items.length}`);
  lines.push(`Overall readiness: ${health.evidence.done}/${health.evidence.total} (${health.evidence.pct}%)`);
  lines.push("Provenance: notes, timelines, evidence links, and saved theories are user-entered; intake matches and evidence suggestions are inferred; packet summaries and coaching text are generated by the app.");
  lines.push("");

  if (audience === "review") {
    lines.push("Quick Review Summary:");
    lines.push(`- Orphans: ${health.orphans.length}`);
    lines.push(`- Disconnected from Primary: ${health.disconnected.length}`);
    lines.push(`- Linked items missing notes: ${health.notesMissingIds.length}`);
    lines.push(`- Broken CFR references: ${health.brokenCfr.broken}`);
    lines.push("");
  }

  if (audience === "veteran") {
    lines.push("Veteran-Facing Overview:");
    lines.push(primary
      ? `This packet is organized around ${primary.name} as the main condition, with related issues listed underneath it.`
      : "This packet lists the current conditions in the workspace, but a primary claim theory still needs to be chosen.");
    lines.push("Use it to understand what is already documented and what details still need to be added.");
    lines.push("");
  }

  if (audience === "representative") {
    lines.push("Representative-Facing Overview:");
    lines.push(primary
      ? `Primary theory is currently anchored on ${primary.name}. Review linked conditions, notes, and evidence support for theory consistency.`
      : "No primary theory is set yet. Review the workspace and set the strongest anchor condition before deeper packet review.");
    lines.push("This packet emphasizes relationships, evidence support, and current drafting gaps.");
    lines.push("");
  }

  lines.push("Structured Claim Theories:");
  (theories.length
    ? theories.map((theory, index) => `${index + 1}. ${theory.type}: ${theory.subjectName}${theory.parentName ? ` linked to ${theory.parentName}` : ""}${theory.summary ? ` — ${theory.summary}` : ""}`)
    : ["No structured theory has been saved yet."])
    .forEach(line => lines.push(line));
  lines.push("");

  items.forEach((item, i) => {
    const st = loadEvidenceState(item.id);
    const wsState = loadWorkspaceState();
    const linksToMe = (wsState.links || []).filter(l => l.to === item.id);
    const strength = evidenceStrength(item, wsState);
    const readiness = conditionReadiness(item, wsState);
    const gaps = granularGapsForCondition(item, wsState);
    
    lines.push("============================================================");
    lines.push(`${i + 1}) ${item.name} (${item.id})`);
    lines.push(`Body system: ${item.body_system || "(unknown)"}`);
    lines.push(`Support strength: ${strength.label}`);
    lines.push(`Readiness by section: diagnosis ${readiness.scores.diagnosis}% | severity ${readiness.scores.severity}% | nexus ${readiness.scores.nexus}% | timeline ${readiness.scores.timeline}% | evidence ${readiness.scores.evidence}%`);
    
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

    if (audience === "representative") {
      const notes = (loadNotes(item.id) || "").trim();
      const timelineCount = loadTimeline(item.id).length;
      const evidenceLinksCount = loadEvidenceLinks(item.id).length;
      lines.push("Case posture:");
      lines.push(`- Notes: ${notes ? "present" : "missing"}`);
      lines.push(`- Timeline entries: ${timelineCount}`);
      lines.push(`- Evidence links: ${evidenceLinksCount}`);
      if (gaps.length) lines.push(`- Noted gaps: ${gaps.join("; ")}`);
      lines.push(`- Recommended next action: ${readiness.nextAction}`);
      lines.push("");
    }

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
    lines.push(audience === "veteran" ? "Your saved notes:" : "Notes:");
    const notes = (loadNotes(item.id) || "").trim();
    lines.push(notes ? notes : "(none)");
    lines.push("");

    if (audience === "veteran") {
      const next = [];
      if (!notes) next.push("Add a plain-language note describing symptoms, impact, and treatment.");
      if (loadEvidenceLinks(item.id).length === 0) next.push("Attach at least one supporting evidence link or record reference.");
      if (evidenceCompletion(item, st).pct < 100) next.push("Finish the remaining checklist items for this condition.");
      lines.push("Suggested next steps:");
      (next.length ? next : ["- This condition already has a solid first-pass workspace setup."]).forEach((step) => {
        lines.push(step.startsWith("-") ? step : `- ${step}`);
      });
      lines.push("");
    }

    if (audience !== "veteran" && gaps.length) {
      lines.push("Gap review:");
      gaps.forEach((gap) => lines.push(`- ${gap}`));
      lines.push("");
    }
  });

  lines.push("============================================================");
  if (audience === "review") {
    lines.push("Use this quick packet for fast triage, handoff, or status review.");
  } else if (audience === "veteran") {
    lines.push("Use this packet to understand what your workspace currently says and what details still need to be filled in.");
  } else {
    lines.push("Use this packet for representative-side review of theory, support, and current drafting gaps.");
  }
  lines.push("Disclaimer: Educational only. Not legal advice/representation.");
  lines.push("Assumptions: rating projections are estimates only, and relationship theories still need record-specific support.");
  return lines.join("\n");
}

function buildAssembledPacketText(options = {}) {
  const audience = options.audience || "review";
  const include = {
    overview: options.include?.overview !== false,
    coach: options.include?.coach !== false,
    submission: options.include?.submission !== false,
    theories: options.include?.theories !== false,
    narrative: options.include?.narrative !== false,
    timeline: options.include?.timeline !== false,
    binder: options.include?.binder !== false,
    coverage: options.include?.coverage !== false,
  };

  const ordered = orderedWorkspaceItemsForExport();
  const st = loadWorkspaceState();
  const lines = [];
  lines.push(`VA CFR Finder — Smart Packet Assembler (${audience})`);
  lines.push(new Date().toLocaleString());
  lines.push("");
  lines.push("This assembled packet combines selected workspace outputs into one handoff draft.");
  lines.push("Provenance: notes, timelines, theories, and evidence links are user-entered; suggestions and summaries are generated or inferred by the app.");
  lines.push("");

  if (include.overview) {
    lines.push("============================================================");
    lines.push("WORKSPACE OVERVIEW");
    lines.push("============================================================");
    lines.push(buildWorkspacePacketText(ordered, { audience }));
    lines.push("");
  }

  if (include.coach) {
    lines.push("============================================================");
    lines.push("STRATEGY COACH");
    lines.push("============================================================");
    lines.push(generateStrategyCoachText());
    lines.push("");
  }

  if (include.submission) {
    lines.push("============================================================");
    lines.push("SUBMISSION PREP");
    lines.push("============================================================");
    lines.push(generateSubmissionPrepText());
    lines.push("");
  }

  if (include.theories) {
    const theories = loadTheoryState();
    lines.push("============================================================");
    lines.push("STRUCTURED THEORY REVIEW");
    lines.push("============================================================");
    if (!theories.length) {
      lines.push("No structured theories saved yet.");
    } else {
      theories.forEach((theory, index) => {
        const subject = CONDITIONS.find((item) => item.id === theory.subjectId) || null;
        const parent = CONDITIONS.find((item) => item.id === theory.parentId) || null;
        const score = scoreTheoryRecord(theory, { subject, parent });
        lines.push(`${index + 1}. ${theory.type}: ${theory.subjectName}${theory.parentName ? ` linked to ${theory.parentName}` : ""}`);
        lines.push(`Summary: ${theory.summary || "(none)"}`);
        lines.push(`Review: ${score.tier} (${score.score}/100)`);
        if (score.feedback.length) score.feedback.forEach((entry) => lines.push(`- ${entry}`));
        lines.push("");
      });
    }
    lines.push("");
  }

  if (include.narrative) {
    lines.push("============================================================");
    lines.push("CLAIM NARRATIVE");
    lines.push("============================================================");
    lines.push(generateNarrativeDraft({ linkedOnly: false, style: "detailed" }));
    lines.push("");
  }

  if (include.timeline) {
    lines.push("============================================================");
    lines.push("WORKSPACE TIMELINE");
    lines.push("============================================================");
    lines.push(workspaceTimelineDraft("all"));
    lines.push("");
  }

  if (include.binder) {
    lines.push("============================================================");
    lines.push("EVIDENCE BINDER");
    lines.push("============================================================");
    lines.push(workspaceEvidenceBinderDraft("all", "date", "flat"));
    lines.push("");
  }

  if (include.coverage) {
    const items = (st.nodes || []).map((id) => CONDITIONS.find((condition) => condition.id === id)).filter(Boolean);
    const matrix = computeEvidenceCoverageMatrix(items, st);
    lines.push("============================================================");
    lines.push("EVIDENCE COVERAGE MATRIX");
    lines.push("============================================================");
    if (!matrix.rows.length) {
      lines.push("No workspace conditions yet.");
    } else {
      matrix.rows.forEach((row) => {
        lines.push(`${row.name}: diagnosis ${row.cells.diagnosis ? "yes" : "no"} | severity ${row.cells.severity ? "yes" : "no"} | timeline ${row.cells.timeline ? "yes" : "no"} | nexus ${row.cells.nexus ? "yes" : "no"}`);
        lines.push(`Next move: ${row.nextAction}`);
      });
    }
    lines.push("");
  }

  return lines.join("\n");
}

function orderedWorkspaceItemsForExport() {
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

  return [
    ...(primary ? [primary] : []),
    ...secondaries,
    ...unassigned
  ];
}

function openPrintablePacket(audience = "review") {
  const items = orderedWorkspaceItemsForExport();
  const st = loadWorkspaceState();
  const primary = st.primaryId ? CONDITIONS.find((condition) => condition.id === st.primaryId) : null;
  const html = buildPrintablePacketHtml(items, {
    audience,
    primary,
    theories: loadTheoryState(),
  });
  const win = window.open("", "_blank", "noopener,noreferrer");
  if (!win) {
    alert("Popup blocked. Allow popups for this site to open the printable packet.");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
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
  const wsOrphans = document.getElementById("wsOrphans");
  const wsBarFill = document.getElementById("wsBarFill");
  const wsFilterSearch = document.getElementById("wsFilterSearch");
  const wsFilterSupport = document.getElementById("wsFilterSupport");
  const wsFilterStatus = document.getElementById("wsFilterStatus");
  const wsFilterSystem = document.getElementById("wsFilterSystem");
  const wsFilterNotes = document.getElementById("wsFilterNotes");
  const wsFilterSummary = document.getElementById("wsFilterSummary");

  if (!wsList || !wsScore || !wsBarFill) return;
  renderSnapshotList();
  renderSnapshotHistoryList();
  renderWorkspaceProfiles();
  renderWorkspaceActivity();
  renderEvidenceHub();
  renderEvidenceCoverageMatrix();
  renderEvidenceLibrary();
  renderEvidenceConflictEngine();
  renderRatingEstimator();
  renderNexusBuilder();
  renderRepresentativeReviewSummary();
  renderWorkspaceDashboard();
  renderStickyWorkspaceSummary();
  renderStartHereSteps();
  renderHomepageNextAction();
  renderHomepageUsageSummary();
  renderTheoryBuilder();
  renderActionEngine();
  renderClaimMilestones();

  const st = loadWorkspaceState();
  const items = st.nodes.map(id => CONDITIONS.find(c => c.id === id)).filter(Boolean);
  const systems = [...new Set(items.map((item) => item.body_system).filter(Boolean))].sort();
  if (wsFilterSystem) {
    const current = wsFilterSystem.value || "";
    wsFilterSystem.innerHTML = `<option value="">All body systems</option>${systems.map((value) => `<option value="${escapeHtml(value)}"${value === current ? " selected" : ""}>${escapeHtml(value)}</option>`).join("")}`;
  }

  wsList.innerHTML = "";

  if (!items.length) {
    wsScore.textContent = "Evidence Readiness: 0/0 (0%)";
    wsBarFill.style.width = "0%";
    wsList.innerHTML = `<div class="small">Workspace is empty. Open a condition and click “Add to Workspace”.</div>`;
    return;
  }

  // Compute readiness across ALL workspace items
  const { done, total, pct } = workspaceCompletion(items);
  const strongCount = items.filter(item => evidenceStrength(item, st).label === "Strong").length;
  wsScore.textContent = `Evidence Readiness: ${done}/${total} (${pct}%) • Strong support: ${strongCount}/${items.length}`;
  wsBarFill.style.width = `${pct}%`;

  const orphanItems = items.filter(it => isOrphan(it.id, st));
  if (wsOrphans) wsOrphans.textContent = `Orphans: ${orphanItems.length}`;

  const visibleItems = filterWorkspaceItems(items, {
    search: wsFilterSearch?.value || "",
    support: wsFilterSupport?.value || "",
    status: wsFilterStatus?.value || "",
    system: wsFilterSystem?.value || "",
    notes: wsFilterNotes?.value || ""
  }, st);
  if (wsFilterSummary) {
    wsFilterSummary.textContent = `${visibleItems.length} of ${items.length} workspace condition${items.length === 1 ? "" : "s"} shown.`;
  }

  visibleItems.forEach(item => {
    const isPrimary = item.id === st.primaryId;
    const orphan = isOrphan(item.id, st);
    const stNow = loadWorkspaceState();
    const parentLinks = parentsOf(item.id, stNow.links);
    const candidates = stNow.nodes.filter(x => x !== item.id);

    const ev = evidenceCompletion(item, loadEvidenceState(item.id));
    const strength = evidenceStrength(item, stNow);
    const readiness = conditionReadiness(item, stNow);
    const coachTips = conditionSpecificCoaching(item, stNow);
    const gaps = granularGapsForCondition(item, stNow);

    const card = document.createElement("div");
    card.className = `wsCard ${systemClassName(item.body_system)}${orphan ? " orphan" : ""}`;

    card.innerHTML = `
      <div class="wsRow">
        <div style="min-width:260px">
          <div>
            <strong>${escapeHtml(item.name)}</strong>
            ${orphan ? `<span class="orphanBadge">Orphan</span>` : ""}
            ${isPrimary ? `<span class="wsBadge">Primary</span>` : `<span class="wsBadge">Linked</span>`}
            <span class="strengthBadge ${escapeHtml(strength.className)}">${escapeHtml(strength.label)}</span>
            <span class="strengthBadge ${escapeHtml(readiness.overallTone.className)}">${escapeHtml(readiness.overall)}% ready</span>
          </div>
              <div class="small">${escapeHtml(item.body_system || "")} • ${ev.done}/${ev.total} (${ev.pct}%)</div>
              <div class="small">Readiness: Dx ${readiness.scores.diagnosis}% • Severity ${readiness.scores.severity}% • Nexus ${readiness.scores.nexus}% • Timeline ${readiness.scores.timeline}% • Evidence ${readiness.scores.evidence}%</div>
              ${coachTips.length ? `<div class="small"><strong>Coach:</strong> ${escapeHtml(coachTips[0])}</div>` : ""}
              <div class="small">Next: ${escapeHtml(readiness.nextAction)}</div>
              ${gaps.length ? `<div class="small">Gaps: ${escapeHtml(gaps.slice(0, 3).join(", "))}</div>` : `<div class="small">Gaps: none obvious</div>`}

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

  if (!visibleItems.length) {
    wsList.innerHTML = `<div class="small">No workspace conditions matched the current filters.</div>`;
  }

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
  // Enlarged nodes to reduce label overlap and give badge space
  const nodeW = 340, nodeH = 64;
  const padX = 30, padY = 20;
  const gapX = 90, gapY = 22;

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
      ${(() => {
        // wrap label into up to two lines
        const approxChar = 7; // approximate character width in px
        const padRight = 140; // reserve space for badge and padding
        const maxChars = Math.max(18, Math.floor((nodeW - padRight) / approxChar));
        const words = (label || '').split(/\s+/).filter(Boolean);
        const lines = [];
        let cur = "";
        for (const w of words) {
          if ((cur + ' ' + w).trim().length <= maxChars) cur = (cur + ' ' + w).trim();
          else { lines.push(cur); cur = w; if (lines.length >= 1) break; }
        }
        if (cur) lines.push(cur);
        if (lines.length > 2) {
          const first = lines[0];
          let second = lines.slice(1).join(' ');
          if (second.length > maxChars) second = second.slice(0, maxChars - 3) + '...';
          lines.length = 0; lines.push(first, second);
        }
        if (lines.length === 1) lines.push('');

        const y1 = 22;
        const y2 = y1 + 18;

        return `
          <text fill="rgba(255,255,255,0.95)" style="font-size:13px;font-weight:600">
            <tspan x="12" y="${y1}">${escapeHtml(lines[0] || '')}</tspan>
            <tspan x="12" y="${y2}">${escapeHtml(lines[1] || '')}</tspan>
          </text>
        `;
      })()}
      ${badge ? `<text x="${nodeW - 12}" y="22" fill="rgba(255,255,255,0.65)" style="font-size:12px;text-anchor:end">${esc(badge)}</text>` : ""}
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

  if (q === "timeline" || q.includes("timeline")) {
    const timelineAnchor = document.getElementById("jump-timeline");
    if (timelineAnchor) timelineAnchor.scrollIntoView({ behavior: "smooth", block: "start" });
    const tlDate = document.getElementById("tlDate");
    if (tlDate) {
      setTimeout(() => tlDate.focus(), 150);
    }
    return;
  }

  if (q === "evidence" || q.includes("evidence")) {
    const evidenceAnchor = document.getElementById("jump-evidence");
    if (evidenceAnchor) evidenceAnchor.scrollIntoView({ behavior: "smooth", block: "start" });
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
  const favorites = new Set(loadFavoriteConditions());

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
    




    // Quick add to workspace button (stop propagation so it doesn't open Detail)
    const addBtn = document.createElement('button');
    addBtn.className = 'miniBtn';
    addBtn.type = 'button';
    addBtn.dataset.addToWs = item.id;
    addBtn.textContent = '+ Add to Workspace';
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      ensureNode(item.id);
      renderWorkspace();
      alert('Added to workspace!');
    });

    const metaRow = div.querySelector('.metaRow');
    if (metaRow) metaRow.appendChild(addBtn);

    const favBtn = document.createElement("button");
    favBtn.className = "miniBtn";
    favBtn.type = "button";
    favBtn.dataset.favoriteCondition = item.id;
    favBtn.textContent = favorites.has(item.id) ? "★ Favorite" : "☆ Favorite";
    favBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const active = toggleFavoriteCondition(item.id);
      favBtn.textContent = active ? "★ Favorite" : "☆ Favorite";
      renderConditionBrowse();
    });
    if (metaRow) metaRow.appendChild(favBtn);

    div.addEventListener("click", () => {
      const raw = document.getElementById("q")?.value || "";
      const parsed = parseCommandQuery(raw);
      const hint = parsed.mode === "jump" ? parsed.jump : raw;
      showDetail(item.id, true, hint);
    });

    el.appendChild(div);
  });
}

const POPULAR_CONDITION_IDS = [
  "ptsd",
  "tinnitus",
  "migraines",
  "sleep_apnea",
  "lumbar_strain",
  "sciatic_nerve",
  "depression",
  "anxiety",
  "sinusitis",
  "gerd",
  "ibs",
  "hypertension",
];

const CONDITION_CONNECTION_HINTS = {
  ptsd: ["depression", "anxiety", "insomnia", "migraines"],
  depression: ["ptsd", "anxiety", "insomnia"],
  anxiety: ["ptsd", "insomnia", "migraines"],
  tinnitus: ["hearing_loss", "vertigo"],
  sleep_apnea: ["ptsd", "hypertension", "insomnia"],
  lumbar_strain: ["sciatic_nerve", "peripheral_neuropathy"],
  sciatic_nerve: ["lumbar_strain", "peripheral_neuropathy"],
  sinusitis: ["allergic_rhinitis", "sleep_apnea"],
  allergic_rhinitis: ["sinusitis", "sleep_apnea"],
  migraines: ["ptsd", "anxiety", "insomnia"],
  gerd: ["ibs", "sleep_apnea"],
};

let ONBOARDING_WIZARD_STATE = {
  step: 0,
  mode: "primary",
  primaryId: "ptsd",
  bundleId: "bundle-ptsd-chain",
  planId: "mental-health-chain",
};

function syncOnboardingWizardState(partial = {}) {
  ONBOARDING_WIZARD_STATE = {
    ...ONBOARDING_WIZARD_STATE,
    ...partial,
  };
  saveOnboardingWizardState(ONBOARDING_WIZARD_STATE);
}

function commonSecondaryBundles() {
  return [
    {
      id: "bundle-ptsd-chain",
      title: "PTSD Secondary Bundle",
      description: "Stage a common mental-health chain with mood, sleep, and migraine follow-up issues.",
      primaryId: "ptsd",
      links: [
        { to: "depression", type: "Secondary to" },
        { to: "anxiety", type: "Secondary to" },
        { to: "insomnia", type: "Secondary to" },
        { to: "migraines", type: "Secondary to" },
      ],
    },
    {
      id: "bundle-back-chain",
      title: "Back Pain Bundle",
      description: "Use a lumbar condition as the anchor and stage common radicular/nerve follow-up issues.",
      primaryId: "lumbar_strain",
      links: [
        { to: "sciatic_nerve", type: "Associated with" },
        { to: "peripheral_neuropathy", type: "Associated with" },
      ],
    },
    {
      id: "bundle-ear-chain",
      title: "Noise / Ear Bundle",
      description: "Start from tinnitus and stage hearing loss plus dizziness/vertigo review.",
      primaryId: "tinnitus",
      links: [
        { to: "hearing_loss", type: "Associated with" },
        { to: "vertigo", type: "Associated with" },
      ],
    },
    {
      id: "bundle-sinus-chain",
      title: "Sinus / Breathing Bundle",
      description: "Use chronic sinus complaints as an anchor and stage common nasal breathing follow-up issues.",
      primaryId: "sinusitis",
      links: [
        { to: "allergic_rhinitis", type: "Associated with" },
        { to: "sleep_apnea", type: "Associated with" },
      ],
    },
  ];
}

function connectionHintNames(conditionId) {
  return (CONDITION_CONNECTION_HINTS[conditionId] || [])
    .map((id) => CONDITIONS.find((item) => item.id === id)?.name)
    .filter(Boolean);
}

function whyConditionIsCommon(condition) {
  const id = condition?.id || "";
  if (["ptsd", "depression", "anxiety", "insomnia"].includes(id)) {
    return "Often chosen because mental-health claims and secondaries commonly drive broader claim theory and daily-impact evidence.";
  }
  if (["tinnitus", "hearing_loss", "vertigo"].includes(id)) {
    return "Common because noise exposure and ear-related complaints are frequent starting points with straightforward exposure narratives.";
  }
  if (["lumbar_strain", "sciatic_nerve", "peripheral_neuropathy"].includes(id)) {
    return "Common because back and nerve claims often travel together and benefit from clear functional-impact notes.";
  }
  if (["migraines", "sleep_apnea", "sinusitis", "allergic_rhinitis"].includes(id)) {
    return "Common because these conditions often show up in secondary theories, symptom logs, and treatment-history workflows.";
  }
  if (["gerd", "ibs", "hypertension"].includes(id)) {
    return "Common because chronic symptom patterns and medication history make these claims frequent review targets.";
  }
  return "Common because users often start here when building a primary theory or staging likely related conditions.";
}

function applySecondaryBundle(bundle) {
  if (!bundle) return;
  ensureNode(bundle.primaryId);
  setPrimary(bundle.primaryId);
  bundle.links.forEach((link) => {
    ensureNode(link.to);
    try {
      addLink(bundle.primaryId, link.to, link.type || "Secondary to");
    } catch (error) {
      // ignore duplicate/cycle attempts for preexisting workspace structures
    }
  });
  pushWorkspaceActivity("Secondary bundle applied", `${bundle.title} was added from the browse panel.`);
  incrementHomeUsage("bundles", bundle.id);
  renderWorkspace();
  renderClaimTree();
  renderHealthPanel();
}

function renderOnboardingWizard() {
  const host = document.getElementById("onboardingWizard");
  if (!host) return;

  const step = ONBOARDING_WIZARD_STATE.step || 0;
  const primary = CONDITIONS.find((item) => item.id === ONBOARDING_WIZARD_STATE.primaryId) || CONDITIONS[0];
  const bundle = commonSecondaryBundles().find((item) => item.id === ONBOARDING_WIZARD_STATE.bundleId) || commonSecondaryBundles()[0];
  const plan = quickStartPlans().find((item) => item.id === ONBOARDING_WIZARD_STATE.planId) || quickStartPlans()[0];

  const panels = [
    `
      <article class="builderSuggestionCard">
        <div class="builderSuggestionTop">
          <div>
            <strong>Step 1 of 3: Pick a starting style</strong>
            <div class="small">Choose the kind of help you want first. You can still use everything else later.</div>
          </div>
          <span class="provenanceTag prov-generated">Wizard</span>
        </div>
        <div class="builderGrid" style="margin-top:12px">
          <label class="builderField">
            <span class="small">Starting style</span>
            <select id="wizardMode">
              <option value="primary"${ONBOARDING_WIZARD_STATE.mode === "primary" ? " selected" : ""}>Choose one primary condition first</option>
              <option value="bundle"${ONBOARDING_WIZARD_STATE.mode === "bundle" ? " selected" : ""}>Use a common secondary bundle</option>
              <option value="quickstart"${ONBOARDING_WIZARD_STATE.mode === "quickstart" ? " selected" : ""}>Use a quick-start claim plan</option>
            </select>
          </label>
        </div>
      </article>
    `,
    ONBOARDING_WIZARD_STATE.mode === "primary"
      ? `
        <article class="builderSuggestionCard">
          <div class="builderSuggestionTop">
            <div>
              <strong>Step 2 of 3: Pick the anchor condition</strong>
              <div class="small">Start from the issue that feels most central or best documented.</div>
            </div>
          </div>
          <div class="builderGrid" style="margin-top:12px">
            <label class="builderField">
              <span class="small">Primary condition</span>
              <select id="wizardPrimary">
                ${CONDITIONS.map((item) => `<option value="${escapeHtml(item.id)}"${item.id === primary?.id ? " selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
              </select>
            </label>
          </div>
          <div class="small" style="margin-top:10px">Common follow-up connections: ${connectionHintNames(primary?.id).join(", ") || "none suggested yet"}</div>
        </article>
      `
      : ONBOARDING_WIZARD_STATE.mode === "bundle"
        ? `
          <article class="builderSuggestionCard">
            <div class="builderSuggestionTop">
              <div>
                <strong>Step 2 of 3: Choose a common secondary bundle</strong>
                <div class="small">This is the fastest way to scaffold a common claim chain.</div>
              </div>
            </div>
            <div class="builderGrid" style="margin-top:12px">
              <label class="builderField">
                <span class="small">Bundle</span>
                <select id="wizardBundle">
                  ${commonSecondaryBundles().map((item) => `<option value="${escapeHtml(item.id)}"${item.id === bundle?.id ? " selected" : ""}>${escapeHtml(item.title)}</option>`).join("")}
                </select>
              </label>
            </div>
            <div class="small" style="margin-top:10px">${escapeHtml(bundle?.description || "")}</div>
          </article>
        `
        : `
          <article class="builderSuggestionCard">
            <div class="builderSuggestionTop">
              <div>
                <strong>Step 2 of 3: Choose a quick-start claim plan</strong>
                <div class="small">Use this if you want the app to scaffold a broader starter path.</div>
              </div>
            </div>
            <div class="builderGrid" style="margin-top:12px">
              <label class="builderField">
                <span class="small">Quick-start plan</span>
                <select id="wizardPlan">
                  ${quickStartPlans().map((item) => `<option value="${escapeHtml(item.id)}"${item.id === plan?.id ? " selected" : ""}>${escapeHtml(item.title)}</option>`).join("")}
                </select>
              </label>
            </div>
            <div class="small" style="margin-top:10px">${escapeHtml(plan?.description || "")}</div>
          </article>
        `,
    `
      <article class="builderSuggestionCard">
        <div class="builderSuggestionTop">
          <div>
            <strong>Step 3 of 3: Apply and continue</strong>
            <div class="small">This will stage the starting workspace so you can move straight into evidence, notes, and theory building.</div>
          </div>
        </div>
        <div class="small">
          ${ONBOARDING_WIZARD_STATE.mode === "primary"
            ? `Primary condition: ${escapeHtml(primary?.name || "(not selected)")}`
            : ONBOARDING_WIZARD_STATE.mode === "bundle"
              ? `Bundle: ${escapeHtml(bundle?.title || "(not selected)")}`
              : `Quick-start plan: ${escapeHtml(plan?.title || "(not selected)")}`}
        </div>
      </article>
    `,
  ];

  host.innerHTML = `
    ${panels[step] || panels[0]}
    <div class="healthBtns" style="margin-top:12px">
      <button id="wizardBack" class="miniBtn" type="button"${step === 0 ? " disabled" : ""}>Back</button>
      ${step < 2 ? `<button id="wizardNext" class="miniBtn" type="button">Next</button>` : `<button id="wizardApply" class="miniBtn" type="button">Apply Setup</button>`}
      <button id="wizardSkip" class="miniBtn" type="button">Skip Wizard</button>
    </div>
  `;

  document.getElementById("wizardMode")?.addEventListener("change", (event) => {
    syncOnboardingWizardState({ mode: event.target.value || "primary", step: 0 });
    renderOnboardingWizard();
  });

  document.getElementById("wizardPrimary")?.addEventListener("change", (event) => {
    syncOnboardingWizardState({ primaryId: event.target.value || ONBOARDING_WIZARD_STATE.primaryId });
    renderOnboardingWizard();
  });

  document.getElementById("wizardBundle")?.addEventListener("change", (event) => {
    syncOnboardingWizardState({ bundleId: event.target.value || ONBOARDING_WIZARD_STATE.bundleId });
    renderOnboardingWizard();
  });

  document.getElementById("wizardPlan")?.addEventListener("change", (event) => {
    syncOnboardingWizardState({ planId: event.target.value || ONBOARDING_WIZARD_STATE.planId });
    renderOnboardingWizard();
  });

  document.getElementById("wizardBack")?.addEventListener("click", () => {
    syncOnboardingWizardState({ step: Math.max(0, (ONBOARDING_WIZARD_STATE.step || 0) - 1) });
    renderOnboardingWizard();
  });

  document.getElementById("wizardNext")?.addEventListener("click", () => {
    syncOnboardingWizardState({ step: Math.min(2, (ONBOARDING_WIZARD_STATE.step || 0) + 1) });
    renderOnboardingWizard();
  });

  document.getElementById("wizardApply")?.addEventListener("click", () => {
    if (ONBOARDING_WIZARD_STATE.mode === "primary") {
      ensureNode(primary.id);
      setPrimary(primary.id);
      showDetail(primary.id, true);
    } else if (ONBOARDING_WIZARD_STATE.mode === "bundle") {
      applySecondaryBundle(bundle);
    } else {
      applyQuickStartPlan(plan);
    }
    renderWorkspace();
    renderClaimTree();
    renderHealthPanel();
    syncOnboardingWizardState({ step: 2 });
    renderHomepageNextAction();
    renderHomepageUsageSummary();
    alert("Guided setup applied.");
  });

  document.getElementById("wizardSkip")?.addEventListener("click", () => {
    syncOnboardingWizardState({ step: 0 });
    document.getElementById("search-zone")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function renderConditionBrowse() {
  const popularEl = document.getElementById("popularConditions");
  const categoriesEl = document.getElementById("browseCategories");
  const summaryEl = document.getElementById("browseSummary");
  const recentEl = document.getElementById("recentConditions");
  const favoriteEl = document.getElementById("favoriteConditions");
  const bundlesEl = document.getElementById("secondaryBundles");
  if (!popularEl || !categoriesEl) return;

  const bySystem = new Map();
  CONDITIONS.forEach((condition) => {
    const key = condition.body_system || "Other";
    const rows = bySystem.get(key) || [];
    rows.push(condition);
    bySystem.set(key, rows);
  });

  const popular = POPULAR_CONDITION_IDS
    .map((id) => CONDITIONS.find((item) => item.id === id))
    .filter(Boolean);
  const recent = loadRecentConditions()
    .map((id) => CONDITIONS.find((item) => item.id === id))
    .filter(Boolean);
  const favorites = loadFavoriteConditions()
    .map((id) => CONDITIONS.find((item) => item.id === id))
    .filter(Boolean);

  if (summaryEl) {
    summaryEl.textContent = `${CONDITIONS.length} conditions across ${bySystem.size} body-system groups`;
  }

  if (recentEl) {
    recentEl.innerHTML = recent.length
      ? recent.map((item) => `
          <button class="browseMiniChip" data-browse-condition="${escapeHtml(item.id)}" type="button">
            ${escapeHtml(item.name)}
          </button>
        `).join("")
      : `<div class="small">Open a few condition details and your recent conditions will appear here.</div>`;
  }

  if (favoriteEl) {
    favoriteEl.innerHTML = favorites.length
      ? favorites.map((item) => `
          <button class="browseMiniChip" data-browse-condition="${escapeHtml(item.id)}" type="button">
            ${escapeHtml(item.name)}
          </button>
        `).join("")
      : `<div class="small">Use the star button on a search result to pin favorite conditions here.</div>`;
  }

  popularEl.innerHTML = popular.map((item) => `
    <article class="featuredConditionCard ${systemClassName(item.body_system)}">
      <div class="browseCategoryTop">
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <div class="small">${escapeHtml(item.body_system || "Other")}</div>
        </div>
        <button class="miniBtn" data-browse-condition="${escapeHtml(item.id)}" type="button">Open</button>
      </div>
      <div class="small">${escapeHtml(item.rating_logic?.summary || "Browse this condition to review CFR context and evidence guidance.")}</div>
      <div class="small" style="margin-top:6px"><strong>Usually connects to:</strong> ${escapeHtml(connectionHintNames(item.id).join(", ") || "no common connection hint saved yet")}</div>
      <div class="small" style="margin-top:4px"><strong>Why this is common:</strong> ${escapeHtml(whyConditionIsCommon(item))}</div>
    </article>
  `).join("");

  if (bundlesEl) {
    bundlesEl.innerHTML = commonSecondaryBundles().map((bundle) => `
      <article class="browseCategoryCard">
        <div class="browseCategoryTop">
          <div>
            <strong>${escapeHtml(bundle.title)}</strong>
            <div class="small">${escapeHtml(bundle.description)}</div>
          </div>
          <div class="healthBtns" style="margin-top:0">
            <button class="miniBtn" data-bundle-preview="${escapeHtml(bundle.id)}" type="button">Preview</button>
            <button class="miniBtn" data-bundle-apply="${escapeHtml(bundle.id)}" type="button">Add Bundle</button>
          </div>
        </div>
        <div class="browseChipRow">
          ${[bundle.primaryId, ...bundle.links.map((link) => link.to)].map((id) => {
            const item = CONDITIONS.find((condition) => condition.id === id);
            return item ? `<span class="popularChip ${systemClassName(item.body_system)}">${escapeHtml(item.name)}</span>` : "";
          }).join("")}
        </div>
      </article>
    `).join("");
  }

  categoriesEl.innerHTML = [...bySystem.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([system, items]) => `
      <article class="browseCategoryCard">
        <div class="browseCategoryTop">
          <div>
            <strong>${escapeHtml(system)}</strong>
            <div class="small">${items.length} condition${items.length === 1 ? "" : "s"}</div>
          </div>
          <button class="miniBtn" data-browse-system="${escapeHtml(system)}" type="button">View all</button>
        </div>
        <div class="small">Common links: ${escapeHtml(items.slice(0, 4).flatMap((item) => connectionHintNames(item.id).slice(0, 1)).filter(Boolean).slice(0, 4).join(", ") || "browse this group to explore condition relationships")}</div>
        <div class="browseChipRow">
          ${items.slice(0, 6).map((item) => `
            <button class="browseMiniChip" data-browse-condition="${escapeHtml(item.id)}" type="button">
              ${escapeHtml(item.name)}
            </button>
          `).join("")}
        </div>
      </article>
    `).join("");

  document.querySelectorAll("[data-browse-condition]").forEach((button) => {
    button.addEventListener("click", () => {
      const condition = CONDITIONS.find((item) => item.id === button.dataset.browseCondition);
      if (!condition) return;
      const input = document.getElementById("q");
      const filter = document.getElementById("systemFilter");
      if (filter) filter.value = condition.body_system || "";
      if (input) input.value = condition.name;
      const results = CONDITIONS
        .filter((item) => item.body_system === condition.body_system)
        .filter((item) => matches(item, condition.name))
        .sort((a, b) => scoreMatch(b, condition.name) - scoreMatch(a, condition.name));
      renderResults(results);
      document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  document.querySelectorAll("[data-bundle-preview]").forEach((button) => {
    button.addEventListener("click", () => {
      const bundle = commonSecondaryBundles().find((item) => item.id === button.dataset.bundlePreview);
      if (!bundle) return;
      const primary = CONDITIONS.find((item) => item.id === bundle.primaryId);
      if (!primary) return;
      const input = document.getElementById("q");
      const filter = document.getElementById("systemFilter");
      if (filter) filter.value = primary.body_system || "";
      if (input) input.value = "";
      const ids = new Set([bundle.primaryId, ...bundle.links.map((link) => link.to)]);
      renderResults(CONDITIONS.filter((item) => ids.has(item.id)));
      document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  document.querySelectorAll("[data-bundle-apply]").forEach((button) => {
    button.addEventListener("click", () => {
      const bundle = commonSecondaryBundles().find((item) => item.id === button.dataset.bundleApply);
      if (!bundle) return;
      applySecondaryBundle(bundle);
      alert(`${bundle.title} added to workspace.`);
    });
  });

  document.querySelectorAll("[data-browse-system]").forEach((button) => {
    button.addEventListener("click", () => {
      const system = button.dataset.browseSystem || "";
      const filter = document.getElementById("systemFilter");
      const input = document.getElementById("q");
      if (filter) filter.value = system;
      if (input) input.value = "";
      const results = CONDITIONS
        .filter((item) => !system || item.body_system === system)
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      renderResults(results);
      document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

// --- Loading / skeleton helpers ---
function showLoadingResults() {
  const el = document.getElementById('results');
  if (!el) return;
  el.innerHTML = '';
  for (let i = 0; i < 6; i++) {
    const div = document.createElement('div');
    div.className = 'result skeleton';
    div.innerHTML = `
      <div style="height:12px; width:60%; background:rgba(255,255,255,0.06); border-radius:6px; margin-bottom:8px"></div>
      <div style="height:10px; width:40%; background:rgba(255,255,255,0.04); border-radius:6px; margin-bottom:6px"></div>
      <div style="height:10px; width:80%; background:rgba(255,255,255,0.04); border-radius:6px"></div>
    `;
    el.appendChild(div);
  }
}

function hideLoadingResults() {
  // renderResults will replace contents, so nothing required here
}

function debounce(fn, wait) {
  let t;
  return function(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
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

function buildDetailSummaryHTML(item) {
  const st = loadWorkspaceState();
  const readiness = conditionReadiness(item, st);
  const coaching = conditionSpecificCoaching(item, st);
  const notes = (loadNotes(item.id) || "").trim();
  const theories = loadTheoryState().filter((theory) => theory.subjectId === item.id || theory.parentId === item.id);
  const provenance = [
    provenanceMeta("user-entered"),
    LAST_INTAKE_ANALYSIS?.matches?.some((match) => match.id === item.id) ? provenanceMeta("inferred") : null,
    provenanceMeta("generated"),
  ].filter(Boolean);

  return `
    <div class="detailSummaryCard">
      <div class="detailSummaryTop">
        <div>
          <strong>Condition readiness</strong>
          <div class="small">Use this strip to see the weakest section before editing notes, timeline, evidence, or theory details.</div>
        </div>
        <span class="strengthBadge ${escapeHtml(readiness.overallTone.className)}">${escapeHtml(readiness.overallTone.label)} • ${escapeHtml(readiness.overall)}%</span>
      </div>
      <div class="readinessGrid">
        <div class="readinessMetric"><span>Diagnosis</span><strong>${readiness.scores.diagnosis}%</strong></div>
        <div class="readinessMetric"><span>Severity</span><strong>${readiness.scores.severity}%</strong></div>
        <div class="readinessMetric"><span>Nexus</span><strong>${readiness.scores.nexus}%</strong></div>
        <div class="readinessMetric"><span>Timeline</span><strong>${readiness.scores.timeline}%</strong></div>
        <div class="readinessMetric"><span>Evidence</span><strong>${readiness.scores.evidence}%</strong></div>
      </div>
      <div class="small" style="margin-top:8px"><strong>Best next step:</strong> ${escapeHtml(readiness.nextAction)}</div>
      <div class="small" style="margin-top:8px"><strong>Theory status:</strong> ${theories.length ? `${theories.length} structured theor${theories.length === 1 ? "y" : "ies"} linked` : "No structured theory linked yet."}</div>
      <div class="small" style="margin-top:8px"><strong>Notes status:</strong> ${notes ? "User-entered notes saved." : "No notes saved yet."}</div>
      ${coaching.length ? `<div class="small" style="margin-top:8px"><strong>Condition-specific coaching:</strong> ${escapeHtml(coaching.join(" "))}</div>` : ""}
      <div class="provenanceRow">${provenance.map((entry) => `<span class="provenanceTag ${escapeHtml(entry.className)}">${escapeHtml(entry.label)}</span>`).join("")}</div>
    </div>
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

${buildDetailSummaryHTML(item)}

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

<h3>📝 Guided Condition Form</h3>
<div class="small">Capture structured symptom and impact details so the notes, severity picture, and packet output are easier to review.</div>
<div id="guidedFormHost" class="builderSuggestions" style="margin-top:12px"></div>

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

<h3 id="jump-timeline">Timeline</h3>
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
  const cond = CONDITIONS.find(c => c.id === condId);
  const wrapper = document.createElement('div');
  wrapper.className = 'secondaryCard';

  if (!cond) {
    wrapper.textContent = condId;
    return wrapper;
  }

  const st = loadEvidenceState(cond.id);
  const total = (cond.evidence_checklist || []).length;
  const done = (cond.evidence_checklist || []).reduce((acc, _, idx) => acc + (st[idx] ? 1 : 0), 0);

  const title = document.createElement('div');
  title.innerHTML = `<strong>${escapeHtml(cond.name)}</strong>`;
  const openBtn = document.createElement('button');
  openBtn.className = 'miniBtn';
  openBtn.type = 'button';
  openBtn.textContent = 'Open';
  openBtn.addEventListener('click', () => showDetail(cond.id));
  title.appendChild(openBtn);

  wrapper.appendChild(title);

  const summary = document.createElement('div');
  summary.className = 'small';
  summary.style.marginTop = '6px';
  summary.textContent = `Checklist: ${done}/${total}`;
  wrapper.appendChild(summary);

  const list = document.createElement('div');
  list.className = 'secEvList';
  list.style.marginTop = '8px';

  if (!total) {
    list.innerHTML = `<div class="small">(No checklist available for this condition)</div>`;
  } else {
    list.innerHTML = (cond.evidence_checklist || []).map((t, idx) => {
      const checked = st[idx] ? 'checked' : '';
      return `
        <label class="evItem">
          <input type="checkbox" class="secondaryEvCheck" data-idx="${idx}" data-cond="${escapeHtml(cond.id)}" ${checked} />
          <span>${escapeHtml(t)}</span>
        </label>
      `;
    }).join('');
  }

  wrapper.appendChild(list);

  // Wire change handler for this card (delegated)
  list.querySelectorAll('input.secondaryEvCheck').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const c = e.currentTarget;
      const idx = Number(c.dataset.idx);
      const cid = c.dataset.cond;
      const stObj = loadEvidenceState(cid);
      stObj[idx] = c.checked;
      saveEvidenceState(cid, stObj);
      // ensure in workspace and refresh UI
      try { ensureNode(cid); } catch (err) {}
      renderWorkspace();
      // update summary
      const tot = (COND_EVIDENCE_COUNT(cid));
      const dn = (COND_EVIDENCE_DONE(cid));
      summary.textContent = `Checklist: ${dn}/${tot}`;
    });
  });

  return wrapper;
}

function COND_EVIDENCE_COUNT(condId) {
  const cond = CONDITIONS.find(c => c.id === condId);
  return (cond && Array.isArray(cond.evidence_checklist)) ? cond.evidence_checklist.length : 0;
}

function COND_EVIDENCE_DONE(condId) {
  const cond = CONDITIONS.find(c => c.id === condId);
  if (!cond) return 0;
  const st = loadEvidenceState(condId);
  return (cond.evidence_checklist || []).reduce((acc, _, idx) => acc + (st[idx] ? 1 : 0), 0);
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

  const guidedFormHost = document.getElementById("guidedFormHost");

  function renderGuidedConditionForm() {
    if (!guidedFormHost) return;
    const schema = getConditionGuidedFormSchema(item);
    const values = loadSymptomForm(item.id);

    guidedFormHost.innerHTML = `
      <article class="builderSuggestionCard">
        <div class="builderSuggestionTop">
          <div>
            <strong>${escapeHtml(schema.title)}</strong>
            <div class="small">Saved locally for this condition. Use it as structured drafting support, then append the summary to your notes when it looks right.</div>
          </div>
          <span class="provenanceTag prov-generated">Guided form</span>
        </div>
        <div class="builderGrid" style="margin-top:12px">
          ${schema.fields.map((field) => `
            <label class="builderField">
              <span class="small">${escapeHtml(field.label)}</span>
              <input data-guided-field="${escapeHtml(field.key)}" value="${escapeHtml(values[field.key] || "")}" placeholder="${escapeHtml(field.placeholder || "")}" />
            </label>
          `).join("")}
        </div>
        <div class="healthBtns" style="margin-top:12px">
          <button id="guidedFormSave" class="miniBtn" type="button">Save Form</button>
          <button id="guidedFormAppend" class="miniBtn" type="button">Append Summary to Notes</button>
        </div>
        <div class="small" id="guidedFormPreview" style="margin-top:8px"></div>
      </article>
    `;

    const readValues = () => {
      const next = {};
      guidedFormHost.querySelectorAll("[data-guided-field]").forEach((input) => {
        next[input.dataset.guidedField] = input.value || "";
      });
      return next;
    };

    const updatePreview = () => {
      const preview = document.getElementById("guidedFormPreview");
      if (!preview) return;
      const text = buildSymptomFormSummary(item, readValues());
      preview.innerHTML = text
        ? `<strong>Summary preview:</strong><br/>${escapeHtml(text).replaceAll("\n", "<br/>")}`
        : "No guided form details saved yet.";
    };

    guidedFormHost.querySelectorAll("[data-guided-field]").forEach((input) => {
      input.addEventListener("input", updatePreview);
    });

    document.getElementById("guidedFormSave")?.addEventListener("click", () => {
      saveSymptomForm(item.id, readValues());
      updatePreview();
      alert("Guided condition form saved.");
      renderWorkspace();
    });

    document.getElementById("guidedFormAppend")?.addEventListener("click", () => {
      const valuesNow = readValues();
      saveSymptomForm(item.id, valuesNow);
      const summary = buildSymptomFormSummary(item, valuesNow);
      if (!summary) {
        alert("Add a little guided-form detail first so there is something useful to append.");
        return;
      }
      const existing = (loadNotes(item.id) || "").trim();
      const next = existing ? `${existing}\n\n${summary}` : summary;
      saveNotes(item.id, next);
      if (notesEl) notesEl.value = next;
      updatePreview();
      renderWorkspace();
      alert("Guided condition summary appended to notes.");
    });

    updatePreview();
  }

  renderGuidedConditionForm();

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

    const idx = buildWorkspaceEvidenceIndex("all");
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
        renderEvidenceLinks();
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

      if (!label) {
        alert("Please enter at least a Label for this evidence item.");
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

      renderEvidenceLinks();
    });
  }

  if (evLinksExport) {
    evLinksExport.addEventListener("click", exportEvidenceLinksTxt);
  }

  renderEvidenceLinks();

  // ---- Evidence ↔ Evidence linking (PER-ROW) ----
  const evRelPanel = document.getElementById("evRelPanel");
  const evRelFromLabel = document.getElementById("evRelFromLabel");
  const evRelPick = document.getElementById("evRelPick");
  const evRelAdd = document.getElementById("evRelAdd");
  const evRelCancel = document.getElementById("evRelCancel");

  // Evidence checklist elements (declare early so helper functions can reference)
  const evList = document.getElementById("evList");
  const evCountEl = document.getElementById("evCount");

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
    if (!evLinksList) return;
    evLinksList.querySelectorAll(".evRow").forEach(row => row.classList.remove("activeRel"));
    if (!currentRelFromRowId) return;
    const r = evLinksList.querySelector(`[data-evid="${CSS.escape(currentRelFromRowId)}"]`);
    if (r) r.classList.add("activeRel");
  }

  function populateRelateDropdown() {
    if (!evRelPick) return;

    const idx = buildWorkspaceEvidenceIndex("all");
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

    evRelPick.innerHTML =
      `<option value="">Select another evidence item…</option>` +
      opts
        .sort((a, b) => evidenceDisplayName(a).localeCompare(evidenceDisplayName(b)))
        .map(m => `<option value="${escapeHtml(m.url)}">${escapeHtml(evidenceDisplayName(m))}</option>`)
        .join("");
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

    evLinksList.innerHTML = sorted.map(l => {
      const relKeys = relatedEvidenceKeys(l.url);
      const relList = relKeys.map(k => idx.get(k)).filter(Boolean).slice(0, 4);

      return `
        <div class="evRow" data-evid="${escapeHtml(l.id)}">
          <div class="evMeta">
            ${l.date ? `<span class="badge">${escapeHtml(l.date)}</span>` : ""}
            <span class="badge">${escapeHtml(l.type || "Other")}</span>
            ${relKeys.length ? `<span class="relBadge">Related: ${relKeys.length}</span>` : ""}
          </div>

          <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start">
            <div style="flex:1">
              <div><strong>${escapeHtml(l.label || "Evidence")}</strong></div>
              ${l.url ? `<div class="small"><a href="${escapeHtml(l.url)}" target="_blank" rel="noreferrer">Open link</a></div>` : ""}
              ${l.note ? `<div class="small">${escapeHtml(l.note)}</div>` : ""}
            </div>

            <div style="display:flex; flex-direction:column; gap:6px; min-width:120px">
                    ${l.url ? `<button class="miniBtn" data-relfrom="${escapeHtml(l.id)}" type="button">Relate…</button>` : ""}
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
      // If user starts checking evidence, ensure the condition is included in the workspace
      try { ensureNode(item.id); } catch (err) { /* ignore */ }
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
  pushRecentCondition(id);
  incrementHomeUsage("conditions", id);
  renderConditionBrowse();
  renderHomepageUsageSummary();

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
  applyCoverageFocusAction(item);
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
    // (debug info removed)

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
      // Accept URL-based links or label-only entries. Create a synthetic key for items without a URL.
      let key = normalizeUrl(l.url);
      let synthetic = false;
      if (!key) {
        // create a stable synthetic key from label+date; base64 url-safe encoded
        const seed = `${(l.label || "").trim()}::${(l.date || "").trim()}::${(l.note || "").trim()}`;
        key = `label-${base64UrlEncode(seed || String(Math.random()))}`;
        synthetic = true;
      }

      if (!byUrl.has(key)) {
        byUrl.set(key, {
          url: l.url || "",
          urlKey: key,
          label: l.label || "",
          type: l.type || "Other",
          date: l.date || "",
          note: l.note || "",
          conditions: new Set([cond.name]),
          synthetic: synthetic
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

function renderEvidenceHub() {
  const listEl = document.getElementById("wsHubList");
  const summaryEl = document.getElementById("wsHubSummary");
  const searchEl = document.getElementById("wsHubSearch");
  const scopeEl = document.getElementById("wsHubScope");
  const typeEl = document.getElementById("wsHubType");
  const conditionEl = document.getElementById("wsHubCondition");
  const includeLabelOnlyEl = document.getElementById("wsHubIncludeLabelOnly");
  if (!listEl || !summaryEl || !scopeEl || !typeEl || !conditionEl || !includeLabelOnlyEl) return;

  const scope = scopeEl.value || "all";
  const allEntries = sortBinderEntries(buildBinderEntries(scope), "date");
  const allTypes = [...new Set(allEntries.map(entry => entry.type).filter(Boolean))].sort();
  const allConditions = [...new Set(allEntries.flatMap(entry => entry.conditions || []))].sort();

  const currentType = typeEl.value || "";
  const currentCondition = conditionEl.value || "";

  typeEl.innerHTML = `<option value="">All types</option>${allTypes.map(type => `<option value="${escapeHtml(type)}"${type === currentType ? " selected" : ""}>${escapeHtml(type)}</option>`).join("")}`;
  conditionEl.innerHTML = `<option value="">All conditions</option>${allConditions.map(condition => `<option value="${escapeHtml(condition)}"${condition === currentCondition ? " selected" : ""}>${escapeHtml(condition)}</option>`).join("")}`;

  const q = (searchEl?.value || "").toLowerCase().trim();
  const includeLabelOnly = !!includeLabelOnlyEl.checked;
  const filtered = allEntries.filter((entry) => {
    if (!includeLabelOnly && entry.synthetic) return false;
    if (currentType && entry.type !== currentType) return false;
    if (currentCondition && !(entry.conditions || []).includes(currentCondition)) return false;
    if (!q) return true;
    const haystack = [
      entry.label,
      entry.note,
      entry.date,
      entry.type,
      ...(entry.conditions || []),
      entry.url,
    ].join(" ").toLowerCase();
    return haystack.includes(q);
  });

  summaryEl.textContent = `${filtered.length} evidence item${filtered.length === 1 ? "" : "s"} shown${allEntries.length !== filtered.length ? ` • ${allEntries.length} total in scope` : ""}`;

  if (!filtered.length) {
    listEl.innerHTML = `<div class="small">No evidence matched the current filters.</div>`;
    return;
  }

  listEl.innerHTML = filtered.map((entry) => {
    const relCount = entry.url ? relatedEvidenceKeys(entry.url).length : 0;
    return `
      <article class="builderSuggestionCard">
        <div class="builderSuggestionTop">
          <div>
            <strong>${escapeHtml(entry.label || "Evidence item")}</strong>
            <div class="small">${escapeHtml(entry.note || entry.url || "(no note provided)")}</div>
          </div>
          ${entry.url ? `<a class="miniBtn" href="${escapeHtml(entry.url)}" target="_blank" rel="noreferrer">Open Link</a>` : `<span class="small">Label only</span>`}
        </div>
        <div class="hubMeta">
          ${entry.date ? `<span class="quickStartTag">${escapeHtml(entry.date)}</span>` : ""}
          ${entry.type ? `<span class="quickStartTag">${escapeHtml(entry.type)}</span>` : ""}
          ${relCount ? `<span class="quickStartTag">Related ${relCount}</span>` : ""}
          ${entry.synthetic ? `<span class="quickStartTag">Label-only</span>` : ""}
        </div>
        <div class="healthBtns">
          ${(entry.conditions || []).map(conditionName => `<button class="miniBtn" data-hub-condition="${escapeHtml(conditionName)}" type="button">${escapeHtml(conditionName)}</button>`).join("")}
        </div>
      </article>
    `;
  }).join("");

  listEl.querySelectorAll("button[data-hub-condition]").forEach((button) => {
    button.addEventListener("click", () => {
      const condition = CONDITIONS.find(item => item.name === button.dataset.hubCondition);
      if (!condition) return;
      showDetail(condition.id, true);
      document.getElementById("detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
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

  // Nodes
  for (const k of inScope) {
    const d = degree.get(k) || 0;
    if (hideOrphans && d === 0) continue;

    const meta = entryByKey.get(k);
    nodes.push({
      id: k,
      url: meta?.url || "",
      label: meta?.label || "(Evidence)",
      type: meta?.type || "Other",
      date: meta?.date || "",
      note: meta?.note || "",
      synthetic: meta?.synthetic || false,
      conditions: meta?.conditions || [],
      degree: d
    });
  }

  // Remove edges if hideOrphans removed nodes
  const nodeSet = new Set(nodes.map(n => n.id));
  const edgesFiltered = edges.filter(e => nodeSet.has(e.source) && nodeSet.has(e.target));

  return { nodes, edges: edgesFiltered };
}

let __graphSim = null;

function renderEvidenceGraph({ scope = "all", hideOrphans = false, showLabelOnly = undefined } = {}) {
  const host = document.getElementById("wsGraph");
  const info = document.getElementById("wsGraphInfo");
  if (!host) return;

  host.innerHTML = "";
  const { nodes, edges } = buildEvidenceGraphData(scope, hideOrphans);

  // Determine whether to show synthetic (label-only) nodes. Prefer explicit param, otherwise read UI control.
  const showLabelOnlyFlag = typeof showLabelOnly === "boolean"
    ? showLabelOnly
    : (document.getElementById('wsGraphShowLabelOnly')?.checked ?? true);

  // If user disabled label-only nodes, filter them out (and any edges referencing them)
  let nodesToRender = nodes.slice();
  let edgesToRender = edges.slice();
  if (!showLabelOnlyFlag) {
    const kept = new Set(nodesToRender.filter(n => !n.synthetic).map(n => n.id));
    nodesToRender = nodesToRender.filter(n => kept.has(n.id));
    edgesToRender = edgesToRender.filter(e => kept.has(e.source) && kept.has(e.target));
  }

  if (!nodes.length) {
    host.innerHTML = `<div class="small" style="padding:12px">(No evidence nodes to display for this scope.)</div>`;
    if (info) info.textContent = "No nodes found.";
    return;
  }

  const w = host.clientWidth || 900;
  const h = host.clientHeight || 520;

  // SVG + group for pan/zoom
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "graphSvg");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);

  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  svg.appendChild(g);

  // edge layer
  const edgeEls = edgesToRender.map(() => {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("class", "edgeLine");
    g.appendChild(line);
    return line;
  });

  // node layer
  const nodeGroupEls = nodesToRender.map(n => {
    const grp = document.createElementNS("http://www.w3.org/2000/svg", "g");

    const r = Math.max(6, Math.min(18, 6 + n.degree * 2));
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("r", r);
    circle.setAttribute("class", "nodeCircle");
    circle.setAttribute("fill", `rgba(255,255,255,${Math.min(0.35 + n.degree * 0.08, 0.80)})`);

    // mark synthetic (label-only) nodes
    if (n.synthetic) {
      circle.classList.add('synthetic');
    }

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("class", "nodeLabel" + (n.synthetic ? ' synthetic' : ''));
    label.setAttribute("x", r + 6);
    label.setAttribute("y", 4);
    label.textContent = (n.label || "(Evidence)").slice(0, 34);

    grp.appendChild(circle);
    grp.appendChild(label);
    g.appendChild(grp);

    // Click → open URL
    circle.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (info) {
        info.innerHTML = `
          <strong>${escapeHtml(n.label || "Evidence")}</strong>
          ${n.date ? ` • ${escapeHtml(n.date)}` : ""}
          ${n.type ? ` • ${escapeHtml(n.type)}` : ""}
          <br/>
          <span>Conditions:</span> ${escapeHtml((n.conditions || []).join(", ") || "(none)")}
          <br/>
          ${n.url ? `<a href="${escapeHtml(n.url)}" target="_blank" rel="noreferrer">Open link</a>` : ""}
          ${n.note ? `<div style="margin-top:6px">${escapeHtml(n.note)}</div>` : ""}
        `;
      }
      if (n.url) window.open(n.url, "_blank");
    });

    return { grp, circle, label };
  });

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
    // tighter springs and shorter rest length for denser clusters
    const springK = 0.04;
    const restLen = 70;

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

    // reduce global repulsion to allow nodes to cluster
    const repK = 600;
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

    const damp = 0.9;
    nodes.forEach(n => {
      // stronger centering force to keep clusters on-screen
      n.vx += (centerX - n.x) * 0.005;
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
    });

    nodes.forEach((n, i) => {
      nodeGroupEls[i].grp.setAttribute("transform", `translate(${n.x},${n.y})`);
    });

    tickCount++;
    // auto-fit after simulation has run a bit so layout stabilizes
    if (tickCount === 60) {
      try { svg.__fit && svg.__fit(); } catch (e) {}
    }
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
  renderQuickStartPlans();

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
  const darkToggle = document.getElementById("darkModeToggle");
  const builderApply = document.getElementById("builderApply");
  const builderOpenPrimary = document.getElementById("builderOpenPrimary");
  const builderPrimary = document.getElementById("builderPrimary");
  const docIntakeInput = document.getElementById("docIntakeInput");
  const docIntakeAnalyze = document.getElementById("docIntakeAnalyze");
  const docIntakeAdd = document.getElementById("docIntakeAdd");
  const docIntakeLoadFile = document.getElementById("docIntakeLoadFile");
  const docIntakeFile = document.getElementById("docIntakeFile");
  const docLibraryName = document.getElementById("docLibraryName");
  const docLibraryType = document.getElementById("docLibraryType");
  const docLibraryTags = document.getElementById("docLibraryTags");
  const docLibrarySave = document.getElementById("docLibrarySave");
  const evLibraryLabel = document.getElementById("evLibraryLabel");
  const evLibraryUrl = document.getElementById("evLibraryUrl");
  const evLibraryType = document.getElementById("evLibraryType");
  const evLibraryExcerpt = document.getElementById("evLibraryExcerpt");
  const evLibrarySave = document.getElementById("evLibrarySave");
  const wsHubSearch = document.getElementById("wsHubSearch");
  const wsHubScope = document.getElementById("wsHubScope");
  const wsHubType = document.getElementById("wsHubType");
  const wsHubCondition = document.getElementById("wsHubCondition");
  const wsHubIncludeLabelOnly = document.getElementById("wsHubIncludeLabelOnly");
  const wsCurrentRating = document.getElementById("wsCurrentRating");
  const wsRatingCalculate = document.getElementById("wsRatingCalculate");
  const wsRatingCompare = document.getElementById("wsRatingCompare");
  const wsRatingScenarioName = document.getElementById("wsRatingScenarioName");
  const wsRatingScenarioSave = document.getElementById("wsRatingScenarioSave");
  const wsRatingOut = document.getElementById("wsRatingOut");
  const wsCoachGenerate = document.getElementById("wsCoachGenerate");
  const wsCoachCopy = document.getElementById("wsCoachCopy");
  const wsCoachOut = document.getElementById("wsCoachOut");
  const wsReviewGenerate = document.getElementById("wsReviewGenerate");
  const wsReviewCopy = document.getElementById("wsReviewCopy");
  const wsReviewOut = document.getElementById("wsReviewOut");
  const wsSubmitGenerate = document.getElementById("wsSubmitGenerate");
  const wsSubmitCopy = document.getElementById("wsSubmitCopy");
  const wsSubmitOut = document.getElementById("wsSubmitOut");
  const wsAssemblerAudience = document.getElementById("wsAssemblerAudience");
  const wsAssemblerGenerate = document.getElementById("wsAssemblerGenerate");
  const wsAssemblerCopy = document.getElementById("wsAssemblerCopy");
  const wsAssemblerDownload = document.getElementById("wsAssemblerDownload");
  const wsAssemblerOut = document.getElementById("wsAssemblerOut");
  const theoryType = document.getElementById("theoryType");
  const theorySubject = document.getElementById("theorySubject");
  const theoryParent = document.getElementById("theoryParent");
  const theorySummary = document.getElementById("theorySummary");
  const theoryAdd = document.getElementById("theoryAdd");
  const nexusChild = document.getElementById("nexusChild");
  const nexusParent = document.getElementById("nexusParent");
  const nexusRelation = document.getElementById("nexusRelation");
  const nexusMechanism = document.getElementById("nexusMechanism");
  const nexusSymptoms = document.getElementById("nexusSymptoms");
  const nexusTreatment = document.getElementById("nexusTreatment");
  const nexusSupport = document.getElementById("nexusSupport");
  const nexusRationale = document.getElementById("nexusRationale");
  const nexusGenerate = document.getElementById("nexusGenerate");
  const nexusApply = document.getElementById("nexusApply");
  const nexusDraftOut = document.getElementById("nexusDraftOut");
  const wsSnapshotName = document.getElementById("wsSnapshotName");
  const wsSnapshotMilestone = document.getElementById("wsSnapshotMilestone");
  const wsSnapshotSave = document.getElementById("wsSnapshotSave");
  const wsBackupExport = document.getElementById("wsBackupExport");
  const wsBackupImport = document.getElementById("wsBackupImport");
  const wsBackupImportFile = document.getElementById("wsBackupImportFile");
  const wsActivityClear = document.getElementById("wsActivityClear");
  const wsProfileName = document.getElementById("wsProfileName");
  const wsProfileNotes = document.getElementById("wsProfileNotes");
  const wsProfileSaveCurrent = document.getElementById("wsProfileSaveCurrent");
  const wsProfileNewBlank = document.getElementById("wsProfileNewBlank");
  const wsHandoffGenerate = document.getElementById("wsHandoffGenerate");
  const wsHandoffCopy = document.getElementById("wsHandoffCopy");
  const wsHandoffOut = document.getElementById("wsHandoffOut");
  const wsConflictsRefresh = document.getElementById("wsConflictsRefresh");
  const evLibraryExportCsv = document.getElementById("evLibraryExportCsv");
  const evLibraryImportCsv = document.getElementById("evLibraryImportCsv");
  const evLibraryImportFile = document.getElementById("evLibraryImportFile");
  const wsMilestoneDate = document.getElementById("wsMilestoneDate");
  const wsMilestoneStage = document.getElementById("wsMilestoneStage");
  const wsMilestoneNote = document.getElementById("wsMilestoneNote");
  const wsMilestoneAdd = document.getElementById("wsMilestoneAdd");
  const wsMilestoneExportCsv = document.getElementById("wsMilestoneExportCsv");

  if (!input) {
    console.error('Missing search input with id="q" in index.html');
    return;
  }
  if (!filter) {
    console.error('Missing dropdown with id="systemFilter" in index.html');
    return;
  }

  // Theme persistence and toggle
  function applyThemeChoice(choice) {
    if (choice === 'light') {
      document.body.classList.add('light');
      document.body.classList.remove('dark-mode');
      if (darkToggle) darkToggle.setAttribute('aria-pressed', 'true');
    } else {
      document.body.classList.remove('light');
      document.body.classList.add('dark-mode');
      if (darkToggle) darkToggle.setAttribute('aria-pressed', 'false');
    }
  }

  const savedTheme = (localStorage.getItem('vaCfrTheme')) || (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  applyThemeChoice(savedTheme);
  const savedWizard = loadOnboardingWizardState();
  if (savedWizard) {
    ONBOARDING_WIZARD_STATE = {
      ...ONBOARDING_WIZARD_STATE,
      ...savedWizard,
    };
  }
  renderGuidedBuilder();
  renderDocumentIntakeResults();
  renderDocumentLibrary();
  renderExtractorPacketLibrary();
  renderEvidenceLibrary();
  renderEvidenceHub();
  renderConditionBrowse();
  renderOnboardingWizard();
  renderHomepageNextAction();
  renderHomepageUsageSummary();
  renderRatingEstimator();
  renderWorkspaceProfiles();
  renderWorkspaceDashboard();
  renderStickyWorkspaceSummary();
  renderStartHereSteps();
  renderTheoryBuilder();
  renderNexusBuilder();
  renderSnapshotHistoryList();
  renderActionEngine();
  renderEvidenceConflictEngine();
  renderClaimMilestones();
  mountWorkspacePanelToggles();

  if (darkToggle) {
    darkToggle.addEventListener('click', () => {
      const cur = document.body.classList.contains('light') ? 'light' : 'dark';
      const next = cur === 'light' ? 'dark' : 'light';
      applyThemeChoice(next);
      try { localStorage.setItem('vaCfrTheme', next); } catch (e) {}
    });
  }

  if (wsSnapshotSave) {
    wsSnapshotSave.addEventListener("click", () => {
      const st = loadWorkspaceState();
      if (!(st.nodes || []).length) {
        alert("Add at least one condition before saving a snapshot.");
        return;
      }
      const snapshot = buildWorkspaceSnapshot(wsSnapshotName?.value || "");
      const nextSnapshots = [snapshot, ...loadWorkspaceSnapshots()].slice(0, 8);
      saveWorkspaceSnapshots(nextSnapshots);
      pushWorkspaceActivity("Snapshot saved", `${snapshot.name} was saved as a workspace checkpoint.`);
      if (wsSnapshotName) wsSnapshotName.value = "";
      if (wsSnapshotMilestone) wsSnapshotMilestone.value = "Working draft";
      renderSnapshotList();
      renderStickyWorkspaceSummary();
      renderSnapshotHistoryList();
      renderWorkspaceActivity();
      alert("Workspace snapshot saved.");
    });
  }

  if (builderApply) {
    builderApply.addEventListener("click", () => {
      applyGuidedBuilderSelection();
      alert("Guided claim plan added to the workspace.");
    });
  }

  if (builderOpenPrimary && builderPrimary) {
    builderOpenPrimary.addEventListener("click", () => {
      if (!builderPrimary.value) return;
      showDetail(builderPrimary.value, true);
      document.getElementById("detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  if (docIntakeAnalyze && docIntakeInput) {
    docIntakeAnalyze.addEventListener("click", () => {
      LAST_INTAKE_ANALYSIS = analyzeDocumentIntake(docIntakeInput.value || "");
      LAST_INTAKE_ANALYSIS.sourceName = (docIntakeInput.dataset.sourceName || docLibraryName?.value || "").trim() || "Pasted intake text";
      LAST_INTAKE_ANALYSIS.mapper = analyzeRecordToClaimMapper(docIntakeInput.value || "", CONDITIONS);
      LAST_INTAKE_ANALYSIS.extractor = extractEvidenceSignals(docIntakeInput.value || "", CONDITIONS);
      renderDocumentIntakeResults();
      alert("Document intake analysis complete.");
    });
  }

  if (docIntakeInput && !docIntakeInput.dataset.boundSourceInput) {
    docIntakeInput.dataset.boundSourceInput = "1";
    docIntakeInput.addEventListener("input", () => {
      docIntakeInput.dataset.sourceType = "user-entered";
      docIntakeInput.dataset.sourceName = (docLibraryName?.value || "").trim() || "Pasted intake text";
      docIntakeInput.dataset.fileName = "";
    });
  }

  if (docIntakeLoadFile && docIntakeFile && docIntakeInput) {
    docIntakeLoadFile.addEventListener("click", () => {
      docIntakeFile.value = "";
      docIntakeFile.click();
    });

    docIntakeFile.addEventListener("change", async () => {
      const file = docIntakeFile.files?.[0];
      if (!file) return;
      try {
        const extension = `.${(file.name || "").split(".").pop() || ""}`.toLowerCase();
        const needsStructuredExtract = extension === ".pdf" || extension === ".docx";
        const text = needsStructuredExtract
          ? (await extractStructuredDocument(file)).text || ""
          : await file.text();
        docIntakeInput.value = text;
        docIntakeInput.dataset.sourceType = inferDocumentSourceType(file);
        docIntakeInput.dataset.sourceName = file.name;
        docIntakeInput.dataset.fileName = file.name;
        if (docLibraryName && !docLibraryName.value.trim()) {
          docLibraryName.value = file.name.replace(/\.[^.]+$/, "");
        }
        alert(`Loaded ${file.name} into Document Intake.`);
      } catch (error) {
        console.error(error);
        alert(error.message || "Could not load that file.");
      }
    });
  }

  if (docLibrarySave && docIntakeInput) {
    docLibrarySave.addEventListener("click", () => {
      const text = (docIntakeInput.value || "").trim();
      if (!text) {
        alert("Paste or load some intake text before saving it to the document library.");
        return;
      }

      const doc = createDocumentRecord({
        name: docLibraryName?.value || "",
        type: docLibraryType?.value || "General",
        tags: docLibraryTags?.value || "",
        text,
        sourceType: docIntakeInput.dataset.sourceType || "user-entered",
        sourceName: docIntakeInput.dataset.sourceName || (docLibraryName?.value || "").trim() || "Document intake",
        fileName: docIntakeInput.dataset.fileName || "",
      });
      saveDocumentLibrary([doc, ...loadDocumentLibrary()].slice(0, 30));
      pushWorkspaceActivity("Document saved", `${doc.name} was added to the reusable document library.`);
      if (docLibraryName) docLibraryName.value = "";
      if (docLibraryTags) docLibraryTags.value = "";
      docIntakeInput.dataset.sourceType = "user-entered";
      docIntakeInput.dataset.sourceName = doc.name;
      docIntakeInput.dataset.fileName = "";
      renderDocumentLibrary();
      renderWorkspaceActivity();
      alert("Document saved to library.");
    });
  }

  if (evLibrarySave) {
    evLibrarySave.addEventListener("click", () => {
      const record = createEvidenceLibraryRecord({
        label: evLibraryLabel?.value || "",
        url: evLibraryUrl?.value || "",
        type: evLibraryType?.value || "Other",
        excerpt: evLibraryExcerpt?.value || "",
        tags: []
      });
      if (!record.label && !record.url && !record.excerpt) {
        alert("Add at least a label, URL, or excerpt before saving an evidence record.");
        return;
      }
      saveEvidenceLibrary([record, ...loadEvidenceLibrary()].slice(0, 40));
      pushWorkspaceActivity("Evidence record saved", `${record.label} was added to the reusable evidence library.`);
      if (evLibraryLabel) evLibraryLabel.value = "";
      if (evLibraryUrl) evLibraryUrl.value = "";
      if (evLibraryExcerpt) evLibraryExcerpt.value = "";
      renderEvidenceLibrary();
      renderWorkspaceActivity();
      alert("Evidence record saved.");
    });
  }

  if (docIntakeAdd) {
    docIntakeAdd.addEventListener("click", () => {
      const analysis = LAST_INTAKE_ANALYSIS;
      if (!analysis?.matches?.length) {
        alert("Analyze some intake text first.");
        return;
      }

      const selectedIds = [...document.querySelectorAll("input[data-intake-condition]:checked")]
        .map(input => input.dataset.intakeCondition)
        .filter(Boolean);
      if (!selectedIds.length) {
        alert("Select at least one detected condition to add.");
        return;
      }

      selectedIds.forEach((id, index) => {
        const match = analysis.matches.find(item => item.id === id);
        ensureNode(id);
        if (index === 0 && !loadWorkspaceState().primaryId) {
          setPrimary(id);
        }
        if (match?.sentence) {
          const existing = (loadNotes(id) || "").trim();
          const nextNote = existing
            ? `${existing}\n\n[Intake excerpt]\n${match.sentence}`
            : `[Intake excerpt]\n${match.sentence}`;
          saveNotes(id, nextNote);
        }
      });

      if (analysis.dates.length) {
        selectedIds.forEach((id) => {
          const entries = loadTimeline(id);
          if (!entries.some(entry => analysis.dates.includes(entry.date))) {
            analysis.dates.slice(0, 2).forEach((date) => {
              entries.push({
                id: `intake-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                date,
                type: "Other",
                note: "Imported from document intake analysis"
              });
            });
            saveTimeline(id, entries);
          }
        });
      }

      pushWorkspaceActivity("Document intake applied", `${selectedIds.length} detected condition${selectedIds.length === 1 ? "" : "s"} were added from document intake.`);
      renderWorkspace();
      renderClaimTree();
      renderHealthPanel();
      alert("Selected intake conditions added to the workspace.");
    });
  }

  if (wsCoachGenerate && wsCoachOut) {
    wsCoachGenerate.addEventListener("click", () => {
      wsCoachOut.value = generateStrategyCoachText();
    });
  }

  if (wsCoachCopy && wsCoachOut) {
    wsCoachCopy.addEventListener("click", async () => {
      await navigator.clipboard.writeText(wsCoachOut.value || "");
      alert("Coach summary copied!");
    });
  }

  if (wsReviewGenerate && wsReviewOut) {
    wsReviewGenerate.addEventListener("click", () => {
      wsReviewOut.value = buildPacketReviewText();
    });
  }

  if (wsReviewCopy && wsReviewOut) {
    wsReviewCopy.addEventListener("click", async () => {
      await navigator.clipboard.writeText(wsReviewOut.value || "");
      alert("Packet review copied!");
    });
  }

  if (wsSubmitGenerate && wsSubmitOut) {
    wsSubmitGenerate.addEventListener("click", () => {
      wsSubmitOut.value = generateSubmissionPrepText();
    });
  }

  if (wsSubmitCopy && wsSubmitOut) {
    wsSubmitCopy.addEventListener("click", async () => {
      await navigator.clipboard.writeText(wsSubmitOut.value || "");
      alert("Submission-prep summary copied!");
    });
  }

  if (wsHandoffGenerate && wsHandoffOut) {
    wsHandoffGenerate.addEventListener("click", () => {
      wsHandoffOut.value = buildRepresentativeHandoffText();
    });
  }

  if (wsHandoffCopy && wsHandoffOut) {
    wsHandoffCopy.addEventListener("click", async () => {
      await navigator.clipboard.writeText(wsHandoffOut.value || "");
      alert("Representative handoff copied!");
    });
  }

  if (wsConflictsRefresh) {
    wsConflictsRefresh.addEventListener("click", () => {
      renderEvidenceConflictEngine();
    });
  }

  if (evLibraryExportCsv) {
    evLibraryExportCsv.addEventListener("click", () => {
      downloadText("evidence_library.csv", buildEvidenceLibraryCsv());
    });
  }

  if (evLibraryImportCsv && evLibraryImportFile) {
    evLibraryImportCsv.addEventListener("click", () => {
      evLibraryImportFile.value = "";
      evLibraryImportFile.click();
    });

    evLibraryImportFile.addEventListener("change", async () => {
      const file = evLibraryImportFile.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const parsed = parseEvidenceCsv(text);
        if (!parsed.length) {
          alert("No evidence rows could be imported from that CSV.");
          return;
        }

        const existing = loadEvidenceLibrary();
        const seen = new Set(existing.map((record) => `${normalizeUrl(record.url || "")}::${normalize(record.label || "")}`));
        const merged = [...existing];
        parsed.forEach((record) => {
          const key = `${normalizeUrl(record.url || "")}::${normalize(record.label || "")}`;
          if (!seen.has(key)) {
            merged.unshift(record);
            seen.add(key);
          }
        });
        saveEvidenceLibrary(merged.slice(0, 80));
        pushWorkspaceActivity("Evidence library imported", `${parsed.length} evidence record${parsed.length === 1 ? "" : "s"} were imported from CSV.`);
        renderEvidenceLibrary();
        renderEvidenceConflictEngine();
        renderWorkspaceActivity();
        renderActionEngine();
        alert("Evidence library CSV imported.");
      } catch (error) {
        console.error(error);
        alert(error.message || "Could not import that evidence CSV.");
      }
    });
  }

  if (wsMilestoneAdd) {
    wsMilestoneAdd.addEventListener("click", () => {
      const date = (wsMilestoneDate?.value || "").trim();
      const stage = (wsMilestoneStage?.value || "").trim();
      const note = (wsMilestoneNote?.value || "").trim();
      if (!date || !stage) {
        alert("Add at least a milestone date and stage.");
        return;
      }
      const next = [
        {
          id: `milestone-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          date,
          stage,
          note,
        },
        ...loadClaimMilestones(),
      ].slice(0, 40);
      saveClaimMilestones(next);
      pushWorkspaceActivity("Milestone added", `${stage} was added to the claim milestone tracker.`);
      if (wsMilestoneDate) wsMilestoneDate.value = "";
      if (wsMilestoneNote) wsMilestoneNote.value = "";
      renderClaimMilestones();
      renderWorkspaceActivity();
      renderActionEngine();
      alert("Claim milestone added.");
    });
  }

  if (wsMilestoneExportCsv) {
    wsMilestoneExportCsv.addEventListener("click", () => {
      downloadText("claim_milestones.csv", buildMilestonesCsv());
    });
  }

  function assemblerOptionsFromUi() {
    return {
      audience: wsAssemblerAudience?.value || "review",
      include: {
        overview: !!document.getElementById("wsAssemblerOverview")?.checked,
        coach: !!document.getElementById("wsAssemblerCoach")?.checked,
        submission: !!document.getElementById("wsAssemblerSubmission")?.checked,
        theories: !!document.getElementById("wsAssemblerTheories")?.checked,
        narrative: !!document.getElementById("wsAssemblerNarrative")?.checked,
        timeline: !!document.getElementById("wsAssemblerTimeline")?.checked,
        binder: !!document.getElementById("wsAssemblerBinder")?.checked,
        coverage: !!document.getElementById("wsAssemblerCoverage")?.checked,
      },
    };
  }

  if (wsAssemblerGenerate && wsAssemblerOut) {
    wsAssemblerGenerate.addEventListener("click", () => {
      wsAssemblerOut.value = buildAssembledPacketText(assemblerOptionsFromUi());
    });
  }

  if (wsAssemblerCopy && wsAssemblerOut) {
    wsAssemblerCopy.addEventListener("click", async () => {
      await navigator.clipboard.writeText(wsAssemblerOut.value || "");
      alert("Assembled packet copied!");
    });
  }

  if (wsAssemblerDownload && wsAssemblerOut) {
    wsAssemblerDownload.addEventListener("click", () => {
      const options = assemblerOptionsFromUi();
      downloadText(`smart_packet_assembler_${options.audience}.txt`, wsAssemblerOut.value || buildAssembledPacketText(options));
    });
  }

  [wsHubSearch, wsHubScope, wsHubType, wsHubCondition, wsHubIncludeLabelOnly].forEach((el) => {
    if (!el) return;
    el.addEventListener(el.tagName === "INPUT" && el.type !== "checkbox" ? "input" : "change", () => {
      renderEvidenceHub();
    });
  });

  if (wsCurrentRating) {
    wsCurrentRating.addEventListener("input", () => {
      const next = loadRatingEstimatorState();
      next.currentRating = Math.max(0, Math.min(100, Number(wsCurrentRating.value || 0) || 0));
      saveRatingEstimatorState(next);
      renderStickyWorkspaceSummary();
    });
  }

  if (wsRatingCalculate && wsRatingOut) {
    wsRatingCalculate.addEventListener("click", () => {
      wsRatingOut.value = generateRatingEstimateText();
    });
  }

  if (wsRatingCompare && wsRatingOut) {
    wsRatingCompare.addEventListener("click", () => {
      const base = generateRatingEstimateText();
      const compare = generateScenarioComparisons();
      wsRatingOut.value = `${base}\n\nScenario Comparison\n${compare}`;
    });
  }

  if (wsRatingScenarioSave) {
    wsRatingScenarioSave.addEventListener("click", () => {
      const scenario = saveCurrentRatingScenario(wsRatingScenarioName?.value || "");
      saveRatingScenarios([scenario, ...loadRatingScenarios()].slice(0, 12));
      pushWorkspaceActivity("Rating scenario saved", `${scenario.name} was saved from the current estimator selections.`);
      if (wsRatingScenarioName) wsRatingScenarioName.value = "";
      renderRatingScenarioList();
      renderWorkspaceActivity();
      alert("Rating scenario saved.");
    });
  }

  if (theoryAdd && theoryType && theorySubject && theoryParent && theorySummary) {
    theoryAdd.addEventListener("click", () => {
      if (!theorySubject.value) {
        alert("Add at least one workspace condition before saving a structured theory.");
        return;
      }

      const subject = CONDITIONS.find((item) => item.id === theorySubject.value);
      const parent = CONDITIONS.find((item) => item.id === theoryParent.value);
      const summary = (theorySummary.value || "").trim();
      const next = [
        {
          id: `theory-${Date.now()}`,
          type: theoryType.value || "Direct service connection",
          subjectId: theorySubject.value,
          subjectName: subject?.name || theorySubject.value,
          parentId: theoryParent.value || "",
          parentName: parent?.name || "",
          summary
        },
        ...loadTheoryState()
      ].slice(0, 12);

      saveTheoryState(next);
      pushWorkspaceActivity("Theory added", `${subject?.name || "A condition"} was added to the structured theory builder as ${theoryType.value || "a claim theory"}.`);
      theorySummary.value = "";
      renderTheoryBuilder();
      renderStartHereSteps();
      renderStickyWorkspaceSummary();
      renderWorkspaceActivity();
      alert("Structured claim theory saved.");
    });
  }

  function buildNexusFromInputs() {
    const child = CONDITIONS.find((item) => item.id === nexusChild?.value);
    const parent = CONDITIONS.find((item) => item.id === nexusParent?.value);
    return buildNexusDraft({
      childName: child?.name || nexusChild?.value || "",
      parentName: parent?.name || nexusParent?.value || "",
      relationType: nexusRelation?.value || "Secondary service connection",
      mechanism: nexusMechanism?.value || "",
      symptoms: nexusSymptoms?.value || "",
      treatment: nexusTreatment?.value || "",
      support: nexusSupport?.value || "",
      rationale: nexusRationale?.value || ""
    });
  }

  [nexusChild, nexusParent].forEach((el) => {
    if (!el) return;
    el.addEventListener("change", () => {
      renderNexusBuilder();
    });
  });

  if (nexusGenerate && nexusDraftOut) {
    nexusGenerate.addEventListener("click", () => {
      nexusDraftOut.value = buildNexusFromInputs();
    });
  }

  if (nexusApply && nexusDraftOut && nexusChild) {
    nexusApply.addEventListener("click", () => {
      if (!nexusChild.value) {
        alert("Choose a condition in the Guided Nexus Builder first.");
        return;
      }

      const draft = nexusDraftOut.value.trim() || buildNexusFromInputs();
      const existing = (loadNotes(nexusChild.value) || "").trim();
      const nextNote = existing ? `${existing}\n\n${draft}` : draft;
      saveNotes(nexusChild.value, nextNote);
      const child = CONDITIONS.find((item) => item.id === nexusChild.value);
      pushWorkspaceActivity("Nexus draft applied", `A guided nexus note was appended to ${child?.name || nexusChild.value}.`);
      renderWorkspace();
      renderHealthPanel();
      renderWorkspaceActivity();
      alert("Guided nexus draft appended to condition notes.");
    });
  }

  if (wsBackupExport) {
    wsBackupExport.addEventListener("click", () => {
      const backup = buildWorkspaceBackup();
      const stamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
      downloadText(`va_cfr_workspace_backup_${stamp}.json`, JSON.stringify(backup, null, 2));
      pushWorkspaceActivity("Backup exported", "A full workspace backup JSON file was exported.");
      renderWorkspaceActivity();
      alert("Full workspace backup exported.");
    });
  }

  if (wsBackupImport && wsBackupImportFile) {
    wsBackupImport.addEventListener("click", () => {
      wsBackupImportFile.value = "";
      wsBackupImportFile.click();
    });

    wsBackupImportFile.addEventListener("change", async () => {
      const file = wsBackupImportFile.files?.[0];
      if (!file) return;
      if (!confirm(`Import backup "${file.name}" and replace the current local workspace state?`)) return;

      try {
        const text = await file.text();
        const backup = JSON.parse(text);
        applyWorkspaceBackup(backup);
        pushWorkspaceActivity("Backup imported", `${file.name} restored a full workspace backup.`);
        renderSnapshotComparison(null);
        renderDocumentLibrary();
        renderExtractorHistory();
        renderExtractorPacketLibrary();
        renderEvidenceLibrary();
        renderSnapshotHistoryList();
        renderWorkspace();
        renderClaimTree();
        renderHealthPanel();
        renderWorkspaceActivity();
        alert("Full workspace backup imported.");
      } catch (error) {
        console.error(error);
        alert(error.message || "Could not import that backup file.");
      }
    });
  }

  if (wsProfileSaveCurrent) {
    wsProfileSaveCurrent.addEventListener("click", () => {
      const profile = buildWorkspaceProfile({
        name: wsProfileName?.value || "",
        notes: wsProfileNotes?.value || "",
        backup: buildWorkspaceBackup()
      });
      saveWorkspaceProfiles([profile, ...loadWorkspaceProfiles()].slice(0, 20));
      saveActiveWorkspaceProfileId(profile.id);
      renderWorkspaceProfiles();
      if (wsProfileName) wsProfileName.value = "";
      if (wsProfileNotes) wsProfileNotes.value = "";
      alert(`Saved ${profile.name} as a claim workspace profile.`);
    });
  }

  if (wsProfileNewBlank) {
    wsProfileNewBlank.addEventListener("click", () => {
      const name = (wsProfileName?.value || "").trim() || `Blank Claim Workspace ${new Date().toLocaleString()}`;
      const notes = (wsProfileNotes?.value || "").trim();
      const profile = buildWorkspaceProfile({
        name,
        notes,
        backup: emptyWorkspaceBackup()
      });
      saveWorkspaceProfiles([profile, ...loadWorkspaceProfiles()].slice(0, 20));
      saveActiveWorkspaceProfileId(profile.id);
      applyWorkspaceBackup(profile.backup);
      renderWorkspaceProfiles();
      renderSnapshotComparison(null);
      renderDocumentLibrary();
      renderExtractorHistory();
      renderExtractorPacketLibrary();
      renderEvidenceLibrary();
      renderSnapshotHistoryList();
      renderWorkspace();
      renderClaimTree();
      renderHealthPanel();
      renderWorkspaceActivity();
      if (wsProfileName) wsProfileName.value = "";
      if (wsProfileNotes) wsProfileNotes.value = "";
      alert(`Created and loaded ${profile.name}.`);
    });
  }

  if (wsActivityClear) {
    wsActivityClear.addEventListener("click", () => {
      saveWorkspaceActivity([]);
      renderWorkspaceActivity();
      alert("Workspace activity cleared.");
    });
  }

  // Shortcut: press '/' to focus search unless typing in a field
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName) && !document.activeElement.isContentEditable) {
      e.preventDefault();
      input.focus();
    }
  });

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

  // Debounce search to improve perceived performance and avoid excessive work
  const debouncedApply = debounce(applyFilters, 240);

  input.addEventListener("input", () => { showLoadingResults(); debouncedApply(); });
  input.addEventListener("keyup", () => { showLoadingResults(); debouncedApply(); });
  input.addEventListener("search", () => { showLoadingResults(); debouncedApply(); });
  filter.addEventListener("change", () => { showLoadingResults(); applyFilters(); });

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

  renderConditionBrowse();

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

  applyFilters();
  tryLoadFromPath(); // load /condition/:id if present

  // Workspace buttons
  const wsExport = document.getElementById("wsExport");
  const wsExportAll = document.getElementById("wsExportAll");
  const wsPrintPacket = document.getElementById("wsPrintPacket");
  const wsExportAudience = document.getElementById("wsExportAudience");
  const wsClear = document.getElementById("wsClear");
  const wsShowTips = document.getElementById("wsShowTips");
  const wsFilterSearch = document.getElementById("wsFilterSearch");
  const wsFilterSupport = document.getElementById("wsFilterSupport");
  const wsFilterStatus = document.getElementById("wsFilterStatus");
  const wsFilterSystem = document.getElementById("wsFilterSystem");
  const wsFilterNotes = document.getElementById("wsFilterNotes");

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
      const ordered = orderedWorkspaceItemsForExport();
      const audience = wsExportAudience?.value || "review";
      const text = buildWorkspacePacketText(ordered, { audience });
      downloadText(`claim_workspace_packet_${audience}.txt`, text);
    });
  }

  if (wsExportAll) {
    wsExportAll.addEventListener("click", () => {
      const ordered = orderedWorkspaceItemsForExport();
      ["review", "veteran", "representative"].forEach((audience) => {
        const text = buildWorkspacePacketText(ordered, { audience });
        downloadText(`claim_workspace_packet_${audience}.txt`, text);
      });
      alert("All packet versions exported.");
    });
  }

  if (wsPrintPacket) {
    wsPrintPacket.addEventListener("click", () => {
      openPrintablePacket(wsExportAudience?.value || "review");
    });
  }

  [wsFilterSearch, wsFilterSupport, wsFilterStatus, wsFilterSystem, wsFilterNotes].forEach((el) => {
    if (!el) return;
    el.addEventListener(el.tagName === "INPUT" ? "input" : "change", () => {
      renderWorkspace();
    });
  });

  if (wsShowTips) {
    wsShowTips.addEventListener("click", () => {
      try {
        document.querySelectorAll('.helpTip').forEach(el => {
          const id = el.dataset.tipId || '';
          if (id) localStorage.removeItem(`vaCfrTipDismissed:${id}`);
          el.style.display = '';
        });
        alert('Tips re-enabled.');
      } catch (e) {
        console.error(e);
        alert('Could not re-enable tips.');
      }
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
  const wsTimelineNarrative = document.getElementById("wsTimelineNarrative");
  const wsTimelineNarrativeOut = document.getElementById("wsTimelineNarrativeOut");
  const wsTimelineOut = document.getElementById("wsTimelineOut");
  const wsTimelineScope = document.getElementById("wsTimelineScope");
  const wsTimelineInclude = document.getElementById("wsTimelineInclude");
  const wsTimelineContrib = document.getElementById("wsTimelineContrib");
  const wsTimelineConflictSummary = document.getElementById("wsTimelineConflictSummary");

  function regenWsTimeline() {
    const scope = wsTimelineScope?.value || "all";
    const text = workspaceTimelineDraft(scope);
    if (wsTimelineOut) wsTimelineOut.value = text;

    // Show which workspace conditions contributed timeline entries for the chosen scope
    try {
      const st = loadWorkspaceState();
      let ids = (st.nodes || []).slice();
      if (scope === "primary") ids = st.primaryId ? [st.primaryId] : [];
      else if (scope === "linked") {
        ids = ids.filter(id => isLinkedNode(id, st));
        if (st.primaryId && !ids.includes(st.primaryId)) ids.unshift(st.primaryId);
      }

      const contributors = ids.filter(id => {
        const t = loadTimeline(id);
        return Array.isArray(t) && t.length > 0;
      }).map(id => {
        const c = getConditionById(id);
        return c ? c.name : id;
      });
      const entriesByCondition = Object.fromEntries(ids.map((id) => {
        const c = getConditionById(id);
        return [c ? c.name : id, loadTimeline(id)];
      }));
      const conflicts = analyzeTimelineConflicts(entriesByCondition);

      if (wsTimelineContrib) {
        wsTimelineContrib.textContent = contributors.length ? `Timeline contributors: ${contributors.join(', ')}` : 'No timeline entries found in selected scope.';
      }
      if (wsTimelineConflictSummary) {
        wsTimelineConflictSummary.textContent = conflicts.length
          ? `Timeline conflict check: ${conflicts.length} issue${conflicts.length === 1 ? "" : "s"} found. ${conflicts.slice(0, 2).join(" ")}`
          : "Timeline conflict check: no obvious date conflicts detected.";
      }
    } catch (e) {
      if (wsTimelineContrib) wsTimelineContrib.textContent = '';
      if (wsTimelineConflictSummary) wsTimelineConflictSummary.textContent = "";
    }
  }

  if (wsTimelineBtn) wsTimelineBtn.addEventListener("click", regenWsTimeline);

  if (wsTimelineNarrative && wsTimelineNarrativeOut) {
    wsTimelineNarrative.addEventListener("click", () => {
      const scope = wsTimelineScope?.value || "all";
      wsTimelineNarrativeOut.value = timelineNarrativeDraft(scope);
    });
  }

  if (wsTimelineInclude) {
    wsTimelineInclude.addEventListener("click", () => {
      // Add all conditions (from CONDITIONS list) that have timeline entries into workspace
      const idsWithTimeline = [];
      CONDITIONS.forEach(c => {
        try {
          const t = loadTimeline(c.id);
          if (Array.isArray(t) && t.length) idsWithTimeline.push(c.id);
        } catch (e) {}
      });

      if (!idsWithTimeline.length) return alert('No timeline entries found across conditions.');

      idsWithTimeline.forEach(id => ensureNode(id));
      renderWorkspace();
      alert(`Added ${idsWithTimeline.length} condition(s) with timeline entries to workspace.`);
      // regenerate timeline view so contributors list updates
      regenWsTimeline();
    });
  }

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
    if (wsTimelineNarrativeOut && wsTimelineNarrativeOut.value.trim()) {
      wsTimelineNarrativeOut.value = timelineNarrativeDraft(wsTimelineScope.value || "all");
    }
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
  const wsGraphShowLabelOnly = document.getElementById("wsGraphShowLabelOnly");

  function buildGraphNow() {
    const scope = wsGraphScope?.value || "all";
    const hideOrphans = wsGraphHideOrphans?.checked || false;
    renderEvidenceGraph({ scope, hideOrphans });
  }

  if (wsGraphBuild) wsGraphBuild.addEventListener("click", buildGraphNow);

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

  if (wsGraphShowLabelOnly) {
    wsGraphShowLabelOnly.addEventListener("change", () => {
      const svg = document.querySelector("#wsGraph svg");
      if (svg) buildGraphNow(); // rebuild if already exists
    });
  }

  // First render
  renderWorkspace();
  renderClaimTree();
  renderHealthPanel();
}




if (typeof window !== "undefined" && window.addEventListener) {
  window.addEventListener("popstate", (e) => {
    const id = e.state?.id;
    if (id) showDetail(id, false);
  });
}

function tryLoadFromPath() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts[0] === "condition" && parts[1]) {
    showDetail(parts[1], false);
  }
}

if (typeof document !== "undefined" && document.addEventListener) {
  document.addEventListener("DOMContentLoaded", () => {
    init();
  });
}

if (typeof module !== "undefined") {
  module.exports = {
    analyzeEvidenceConflicts,
    analyzeTimelineConflicts,
    analyzeRecordToClaimMapper,
    extractEvidenceSignals,
    buildAssembledPacketText,
    buildEvidenceLibraryCsv,
    buildExtractorDraftPacketText,
    buildExtractorPacketPreview,
    computeExtractorApplyNewPlan,
    compareExtractorPacketRecords,
    compareExtractorPreview,
    buildExtractorEvidencePreview,
    buildExtractorNoteSummary,
    buildExtractorDraft,
    buildExtractorTimelinePreview,
    buildNexusDraft,
    buildPacketReviewSnapshot,
    buildPrintablePacketHtml,
    buildSubmissionPrepSnapshot,
    buildSymptomFormSummary,
    buildMilestonesCsv,
    buildCoverageStarter,
    computeEvidenceCoverageMatrix,
    computeActionEngine,
    createExtractorHistoryEntry,
    createExtractorPacketRecord,
    createEvidenceLibraryRecord,
    createDocumentRecord,
    conditionSpecificCoaching,
    computeConditionReadinessSnapshot,
    estimateScenarioSnapshot,
    filterWorkspaceItems,
    getConditionGuidedFormSchema,
    parseEvidenceCsv,
    pruneExtractorDraft,
    scoreTheoryRecord,
    suggestEvidenceTargets,
    workspaceProfileSummary,
  };
}
