// server/engines/gapFinder.js
// Edge-aware gap finder for VA CFR Finder
// - Finds missing "story chain" roles
// - Detects disconnected role links
// - Suggests specific edges to add (typed) with confidence + reasons

function normStr(v) { return (v ?? "").toString().trim(); }
function lower(v) { return normStr(v).toLowerCase(); }
function toArr(v) { return v ? (Array.isArray(v) ? v : [v]) : []; }
function safeId(x) { return normStr(x?.id || x?._id || x?.uuid || x?.key || x?.evidenceId || x?.conditionId || x); }

function getEvidenceTitle(ev) {
  return normStr(ev.title || ev.name || ev.label || ev.summary || ev.text || ev.description || `Evidence ${safeId(ev)}`).trim();
}
function getEvidenceType(ev) { return lower(ev.type || ev.kind || ev.category || ev.sourceType || ""); }
function getEvidenceBody(ev) { return normStr(ev.text || ev.body || ev.description || ev.summary || ev.note || ""); }

function tokenize(s) {
  return lower(s).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(t => t.length >= 3);
}
function uniq(arr) { return [...new Set(arr)]; }

function evidenceKeywords(ev) {
  const title = getEvidenceTitle(ev);
  const body = getEvidenceBody(ev);
  const type = getEvidenceType(ev);
  return uniq([...tokenize(title), ...tokenize(body), ...tokenize(type)]);
}

// Condition matching (tries explicit condition IDs/names; falls back to keyword overlap)
function evidenceMatchesCondition(ev, condition) {
  const cid = safeId(condition);
  const cname = normStr(condition?.name || condition?.title || "");

  const evCondIds = toArr(ev.conditionIds || ev.conditions || ev.conditionId || ev.conditionIDs).map(normStr);
  const evCondNames = toArr(ev.conditionNames || ev.condition || ev.forCondition).map(normStr);

  if (evCondIds.includes(cid)) return true;
  if (evCondNames.map(lower).includes(lower(cname))) return true;

  const kw = evidenceKeywords(ev);
  const ckw = tokenize(cname);
  const overlap = ckw.filter(t => kw.includes(t)).length;
  if (ckw.length <= 2) return overlap >= 1;
  return overlap >= 2;
}

function edgeType(edge) { return lower(edge.type || edge.relationship || edge.relType || edge.kind || ""); }

function buildAdj(edges) {
  // undirected adjacency for connectivity checks
  const adj = new Map();
  const add = (a, b) => {
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a).add(b);
  };

  for (const e of edges || []) {
    const from = normStr(e.from);
    const to = normStr(e.to);
    if (!from || !to) continue;
    add(from, to);
    add(to, from);
  }
  return adj;
}

function bfsConnected(adj, srcIds, dstIds, maxDepth = 2) {
  // Returns true if any src can reach any dst within maxDepth hops
  const dstSet = new Set(dstIds);
  const visited = new Set();
  const q = [];

  for (const s of srcIds) {
    if (!s) continue;
    visited.add(s);
    q.push({ id: s, d: 0 });
    if (dstSet.has(s)) return true;
  }

  while (q.length) {
    const { id, d } = q.shift();
    if (d >= maxDepth) continue;
    const nbrs = adj.get(id);
    if (!nbrs) continue;

    for (const n of nbrs) {
      if (visited.has(n)) continue;
      if (dstSet.has(n)) return true;
      visited.add(n);
      q.push({ id: n, d: d + 1 });
    }
  }
  return false;
}

function hasDirectEdge(edges, from, to) {
  const a = normStr(from), b = normStr(to);
  return (edges || []).some(e =>
    (normStr(e.from) === a && normStr(e.to) === b) ||
    (normStr(e.from) === b && normStr(e.to) === a)
  );
}

// ---- Role classification (heuristics) ----

const ROLE = {
  IN_SERVICE: "in_service",
  SYMPTOMS: "symptoms",
  DIAGNOSIS: "diagnosis",
  NEXUS: "nexus",
  IMPACT: "impact",
  TREATMENT: "treatment",
  DBQ_CP: "dbq_cp",
  OTHER: "other"
};

function scoreRole(ev, conditionName) {
  const title = lower(getEvidenceTitle(ev));
  const body = lower(getEvidenceBody(ev));
  const type = getEvidenceType(ev);
  const blob = `${title} ${body} ${type}`;
  const kw = evidenceKeywords(ev);
  const ckw = tokenize(conditionName || "");
  const overlap = ckw.filter(t => kw.includes(t)).length;

  const s = {
    [ROLE.IN_SERVICE]: 0,
    [ROLE.SYMPTOMS]: 0,
    [ROLE.DIAGNOSIS]: 0,
    [ROLE.NEXUS]: 0,
    [ROLE.IMPACT]: 0,
    [ROLE.TREATMENT]: 0,
    [ROLE.DBQ_CP]: 0,
    [ROLE.OTHER]: 0
  };

  // In-service
  if (type.includes("str") || type.includes("service") || blob.includes("line of duty") || blob.includes("lod")) s[ROLE.IN_SERVICE] += 4;
  if (blob.includes("deployment") || blob.includes("mos") || blob.includes("dd214") || blob.includes("personnel") || blob.includes("incident")) s[ROLE.IN_SERVICE] += 3;
  if (blob.includes("exposure") || blob.includes("hazard") || blob.includes("burn pit") || blob.includes("ptsd stressor")) s[ROLE.IN_SERVICE] += 3;

  // Symptoms
  if (type.includes("lay") || type.includes("buddy") || blob.includes("statement")) s[ROLE.SYMPTOMS] += 2;
  if (blob.includes("symptom") || blob.includes("pain") || blob.includes("flare") || blob.includes("frequency") || blob.includes("severity")) s[ROLE.SYMPTOMS] += 4;
  if (blob.includes("headache") || blob.includes("numb") || blob.includes("tingl") || blob.includes("sleep") || blob.includes("anxiety") || blob.includes("depress")) s[ROLE.SYMPTOMS] += 2;

  // Diagnosis
  if (blob.includes("diagnos") || blob.includes("dx") || blob.includes("icd") || blob.includes("problem list")) s[ROLE.DIAGNOSIS] += 5;
  if (type.includes("imaging") || blob.includes("mri") || blob.includes("xray") || blob.includes("ct")) s[ROLE.DIAGNOSIS] += 2;

  // Nexus
  if (type.includes("imo") || type.includes("nexus") || blob.includes("medical opinion")) s[ROLE.NEXUS] += 6;
  if (blob.includes("at least as likely") || blob.includes("more likely than not") || blob.includes("due to") || blob.includes("caused by") || blob.includes("aggravated by")) s[ROLE.NEXUS] += 4;
  if (blob.includes("secondary") || blob.includes("proximately due") || blob.includes("aggravation")) s[ROLE.NEXUS] += 2;

  // Impact (functional)
  if (blob.includes("functional") || blob.includes("limitations") || blob.includes("adl") || blob.includes("occupational")) s[ROLE.IMPACT] += 5;
  if (blob.includes("work") || blob.includes("missed") || blob.includes("cannot lift") || blob.includes("standing") || blob.includes("walking")) s[ROLE.IMPACT] += 3;
  if (blob.includes("social impairment") || blob.includes("panic") || blob.includes("concentration")) s[ROLE.IMPACT] += 2;

  // Treatment
  if (type.includes("treat") || type.includes("clinic") || type.includes("progress")) s[ROLE.TREATMENT] += 4;
  if (blob.includes("medication") || blob.includes("pt ") || blob.includes("therapy") || blob.includes("follow up") || blob.includes("referral")) s[ROLE.TREATMENT] += 3;

  // DBQ/C&P
  if (type.includes("dbq") || type.includes("c&p") || blob.includes("compensation and pension")) s[ROLE.DBQ_CP] += 7;
  if (blob.includes("examiner") || blob.includes("section iii") || blob.includes("rom") || blob.includes("range of motion")) s[ROLE.DBQ_CP] += 2;

  // Condition overlap = small boost across non-other roles
  const overlapBoost = Math.min(3, overlap);
  for (const k of Object.keys(s)) {
    if (k !== ROLE.OTHER) s[k] += overlapBoost * 0.5;
  }

  // Pick best role
  let bestRole = ROLE.OTHER;
  let best = -Infinity;
  for (const [r, v] of Object.entries(s)) {
    if (v > best) { best = v; bestRole = r; }
  }

  // Confidence (0..1)
  const conf = Math.max(0, Math.min(1, best / 10));
  return { role: bestRole, confidence: conf, roleScores: s };
}

function pickTopByRole(classified, role, n = 3) {
  return classified
    .filter(x => x.role === role)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, n);
}

function suggestEdgeType(fromRole, toRole) {
  // Keep edge types consistent with your existing typed edges
  if (fromRole === ROLE.IN_SERVICE && toRole === ROLE.SYMPTOMS) return "timeline";
  if (fromRole === ROLE.SYMPTOMS && toRole === ROLE.DIAGNOSIS) return "supports";
  if (fromRole === ROLE.DIAGNOSIS && toRole === ROLE.NEXUS) return "supports";
  if (fromRole === ROLE.NEXUS && toRole === ROLE.IMPACT) return "supports";
  if (fromRole === ROLE.TREATMENT && (toRole === ROLE.SYMPTOMS || toRole === ROLE.DIAGNOSIS)) return "corroborates";
  if (fromRole === ROLE.DBQ_CP && (toRole === ROLE.IMPACT || toRole === ROLE.DIAGNOSIS)) return "supports";
  return "supports";
}

function proposeEdges(edges, fromNodes, toNodes, fromRole, toRole) {
  const suggestions = [];
  for (const a of fromNodes) {
    for (const b of toNodes) {
      const from = a.id, to = b.id;
      if (!from || !to) continue;
      if (from === to) continue;
      if (hasDirectEdge(edges, from, to)) continue;

      const type = suggestEdgeType(fromRole, toRole);
      const confidence = Math.max(0, Math.min(1,
        0.45 +
        0.35 * (a.confidence || 0) +
        0.35 * (b.confidence || 0) -
        0.10 * (type === "timeline" ? 0 : 0) // placeholder (keep simple)
      ));

      suggestions.push({
        from,
        to,
        type,
        confidence: Number(confidence.toFixed(2)),
        reason: `Connect ${fromRole} → ${toRole} to complete the chain (suggested: ${type}).`,
        fromTitle: a.title,
        toTitle: b.title
      });
    }
  }

  // Keep top 6 best (by confidence)
  suggestions.sort((x, y) => y.confidence - x.confidence);
  return suggestions.slice(0, 6);
}

function findEdgeAwareGapsForCondition({ state, condition }) {
  const edges = state.edges || state.relationships || [];
  const evidence = state.evidence || state.evidenceNodes || [];
  const conditionName = normStr(condition?.name || condition?.title || "");

  const matched = evidence.filter(ev => evidenceMatchesCondition(ev, condition));

  const classified = matched.map(ev => {
    const id = safeId(ev);
    const title = getEvidenceTitle(ev);
    const { role, confidence } = scoreRole(ev, conditionName);
    return { id, title, role, confidence, ev };
  });

  // Roles required for a strong direct SC story chain:
  const requiredRoles = [
    ROLE.DIAGNOSIS,
    ROLE.IN_SERVICE,
    ROLE.NEXUS,
    ROLE.IMPACT
  ];

  // Symptoms is often necessary; allow it to be "recommended" rather than required
  const recommendedRoles = [ROLE.SYMPTOMS, ROLE.TREATMENT, ROLE.DBQ_CP];

  const roleBuckets = {};
  for (const r of Object.values(ROLE)) roleBuckets[r] = [];
  for (const x of classified) roleBuckets[x.role].push(x);

  const missingRequired = requiredRoles.filter(r => roleBuckets[r].length === 0);
  const missingRecommended = recommendedRoles.filter(r => roleBuckets[r].length === 0);

  const adj = buildAdj(edges);

  // Link requirements (role-to-role links that should be connected by existing edges)
  const requiredLinks = [
    { from: ROLE.IN_SERVICE, to: ROLE.SYMPTOMS, label: "in-service → symptoms" },
    { from: ROLE.SYMPTOMS, to: ROLE.DIAGNOSIS, label: "symptoms → diagnosis" },
    { from: ROLE.DIAGNOSIS, to: ROLE.NEXUS, label: "diagnosis → nexus" },
    { from: ROLE.NEXUS, to: ROLE.IMPACT, label: "nexus → impact" }
  ];

  // If symptoms is missing, we still evaluate the rest; we'll flag that link as blocked.
  const linkFindings = [];
  const edgeSuggestions = [];

  for (const link of requiredLinks) {
    const fromIds = roleBuckets[link.from].map(x => x.id);
    const toIds = roleBuckets[link.to].map(x => x.id);

    if (!fromIds.length || !toIds.length) {
      linkFindings.push({
        link: link.label,
        status: "blocked_missing_role",
        fromRole: link.from,
        toRole: link.to,
        note: "Cannot evaluate connectivity because one side has no nodes."
      });
      continue;
    }

    const connected = bfsConnected(adj, fromIds, toIds, 1); // require direct edge
    if (connected) {
      linkFindings.push({
        link: link.label,
        status: "connected",
        fromRole: link.from,
        toRole: link.to
      });
    } else {
      // Not directly connected—suggest best edges between top candidates of each role
      linkFindings.push({
        link: link.label,
        status: "disconnected",
        fromRole: link.from,
        toRole: link.to,
        note: "Roles exist but no direct edge connects them."
      });

      const fromTop = pickTopByRole(classified, link.from, 2);
      const toTop = pickTopByRole(classified, link.to, 2);
      const sug = proposeEdges(edges, fromTop, toTop, link.from, link.to);
      edgeSuggestions.push(...sug);
    }
  }

  // Also: treat helpful "support links"
  const helpfulLinks = [
    { from: ROLE.TREATMENT, to: ROLE.SYMPTOMS, label: "treatment → symptoms" },
    { from: ROLE.TREATMENT, to: ROLE.DIAGNOSIS, label: "treatment → diagnosis" },
    { from: ROLE.DBQ_CP, to: ROLE.DIAGNOSIS, label: "dbq/c&p → diagnosis" },
    { from: ROLE.DBQ_CP, to: ROLE.IMPACT, label: "dbq/c&p → impact" }
  ];

  const helpfulFindings = [];
  for (const link of helpfulLinks) {
    const fromIds = roleBuckets[link.from].map(x => x.id);
    const toIds = roleBuckets[link.to].map(x => x.id);
    if (!fromIds.length || !toIds.length) continue;

    const connected = bfsConnected(adj, fromIds, toIds, 1);
    if (!connected) {
      helpfulFindings.push({
        link: link.label,
        status: "disconnected",
        fromRole: link.from,
        toRole: link.to
      });

      const fromTop = pickTopByRole(classified, link.from, 2);
      const toTop = pickTopByRole(classified, link.to, 2);
      const sug = proposeEdges(edges, fromTop, toTop, link.from, link.to);
      edgeSuggestions.push(...sug);
    } else {
      helpfulFindings.push({
        link: link.label,
        status: "connected",
        fromRole: link.from,
        toRole: link.to
      });
    }
  }

  // De-dupe suggestions (same from/to/type)
  const seen = new Set();
  const deduped = [];
  for (const s of edgeSuggestions) {
    const k = `${s.from}::${s.to}::${s.type}`;
    const k2 = `${s.to}::${s.from}::${s.type}`;
    if (seen.has(k) || seen.has(k2)) continue;
    seen.add(k);
    deduped.push(s);
  }
  deduped.sort((a, b) => b.confidence - a.confidence);

  // Identify "role orphans": nodes in a role with no edges at all
  const edgeByNode = new Map();
  for (const e of edges || []) {
    const a = normStr(e.from), b = normStr(e.to);
    if (!a || !b) continue;
    edgeByNode.set(a, (edgeByNode.get(a) || 0) + 1);
    edgeByNode.set(b, (edgeByNode.get(b) || 0) + 1);
  }

  const roleOrphans = classified
    .filter(x => (edgeByNode.get(x.id) || 0) === 0 && x.role !== ROLE.OTHER)
    .map(x => ({ id: x.id, title: x.title, role: x.role, confidence: x.confidence }));

  return {
    condition: { id: safeId(condition), name: conditionName },
    counts: {
      matchedEvidence: matched.length,
      edges: (edges || []).length
    },
    rolesPresent: Object.fromEntries(
      Object.entries(roleBuckets).map(([r, list]) => [r, list.length])
    ),
    missingRequired,
    missingRecommended,
    requiredLinkFindings: linkFindings,
    helpfulLinkFindings: helpfulFindings,
    edgeSuggestions: deduped.slice(0, 12),
    roleOrphans: roleOrphans.slice(0, 20)
  };
}

function findEdgeAwareGaps({ state, conditionId }) {
  const conditions = state.conditions || state.conditionList || [];
  if (!conditions.length) return { ok: false, error: "No conditions in state." };

  if (conditionId) {
    const condition =
      conditions.find(c => safeId(c) === String(conditionId)) ||
      conditions.find(c => lower(c.name || c.title) === lower(conditionId));

    if (!condition) return { ok: false, error: "Condition not found." };

    return { ok: true, result: findEdgeAwareGapsForCondition({ state, condition }) };
  }

  const results = conditions.map(condition => findEdgeAwareGapsForCondition({ state, condition }));
  // prioritize the worst gaps: missing required + most disconnected required links
  results.sort((a, b) => {
    const aMiss = a.missingRequired.length;
    const bMiss = b.missingRequired.length;
    if (aMiss !== bMiss) return bMiss - aMiss;
    const aDisc = a.requiredLinkFindings.filter(x => x.status === "disconnected").length;
    const bDisc = b.requiredLinkFindings.filter(x => x.status === "disconnected").length;
    return bDisc - aDisc;
  });

  return { ok: true, results };
}

module.exports = {
  findEdgeAwareGaps,
  ROLE
};
