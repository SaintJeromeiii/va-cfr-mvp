"use strict";

const {
  base64UrlEncode,
  base64UrlDecode,
  createWorkspaceExportApi,
} = require("../public/js/workspace-export");

describe("workspace export helpers", () => {
  test("round-trips base64url payloads", () => {
    const original = JSON.stringify({ note: "PTSD + tinnitus", links: [1, 2, 3] });
    expect(base64UrlDecode(base64UrlEncode(original))).toBe(original);
  });

  test("builds a share payload from workspace state", () => {
    const api = createWorkspaceExportApi({
      loadWorkspaceState: () => ({
        nodes: ["ptsd", "migraines"],
        primaryId: "ptsd",
        links: [{ from: "ptsd", to: "migraines", type: "Secondary to" }],
      }),
      saveWorkspaceState: jest.fn(),
      loadNotes: () => "",
      loadEvidenceState: () => ({}),
      getConditionById: () => null,
      now: () => "TEST_NOW",
    });

    expect(api.makeSharePayload()).toEqual({
      v: 1,
      nodes: ["ptsd", "migraines"],
      primaryId: "ptsd",
      links: [{ from: "ptsd", to: "migraines", type: "Secondary to" }],
    });
  });

  test("applies a valid share payload", () => {
    const saveWorkspaceState = jest.fn();
    const api = createWorkspaceExportApi({
      loadWorkspaceState: () => ({ nodes: [], primaryId: "", links: [] }),
      saveWorkspaceState,
      loadNotes: () => "",
      loadEvidenceState: () => ({}),
      getConditionById: () => null,
      now: () => "TEST_NOW",
    });

    api.applySharePayload({
      nodes: ["tinnitus"],
      primaryId: "tinnitus",
      links: [],
    });

    expect(saveWorkspaceState).toHaveBeenCalledWith({
      nodes: ["tinnitus"],
      primaryId: "tinnitus",
      links: [],
    });
  });

  test("builds workspace packet text with role and note information", () => {
    const api = createWorkspaceExportApi({
      loadWorkspaceState: () => ({
        nodes: ["ptsd", "migraines"],
        primaryId: "ptsd",
        links: [{ from: "ptsd", to: "migraines", type: "Secondary to" }],
      }),
      saveWorkspaceState: jest.fn(),
      loadNotes: (id) => (id === "migraines" ? "Migraine notes" : ""),
      loadEvidenceState: (id) => (id === "migraines" ? { 0: true } : {}),
      getConditionById: (id) =>
        id === "ptsd"
          ? { id: "ptsd", name: "PTSD" }
          : id === "migraines"
            ? { id: "migraines", name: "Migraines" }
            : null,
      now: () => "TEST_NOW",
    });

    const text = api.buildWorkspacePacketText([
      {
        id: "ptsd",
        name: "PTSD",
        body_system: "Mental Disorders",
        cfr: [{ section: "4.130", diagnostic_code: "9411", title: "PTSD", url: "https://example.com/ptsd" }],
        evidence_checklist: ["Diagnosis"],
      },
      {
        id: "migraines",
        name: "Migraines",
        body_system: "Neurological",
        cfr: [{ section: "4.124a", diagnostic_code: "8100", title: "Migraines", url: "https://example.com/migraine" }],
        evidence_checklist: ["Headache log"],
      },
    ]);

    expect(text).toContain("VA CFR Finder — Claim Workspace Packet");
    expect(text).toContain("TEST_NOW");
    expect(text).toContain("Workspace Summary");
    expect(text).toContain("Primary condition: PTSD");
    expect(text).toContain("Role: Primary");
    expect(text).toContain("Role: Linked");
    expect(text).toContain("Condition Snapshot");
    expect(text).toContain("Relationship Summary");
    expect(text).toContain("PTSD (Secondary to)");
    expect(text).toContain("[x] Headache log");
    expect(text).toContain("Migraine notes");
    expect(text).toContain("Recommended Next Steps");
  });

  test("builds claim packet text with relationship and next-step guidance", () => {
    const api = createWorkspaceExportApi({
      loadWorkspaceState: () => ({
        nodes: ["ptsd", "migraines"],
        primaryId: "ptsd",
        links: [{ from: "ptsd", to: "migraines", type: "Secondary to" }],
      }),
      saveWorkspaceState: jest.fn(),
      loadNotes: (id) => (id === "migraines" ? "" : ""),
      loadEvidenceState: () => ({}),
      getConditionById: (id) =>
        id === "ptsd"
          ? { id: "ptsd", name: "PTSD" }
          : id === "migraines"
            ? { id: "migraines", name: "Migraines" }
            : null,
      now: () => "TEST_NOW",
    });

    const text = api.buildClaimPacketText({
      id: "migraines",
      name: "Migraines",
      body_system: "Neurological",
      cfr: [{ section: "4.124a", diagnostic_code: "8100", title: "Migraines", url: "https://example.com/migraine" }],
      evidence_checklist: ["Headache log"],
    }, {});

    expect(text).toContain("VA CFR Finder — Claim Packet");
    expect(text).toContain("Claim Snapshot");
    expect(text).toContain("Relationship Summary");
    expect(text).toContain("Secondary to PTSD");
    expect(text).toContain("Recommended Next Steps");
    expect(text).toContain("Add a concise condition summary in Notes");
  });
});
