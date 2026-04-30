"use strict";

const { createEvidenceBinderApi, labelCluster } = require("../public/js/evidence-binder");

describe("evidence binder module", () => {
  function createApi() {
    const workspace = {
      nodes: ["ptsd", "migraines"],
      primaryId: "ptsd",
      links: [{ from: "ptsd", to: "migraines", type: "Secondary to" }],
    };

    const evidence = {
      ptsd: [
        {
          url: "https://example.com/a",
          label: "Sleep study record",
          type: "Medical record",
          date: "2024-03-01",
          note: "OSA symptoms",
        },
      ],
      migraines: [
        {
          url: "https://example.com/a",
          label: "Sleep study record",
          type: "Medical record",
          date: "2024-03-01",
          note: "",
        },
        {
          url: "",
          label: "Headache journal",
          type: "Lay statement / Buddy statement",
          date: "2024-04",
          note: "Tracks weekly migraines",
        },
      ],
    };

    const syntheticKey = `label-${Buffer.from("Headache journal::2024-04::Tracks weekly migraines", "utf8").toString("base64url")}`;

    return createEvidenceBinderApi({
      loadWorkspaceState: () => workspace,
      isLinkedNode: (id, st) => id === st.primaryId || st.links.some((link) => link.to === id),
      getConditionById: (id) =>
        id === "ptsd"
          ? { id: "ptsd", name: "PTSD" }
          : id === "migraines"
            ? { id: "migraines", name: "Migraines" }
            : null,
      loadEvidenceLinks: (id) => evidence[id] || [],
      normalizeUrl: (url) => (url || "").trim().toLowerCase(),
      base64UrlEncode: (value) => Buffer.from(value, "utf8").toString("base64url"),
      toSortableDateKey: (value) => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return value;
        if (/^\d{4}-\d{2}$/.test(value || "")) return `${value}-01`;
        return "9999-99-99";
      },
      relatedEvidenceKeys: (url) => (url ? ["rel-1"] : []),
      loadEvidenceRelations: () => ({
        "https://example.com/a": [syntheticKey],
        [syntheticKey]: ["https://example.com/a"],
      }),
      now: () => "TEST_NOW",
    });
  }

  test("merges shared evidence across conditions", () => {
    const api = createApi();
    const entries = api.buildBinderEntries("all");

    expect(entries).toHaveLength(2);
    expect(entries.find((entry) => entry.url === "https://example.com/a").conditions).toEqual([
      "Migraines",
      "PTSD",
    ]);
  });

  test("sorts entries by condition", () => {
    const api = createApi();
    const entries = api.sortBinderEntries(api.buildBinderEntries("all"), "condition");

    expect(entries[0].conditions[0]).toBe("Migraines");
  });

  test("builds graph data with nodes and edges", () => {
    const api = createApi();
    const graph = api.buildEvidenceGraphData("all", false);

    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);
  });

  test("builds clustered binder draft", () => {
    const api = createApi();
    const text = api.workspaceEvidenceBinderDraft("all", "date", "cluster");

    expect(text).toContain("Workspace Evidence Binder (Clustered)");
    expect(text).toContain("TEST_NOW");
    expect(text).toContain("Cluster 1:");
  });

  test("computes binder stats", () => {
    const api = createApi();
    expect(api.binderStats("all")).toEqual({ total: 2, unique: 1 });
  });

  test("builds readable cluster labels", () => {
    const label = labelCluster([
      {
        label: "Sleep study record",
        note: "OSA symptoms",
        type: "Medical record",
        conditions: ["PTSD", "Migraines"],
      },
    ]);

    expect(label).toContain("Medical record");
    expect(label).toContain("Migraines + PTSD");
    expect(label.includes("sleep") || label.includes("study") || label.includes("osa")).toBe(true);
  });
});
