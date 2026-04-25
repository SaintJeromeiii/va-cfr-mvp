"use strict";

const { createDetailInteractionsApi } = require("../public/js/detail-interactions");

describe("detail interaction helpers", () => {
  const api = createDetailInteractionsApi({
    loadNotes: () => "",
    saveNotes: () => {},
    sortTimeline: (entries) => entries,
    loadTimeline: () => [],
    addTimelineEntry: () => {},
    removeTimelineEntry: () => {},
    downloadText: () => {},
    loadEvidenceLinks: () => [],
    addEvidenceLink: () => {},
    removeEvidenceLink: () => {},
    buildWorkspaceEvidenceIndex: () => new Map(),
    relatedEvidenceKeys: () => [],
    evidenceDisplayName: (entry) => entry.label || entry.url || "",
    addEvidenceRelation: () => {},
    removeEvidenceRelation: () => {},
    normalizeUrl: (value) => value,
    escapeHtml: (value) => String(value),
    toSortableDateKey: (value) => value || "9999-99-99",
    loadEvidenceState: () => ({}),
    saveEvidenceState: () => {},
    ensureNode: () => {},
    renderWorkspace: () => {},
    evidenceCompletion: () => ({ done: 0, total: 0, pct: 0 }),
    buildClaimPacketText: () => "",
    exportChecklistText: () => "",
    documentRef: {},
    windowRef: { clearTimeout() {}, setTimeout() {} },
    cssEscape: (value) => value,
  });

  test("builds timeline text", () => {
    const text = api.buildTimelineText(
      { name: "PTSD" },
      [{ date: "2024-01", type: "Onset", note: "Symptoms began" }],
      "TEST_NOW",
    );

    expect(text).toContain("VA CFR Finder — Condition Timeline");
    expect(text).toContain("TEST_NOW");
    expect(text).toContain("Condition: PTSD");
    expect(text).toContain("2024-01 • Onset");
  });

  test("builds evidence links text", () => {
    const text = api.buildEvidenceLinksText(
      { name: "PTSD" },
      [{ date: "2024-02", type: "Medical record", label: "DBQ", url: "https://example.com", note: "Important" }],
      "TEST_NOW",
    );

    expect(text).toContain("VA CFR Finder — Condition Evidence Links");
    expect(text).toContain("TEST_NOW");
    expect(text).toContain("Condition: PTSD");
    expect(text).toContain("URL: https://example.com");
    expect(text).toContain("Notes: Important");
  });
});
