"use strict";

const { createEvidenceGraphApi } = require("../public/js/evidence-graph");

describe("evidence graph helpers", () => {
  function createApi() {
    return createEvidenceGraphApi({
      loadWorkspaceState: () => ({
        nodes: ["ptsd", "migraines"],
        primaryId: "ptsd",
        links: [{ from: "ptsd", to: "migraines", type: "Secondary to" }],
      }),
      isLinkedNode: (id, st) => id === st.primaryId || st.links.some((link) => link.to === id),
      getConditionById: (id) =>
        id === "ptsd"
          ? { id: "ptsd", name: "PTSD" }
          : id === "migraines"
            ? { id: "migraines", name: "Migraines" }
            : null,
      loadEvidenceLinks: (id) =>
        id === "ptsd"
          ? [{ url: "https://example.com/a", label: "Sleep study", type: "Medical record", date: "2024-03-01", note: "" }]
          : [{ url: "https://example.com/a", label: "", type: "", date: "", note: "Cross-linked" }],
      normalizeUrl: (url) => (url || "").trim().toLowerCase(),
      relatedEvidenceKeys: () => [],
      buildEvidenceGraphData: () => ({ nodes: [], edges: [] }),
      escapeHtml: (value) => value,
      toSortableDateKey: (value) => value || "9999-99-99",
      documentRef: {},
      windowRef: {},
    });
  }

  test("builds a merged workspace evidence index", () => {
    const api = createApi();
    const index = api.buildWorkspaceEvidenceIndex("all");
    const entry = index.get("https://example.com/a");

    expect(index.size).toBe(1);
    expect(entry.conditions).toEqual(["Migraines", "PTSD"]);
    expect(entry.label).toBe("Sleep study");
  });

  test("formats evidence display names", () => {
    const api = createApi();
    expect(
      api.evidenceDisplayName({
        url: "https://example.com/a",
        label: "Sleep study",
        date: "2024-03-01",
        type: "Medical record",
      }),
    ).toBe("Sleep study • 2024-03-01 • Medical record");
  });
});
