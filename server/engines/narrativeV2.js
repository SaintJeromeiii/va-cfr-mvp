// server/engines/narrativeV2.js
// Narrative v2: exhibit-cited narrative with edge-backed chain preference.

const { buildPacketBundle } = require("./packetBuilderV2");

function normStr(v) { return (v ?? "").toString().trim(); }
function lower(v) { return normStr(v).toLowerCase(); }
function safeId(x) { return normStr(x?.id || x?._id || x?.uuid || x?.key || x?.evidenceId || x); }

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

function getEdges(state) {
  return state.edges || state.relationships || [];
}

function buildAdj(edges) {
  const adj = new Map(); // id -> Set(id)
  const add = (a, b) => {
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a).add(b);
  };
  for (const e of edges || []) {
    const a = normStr(e.from);
    const b = normStr(e.to);
    if (!a || !b) continue;
    add(a, b);
    add(b, a);
  }
  return adj;
}

function findEdge(edges, a, b) {
  const A = String(a), B = String(b);
  return (edges || []).find(e =>
    (String(e.from) === A && String(e.to) === B) ||
    (String(e.from) === B && String(e.to) === A)
  ) || null;
}

function isConnected(adj, a, b) {
  if (!a || !b) return false;
  if (String(a) === String(b)) return true;
  return adj.get(String(a))?.has(String(b)) || false;
}

function byRole(exhibits) {
  const map = new Map();
  for (const ex of exhibits || []) {
    const k = ex.roleKey || ROLE.OTHER;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(ex);
  }
  // mild preference: higher confidence, more connections
  for (const [k, arr] of map.entries()) {
    arr.sort((a, b) => {
      const ca = (a.roleConfidence ?? 0);
      const cb = (b.roleConfidence ?? 0);
      if (cb !== ca) return cb - ca;
      return (b.edgeCount ?? 0) - (a.edgeCount ?? 0);
    });
  }
  return map;
}

function pickBestExhibit(roleMap, roleKey) {
  const arr = roleMap.get(roleKey) || [];
  return arr[0] || null;
}

function pickChain({ exhibits, adj }) {
  // Preferred chain: in_service -> symptoms -> diagnosis -> nexus -> impact
  // but often you'll have diagnosis/nexus/impact only.
  const roleMap = byRole(exhibits);

  const inSvc = pickBestExhibit(roleMap, ROLE.IN_SERVICE);
  const symptoms = pickBestExhibit(roleMap, ROLE.SYMPTOMS);
  const dx = pickBestExhibit(roleMap, ROLE.DIAGNOSIS);
  const nexus = pickBestExhibit(roleMap, ROLE.NEXUS);
  const impact = pickBestExhibit(roleMap, ROLE.IMPACT);

  // If missing diagnosis but DBQ exists, treat DBQ as dx-ish fallback
  const dbq = pickBestExhibit(roleMap, ROLE.DBQ_CP);
  const dx2 = dx || dbq;

  // Prefer connectedness: if nexus exists, try to ensure dx2<->nexus, nexus<->impact
  // If not connected, pick alternative candidates from those roles that connect.
  function pickConnected(fromEx, roleKey) {
    const candidates = (roleMap.get(roleKey) || []).slice(0, 6);
    if (!fromEx) return candidates[0] || null;
    const hit = candidates.find(c => isConnected(adj, fromEx.evidenceId, c.evidenceId));
    return hit || candidates[0] || null;
  }

  const dxPick = dx2;
  const nexusPick = pickConnected(dxPick, ROLE.NEXUS) || nexus;
  const impactPick = pickConnected(nexusPick, ROLE.IMPACT) || impact;

  const symPick = symptoms ? (inSvc ? pickConnected(inSvc, ROLE.SYMPTOMS) : symptoms) : null;
  const inSvcPick = inSvc;

  return {
    inService: inSvcPick,
    symptoms: symPick,
    diagnosis: dxPick,
    nexus: nexusPick,
    impact: impactPick
  };
}

function cite(exs) {
  const ids = (Array.isArray(exs) ? exs : [exs])
    .filter(Boolean)
    .map(x => x.exhibitId)
    .filter(Boolean);
  if (!ids.length) return "";
  return ` [${ids.join(", ")}]`;
}

function fmtEx(ex) {
  if (!ex) return "(missing)";
  const bits = [];
  bits.push(ex.exhibitId);
  if (ex.date) bits.push(ex.date);
  bits.push(ex.title);
  return bits.join(" • ");
}

function elementStatus(ex) {
  return ex ? "✅" : "⚠️";
}

function buildEdgeNotes({ edges, chain }) {
  const notes = [];
  const pairs = [
    ["Diagnosis → Nexus", chain.diagnosis, chain.nexus],
    ["Nexus → Impact", chain.nexus, chain.impact],
    ["In-service → Symptoms", chain.inService, chain.symptoms],
    ["Symptoms → Diagnosis", chain.symptoms, chain.diagnosis],
  ];

  for (const [label, a, b] of pairs) {
    if (!a || !b) continue;
    const e = findEdge(edges, a.evidenceId, b.evidenceId);
    if (e?.justification) {
      notes.push(`- **${label}**: ${normStr(e.justification)} ${cite([a, b])}`);
    }
  }
  return notes;
}

function buildNarrativeMarkdown({ conditionName, chain, edges }) {
  const dx = chain.diagnosis;
  const nexus = chain.nexus;
  const impact = chain.impact;
  const inSvc = chain.inService;
  const symptoms = chain.symptoms;

  const lines = [];
  lines.push(`# Cited Narrative (v2): ${conditionName}`);
  lines.push(``);
  lines.push(`## Issue`);
  lines.push(`Service connection for **${conditionName}**.`);
  lines.push(``);

  lines.push(`## Elements Checklist`);
  lines.push(`- ${elementStatus(dx)} **Current diagnosis/findings**${cite(dx)}`);
  lines.push(`- ${elementStatus(inSvc)} **In-service event/exposure/onset**${cite(inSvc)}`);
  lines.push(`- ${elementStatus(nexus)} **Nexus (direct/secondary/aggravation)**${cite(nexus)}`);
  lines.push(`- ${elementStatus(impact)} **Severity / functional impact**${cite(impact)}`);
  if (symptoms) lines.push(`- ✅ **Symptoms / continuity**${cite(symptoms)}`);
  lines.push(``);

  lines.push(`## Evidence Chosen (Packet)`);
  lines.push(`- Diagnosis: ${fmtEx(dx)}`);
  lines.push(`- In-service: ${fmtEx(inSvc)}`);
  if (symptoms) lines.push(`- Symptoms: ${fmtEx(symptoms)}`);
  lines.push(`- Nexus: ${fmtEx(nexus)}`);
  lines.push(`- Impact: ${fmtEx(impact)}`);
  lines.push(``);

  // Narrative paragraphs
  lines.push(`## Narrative`);
  lines.push(
    `I am seeking service connection for **${conditionName}**.${cite([dx, inSvc].filter(Boolean))}`
  );

  if (inSvc) {
    lines.push(
      `During service, I experienced an in-service event/exposure/onset relevant to ${conditionName}.${cite(inSvc)}`
    );
  } else {
    lines.push(
      `My service history includes events/exposures relevant to ${conditionName}; additional documentation can further corroborate the in-service element.`
    );
  }

  if (symptoms) {
    lines.push(
      `Since service, I have experienced ongoing symptoms/continuity consistent with ${conditionName}.${cite(symptoms)}`
    );
  }

  if (dx) {
    lines.push(
      `Medical evidence confirms a current diagnosis and/or objective findings consistent with ${conditionName}.${cite(dx)}`
    );
  } else {
    lines.push(
      `Current diagnosis documentation should be added to clearly establish the present condition.`
    );
  }

  if (nexus) {
    lines.push(
      `The medical evidence supports a nexus linking ${conditionName} to service (directly or as secondary/aggravation, as applicable).${cite(nexus)}`
    );
  } else {
    lines.push(
      `A nexus statement/medical opinion would strengthen the causal link between service and ${conditionName}.`
    );
  }

  if (impact) {
    lines.push(
      `The severity and functional impact of ${conditionName} affects daily functioning and/or occupational capacity.${cite(impact)}`
    );
  } else {
    lines.push(
      `Additional functional impact/severity evidence should be added (frequency, limitations, work/ADLs).`
    );
  }

  lines.push(``);
  lines.push(`## Edge-Backed Notes`);
  const edgeNotes = buildEdgeNotes({ edges, chain });
  lines.push(edgeNotes.length ? edgeNotes.join("\n") : `- (No edge justifications found yet — apply recommended links to generate them.)`);

  lines.push(``);
  lines.push(`---`);
  lines.push(`_Generated by VA CFR Finder Narrative v2. Edit for accuracy and specifics._`);

  return lines.join("\n");
}

function buildNarrativeV2({ state, conditionId, selectedEvidenceIds }) {
  // Use Packet v2 to get exhibits + EX ids
  const bundle = buildPacketBundle({ state, conditionId, selectedEvidenceIds });
  if (!bundle.ok) return bundle;

  const conditionName = normStr(bundle.condition?.name || "Unnamed Condition");
  const exhibits = bundle.exhibits || [];
  const edges = getEdges(state);
  const adj = buildAdj(edges);

  const chain = pickChain({ exhibits, adj });

  const narrativeMarkdown = buildNarrativeMarkdown({ conditionName, chain, edges });

  return {
    ok: true,
    condition: bundle.condition,
    chain: {
      inService: chain.inService?.exhibitId || null,
      symptoms: chain.symptoms?.exhibitId || null,
      diagnosis: chain.diagnosis?.exhibitId || null,
      nexus: chain.nexus?.exhibitId || null,
      impact: chain.impact?.exhibitId || null
    },
    narrativeMarkdown
  };
}

module.exports = { buildNarrativeV2 };
