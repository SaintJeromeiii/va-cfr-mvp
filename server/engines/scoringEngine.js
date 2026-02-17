// server/engines/scoringEngine.js
// Deterministic scoring + narrative builder for VA CFR Finder MVP.
// Defensive against unknown schema: it tries to infer fields.

function normStr(v) {
  return (v ?? "").toString().trim();
}

function lower(v) {
  return normStr(v).toLowerCase();
}

function toArr(v) {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function isISODateLike(s) {
  const t = Date.parse(s);
  return Number.isFinite(t);
}

function getDateFromEvidence(ev) {
  // Common guesses: date, docDate, createdAt, timestamp, serviceDate, onsetDate
  const candidates = [
    ev.date, ev.docDate, ev.createdAt, ev.updatedAt, ev.timestamp,
    ev.serviceDate, ev.onsetDate, ev.eventDate
  ].map(normStr).filter(Boolean);

  for (const c of candidates) {
    if (isISODateLike(c)) return new Date(c);
  }
  return null;
}

function getEvidenceTitle(ev) {
  return normStr(ev.title || ev.name || ev.label || ev.summary || ev.text || ev.description || `Evidence ${ev.id ?? ""}`).trim();
}

function getEvidenceType(ev) {
  return lower(ev.type || ev.kind || ev.category || ev.sourceType || "");
}

function getEvidenceBody(ev) {
  return normStr(ev.text || ev.body || ev.description || ev.summary || ev.note || "");
}

function tokenize(s) {
  return lower(s)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(t => t.length >= 3);
}

function uniq(arr) {
  return [...new Set(arr)];
}

function safeId(x) {
  return normStr(x.id || x._id || x.uuid || x.key || x.evidenceId || x.conditionId || x);
}

function buildIndex(evidenceList) {
  const map = new Map();
  for (const ev of evidenceList || []) map.set(safeId(ev), ev);
  return map;
}

function edgeType(edge) {
  return lower(edge.type || edge.relationship || edge.relType || edge.kind || "");
}

function getEdgesForEvidence(edges, evidenceId) {
  const id = normStr(evidenceId);
  return (edges || []).filter(e => normStr(e.from) === id || normStr(e.to) === id);
}

function evidenceKeywords(ev) {
  const title = getEvidenceTitle(ev);
  const body = getEvidenceBody(ev);
  const type = getEvidenceType(ev);
  return uniq([...tokenize(title), ...tokenize(body), ...tokenize(type)]);
}

// Heuristic: classify "strong" evidence types
function typeWeight(type) {
  if (!type) return 0.6;
  if (type.includes("c&p") || type.includes("dbq")) return 1.25;
  if (type.includes("imo") || type.includes("nexus") || type.includes("medical opinion")) return 1.25;
  if (type.includes("service") || type.includes("str") || type.includes("personnel")) return 1.1;
  if (type.includes("imaging") || type.includes("mri") || type.includes("xray") || type.includes("ct")) return 1.05;
  if (type.includes("treatment") || type.includes("clinic") || type.includes("progress")) return 0.95;
  if (type.includes("lay") || type.includes("buddy") || type.includes("statement")) return 0.9;
  if (type.includes("log") || type.includes("journal")) return 0.8;
  return 0.85;
}

// Edge boosts: typed relationships add "graph intelligence"
function edgeBoostForEvidence(edges, evidenceId) {
  const list = getEdgesForEvidence(edges, evidenceId);
  if (!list.length) return 0;

  let boost = 0;
  for (const e of list) {
    const t = edgeType(e);
    if (t.includes("supports")) boost += 0.12;
    else if (t.includes("contradict")) boost -= 0.10;
    else if (t.includes("causes") || t.includes("nexus")) boost += 0.16;
    else if (t.includes("corroborat")) boost += 0.10;
    else if (t.includes("timeline") || t.includes("chron")) boost += 0.06;
    else boost += 0.04;
  }

  // cap
  return Math.max(-0.25, Math.min(0.35, boost));
}

// Extract CFR hints from state mappings (handles multiple shapes)
function getCfrRefsForCondition(state, condition) {
  const cid = safeId(condition);
  const mapping = state.cfrMapping || state.cfrMap || state.mappings || {};
  const dcMap = state.dcMapping || state.diagnosticCodes || {};

  // Supported shapes:
  // mapping[conditionId] = { cfr: ["38 CFR 4.71a"], dcs: ["5257"] }
  // mapping[conditionName] = ...
  // mapping = [{ conditionId, cfrRefs:[...], dcs:[...] }]
  // dcMap[conditionId] = ["5257"]
  let cfrRefs = [];
  let dcs = [];

  if (Array.isArray(mapping)) {
    const row = mapping.find(r => safeId(r.conditionId) === cid || lower(r.conditionName) === lower(condition.name));
    if (row) {
      cfrRefs = toArr(row.cfrRefs || row.cfr || row.sections || row.sectionRefs);
      dcs = toArr(row.dcs || row.dc || row.diagnosticCodes);
    }
  } else {
    const key1 = cid;
    const key2 = condition.name;
    const row = mapping[key1] || mapping[key2] || mapping[lower(key2)] || null;
    if (row) {
      cfrRefs = toArr(row.cfrRefs || row.cfr || row.sections || row.sectionRefs || row);
      dcs = toArr(row.dcs || row.dc || row.diagnosticCodes);
    }
  }

  const dcRow = dcMap[cid] || dcMap[condition.name] || dcMap[lower(condition.name)] || null;
  if (dcRow) dcs = uniq([...dcs, ...toArr(dcRow)]);

  // normalize "38 CFR …" formatting lightly
  cfrRefs = uniq(cfrRefs.map(normStr).filter(Boolean));
  dcs = uniq(dcs.map(normStr).filter(Boolean));

  return { cfrRefs, dcs };
}

// Try to determine if evidence is "attached" to condition by explicit fields or keyword match.
function evidenceMatchesCondition(ev, condition) {
  const cid = safeId(condition);
  const evCondIds = toArr(ev.conditionIds || ev.conditions || ev.conditionId || ev.conditionIDs).map(normStr);
  const evCondNames = toArr(ev.conditionNames || ev.condition || ev.forCondition).map(normStr);

  if (evCondIds.includes(cid)) return true;
  if (evCondNames.map(lower).includes(lower(condition.name))) return true;

  // keyword fallback:
  const kw = evidenceKeywords(ev);
  const ckw = tokenize(condition.name);
  // match if at least 2 keywords overlap (or 1 for short names)
  const overlap = ckw.filter(t => kw.includes(t)).length;
  if (ckw.length <= 2) return overlap >= 1;
  return overlap >= 2;
}

function computeEvidenceRelevance(ev, condition, cfrRefs, dcs, edges) {
  const base = typeWeight(getEvidenceType(ev));
  const kb = evidenceKeywords(ev);

  // CFR/DC mention boost
  const blob = lower(`${getEvidenceTitle(ev)} ${getEvidenceBody(ev)}`);
  let citeBoost = 0;
  for (const c of cfrRefs || []) {
    const cTok = lower(c).replace(/\s+/g, " ");
    if (cTok && blob.includes(cTok)) { citeBoost += 0.12; break; }
  }
  for (const dc of dcs || []) {
    if (dc && blob.includes(lower(dc))) { citeBoost += 0.10; break; }
  }

  // Condition keyword overlap
  const ckw = tokenize(condition.name);
  const overlap = ckw.filter(t => kb.includes(t)).length;
  const overlapBoost = Math.min(0.22, overlap * 0.07);

  // Date presence = slightly better
  const date = getDateFromEvidence(ev);
  const dateBoost = date ? 0.05 : 0;

  // Graph boost
  const gBoost = edgeBoostForEvidence(edges, safeId(ev));

  // Final (0..1.5) then mapped to 0..100
  const raw = Math.max(0, base + citeBoost + overlapBoost + dateBoost + gBoost);
  const pct = Math.max(0, Math.min(100, Math.round((raw / 1.5) * 100)));

  return {
    scorePct: pct,
    components: {
      typeWeight: base,
      citeBoost,
      overlapBoost,
      dateBoost,
      graphBoost: gBoost
    }
  };
}

// Condition readiness scoring: 0..100 + missing checklist
function computeConditionReadiness({ state, condition }) {
  const evidence = state.evidence || state.evidenceNodes || [];
  const edges = state.edges || state.relationships || [];

  const { cfrRefs, dcs } = getCfrRefsForCondition(state, condition);

  const matched = evidence.filter(ev => evidenceMatchesCondition(ev, condition));
  const scored = matched.map(ev => ({
    id: safeId(ev),
    title: getEvidenceTitle(ev),
    type: getEvidenceType(ev),
    date: getDateFromEvidence(ev)?.toISOString().slice(0, 10) || null,
    ...computeEvidenceRelevance(ev, condition, cfrRefs, dcs, edges)
  })).sort((a, b) => b.scorePct - a.scorePct);

  // Signals for readiness
  const hasDiagnosis = scored.some(e => (e.type.includes("diagnos") || lower(e.title).includes("diagnos")));
  const hasCurrentSymptoms = scored.some(e => lower(e.title + " " + (e.type || "")).includes("symptom") || lower(e.title).includes("flare"));
  const hasInServiceEvent = scored.some(e => e.type.includes("str") || e.type.includes("service") || lower(e.title).includes("line of duty") || lower(e.title).includes("incident"));
  const hasNexus = scored.some(e => e.type.includes("nexus") || e.type.includes("imo") || lower(e.title).includes("medical opinion") || lower(getEvidenceTitle(e)).includes("nexus"));
  const hasFunctionalImpact = scored.some(e => lower(e.title).includes("functional") || lower(e.title).includes("limitations") || lower(e.title).includes("work") || lower(e.title).includes("adl"));
  const hasTreatment = scored.some(e => e.type.includes("treat") || e.type.includes("clinic") || lower(e.title).includes("follow up") || lower(e.title).includes("therapy"));
  const hasDBQorCP = scored.some(e => e.type.includes("dbq") || e.type.includes("c&p"));

  const edgeCount = matched.reduce((acc, ev) => acc + getEdgesForEvidence(edges, safeId(ev)).length, 0);
  const hasRelationships = edgeCount >= Math.max(2, Math.floor(matched.length / 2));

  // Base score from evidence quantity + quality
  const topAvg = scored.slice(0, 6).reduce((a, x) => a + x.scorePct, 0) / Math.max(1, Math.min(6, scored.length));
  const qtyScore = Math.min(20, matched.length * 4); // 5 items => 20
  const qualScore = Math.min(55, (topAvg || 0) * 0.55); // topAvg(0..100) => 0..55
  const graphScore = hasRelationships ? 10 : Math.min(10, edgeCount * 2);

  let rubric = 0;
  rubric += hasDiagnosis ? 8 : 0;
  rubric += hasInServiceEvent ? 8 : 0;
  rubric += hasNexus ? 10 : 0;
  rubric += hasFunctionalImpact ? 6 : 0;
  rubric += hasTreatment ? 4 : 0;
  rubric += hasDBQorCP ? 4 : 0;

  const score = Math.max(0, Math.min(100, Math.round(qtyScore + qualScore + graphScore + rubric)));

  const missing = [];
  if (!hasDiagnosis) missing.push("Add a clear current diagnosis (problem list / ICD / provider note).");
  if (!hasInServiceEvent) missing.push("Add in-service event/exposure proof (STR/personnel/incident statement).");
  if (!hasNexus) missing.push("Add nexus evidence (IMO/nexus letter or provider statement tying condition to service).");
  if (!hasFunctionalImpact) missing.push("Add functional impact (work limitations/ADLs, frequency, severity).");
  if (!hasTreatment) missing.push("Add treatment history (visits, meds, PT, progression).");
  if (!hasDBQorCP) missing.push("Optional but strong: DBQ or C&P exam notes.");
  if (!hasRelationships) missing.push("Link your evidence: Supports/Corroborates/Nexus/Timeline edges.");

  // Strategy text (simple)
  let strategy = "Build a tight 3-part story: (1) current diagnosis, (2) in-service event/exposure, (3) nexus + continuity/impact.";
  if (score >= 80) strategy = "You're close: tighten nexus language, add severity/impact details, and ensure your best items are connected and labeled.";
  if (score < 50) strategy = "Start with fundamentals: diagnosis + in-service proof, then add nexus and functional impact. Use edges to show the chain.";

  return {
    condition: { id: safeId(condition), name: normStr(condition.name || condition.title || "Unnamed Condition") },
    cfr: { cfrRefs, dcs },
    score,
    matchedEvidenceCount: matched.length,
    edgeCount,
    missing,
    strategy,
    evidenceRanked: scored
  };
}

function buildNarrative({ state, conditionId }) {
  const conditions = state.conditions || state.conditionList || [];
  const condition = conditions.find(c => safeId(c) === normStr(conditionId)) || conditions.find(c => lower(c.name) === lower(conditionId));
  if (!condition) {
    return { ok: false, error: "Condition not found." };
  }

  const result = computeConditionReadiness({ state, condition });
  const top = result.evidenceRanked.slice(0, 8);

  // Chronology (sorted by date if present)
  const dated = top
    .map(e => ({ ...e, _d: e.date ? new Date(e.date) : null }))
    .sort((a, b) => {
      if (!a._d && !b._d) return 0;
      if (!a._d) return 1;
      if (!b._d) return -1;
      return a._d - b._d;
    });

  const cfrLine = [
    ...(result.cfr.cfrRefs.length ? [`CFR reference(s): ${result.cfr.cfrRefs.join(", ")}`] : []),
    ...(result.cfr.dcs.length ? [`Diagnostic Code(s): ${result.cfr.dcs.join(", ")}`] : [])
  ].join(" | ");

  const bullets = top.map(e => `- ${e.title}${e.date ? ` (${e.date})` : ""} [relevance ${e.scorePct}%]`).join("\n");

  const timeline = dated.length
    ? dated.map(e => `- ${e.date || "Undated"}: ${e.title}`).join("\n")
    : "- (Add dated evidence to generate a chronology.)";

  // Draft narrative (markdown)
  const md = [
    `# Condition Narrative Draft: ${result.condition.name}`,
    ``,
    cfrLine ? `**${cfrLine}**` : "",
    cfrLine ? `` : "",
    `## Summary`,
    `I am claiming **${result.condition.name}**. The record supports: a current condition, an in-service event/exposure (or onset during service), and a connection (nexus) supported by medical and/or lay evidence.`,
    ``,
    `## Key Evidence (ranked)`,
    bullets || "- (No matched evidence yet.)",
    ``,
    `## Chronology (from your top evidence)`,
    timeline,
    ``,
    `## Functional Impact (fill in / refine)`,
    `- Frequency: ____`,
    `- Severity: ____`,
    `- Work/ADL impact: ____`,
    `- Flare-ups: ____`,
    ``,
    `## Gaps / Next Best Adds`,
    result.missing.length ? result.missing.map(x => `- ${x}`).join("\n") : "- None flagged by rubric.",
    ``,
    `## Strategy`,
    result.strategy,
    ``,
    `---`,
    `_Generated by VA CFR Finder (deterministic template). Edit for accuracy and add specifics._`
  ].filter(Boolean).join("\n");

  return { ok: true, readiness: result, narrativeMarkdown: md };
}

module.exports = {
  computeConditionReadiness,
  buildNarrative
};
