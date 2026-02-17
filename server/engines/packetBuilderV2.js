// server/engines/packetBuilderV2.js
// Packet Builder v2 (upgraded):
// - Adds role inference per exhibit
// - Adds neighbor evidence (graph connections)
// - Adds recommended links derived from the graph + claim chain heuristics

const { computeConditionReadiness, buildNarrative } = require("./scoringEngine");

function normStr(v) { return (v ?? "").toString().trim(); }
function lower(v) { return normStr(v).toLowerCase(); }
function safeId(x) { return normStr(x?.id || x?._id || x?.uuid || x?.key || x?.evidenceId || x); }
function toArr(v) { return v ? (Array.isArray(v) ? v : [v]) : []; }

function getConditions(state) {
  return state.conditions || state.conditionList || [];
}
function getEvidence(state) {
  return state.evidence || state.evidenceNodes || [];
}
function getEdges(state) {
  return state.edges || state.relationships || [];
}

function getEvidenceTitle(ev) {
  return normStr(ev.title || ev.name || ev.label || ev.summary || ev.text || ev.description || `Evidence ${safeId(ev)}`).trim();
}
function getEvidenceType(ev) { return lower(ev.type || ev.kind || ev.category || ev.sourceType || ""); }
function getEvidenceBody(ev) { return normStr(ev.text || ev.body || ev.description || ev.summary || ev.note || ""); }

function isISODateLike(s) {
  const t = Date.parse(s);
  return Number.isFinite(t);
}
function getDateFromEvidence(ev) {
  const candidates = [
    ev.date, ev.docDate, ev.createdAt, ev.updatedAt, ev.timestamp,
    ev.serviceDate, ev.onsetDate, ev.eventDate
  ].map(normStr).filter(Boolean);
  for (const c of candidates) if (isISODateLike(c)) return new Date(c);
  return null;
}

function evidenceMatchesCondition(ev, condition) {
  const cid = safeId(condition);
  const cname = normStr(condition?.name || condition?.title || "");

  const evCondIds = toArr(ev.conditionIds || ev.conditions || ev.conditionId || ev.conditionIDs).map(normStr);
  const evCondNames = toArr(ev.conditionNames || ev.condition || ev.forCondition).map(normStr);

  if (evCondIds.includes(cid)) return true;
  if (evCondNames.map(lower).includes(lower(cname))) return true;

  // keyword fallback (simple)
  const blob = lower(`${getEvidenceTitle(ev)} ${getEvidenceBody(ev)} ${getEvidenceType(ev)}`);
  const tokens = lower(cname).split(/\s+/).filter(t => t.length >= 3);
  const hit = tokens.filter(t => blob.includes(t)).length;
  if (tokens.length <= 2) return hit >= 1;
  return hit >= 2;
}

function pad3(n) { return String(n).padStart(3, "0"); }
function defaultExhibitId(i) { return `EX-${pad3(i)}`; }

function hasDirectEdge(edges, from, to) {
  const a = normStr(from), b = normStr(to);
  return (edges || []).some(e =>
    (normStr(e.from) === a && normStr(e.to) === b) ||
    (normStr(e.from) === b && normStr(e.to) === a)
  );
}

function buildNeighborMap(edges) {
  const map = new Map(); // evidenceId -> Set(neighborId)
  const add = (a, b) => {
    if (!map.has(a)) map.set(a, new Set());
    map.get(a).add(b);
  };
  for (const e of edges || []) {
    const a = normStr(e.from);
    const b = normStr(e.to);
    if (!a || !b) continue;
    add(a, b);
    add(b, a);
  }
  return map;
}

// ---- Role inference (server-side, deterministic) ----
const ROLE = {
  NEXUS: "nexus",
  DIAGNOSIS: "diagnosis",
  IN_SERVICE: "in_service",
  IMPACT: "impact",
  SYMPTOMS: "symptoms",
  TREATMENT: "treatment",
  DBQ_CP: "dbq_cp",
  OTHER: "other"
};

function inferRoleFromEvidence(ev) {
  const title = lower(getEvidenceTitle(ev));
  const body = lower(getEvidenceBody(ev));
  const type = getEvidenceType(ev);
  const blob = `${title} ${body} ${type}`;

  const score = {
    [ROLE.NEXUS]: 0,
    [ROLE.DIAGNOSIS]: 0,
    [ROLE.IN_SERVICE]: 0,
    [ROLE.IMPACT]: 0,
    [ROLE.SYMPTOMS]: 0,
    [ROLE.TREATMENT]: 0,
    [ROLE.DBQ_CP]: 0,
    [ROLE.OTHER]: 0
  };

  // Nexus
  if (type.includes("imo") || type.includes("nexus") || blob.includes("medical opinion")) score[ROLE.NEXUS] += 6;
  if (blob.includes("at least as likely") || blob.includes("more likely than not") || blob.includes("due to") || blob.includes("caused by") || blob.includes("aggravated by")) score[ROLE.NEXUS] += 4;
  if (blob.includes("secondary") || blob.includes("proximately due") || blob.includes("aggravation")) score[ROLE.NEXUS] += 2;

  // Diagnosis
  if (blob.includes("diagnos") || blob.includes("dx") || blob.includes("icd") || blob.includes("problem list")) score[ROLE.DIAGNOSIS] += 6;
  if (type.includes("imaging") || blob.includes("mri") || blob.includes("xray") || blob.includes("ct")) score[ROLE.DIAGNOSIS] += 2;

  // In-service
  if (type.includes("str") || type.includes("service") || blob.includes("line of duty") || blob.includes("lod")) score[ROLE.IN_SERVICE] += 5;
  if (blob.includes("dd214") || blob.includes("deployment") || blob.includes("personnel") || blob.includes("incident")) score[ROLE.IN_SERVICE] += 3;
  if (blob.includes("exposure") || blob.includes("hazard") || blob.includes("burn pit") || blob.includes("stressor")) score[ROLE.IN_SERVICE] += 3;

  // Impact
  if (blob.includes("functional") || blob.includes("limitations") || blob.includes("adl") || blob.includes("occupational")) score[ROLE.IMPACT] += 6;
  if (blob.includes("work") || blob.includes("cannot") || blob.includes("missed") || blob.includes("standing") || blob.includes("walking") || blob.includes("lifting")) score[ROLE.IMPACT] += 3;

  // Symptoms
  if (blob.includes("symptom") || blob.includes("pain") || blob.includes("flare") || blob.includes("frequency") || blob.includes("severity")) score[ROLE.SYMPTOMS] += 5;
  if (type.includes("lay") || blob.includes("buddy statement") || blob.includes("statement")) score[ROLE.SYMPTOMS] += 2;

  // Treatment
  if (type.includes("treat") || type.includes("clinic") || type.includes("progress")) score[ROLE.TREATMENT] += 4;
  if (blob.includes("medication") || blob.includes("therapy") || blob.includes("follow up") || blob.includes("referral") || blob.includes("pt ")) score[ROLE.TREATMENT] += 3;

  // DBQ / C&P
  if (type.includes("dbq") || type.includes("c&p") || blob.includes("compensation and pension")) score[ROLE.DBQ_CP] += 7;
  if (blob.includes("examiner") || blob.includes("range of motion") || blob.includes("rom")) score[ROLE.DBQ_CP] += 2;

  let bestRole = ROLE.OTHER;
  let best = -Infinity;
  for (const [k, v] of Object.entries(score)) {
    if (v > best) { best = v; bestRole = k; }
  }

  const roleLabel = ({
    [ROLE.NEXUS]: "Nexus / Medical Opinion",
    [ROLE.DIAGNOSIS]: "Diagnosis / Findings",
    [ROLE.IN_SERVICE]: "In-Service Event / Exposure",
    [ROLE.IMPACT]: "Functional Impact / Severity",
    [ROLE.SYMPTOMS]: "Symptoms / Continuity",
    [ROLE.TREATMENT]: "Treatment / Care",
    [ROLE.DBQ_CP]: "DBQ / C&P Exam",
    [ROLE.OTHER]: "General Evidence"
  })[bestRole];

  const confidence = Math.max(0, Math.min(1, best / 10));
  return { roleKey: bestRole, roleLabel, confidence: Number(confidence.toFixed(2)) };
}

function pickTargetRole(roleKey) {
  // Claim chain preference:
  // in_service -> symptoms -> diagnosis -> nexus -> impact
  switch (roleKey) {
    case ROLE.IN_SERVICE: return ROLE.SYMPTOMS;
    case ROLE.SYMPTOMS: return ROLE.DIAGNOSIS;
    case ROLE.DIAGNOSIS: return ROLE.NEXUS;
    case ROLE.NEXUS: return ROLE.IMPACT;
    case ROLE.TREATMENT: return ROLE.DIAGNOSIS;
    case ROLE.DBQ_CP: return ROLE.IMPACT;
    case ROLE.IMPACT: return ROLE.DIAGNOSIS;
    default: return ROLE.DIAGNOSIS;
  }
}

function suggestedEdgeType(fromRole, toRole) {
  if (fromRole === ROLE.IN_SERVICE && toRole === ROLE.SYMPTOMS) return "timeline";
  if (fromRole === ROLE.SYMPTOMS && toRole === ROLE.DIAGNOSIS) return "supports";
  if (fromRole === ROLE.DIAGNOSIS && toRole === ROLE.NEXUS) return "supports";
  if (fromRole === ROLE.NEXUS && toRole === ROLE.IMPACT) return "supports";
  if (fromRole === ROLE.TREATMENT && (toRole === ROLE.SYMPTOMS || toRole === ROLE.DIAGNOSIS)) return "corroborates";
  if (fromRole === ROLE.DBQ_CP && (toRole === ROLE.IMPACT || toRole === ROLE.DIAGNOSIS)) return "supports";
  return "supports";
}

function buildRecommendedLinks({
  exhibitEv,
  exhibitRole,
  poolEvs,
  edges,
  neighborSet,
  evIndex,
  // NEW:
  exhibitIdByEvidenceId,
  selectedExhibitEvidenceIds
}) {
  // Recommend up to 2 links from this exhibit to help complete the claim chain.
  const rec = [];
  const fromId = safeId(exhibitEv);

  const targetRole = pickTargetRole(exhibitRole.roleKey);
  const edgeType = suggestedEdgeType(exhibitRole.roleKey, targetRole);

  // Helpers
  const isSelectedExhibit = (evidenceId) => selectedExhibitEvidenceIds?.has(String(evidenceId));
  const exIdOf = (evidenceId) => exhibitIdByEvidenceId?.get(String(evidenceId)) || null;

  const buildRec = (toEv, toRole, reason) => {
    const toId = safeId(toEv);
    return {
      fromEvidenceId: fromId,
      toEvidenceId: toId,
      type: edgeType,
      reason,
      toTitle: evIndex.get(toId)?.title || getEvidenceTitle(toEv),
      toRoleLabel: toRole.roleLabel,
      // NEW: Packet cross-reference
      toExhibitId: exIdOf(toId),
      fromExhibitId: exIdOf(fromId)
    };
  };

  // 1) Prefer candidates INSIDE the packet first
  const inPacketCandidates = poolEvs
    .map(ev => ({ ev, role: inferRoleFromEvidence(ev) }))
    .filter(x => x.role.roleKey === targetRole)
    .filter(x => isSelectedExhibit(safeId(x.ev)))
    .sort((a, b) => b.role.confidence - a.role.confidence);

  for (const c of inPacketCandidates) {
    const toId = safeId(c.ev);
    if (!toId || toId === fromId) continue;
    if (neighborSet?.has(toId)) continue;
    if (hasDirectEdge(edges, fromId, toId)) continue;

    rec.push(buildRec(
      c.ev,
      c.role,
      `Packet-aware: connect ${exhibitRole.roleLabel} → ${c.role.roleLabel} using ${edgeType}.`
    ));
    if (rec.length >= 2) return rec;
  }

  // 2) Then try any candidates (not necessarily in packet)
  const generalCandidates = poolEvs
    .map(ev => ({ ev, role: inferRoleFromEvidence(ev) }))
    .filter(x => x.role.roleKey === targetRole)
    .sort((a, b) => b.role.confidence - a.role.confidence)
    .slice(0, 10);

  for (const c of generalCandidates) {
    const toId = safeId(c.ev);
    if (!toId || toId === fromId) continue;
    if (neighborSet?.has(toId)) continue;
    if (hasDirectEdge(edges, fromId, toId)) continue;

    rec.push(buildRec(
      c.ev,
      c.role,
      `Strengthen chain: ${exhibitRole.roleLabel} → ${c.role.roleLabel} (${edgeType}).`
    ));
    if (rec.length >= 2) return rec;
  }

  // 3) If nothing, suggest a generic "connect to strongest non-other"
  const alt = poolEvs
    .map(ev => ({ ev, role: inferRoleFromEvidence(ev) }))
    .filter(x => x.role.roleKey !== ROLE.OTHER)
    .sort((a, b) => b.role.confidence - a.role.confidence)
    .slice(0, 10);

  for (const c of alt) {
    const toId = safeId(c.ev);
    if (!toId || toId === fromId) continue;
    if (neighborSet?.has(toId)) continue;
    if (hasDirectEdge(edges, fromId, toId)) continue;

    rec.push({
      fromEvidenceId: fromId,
      toEvidenceId: toId,
      type: "supports",
      reason: `Connect this exhibit to a strong supporting node (${c.role.roleLabel}).`,
      toTitle: evIndex.get(toId)?.title || getEvidenceTitle(c.ev),
      toRoleLabel: c.role.roleLabel,
      toExhibitId: exIdOf(toId),
      fromExhibitId: exIdOf(fromId)
    });
    if (rec.length >= 2) break;
  }

  return rec;
}

function buildExhibits({ state, condition, selectedEvidenceIds }) {
  const evidence = getEvidence(state);
  const edges = getEdges(state);

  // Build index for title/type lookup
  const evIndex = new Map();
  for (const ev of evidence) {
    const id = safeId(ev);
    if (!id) continue;
    evIndex.set(id, {
      title: getEvidenceTitle(ev),
      type: getEvidenceType(ev),
      date: getDateFromEvidence(ev)?.toISOString().slice(0, 10) || null
    });
  }

  // Candidate pool: evidence matched to condition
  const pool = evidence.filter(ev => evidenceMatchesCondition(ev, condition));

  // Determine chosen exhibits
  const idSet = new Set((selectedEvidenceIds || []).map(String));

  let chosen = [];
  if (idSet.size) {
    chosen = pool.filter(ev => idSet.has(String(safeId(ev))));
  } else {
    // auto pick from readiness ranking (top 12)
    const readiness = computeConditionReadiness({ state, condition });
    const rankedIds = (readiness.evidenceRanked || []).slice(0, 12).map(x => String(x.id));
    const rankedSet = new Set(rankedIds);
    chosen = pool.filter(ev => rankedSet.has(String(safeId(ev))));
    chosen.sort((a, b) => rankedIds.indexOf(String(safeId(a))) - rankedIds.indexOf(String(safeId(b))));
  }

  const neighborMap = buildNeighborMap(edges);

  // NEW: Track selected exhibits for packet-aware recommendations
  const selectedExhibitEvidenceIds = new Set(chosen.map(ev => String(safeId(ev))));

  // Exhibit ID mapping (so recommendations can reference EX-###)
  const exhibitIdByEvidenceId = new Map();
  chosen.forEach((ev, idx) => {
    exhibitIdByEvidenceId.set(String(safeId(ev)), defaultExhibitId(idx + 1));
  });

  // Build exhibit objects with graph intelligence fields
  const exhibits = chosen.map((ev, idx) => {
    const id = safeId(ev);
    const date = getDateFromEvidence(ev);
    const type = getEvidenceType(ev);
    const title = getEvidenceTitle(ev);
    const snippet = normStr(getEvidenceBody(ev)).slice(0, 240) || null;

    const neighborSet = neighborMap.get(id) || new Set();
    const neighbors = [...neighborSet]
      .slice(0, 8)
      .map(nid => ({
        evidenceId: nid,
        title: evIndex.get(nid)?.title || nid,
        type: evIndex.get(nid)?.type || ""
      }));

    const edgeCount = neighborSet.size;

    const role = inferRoleFromEvidence(ev);

    const recommendedLinks = buildRecommendedLinks({
      exhibitEv: ev,
      exhibitRole: role,
      poolEvs: pool,
      edges,
      neighborSet,
      evIndex,
      exhibitIdByEvidenceId,
      selectedExhibitEvidenceIds
    });

    return {
      exhibitId: defaultExhibitId(idx + 1),
      evidenceId: id,
      title,
      type,
      date: date ? date.toISOString().slice(0, 10) : null,
      snippet,
      edgeCount,
      // NEW:
      roleKey: role.roleKey,
      roleLabel: role.roleLabel,
      roleConfidence: role.confidence,
      neighbors,
      recommendedLinks
    };
  });

  return exhibits;
}

function buildCoverSheet({ conditionName, readiness, cfrRefs, dcs }) {
  const lines = [];
  lines.push(`# Claim Packet Cover Sheet`);
  lines.push(``);
  lines.push(`**Condition:** ${conditionName}`);
  lines.push(`**Readiness:** ${readiness?.score ?? "--"}/100`);
  if ((cfrRefs || []).length) lines.push(`**CFR:** ${cfrRefs.join(", ")}`);
  if ((dcs || []).length) lines.push(`**Diagnostic Codes:** ${dcs.join(", ")}`);
  lines.push(``);
  lines.push(`**Purpose:** Organized claim packet with labeled exhibits and a narrative draft.`);
  lines.push(``);
  return lines.join("\n");
}

function buildExhibitListMarkdown(exhibits) {
  if (!exhibits.length) return `## Exhibit List\n- (No exhibits selected.)`;

  const lines = [];
  lines.push(`## Exhibit List`);
  for (const ex of exhibits) {
    const parts = [
      `**${ex.exhibitId}**`,
      ex.date ? `(${ex.date})` : `(Undated)`,
      ex.title
    ];
    const role = ex.roleLabel ? ` • ${ex.roleLabel}` : "";
    lines.push(`- ${parts.join(" ")}${ex.type ? ` — _${ex.type}_` : ""}${role}`);
  }
  return lines.join("\n");
}

function buildExhibitPagesMarkdown(exhibits) {
  if (!exhibits.length) return `## Exhibits\n_(No exhibits selected.)_`;

  const lines = [];
  lines.push(`## Exhibits`);
  for (const ex of exhibits) {
    lines.push(`\n---\n`);
    lines.push(`### ${ex.exhibitId}: ${ex.title}`);
    lines.push(`- Evidence ID: \`${ex.evidenceId}\``);
    if (ex.date) lines.push(`- Date: ${ex.date}`);
    if (ex.type) lines.push(`- Type: ${ex.type}`);
    if (ex.roleLabel) lines.push(`- Role: ${ex.roleLabel} (conf ${ex.roleConfidence})`);
    lines.push(`- Graph connections: ${ex.edgeCount}`);

    if (ex.neighbors?.length) {
      lines.push(`\n**Connected to:**`);
      for (const n of ex.neighbors) lines.push(`- ${n.title}${n.type ? ` (${n.type})` : ""}`);
    }

    if (ex.recommendedLinks?.length) {
      lines.push(`\n**Recommended links:**`);
      for (const r of ex.recommendedLinks) {
        lines.push(`- ${r.type}: ${r.reason} → ${r.toTitle}`);
      }
    }

    if (ex.snippet) {
      lines.push(`\n**Snippet:**\n${ex.snippet}`);
    } else {
      lines.push(`\n**Snippet:** _(none)_`);
    }
  }
  return lines.join("\n");
}

function buildPacketMarkdown({ coverSheet, exhibitList, narrativeMarkdown, exhibitPages }) {
  return [
    coverSheet,
    ``,
    exhibitList,
    ``,
    `## Narrative Draft`,
    narrativeMarkdown || `_(Generate narrative first.)_`,
    ``,
    exhibitPages,
    ``,
    `---`,
    `_Generated by VA CFR Finder Packet Builder v2. Edit for accuracy._`
  ].join("\n");
}

function buildPacketBundle({ state, conditionId, selectedEvidenceIds }) {
  const conditions = getConditions(state);
  const condition =
    conditions.find(c => safeId(c) === String(conditionId)) ||
    conditions.find(c => lower(c.name || c.title) === lower(conditionId));

  if (!condition) return { ok: false, error: "Condition not found." };

  const condId = safeId(condition);
  const condName = normStr(condition.name || condition.title || "Unnamed Condition");

  const readiness = computeConditionReadiness({ state, condition });

  const narrativeOut = buildNarrative({ state, conditionId: condId });
  const narrativeMarkdown = narrativeOut.ok ? narrativeOut.narrativeMarkdown : "";

  const cfrRefs = readiness?.cfr?.cfrRefs || [];
  const dcs = readiness?.cfr?.dcs || [];

  const exhibits = buildExhibits({ state, condition, selectedEvidenceIds });

  const coverSheet = buildCoverSheet({ conditionName: condName, readiness, cfrRefs, dcs });
  const exhibitList = buildExhibitListMarkdown(exhibits);
  const exhibitPages = buildExhibitPagesMarkdown(exhibits);

  const packetMarkdown = buildPacketMarkdown({ coverSheet, exhibitList, narrativeMarkdown, exhibitPages });

  return {
    ok: true,
    condition: { id: condId, name: condName },
    readiness,
    exhibits,
    packetMarkdown,
    export: {
      version: "packet-v2",
      condition: { id: condId, name: condName },
      generatedAt: new Date().toISOString(),
      exhibits: exhibits.map(x => ({
        exhibitId: x.exhibitId,
        evidenceId: x.evidenceId,
        title: x.title,
        type: x.type,
        date: x.date,
        roleKey: x.roleKey,
        roleLabel: x.roleLabel,
        roleConfidence: x.roleConfidence,
        neighbors: x.neighbors,
        recommendedLinks: x.recommendedLinks
      })),
      narrativeMarkdown
    }
  };
}

module.exports = { buildPacketBundle };
