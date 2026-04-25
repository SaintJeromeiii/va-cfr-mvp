"use strict";

const { createDetailViewApi } = require("../public/js/detail-view");

describe("detail view markup", () => {
  const api = createDetailViewApi({
    escapeHtml: (value) => String(value),
    systemClassName: (value) => `sys-${value}`,
    loadEvidenceState: () => ({ 0: true }),
    TIMELINE_TYPES: ["Onset", "Diagnosis"],
    EVIDENCE_LINK_TYPES: ["Medical record", "Other"],
  });

  test("builds references for thresholds", () => {
    const html = api.buildReferencesHTML({
      cfr: [{ section: "4.71a", diagnostic_code: "5260", url: "https://example.com" }],
      rating_logic: {
        type: "thresholds",
        thresholds: [{ flexion_deg: 45, rating_percent: 10 }],
      },
    });

    expect(html).toContain("Flexion limited to <strong>45°</strong> → <strong>10%</strong>");
  });

  test("builds detail markup with checklist and evidence links", () => {
    const html = api.buildDetailMarkup({
      id: "ptsd",
      name: "PTSD",
      body_system: "Mental",
      disclaimer: "Educational only",
      cfr: [{ section: "4.130", diagnostic_code: "9411", title: "PTSD", url: "https://example.com" }],
      rating_logic: { summary: "High-level summary" },
      evidence_checklist: ["Diagnosis"],
      strategy: ["Gather records"],
      excerpts: [{ label: "Excerpt", text: "Sample text", source_url: "https://example.com/excerpt" }],
    });

    expect(html).toContain('id="jump-cfr"');
    expect(html).toContain("Gather records");
    expect(html).toContain('id="evLinksList"');
    expect(html).toContain('class="evCheck"');
    expect(html).toContain('id="secondaryLinkPanel"');
    expect(html).toContain('id="secondaryLinkType"');
    expect(html).toContain("Add this condition as a linked secondary");
  });
});
