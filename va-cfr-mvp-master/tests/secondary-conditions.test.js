"use strict";

const { createSecondaryConditionsApi } = require("../public/js/secondary-conditions");

describe("secondary conditions helpers", () => {
  const api = createSecondaryConditionsApi({
    documentRef: {
      createElement: (tag) => ({
        tag,
        className: "",
        style: {},
        innerHTML: "",
        textContent: "",
        appendChild() {},
        querySelectorAll() { return []; },
      }),
    },
    getConditions: () => [],
    getConditionById: (id) =>
      id === "migraine"
        ? { id: "migraine", name: "Migraine", evidence_checklist: ["Log", "Dx"] }
        : null,
    loadEvidenceState: () => ({ 0: true }),
    saveEvidenceState: () => {},
    ensureNode: () => {},
    renderWorkspace: () => {},
    showDetail: () => {},
    escapeHtml: (value) => String(value),
  });

  test("computes evidence counts", () => {
    expect(api.conditionEvidenceCount("migraine")).toBe(2);
    expect(api.conditionEvidenceDone("migraine")).toBe(1);
  });
});
