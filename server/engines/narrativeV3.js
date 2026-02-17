// server/engines/narrativeV3.js
// Narrative v3: DC-aware severity strategy + cited recommendations (uses Packet v2 exhibits)

const { buildPacketBundle } = require("./packetBuilderV2");
const { buildNarrativeV2 } = require("./narrativeV2");

function normStr(v) { return (v ?? "").toString().trim(); }
function lower(v) { return normStr(v).toLowerCase(); }
function safeId(x) { return normStr(x?.id || x?._id || x?.uuid || x?.key || x?.evidenceId || x); }

function getConditionById(state, conditionId) {
  const list = state.conditions || state.conditionList || [];
  return list.find(c => String(safeId(c)) === String(conditionId)) || null;
}

function getDcCriteriaCatalog(state) {
  // Flexible: support whichever you already have.
  // Expected shapes (any one is fine):
  // state.dcCriteria = { "8100": { name, levels:[{pct, requires:[...], keywords:[...]}, ...] }, ... }
  // state.cfrMapping.dcCriteria = ...
  // state.cfr?.dcCriteria = ...
  return (
    state.dcCriteria ||
    state.cfrMapping?.dcCriteria ||
    state.cfr?.dcCriteria ||
    {}
  );
}

function defaultGenericCriteriaForDc(dc) {
  // Safe fallback when you don't have tier text. Still useful.
  return {
    dc,
    name: "Severity Strategy (generic)",
    levels: [
      { pct: "Low", requires: ["Symptom frequency", "Duration", "Treatment attempts"], keywords: ["frequency", "duration", "treatment", "medication"] },
      { pct: "Mid", requires: ["Functional impact (work/ADLs)", "Objective findings if applicable", "Flare documentation"], keywords: ["limitations", "work", "adl", "flare", "severity"] },
      { pct: "High", requires: ["Severe functional impairment", "Consistency across records", "Provider statement/DBQ language"], keywords: ["unable", "missed work", "incapacitating", "dbq", "examiner"] }
    ]
  };
}

function pickDcModels({ readiness, dcCatalog }) {
  const dcs = readiness?.cfr?.dcs || [];
  const picked = [];

  for (const dc of dcs) {
    const key = String(dc).trim();
    if (!key) continue;

    const found = dcCatalog[key];
    if (found?.levels?.length) {
      picked.push({
        dc: key,
        name: found.name || found.title || `DC ${key}`,
        levels: found.levels.map(l => ({
          pct: l.pct ?? l.percent ?? l.rating ?? "",
          requires: l.requires || l.elements || l.criteria || [],
          keywords: l.keywords || l.tokens || []
        }))
      });
    } else {
      picked.push(defaultGenericCriteriaForDc(key));
    }
  }

  // If no DCs, return a generic model
  if (!picked.length) picked.push(defaultGenericCriteriaForDc("N/A"));

  return picked;
}

function cite(exs) {
  const ids = (Array.isArray(exs) ? exs : [exs])
    .filter(Boolean)
    .map(x => x.exhibitId)
    .filter(Boolean);
  return ids.length ? ` [${ids.join(", ")}]` : "";
}

function exhibitsText(ex) {
  return lower(`${ex.title || ""} ${ex.type || ""} ${ex.snippet || ""} ${ex.roleLabel || ""}`);
}

function findSupportExhibitsForKeywords(exhibits, keywords) {
  if (!keywords?.length) return [];
  const keys = keywords.map(lower).filter(Boolean);
  const scored = exhibits.map(ex => {
    const blob = exhibitsText(ex);
    const hits = keys.reduce((n, k) => n + (blob.includes(k) ? 1 : 0), 0);
    return { ex, hits };
  }).filter(x => x.hits > 0);

  scored.sort((a, b) => b.hits - a.hits || (b.ex.edgeCount ?? 0) - (a.ex.edgeCount ?? 0));
  return scored.slice(0, 3).map(x => x.ex);
}

function buildSeverityStrategyMarkdown({ conditionName, dcModels, exhibits }) {
  const lines = [];
  lines.push(`## Severity Strategy (DC-aware)`);
  lines.push(`This section helps you target the strongest rating argument by documenting the right severity elements.`);

  for (const dc of dcModels) {
    lines.push(``);
    lines.push(`### DC ${dc.dc}${dc.name ? ` — ${dc.name}` : ""}`);

    // For each tier, show: To support X, document requires + which exhibits already support it
    for (const lvl of (dc.levels || [])) {
      const pct = normStr(lvl.pct) || "Tier";
      const requires = (lvl.requires || []).map(normStr).filter(Boolean);
      const keywords = (lvl.keywords || []).map(normStr).filter(Boolean);

      const supporting = findSupportExhibitsForKeywords(exhibits, keywords);

      lines.push(``);
      lines.push(`**To support ${pct}:**`);
      if (requires.length) {
        lines.push(`- Document: ${requires.join("; ")}`);
      } else {
        lines.push(`- Document: frequency, severity, functional impact, and treatment history.`);
      }

      if (keywords.length) {
        lines.push(`- Keywords to include (DBQ/lay/provider): ${keywords.join(", ")}`);
      }

      if (supporting.length) {
        lines.push(`- Best current exhibits: ${supporting.map(x => x.exhibitId).join(", ")}${cite(supporting)}`);
      } else {
        lines.push(`- Best current exhibits: _(none detected — add Impact/DBQ/Symptoms evidence)_`);
      }
    }

    // Missing checklist (overall)
    const allKeywords = (dc.levels || []).flatMap(l => l.keywords || []).map(lower).filter(Boolean);
    const blobAll = lower(exhibits.map(ex => `${ex.title} ${ex.snippet} ${ex.type}`).join(" "));
    const missing = [...new Set(allKeywords)].filter(k => !blobAll.includes(k)).slice(0, 12);

    lines.push(``);
    lines.push(`**Missing severity evidence (keyword scan):**`);
    if (missing.length) {
      lines.push(missing.map(k => `- [ ] ${k}`).join("\n"));
    } else {
      lines.push(`- (No obvious keyword gaps found from available criteria.)`);
    }
  }

  return lines.join("\n");
}

function buildNarrativeV3({ state, conditionId, selectedEvidenceIds }) {
  // 1) Build packet (EX-IDs + exhibits)
  const packet = buildPacketBundle({ state, conditionId, selectedEvidenceIds });
  if (!packet.ok) return packet;

  // 2) Narrative v2 baseline
  const nar2 = buildNarrativeV2({ state, conditionId, selectedEvidenceIds });
  const nar2Text = nar2.ok ? nar2.narrativeMarkdown : "";

  const conditionName = normStr(packet.condition?.name || "Unnamed Condition");

  // 3) DC models (real criteria if present; generic fallback otherwise)
  const dcCatalog = getDcCriteriaCatalog(state);
  const dcModels = pickDcModels({ readiness: packet.readiness, dcCatalog });

  // 4) Build strategy section from exhibits (prefer Impact/DBQ/Symptoms but allow all)
  const exhibits = packet.exhibits || [];
  const strategy = buildSeverityStrategyMarkdown({ conditionName, dcModels, exhibits });

  const narrativeMarkdown = [
    nar2Text || `# Cited Narrative (v2): ${conditionName}\n\n_(Narrative v2 unavailable)_`,
    ``,
    strategy,
    ``,
    `---`,
    `_Generated by VA CFR Finder Narrative v3. Edit for accuracy._`
  ].join("\n");

  return {
    ok: true,
    condition: packet.condition,
    dcs: packet.readiness?.cfr?.dcs || [],
    narrativeMarkdown
  };
}

module.exports = { buildNarrativeV3 };
