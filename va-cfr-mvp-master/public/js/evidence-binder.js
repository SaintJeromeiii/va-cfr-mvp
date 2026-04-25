(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.VaCfrEvidenceBinderFactory = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STOP_WORDS = new Set([
    "the", "a", "an", "and", "or", "of", "for", "to", "in", "on", "with", "without", "by",
    "from", "at", "as", "is", "are", "was", "were", "be", "been", "being",
    "note", "notes", "report", "records", "record", "medical", "doc", "document",
    "exam", "c&p", "cp", "va", "veteran", "statement", "letter", "form", "dbq",
    "results", "test", "tests", "visit", "clinic", "hospital"
  ]);

  function freqMap(arr) {
    const map = new Map();
    (arr || []).forEach((value) => {
      const key = (value ?? "").toString().trim();
      if (!key) return;
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }

  function topKFromFreq(map, k = 2) {
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, k)
      .map(([name]) => name);
  }

  function tokenizeLabel(text) {
    const normalized = (text || "")
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!normalized) return [];

    return normalized
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
      .filter((token) => !STOP_WORDS.has(token))
      .filter((token) => !/^\d+$/.test(token));
  }

  function keywordSummaryFromEntries(entries, maxWords = 3) {
    const tokens = [];

    (entries || []).forEach((entry) => {
      tokenizeLabel(entry.label).forEach((token) => tokens.push(token));
      tokenizeLabel(entry.note).forEach((token) => tokens.push(token));
    });

    if (!tokens.length) return "";
    return topKFromFreq(freqMap(tokens), maxWords).join(" / ");
  }

  function labelCluster(entries) {
    const allConditions = [];
    const allTypes = [];

    (entries || []).forEach((entry) => {
      (entry.conditions || []).forEach((condition) => allConditions.push(condition));
      if (entry.type) allTypes.push(entry.type);
    });

    const condTop = topKFromFreq(freqMap(allConditions), 2);
    const typeTop = topKFromFreq(freqMap(allTypes), 1);
    const condLabel = condTop.length ? condTop.join(" + ") : "Mixed conditions";
    const typeLabel = typeTop.length ? typeTop[0] : "Mixed evidence";
    const keywords = keywordSummaryFromEntries(entries, 3);

    if (keywords) {
      return `${keywords} (${typeLabel}) — ${condLabel}`;
    }

    return `${condLabel} (${typeLabel})`;
  }

  function clusterLabelConfidence(entries) {
    const allConditions = [];
    const allTypes = [];

    (entries || []).forEach((entry) => {
      (entry.conditions || []).forEach((condition) => allConditions.push(condition));
      if (entry.type) allTypes.push(entry.type);
    });

    const condFreq = freqMap(allConditions);
    const typeFreq = freqMap(allTypes);
    const totalCond = allConditions.length || 1;
    const totalType = allTypes.length || 1;
    const topCondCount = [...condFreq.values()].sort((a, b) => b - a)[0] || 0;
    const topTypeCount = [...typeFreq.values()].sort((a, b) => b - a)[0] || 0;

    return {
      condPct: Math.round((topCondCount / totalCond) * 100),
      typePct: Math.round((topTypeCount / totalType) * 100),
    };
  }

  function createEvidenceBinderApi(deps) {
    const {
      loadWorkspaceState,
      isLinkedNode,
      getConditionById,
      loadEvidenceLinks,
      normalizeUrl,
      base64UrlEncode,
      toSortableDateKey,
      relatedEvidenceKeys,
      loadEvidenceRelations,
      now = () => new Date().toLocaleString(),
    } = deps;

    function scopeWorkspaceIds(scope = "all") {
      const st = loadWorkspaceState();
      const primaryId = st.primaryId || "";
      let ids = (st.nodes || []).slice();

      if (scope === "primary") {
        ids = primaryId ? [primaryId] : [];
      } else if (scope === "linked") {
        ids = ids.filter((id) => isLinkedNode(id, st));
        if (primaryId && !ids.includes(primaryId)) ids.unshift(primaryId);
      }

      return { st, ids };
    }

    function buildBinderEntries(scope = "all") {
      const { ids } = scopeWorkspaceIds(scope);
      const byUrl = new Map();

      ids.forEach((id) => {
        const condition = getConditionById(id);
        if (!condition) return;

        const links = loadEvidenceLinks(id);
        links.forEach((link) => {
          let key = normalizeUrl(link.url);
          let synthetic = false;

          if (!key) {
            const seed = `${(link.label || "").trim()}::${(link.date || "").trim()}::${(link.note || "").trim()}`;
            key = `label-${base64UrlEncode(seed || String(Math.random()))}`;
            synthetic = true;
          }

          if (!byUrl.has(key)) {
            byUrl.set(key, {
              url: link.url || "",
              urlKey: key,
              label: link.label || "",
              type: link.type || "Other",
              date: link.date || "",
              note: link.note || "",
              conditions: new Set([condition.name]),
              synthetic,
            });
            return;
          }

          const entry = byUrl.get(key);
          entry.conditions.add(condition.name);
          if (!entry.label && link.label) entry.label = link.label;
          if ((!entry.type || entry.type === "Other") && link.type) entry.type = link.type;
          if (!entry.date && link.date) entry.date = link.date;
          if (link.note && !entry.note) entry.note = link.note;
        });
      });

      return [...byUrl.values()].map((entry) => ({
        ...entry,
        conditions: [...entry.conditions].sort(),
      }));
    }

    function sortBinderEntries(entries, sortMode = "date") {
      const sorted = (entries || []).slice();

      if (sortMode === "type") {
        sorted.sort((a, b) =>
          (a.type || "").localeCompare(b.type || "") ||
          toSortableDateKey(a.date).localeCompare(toSortableDateKey(b.date)) ||
          (a.label || "").localeCompare(b.label || ""),
        );
      } else if (sortMode === "condition") {
        sorted.sort((a, b) =>
          (a.conditions?.[0] || "").localeCompare(b.conditions?.[0] || "") ||
          toSortableDateKey(a.date).localeCompare(toSortableDateKey(b.date)) ||
          (a.label || "").localeCompare(b.label || ""),
        );
      } else {
        sorted.sort((a, b) =>
          toSortableDateKey(a.date).localeCompare(toSortableDateKey(b.date)) ||
          (a.type || "").localeCompare(b.type || "") ||
          (a.label || "").localeCompare(b.label || ""),
        );
      }

      return sorted;
    }

    function findEvidenceClusters(urlKeys) {
      const rel = loadEvidenceRelations();
      const inScope = new Set(urlKeys || []);
      const adj = new Map();

      (urlKeys || []).forEach((key) => adj.set(key, []));
      (urlKeys || []).forEach((key) => {
        const neighbors = Array.isArray(rel[key]) ? rel[key] : [];
        neighbors.forEach((neighbor) => {
          if (inScope.has(neighbor)) adj.get(key).push(neighbor);
        });
      });

      const visited = new Set();
      const clusters = [];

      for (const key of urlKeys || []) {
        if (visited.has(key)) continue;

        const stack = [key];
        visited.add(key);
        const component = [];

        while (stack.length) {
          const current = stack.pop();
          component.push(current);
          (adj.get(current) || []).forEach((neighbor) => {
            if (!visited.has(neighbor)) {
              visited.add(neighbor);
              stack.push(neighbor);
            }
          });
        }

        clusters.push(component);
      }

      clusters.sort((a, b) => b.length - a.length);
      return clusters;
    }

    function buildEvidenceGraphData(scope = "all", hideOrphans = false) {
      const entries = buildBinderEntries(scope);
      const entryByKey = new Map(entries.map((entry) => [entry.urlKey, entry]));
      const rel = loadEvidenceRelations();
      const inScope = new Set(entries.map((entry) => entry.urlKey));
      const edges = [];
      const degree = new Map();
      const seen = new Set();

      inScope.forEach((key) => degree.set(key, 0));
      inScope.forEach((a) => {
        const neighbors = Array.isArray(rel[a]) ? rel[a] : [];
        neighbors.forEach((b) => {
          if (!inScope.has(b)) return;
          const edgeKey = a < b ? `${a}__${b}` : `${b}__${a}`;
          if (seen.has(edgeKey)) return;
          seen.add(edgeKey);
          edges.push({ source: a, target: b });
        });
      });

      edges.forEach((edge) => {
        degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
        degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
      });

      const nodes = [];
      for (const key of inScope) {
        const nodeDegree = degree.get(key) || 0;
        if (hideOrphans && nodeDegree === 0) continue;

        const meta = entryByKey.get(key);
        nodes.push({
          id: key,
          url: meta?.url || "",
          label: meta?.label || "(Evidence)",
          type: meta?.type || "Other",
          date: meta?.date || "",
          note: meta?.note || "",
          synthetic: meta?.synthetic || false,
          conditions: meta?.conditions || [],
          degree: nodeDegree,
        });
      }

      const nodeSet = new Set(nodes.map((node) => node.id));
      return {
        nodes,
        edges: edges.filter((edge) => nodeSet.has(edge.source) && nodeSet.has(edge.target)),
      };
    }

    function workspaceEvidenceBinderDraft(scope = "all", sortMode = "date", viewMode = "flat") {
      const merged = sortBinderEntries(buildBinderEntries(scope), sortMode);

      if (viewMode === "cluster") {
        const entryByKey = new Map();
        merged.forEach((entry) => entryByKey.set(entry.urlKey, entry));

        const lines = [];
        lines.push("VA CFR Finder — Workspace Evidence Binder (Clustered)");
        lines.push(now());
        lines.push(`Scope: ${scope} | Sort: ${sortMode} | View: ${viewMode}`);
        lines.push("");

        const clusters = findEvidenceClusters(merged.map((entry) => entry.urlKey));
        clusters.forEach((clusterKeys, idx) => {
          const entries = sortBinderEntries(
            clusterKeys.map((key) => entryByKey.get(key)).filter(Boolean),
            sortMode,
          );
          const clusterName = labelCluster(entries);
          const conf = clusterLabelConfidence(entries);

          lines.push(`=== Cluster ${idx + 1}: ${clusterName} (${entries.length} item${entries.length === 1 ? "" : "s"}) ===`);
          lines.push(`(Label confidence: Conditions ${conf.condPct}%, Type ${conf.typePct}%)`);

          entries.forEach((entry, entryIdx) => {
            lines.push(`  #${entryIdx + 1} ${entry.label || "Evidence"}`);
            if (entry.date) lines.push(`  Date: ${entry.date}`);
            if (entry.type) lines.push(`  Type: ${entry.type}`);
            lines.push(`  Conditions: ${(entry.conditions || []).join(", ")}`);
            lines.push(`  URL: ${entry.url}`);
            if (entry.note) lines.push(`  Notes: ${entry.note}`);
            lines.push("");
          });

          lines.push("");
        });

        if (!clusters.length) lines.push("(No evidence links found in this scope.)");
        return lines.join("\n");
      }

      const lines = [];
      lines.push("VA CFR Finder — Workspace Evidence Binder (Educational / Local list)");
      lines.push(now());
      lines.push(`Scope: ${scope} | Sort: ${sortMode}`);
      lines.push("");

      if (!merged.length) {
        lines.push("(No evidence links found in this scope.)");
        return lines.join("\n");
      }

      merged.forEach((entry, idx) => {
        lines.push(`#${idx + 1} ${entry.label || "Evidence"}`);
        if (entry.date) lines.push(`Date: ${entry.date}`);
        if (entry.type) lines.push(`Type: ${entry.type}`);
        lines.push(`Conditions: ${(entry.conditions || []).join(", ")}`);
        lines.push(`URL: ${entry.url}`);
        const related = relatedEvidenceKeys(entry.url);
        if (related.length) lines.push(`Related URLs: ${related.length}`);
        if (entry.note) lines.push(`Notes: ${entry.note}`);
        lines.push("");
      });

      return lines.join("\n");
    }

    function binderStats(scope = "all") {
      const { ids } = scopeWorkspaceIds(scope);
      let total = 0;
      const unique = new Set();

      ids.forEach((id) => {
        const links = loadEvidenceLinks(id);
        links.forEach((link) => {
          if (link?.url) {
            total += 1;
            unique.add(normalizeUrl(link.url));
          }
        });
      });

      return { total, unique: unique.size };
    }

    return {
      buildBinderEntries,
      sortBinderEntries,
      findEvidenceClusters,
      labelCluster,
      clusterLabelConfidence,
      buildEvidenceGraphData,
      workspaceEvidenceBinderDraft,
      binderStats,
    };
  }

  return {
    createEvidenceBinderApi,
    labelCluster,
  };
});
