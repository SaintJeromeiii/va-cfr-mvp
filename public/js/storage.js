(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.VaCfrStorageFactory = factory();
  root.VaCfrStorage = root.VaCfrStorageFactory.createStorageApi(root.localStorage);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_WORKSPACE_STATE = { nodes: [], primaryId: "", links: [] };
  const WORKSPACE_KEY = "vaCfrWorkspace:v4";

  function createStorageApi(storage) {
    function readJson(key, fallback) {
      try {
        const raw = storage.getItem(key);
        if (!raw) {
          return fallback;
        }

        const parsed = JSON.parse(raw);
        return parsed == null ? fallback : parsed;
      } catch {
        return fallback;
      }
    }

    function writeJson(key, value) {
      storage.setItem(key, JSON.stringify(value));
    }

    function evidenceKey(conditionId) {
      return `vaCfrEvidence:${conditionId}`;
    }

    function loadEvidenceState(conditionId) {
      return readJson(evidenceKey(conditionId), {});
    }

    function saveEvidenceState(conditionId, stateObj) {
      writeJson(evidenceKey(conditionId), stateObj || {});
    }

    function notesKey(conditionId) {
      return `vaCfrNotes:${conditionId}`;
    }

    function loadNotes(conditionId) {
      return storage.getItem(notesKey(conditionId)) || "";
    }

    function saveNotes(conditionId, text) {
      storage.setItem(notesKey(conditionId), (text ?? "").toString());
    }

    function timelineKey(id) {
      return `vaCfrTimeline:${id}`;
    }

    function loadTimeline(id) {
      const value = readJson(timelineKey(id), []);
      return Array.isArray(value) ? value : [];
    }

    function saveTimeline(id, entries) {
      writeJson(timelineKey(id), entries || []);
    }

    function evidenceLinksKey(id) {
      return `vaCfrEvidenceLinks:${id}`;
    }

    function loadEvidenceLinks(id) {
      const value = readJson(evidenceLinksKey(id), []);
      return Array.isArray(value) ? value : [];
    }

    function saveEvidenceLinks(id, links) {
      writeJson(evidenceLinksKey(id), links || []);
    }

    function evidenceRelStoreKey() {
      return "vaCfrEvidenceRelations:v1";
    }

    function loadEvidenceRelations() {
      const value = readJson(evidenceRelStoreKey(), {});
      return value && typeof value === "object" ? value : {};
    }

    function saveEvidenceRelations(rel) {
      writeJson(evidenceRelStoreKey(), rel || {});
    }

    function loadWorkspaceState() {
      const parsed = readJson(WORKSPACE_KEY, DEFAULT_WORKSPACE_STATE);

      if (parsed && Array.isArray(parsed.ids) && Array.isArray(parsed.secondary)) {
        const nodes = parsed.ids;
        const primaryId = parsed.primaryId || nodes[0] || "";
        const links = (parsed.secondary || [])
          .filter((item) => item && typeof item.id === "string")
          .map((item) => ({ from: primaryId, to: item.id, type: item.type || "Secondary to" }));
        return { nodes, primaryId, links };
      }

      if (parsed && Array.isArray(parsed.ids) && Array.isArray(parsed.secondaryIds)) {
        const nodes = parsed.ids;
        const primaryId = parsed.primaryId || nodes[0] || "";
        const links = (parsed.secondaryIds || [])
          .filter(Boolean)
          .map((id) => ({ from: primaryId, to: id, type: "Secondary to" }));
        return { nodes, primaryId, links };
      }

      if (Array.isArray(parsed)) {
        const nodes = parsed;
        const primaryId = nodes[0] || "";
        const links = nodes.slice(1).map((id) => ({ from: primaryId, to: id, type: "Secondary to" }));
        return { nodes, primaryId, links };
      }

      const nodes = Array.isArray(parsed.nodes)
        ? parsed.nodes.filter((item) => typeof item === "string")
        : [];
      const primaryId = typeof parsed.primaryId === "string" ? parsed.primaryId : "";
      const links = Array.isArray(parsed.links) ? parsed.links : [];

      const cleanLinks = links
        .filter((link) => link && typeof link.from === "string" && typeof link.to === "string")
        .map((link) => ({
          from: link.from,
          to: link.to,
          type: typeof link.type === "string" ? link.type : "Secondary to",
        }));

      return { nodes, primaryId, links: cleanLinks };
    }

    function saveWorkspaceState(st) {
      writeJson(WORKSPACE_KEY, st || DEFAULT_WORKSPACE_STATE);
    }

    return {
      evidenceKey,
      loadEvidenceState,
      saveEvidenceState,
      notesKey,
      loadNotes,
      saveNotes,
      timelineKey,
      loadTimeline,
      saveTimeline,
      evidenceLinksKey,
      loadEvidenceLinks,
      saveEvidenceLinks,
      evidenceRelStoreKey,
      loadEvidenceRelations,
      saveEvidenceRelations,
      WORKSPACE_KEY,
      loadWorkspaceState,
      saveWorkspaceState,
    };
  }

  return { createStorageApi, DEFAULT_WORKSPACE_STATE, WORKSPACE_KEY };
});
