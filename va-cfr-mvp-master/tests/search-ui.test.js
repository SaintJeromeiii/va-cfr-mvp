"use strict";

const { createSearchUiApi } = require("../public/js/search-ui");

describe("search ui helpers", () => {
  const api = createSearchUiApi({
    getConditions: () => [],
    parseCommandQuery: (value) => ({ mode: "text", text: value }),
    normalize: (value) => (value || "").toLowerCase().trim(),
    escapeHtml: (value) => String(value),
    systemClassName: (value) => String(value || ""),
    debounce: (fn) => fn,
    showDetail: () => {},
    ensureNode: () => {},
    renderWorkspace: () => {},
    documentRef: {},
  });

  test("prioritizes exact diagnostic code matches over name matches", () => {
    const dcMatch = {
      id: "sciatica",
      name: "Sciatica",
      aliases: [],
      cfr: [{ diagnostic_code: "8520", section: "38 CFR § 4.124a", title: "Sciatic nerve" }],
    };
    const nameMatch = {
      id: "code-8520-education",
      name: "About 8520 Claims",
      aliases: [],
      cfr: [],
    };

    expect(api.scoreMatch(dcMatch, "8520")).toBeGreaterThan(api.scoreMatch(nameMatch, "8520"));
  });

  test("summarizes the first CFR references", () => {
    const summary = api.cfrSummary({
      cfr: [
        {
          section: "38 CFR § 4.124a",
          diagnostic_code: "8520",
          title: "Sciatic nerve",
        },
        {
          section: "38 CFR § 4.123",
          diagnostic_code: "8620",
          title: "Neuritis",
        },
      ],
    });

    expect(summary).toContain("§ 4.124a");
    expect(summary).toContain("DC 8520");
    expect(summary).toContain("Neuritis");
  });

  test("identifies CFR section matches", () => {
    const reason = api.matchReason(
      {
        id: "sciatica",
        name: "Sciatica",
        aliases: [],
        cfr: [{ diagnostic_code: "8520", section: "38 CFR § 4.124a", title: "Sciatic nerve" }],
      },
      "4.124a",
    );

    expect(reason).toBe("CFR Section");
  });

  test("renders all conditions when there is no search query", () => {
    const results = {
      innerHTML: "",
      children: [],
      appendChild(node) {
        this.children.push(node);
      },
    };
    const input = {
      value: "",
      addEventListener() {},
    };
    const filter = {
      value: "",
      options: [],
      innerHTML: "",
      appendChild(option) {
        this.options.push(option);
      },
      addEventListener() {},
    };
    const clearBtn = { addEventListener() {} };
    const legend = { innerHTML: "", appendChild() {} };
    const conditions = [
      {
        id: "tinnitus",
        name: "Tinnitus",
        body_system: "Ear",
        aliases: [],
        cfr: [{ diagnostic_code: "6260", section: "38 CFR § 4.87", title: "Tinnitus" }],
      },
      {
        id: "sciatica",
        name: "Sciatica",
        body_system: "Neurological",
        aliases: [],
        cfr: [{ diagnostic_code: "8520", section: "38 CFR § 4.124a", title: "Sciatic nerve" }],
      },
    ];

    const makeElement = (tag) => ({
      tagName: tag,
      className: "",
      type: "",
      dataset: {},
      textContent: "",
      innerHTML: "",
      listeners: {},
      querySelector() { return null; },
      appendChild() {},
      addEventListener(type, handler) {
        this.listeners[type] = handler;
      },
    });

    const mountedApi = createSearchUiApi({
      getConditions: () => conditions,
      parseCommandQuery: (value) => ({ mode: "text", text: value }),
      normalize: (value) => (value || "").toLowerCase().trim(),
      escapeHtml: (value) => String(value),
      systemClassName: (value) => String(value || ""),
      debounce: (fn) => fn,
      showDetail: () => {},
      ensureNode: () => {},
      renderWorkspace: () => {},
      documentRef: {
        getElementById(id) {
          return {
            q: input,
            systemFilter: filter,
            clearBtn,
            legend,
            results,
          }[id] || null;
        },
        createElement: makeElement,
        querySelectorAll() {
          return [];
        },
      },
    });

    mountedApi.mountSearchUi();

    expect(results.children).toHaveLength(2);
  });
});
