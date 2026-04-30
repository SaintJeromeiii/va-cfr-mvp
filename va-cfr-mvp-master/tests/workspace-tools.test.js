"use strict";

const { createWorkspaceToolsApi } = require("../public/js/workspace-tools");

describe("workspace tools helpers", () => {
  test("orders workspace packet items with primary first, then direct secondaries, then unassigned", () => {
    const conditions = [
      { id: "primary", name: "Primary" },
      { id: "child-a", name: "Child A" },
      { id: "child-b", name: "Child B" },
      { id: "solo", name: "Solo" },
    ];
    const byId = new Map(conditions.map((condition) => [condition.id, condition]));
    const api = createWorkspaceToolsApi({
      getConditions: () => conditions,
      getConditionById: (id) => byId.get(id) || null,
      loadWorkspaceState: () => ({
        primaryId: "primary",
        nodes: ["solo", "child-b", "primary", "child-a"],
        links: [
          { from: "primary", to: "child-a" },
          { from: "primary", to: "child-b" },
        ],
      }),
      loadTimeline: () => [],
      ensureNode: () => {},
      renderWorkspace: () => {},
      renderClaimTree: () => {},
      renderHealthPanel: () => {},
      clearWorkspace: () => {},
      buildWorkspacePacketText: () => "",
      downloadText: () => {},
      exportHealthReport: () => {},
      fixLinkAllOrphansToPrimary: () => {},
      fixAttachDisconnectedToPrimary: () => {},
      makeSharePayload: () => ({}),
      base64UrlEncode: (value) => value,
      generateNarrativeDraft: () => "",
      workspaceTimelineDraft: () => "",
      isLinkedNode: () => false,
      workspaceEvidenceBinderDraft: () => "",
      renderBinderViewer: () => {},
      renderEvidenceGraph: () => {},
      documentRef: {},
      windowRef: { location: { href: "https://example.test" }, localStorage: { removeItem() {} } },
      navigatorRef: { clipboard: { writeText: async () => {} } },
    });

    expect(api.buildOrderedWorkspaceItems().map((condition) => condition.id)).toEqual([
      "primary",
      "child-a",
      "child-b",
      "solo",
    ]);
  });

  test("collects timeline contributors within linked scope", () => {
    const conditions = [
      { id: "primary", name: "Primary" },
      { id: "child", name: "Child" },
      { id: "other", name: "Other" },
    ];
    const byId = new Map(conditions.map((condition) => [condition.id, condition]));
    const api = createWorkspaceToolsApi({
      getConditions: () => conditions,
      getConditionById: (id) => byId.get(id) || null,
      loadWorkspaceState: () => ({
        primaryId: "primary",
        nodes: ["primary", "child", "other"],
        links: [{ from: "primary", to: "child" }],
      }),
      loadTimeline: (id) => {
        if (id === "primary") return [{ id: "1" }];
        if (id === "child") return [{ id: "2" }];
        return [];
      },
      ensureNode: () => {},
      renderWorkspace: () => {},
      renderClaimTree: () => {},
      renderHealthPanel: () => {},
      clearWorkspace: () => {},
      buildWorkspacePacketText: () => "",
      downloadText: () => {},
      exportHealthReport: () => {},
      fixLinkAllOrphansToPrimary: () => {},
      fixAttachDisconnectedToPrimary: () => {},
      makeSharePayload: () => ({}),
      base64UrlEncode: (value) => value,
      generateNarrativeDraft: () => "",
      workspaceTimelineDraft: () => "",
      isLinkedNode: (id, st) => id === st.primaryId || id === "child",
      workspaceEvidenceBinderDraft: () => "",
      renderBinderViewer: () => {},
      renderEvidenceGraph: () => {},
      documentRef: {},
      windowRef: { location: { href: "https://example.test" }, localStorage: { removeItem() {} } },
      navigatorRef: { clipboard: { writeText: async () => {} } },
    });

    expect(api.collectTimelineContributorNames("linked")).toEqual(["Primary", "Child"]);
  });
});
