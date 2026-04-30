"use strict";

const { createWorkspaceDraftsApi } = require("../public/js/workspace-drafts");

describe("workspace drafts helpers", () => {
  const api = createWorkspaceDraftsApi({
    loadWorkspaceState: () => ({
      nodes: ["ptsd", "migraines"],
      primaryId: "ptsd",
      links: [{ from: "ptsd", to: "migraines", type: "Secondary to" }],
    }),
    getConditionById: (id) =>
      id === "ptsd"
        ? { id: "ptsd", name: "PTSD", body_system: "Mental", cfr: [{ section: "4.130", diagnostic_code: "9411", title: "PTSD" }], evidence_checklist: ["Diagnosis"] }
        : id === "migraines"
          ? { id: "migraines", name: "Migraines", body_system: "Neuro", cfr: [{ section: "4.124a", diagnostic_code: "8100", title: "Migraines" }], evidence_checklist: ["Log"] }
          : null,
    loadNotes: (id) => (id === "ptsd" ? "Primary notes" : ""),
    loadTimeline: (id) => (id === "migraines" ? [{ date: "2024-02", type: "Onset", note: "Started" }] : []),
    loadEvidenceLinks: (id) => (id === "migraines" ? [{ url: "x" }] : []),
    loadEvidenceState: () => ({}),
    evidenceCompletion: () => ({ done: 0, total: 1, pct: 0 }),
    toSortableDateKey: (value) => value || "9999-99-99",
    now: () => "TEST_NOW",
  });

  test("builds workspace timeline draft", () => {
    const text = api.workspaceTimelineDraft("all");
    expect(text).toContain("Workspace Timeline");
    expect(text).toContain("TEST_NOW");
    expect(text).toContain("2024-02 • Onset • Migraines");
  });

  test("builds narrative draft", () => {
    const text = api.generateNarrativeDraft({ linkedOnly: false, style: "concise" });
    expect(text).toContain("PRIMARY CONDITION: PTSD");
    expect(text).toContain("Primary notes (user-entered):");
    expect(text).toContain("Migraines");
  });
});
