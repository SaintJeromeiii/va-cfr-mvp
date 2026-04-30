(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.VaCfrWorkspaceToolsFactory = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createWorkspaceToolsApi(deps) {
    const {
      documentRef = document,
      windowRef = window,
      navigatorRef = typeof navigator !== "undefined" ? navigator : null,
      getConditions,
      getConditionById,
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
      alertFn = (msg) => alert(msg),
      confirmFn = async () => true,
    } = deps;

    function buildOrderedWorkspaceItems(workspaceState) {
      const st = workspaceState || loadWorkspaceState();
      const primary = st.primaryId ? getConditionById(st.primaryId) : null;
      const secondaries = (st.links || [])
        .filter((link) => link.from === st.primaryId)
        .map((link) => getConditionById(link.to))
        .filter(Boolean);
      const unassigned = (st.nodes || [])
        .filter((id) => id !== st.primaryId && !(st.links || []).some((link) => link.from === st.primaryId && link.to === id))
        .map((id) => getConditionById(id))
        .filter(Boolean);

      return [...(primary ? [primary] : []), ...secondaries, ...unassigned];
    }

    function collectTimelineContributorNames(scope) {
      const st = loadWorkspaceState();
      let ids = (st.nodes || []).slice();

      if (scope === "primary") {
        ids = st.primaryId ? [st.primaryId] : [];
      } else if (scope === "linked") {
        ids = ids.filter((id) => isLinkedNode(id, st));
        if (st.primaryId && !ids.includes(st.primaryId)) ids.unshift(st.primaryId);
      }

      return ids
        .filter((id) => {
          const entries = loadTimeline(id);
          return Array.isArray(entries) && entries.length > 0;
        })
        .map((id) => {
          const condition = getConditionById(id);
          return condition ? condition.name : id;
        });
    }

    function mountWorkspaceTools() {
      const wsExport = documentRef.getElementById("wsExport");
      const wsClear = documentRef.getElementById("wsClear");
      const wsShowTips = documentRef.getElementById("wsShowTips");
      const wsFixOrphans = documentRef.getElementById("wsFixOrphans");
      const wsFixDisconnected = documentRef.getElementById("wsFixDisconnected");
      const wsHealthExport = documentRef.getElementById("wsHealthExport");
      const wsCopyShare = documentRef.getElementById("wsCopyShare");
      const wsNarrativeBtn = documentRef.getElementById("wsNarrativeBtn");
      const wsNarrativeCopy = documentRef.getElementById("wsNarrativeCopy");
      const wsNarrativeDownload = documentRef.getElementById("wsNarrativeDownload");
      const wsNarrativeClear = documentRef.getElementById("wsNarrativeClear");
      const wsNarrativeOut = documentRef.getElementById("wsNarrativeOut");
      const wsNarrativeLinkedOnly = documentRef.getElementById("wsNarrativeLinkedOnly");
      const wsNarrativeStyle = documentRef.getElementById("wsNarrativeStyle");
      const wsTimelineBtn = documentRef.getElementById("wsTimelineBtn");
      const wsTimelineCopy = documentRef.getElementById("wsTimelineCopy");
      const wsTimelineDownload = documentRef.getElementById("wsTimelineDownload");
      const wsTimelineOut = documentRef.getElementById("wsTimelineOut");
      const wsTimelineScope = documentRef.getElementById("wsTimelineScope");
      const wsTimelineInclude = documentRef.getElementById("wsTimelineInclude");
      const wsTimelineContrib = documentRef.getElementById("wsTimelineContrib");
      const wsBinderBtn = documentRef.getElementById("wsBinderBtn");
      const wsBinderCopy = documentRef.getElementById("wsBinderCopy");
      const wsBinderDownload = documentRef.getElementById("wsBinderDownload");
      const wsBinderOut = documentRef.getElementById("wsBinderOut");
      const wsBinderScope = documentRef.getElementById("wsBinderScope");
      const wsBinderSort = documentRef.getElementById("wsBinderSort");
      const wsBinderView = documentRef.getElementById("wsBinderView");
      const wsBinderShowViewer = documentRef.getElementById("wsBinderShowViewer");
      const wsGraphBuild = documentRef.getElementById("wsGraphBuild");
      const wsGraphFit = documentRef.getElementById("wsGraphFit");
      const wsGraphScope = documentRef.getElementById("wsGraphScope");
      const wsGraphHideOrphans = documentRef.getElementById("wsGraphHideOrphans");
      const wsGraphShowLabelOnly = documentRef.getElementById("wsGraphShowLabelOnly");

      function refreshWorkspaceViews() {
        renderWorkspace();
        renderClaimTree();
        renderHealthPanel();
      }

      function narrativeOptions() {
        return {
          linkedOnly: !!wsNarrativeLinkedOnly?.checked,
          style: wsNarrativeStyle?.value || "concise",
        };
      }

      function regenIfAnyNarrativeText() {
        if (!wsNarrativeOut || !wsNarrativeOut.value.trim()) return;
        wsNarrativeOut.value = generateNarrativeDraft(narrativeOptions());
      }

      function regenWsTimeline() {
        const scope = wsTimelineScope?.value || "all";
        const text = workspaceTimelineDraft(scope);
        if (wsTimelineOut) wsTimelineOut.value = text;

        const contributors = collectTimelineContributorNames(scope);
        if (wsTimelineContrib) {
          wsTimelineContrib.textContent = contributors.length
            ? `Timeline contributors: ${contributors.join(", ")}`
            : "No timeline entries found in selected scope.";
        }
      }

      function regenBinder() {
        const scope = wsBinderScope?.value || "all";
        const sortMode = wsBinderSort?.value || "date";
        const viewMode = wsBinderView?.value || "flat";
        const text = workspaceEvidenceBinderDraft(scope, sortMode, viewMode);
        if (wsBinderOut) wsBinderOut.value = text;
        renderBinderViewer({ scope, sortMode, viewMode });
      }

      function buildGraphNow() {
        const scope = wsGraphScope?.value || "all";
        const hideOrphans = !!wsGraphHideOrphans?.checked;
        renderEvidenceGraph({ scope, hideOrphans });
      }

      if (wsClear) {
        wsClear.addEventListener("click", async () => {
          const confirmed = await confirmFn({
            title: "Clear workspace?",
            message: "This will remove the current workspace tree, links, and progress state from the page.",
            confirmLabel: "Clear workspace",
          });
          if (!confirmed) return;
          clearWorkspace();
          refreshWorkspaceViews();
          alertFn("Workspace cleared.");
        });
      }

      if (wsExport) {
        wsExport.addEventListener("click", () => {
          const text = buildWorkspacePacketText(buildOrderedWorkspaceItems(loadWorkspaceState()));
          downloadText("claim_workspace_packet.txt", text);
        });
      }

      if (wsShowTips) {
        wsShowTips.addEventListener("click", () => {
          try {
            documentRef.querySelectorAll(".helpTip").forEach((el) => {
              const id = el.dataset.tipId || "";
              if (id) windowRef.localStorage?.removeItem(`vaCfrTipDismissed:${id}`);
              el.style.display = "";
            });
            alertFn("Tips re-enabled.");
          } catch (_) {
            alertFn("Could not re-enable tips.");
          }
        });
      }

      if (wsFixOrphans) {
        wsFixOrphans.addEventListener("click", () => {
          fixLinkAllOrphansToPrimary();
          refreshWorkspaceViews();
        });
      }

      if (wsFixDisconnected) {
        wsFixDisconnected.addEventListener("click", () => {
          fixAttachDisconnectedToPrimary();
          refreshWorkspaceViews();
        });
      }

      if (wsHealthExport) {
        wsHealthExport.addEventListener("click", () => exportHealthReport());
      }

      if (wsCopyShare) {
        wsCopyShare.addEventListener("click", async () => {
          const payload = makeSharePayload();
          const token = base64UrlEncode(JSON.stringify(payload));
          const url = new URL(windowRef.location.href);
          url.searchParams.set("ws", token);
          await navigatorRef.clipboard.writeText(url.toString());
          alertFn("Share link copied!");
        });
      }

      if (wsNarrativeBtn && wsNarrativeOut) {
        wsNarrativeBtn.addEventListener("click", () => {
          wsNarrativeOut.value = generateNarrativeDraft(narrativeOptions());
        });
      }

      if (wsNarrativeCopy && wsNarrativeOut) {
        wsNarrativeCopy.addEventListener("click", async () => {
          await navigatorRef.clipboard.writeText(wsNarrativeOut.value || "");
          alertFn("Narrative copied!");
        });
      }

      if (wsNarrativeDownload && wsNarrativeOut) {
        wsNarrativeDownload.addEventListener("click", () => {
          downloadText("claim_narrative_draft.txt", wsNarrativeOut.value || generateNarrativeDraft(narrativeOptions()));
        });
      }

      if (wsNarrativeClear && wsNarrativeOut) {
        wsNarrativeClear.addEventListener("click", async () => {
          if (!wsNarrativeOut.value.trim()) return;
          const confirmed = await confirmFn({
            title: "Clear narrative draft?",
            message: "This only clears the generated draft text shown in the panel.",
            confirmLabel: "Clear draft",
          });
          if (!confirmed) return;
          wsNarrativeOut.value = "";
        });
      }

      if (wsNarrativeLinkedOnly) wsNarrativeLinkedOnly.addEventListener("change", regenIfAnyNarrativeText);
      if (wsNarrativeStyle) wsNarrativeStyle.addEventListener("change", regenIfAnyNarrativeText);

      if (wsTimelineBtn) wsTimelineBtn.addEventListener("click", regenWsTimeline);

      if (wsTimelineInclude) {
        wsTimelineInclude.addEventListener("click", () => {
          const idsWithTimeline = [];
          (getConditions() || []).forEach((condition) => {
            try {
              const entries = loadTimeline(condition.id);
              if (Array.isArray(entries) && entries.length) idsWithTimeline.push(condition.id);
            } catch (_) {}
          });

          if (!idsWithTimeline.length) {
            alertFn("No timeline entries found across conditions.");
            return;
          }

          idsWithTimeline.forEach((id) => ensureNode(id));
          renderWorkspace();
          alertFn(`Added ${idsWithTimeline.length} condition(s) with timeline entries to workspace.`);
          regenWsTimeline();
        });
      }

      if (wsTimelineCopy && wsTimelineOut) {
        wsTimelineCopy.addEventListener("click", async () => {
          await navigatorRef.clipboard.writeText(wsTimelineOut.value || "");
          alertFn("Timeline copied!");
        });
      }

      if (wsTimelineDownload && wsTimelineOut) {
        wsTimelineDownload.addEventListener("click", () => {
          const scope = wsTimelineScope?.value || "all";
          downloadText(`workspace_timeline_${scope}.txt`, wsTimelineOut.value || workspaceTimelineDraft(scope));
        });
      }

      if (wsTimelineScope) {
        wsTimelineScope.addEventListener("change", () => {
          if (wsTimelineOut && wsTimelineOut.value.trim()) regenWsTimeline();
        });
      }

      if (wsBinderBtn) wsBinderBtn.addEventListener("click", regenBinder);

      if (wsBinderCopy && wsBinderOut) {
        wsBinderCopy.addEventListener("click", async () => {
          await navigatorRef.clipboard.writeText(wsBinderOut.value || "");
          alertFn("Binder copied!");
        });
      }

      if (wsBinderDownload && wsBinderOut) {
        wsBinderDownload.addEventListener("click", () => {
          const scope = wsBinderScope?.value || "all";
          const sortMode = wsBinderSort?.value || "date";
          const viewMode = wsBinderView?.value || "flat";
          downloadText(
            `workspace_evidence_binder_${scope}_${sortMode}_${viewMode}.txt`,
            wsBinderOut.value || workspaceEvidenceBinderDraft(scope, sortMode, viewMode),
          );
        });
      }

      if (wsBinderScope) {
        wsBinderScope.addEventListener("change", () => {
          if (wsBinderOut && wsBinderOut.value.trim()) regenBinder();
        });
      }

      if (wsBinderSort) {
        wsBinderSort.addEventListener("change", () => {
          if (wsBinderOut && wsBinderOut.value.trim()) regenBinder();
        });
      }

      if (wsBinderView) {
        wsBinderView.addEventListener("change", () => {
          if (wsBinderOut && wsBinderOut.value.trim()) regenBinder();
        });
      }

      if (wsBinderShowViewer) {
        wsBinderShowViewer.addEventListener("change", () => {
          if (wsBinderOut && wsBinderOut.value.trim()) regenBinder();
        });
      }

      if (wsGraphBuild) wsGraphBuild.addEventListener("click", buildGraphNow);

      if (wsGraphFit && wsGraphBuild) {
        wsGraphFit.addEventListener("click", () => {
          const svg = documentRef.querySelector("#wsGraph svg");
          if (svg && svg.__fit) svg.__fit();
        });
      }

      if (wsGraphScope) {
        wsGraphScope.addEventListener("change", () => {
          const svg = documentRef.querySelector("#wsGraph svg");
          if (svg) buildGraphNow();
        });
      }

      if (wsGraphHideOrphans) {
        wsGraphHideOrphans.addEventListener("change", () => {
          const svg = documentRef.querySelector("#wsGraph svg");
          if (svg) buildGraphNow();
        });
      }

      if (wsGraphShowLabelOnly) {
        wsGraphShowLabelOnly.addEventListener("change", () => {
          const svg = documentRef.querySelector("#wsGraph svg");
          if (svg) buildGraphNow();
        });
      }
    }

    return {
      buildOrderedWorkspaceItems,
      collectTimelineContributorNames,
      mountWorkspaceTools,
    };
  }

  return { createWorkspaceToolsApi };
});
