"use strict";

const { createWorkspaceUiApi } = require("../public/js/workspace-ui");

describe("workspace ui helpers", () => {
  function createApi() {
    return createWorkspaceUiApi({
      loadWorkspaceState: () => ({ nodes: [], primaryId: "", links: [] }),
      saveWorkspaceState: () => {},
      loadEvidenceState: (id) => (id === "ptsd" ? { 0: true } : {}),
      loadEvidenceLinks: () => [],
      loadNotes: () => "",
      getConditions: () => [],
      getConditionById: () => null,
      escapeHtml: (value) => String(value),
      systemClassName: () => "",
      REL_TYPES: ["Secondary to"],
      isOrphan: () => false,
      showDetail: () => {},
      setPrimary: () => {},
      removeNode: () => {},
      updateLinkType: () => {},
      removeLink: () => {},
      addLink: () => {},
      renderHealthPanel: () => {},
      alertFn: () => {},
      cssEscape: (value) => value,
      documentRef: { getElementById: () => null },
    });
  }

  test("computes evidence completion", () => {
    const api = createApi();
    expect(
      api.evidenceCompletion(
        { evidence_checklist: ["A", "B", "C"] },
        { 0: true, 2: true },
      ),
    ).toEqual({ done: 2, total: 3, pct: 67 });
  });

  test("computes workspace completion", () => {
    const api = createApi();
    expect(
      api.workspaceCompletion([
        { id: "ptsd", evidence_checklist: ["A", "B"] },
        { id: "migraines", evidence_checklist: ["C"] },
      ]),
    ).toEqual({ done: 1, total: 3, pct: 33 });
  });

  test("returns parent links for a child", () => {
    const api = createApi();
    expect(
      api.parentsOf("migraines", [
        { from: "ptsd", to: "migraines", type: "Secondary to" },
        { from: "tinnitus", to: "ptsd", type: "Associated with" },
      ]),
    ).toEqual([{ from: "ptsd", to: "migraines", type: "Secondary to" }]);
  });

  test("builds adjacency lists", () => {
    const api = createApi();
    const adj = api.buildAdjacency([
      { from: "ptsd", to: "migraines", type: "Secondary to" },
      { from: "ptsd", to: "sleep-apnea", type: "Associated with" },
    ]);

    expect(adj.get("ptsd")).toHaveLength(2);
    expect(adj.get("ptsd")[0].to).toBe("migraines");
  });

  test("summarizes relationship text for linked and primary items", () => {
    const api = createWorkspaceUiApi({
      loadWorkspaceState: () => ({ nodes: [], primaryId: "", links: [] }),
      saveWorkspaceState: () => {},
      loadEvidenceState: () => ({}),
      loadEvidenceLinks: () => [],
      loadNotes: () => "",
      getConditions: () => [],
      getConditionById: (id) => (id === "ptsd" ? { id: "ptsd", name: "PTSD" } : null),
      escapeHtml: (value) => String(value),
      systemClassName: () => "",
      REL_TYPES: ["Secondary to"],
      isOrphan: () => false,
      showDetail: () => {},
      setPrimary: () => {},
      removeNode: () => {},
      updateLinkType: () => {},
      removeLink: () => {},
      addLink: () => {},
      renderHealthPanel: () => {},
      alertFn: () => {},
      cssEscape: (value) => value,
      documentRef: { getElementById: () => null },
    });

    expect(api.relationshipSummary({ id: "ptsd" }, { primaryId: "ptsd", links: [] })).toBe("Primary condition");
    expect(
      api.relationshipSummary(
        { id: "migraines" },
        { primaryId: "ptsd", links: [{ from: "ptsd", to: "migraines", type: "Secondary to" }] },
      ),
    ).toContain("Secondary to PTSD");
  });

  test("suggests next steps based on readiness and linking", () => {
    const api = createApi();
    expect(
      api.nextStepHint(
        { id: "migraines", cfr: [{ section: "4.124a" }] },
        { primaryId: "ptsd", links: [] },
        { done: 0, total: 2, pct: 0 },
      ),
    ).toContain("Finish checklist items");
  });

  test("flags missing support for linked secondary conditions", () => {
    const api = createWorkspaceUiApi({
      loadWorkspaceState: () => ({ nodes: [], primaryId: "", links: [] }),
      saveWorkspaceState: () => {},
      loadEvidenceState: () => ({}),
      loadEvidenceLinks: () => [],
      loadNotes: () => "",
      getConditions: () => [],
      getConditionById: (id) => (id === "ptsd" ? { id: "ptsd", name: "PTSD" } : null),
      escapeHtml: (value) => String(value),
      systemClassName: () => "",
      REL_TYPES: ["Secondary to"],
      isOrphan: () => false,
      showDetail: () => {},
      setPrimary: () => {},
      removeNode: () => {},
      updateLinkType: () => {},
      removeLink: () => {},
      addLink: () => {},
      renderHealthPanel: () => {},
      alertFn: () => {},
      cssEscape: (value) => value,
      documentRef: { getElementById: () => null },
    });

    expect(
      api.nextStepHint(
        { id: "migraines", cfr: [{ section: "4.124a" }] },
        { primaryId: "ptsd", links: [{ from: "ptsd", to: "migraines", type: "Secondary to" }] },
        { done: 0, total: 0, pct: 0 },
      ),
    ).toContain("supporting evidence links");
  });

  test("summarizes claim-wide workspace risks", () => {
    const api = createWorkspaceUiApi({
      loadWorkspaceState: () => ({ nodes: [], primaryId: "", links: [] }),
      saveWorkspaceState: () => {},
      loadEvidenceState: () => ({}),
      loadEvidenceLinks: (id) => (id === "sleep-apnea" ? [{ url: "https://example.test" }] : []),
      loadNotes: (id) => (id === "sleep-apnea" ? "Has notes" : ""),
      getConditions: () => [],
      getConditionById: (id) => ({ id, name: id }),
      escapeHtml: (value) => String(value),
      systemClassName: () => "",
      REL_TYPES: ["Secondary to"],
      isOrphan: () => false,
      showDetail: () => {},
      setPrimary: () => {},
      removeNode: () => {},
      updateLinkType: () => {},
      removeLink: () => {},
      addLink: () => {},
      renderHealthPanel: () => {},
      alertFn: () => {},
      cssEscape: (value) => value,
      documentRef: { getElementById: () => null },
    });

    const risks = api.summarizeWorkspaceRisks(
      [
        { id: "ptsd", evidence_checklist: [] },
        { id: "migraines", evidence_checklist: ["Log"] },
        { id: "sleep-apnea", evidence_checklist: [] },
        { id: "tinnitus", evidence_checklist: [] },
      ],
      {
        primaryId: "ptsd",
        links: [
          { from: "ptsd", to: "migraines", type: "Secondary to" },
          { from: "ptsd", to: "sleep-apnea", type: "Secondary to" },
        ],
      },
    );

    expect(risks[0].label).toContain("1 linked secondary");
    expect(risks[0].ids).toEqual(["migraines"]);
    expect(risks[1].label).toContain("1 linked item");
    expect(risks[1].ids).toEqual(["migraines"]);
    expect(risks[2].label).toContain("1 workspace item");
    expect(risks[2].ids).toEqual(["tinnitus"]);
    expect(risks[3].label).toContain("1 item");
    expect(risks[3].ids).toEqual(["migraines"]);
  });
});
