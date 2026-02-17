// server/engines/packetBuilderV2.js
// Packet Builder v2: exhibit selection, exhibit IDs, cover sheet, exhibit list, export bundle
// Works with flexible state shapes.

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

function defaultExhibitId(i) {
  // EX-001, EX-002, ...
  return `EX-${pad3(i)}`;
}

function buildExhibits({ state, condition, selectedEvidenceIds }) {
  const evidence = getEvidence(state);
  const edges = getEdges(state);

  // Candidate pool: evidence matched to condition
  const pool = evidence.filter(ev => evidenceMatchesCondition(ev, condition));

  // If user passed selected IDs, use those; otherwise auto pick top from readiness ranking
  const idSet = new Set((selectedEvidenceIds || []).map(String));

  let chosen = [];
  if (idSet.size) {
    chosen = pool.filter(ev => idSet.has(String(safeId(ev))));
  } else {
    // auto pick from readiness ranked evidence (top 12)
    const readiness = computeConditionReadiness({ state, condition });
    const rankedIds = (readiness.evidenceRanked || []).slice(0, 12).map(x => String(x.id));
    const rankedSet = new Set(rankedIds);
    chosen = pool.filter(ev => rankedSet.has(String(safeId(ev))));
    // preserve ranking order
    chosen.sort((a, b) => rankedIds.indexOf(String(safeId(a))) - rankedIds.indexOf(String(safeId(b))));
  }

  // Build exhibit objects
  const exhibits = chosen.map((ev, idx) => {
    const id = safeId(ev);
    const date = getDateFromEvidence(ev);
    const type = getEvidenceType(ev);
    const title = getEvidenceTitle(ev);
    // Short snippet (safe)
    const snippet = normStr(getEvidenceBody(ev)).slice(0, 240);

    // Basic connectivity hint
    const edgeCount = (edges || []).filter(e => String(e.from) === String(id) || String(e.to) === String(id)).length;

    return {
      exhibitId: defaultExhibitId(idx + 1),
      evidenceId: id,
      title,
      type,
      date: date ? date.toISOString().slice(0, 10) : null,
      snippet: snippet || null,
      edgeCount
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
    lines.push(`- ${parts.join(" ")}${ex.type ? ` — _${ex.type}_` : ""}`);
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
    lines.push(`- Graph connections: ${ex.edgeCount}`);
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

  const bundle = {
    ok: true,
    condition: { id: condId, name: condName },
    readiness,
    exhibits,
    packetMarkdown,
    // Minimal JSON export for interoperability
    export: {
      version: "packet-v2",
      condition: { id: condId, name: condName },
      generatedAt: new Date().toISOString(),
      exhibits: exhibits.map(x => ({
        exhibitId: x.exhibitId,
        evidenceId: x.evidenceId,
        title: x.title,
        type: x.type,
        date: x.date
      })),
      narrativeMarkdown
    }
  };

  return bundle;
}

module.exports = { buildPacketBundle };
