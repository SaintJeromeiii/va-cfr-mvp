"use strict";

const {
  analyzeTimelineConflicts,
  buildNexusDraft,
  createEvidenceLibraryRecord,
  createDocumentRecord,
  estimateScenarioSnapshot,
} = require("../public/app");

describe("guided upgrade helpers", () => {
  test("builds a nexus draft with the provided fields", () => {
    const text = buildNexusDraft({
      childName: "Migraines",
      parentName: "PTSD",
      relationType: "Secondary service connection",
      mechanism: "Poor sleep and stress worsen headaches.",
      symptoms: "Frequent headaches and missed work.",
      treatment: "Treatment notes document worsening since 2024.",
      support: "Neurology note and lay statement.",
      rationale: "Symptoms appear to increase when PTSD symptoms flare.",
    });

    expect(text).toContain("Condition: Migraines");
    expect(text).toContain("Related condition: PTSD");
    expect(text).toContain("Mechanism: Poor sleep and stress worsen headaches.");
    expect(text).toContain("Nexus language / rationale: Symptoms appear to increase when PTSD symptoms flare.");
  });

  test("creates normalized reusable document records", () => {
    const record = createDocumentRecord({
      name: "  Sleep Study  ",
      type: "Medical record",
      tags: "sleep, apnea, dbq ",
      text: " Study results and physician summary. ",
    });

    expect(record.name).toBe("Sleep Study");
    expect(record.type).toBe("Medical record");
    expect(record.tags).toEqual(["sleep", "apnea", "dbq"]);
    expect(record.text).toBe("Study results and physician summary.");
  });

  test("creates reusable evidence records with normalized fields", () => {
    const record = createEvidenceLibraryRecord({
      label: "  Neurology Note  ",
      url: " https://example.test/note ",
      type: "Medical record",
      excerpt: " Headache frequency increased after sleep disruption. ",
      tags: "migraines, sleep",
    });

    expect(record.label).toBe("Neurology Note");
    expect(record.url).toBe("https://example.test/note");
    expect(record.type).toBe("Medical record");
    expect(record.excerpt).toBe("Headache frequency increased after sleep disruption.");
    expect(record.tags).toEqual(["migraines", "sleep"]);
  });

  test("estimates a saved rating scenario against workspace items", () => {
    const result = estimateScenarioSnapshot(
      {
        currentRating: 70,
        projected: {
          ptsd: 50,
          migraines: 30,
          tinnitus: 10,
        },
      },
      [
        { id: "ptsd" },
        { id: "migraines" },
        { id: "tinnitus" },
      ],
    );

    expect(result.rounded).toBe(90);
    expect(result.raw).toBeGreaterThan(80);
  });

  test("detects timeline conflicts and invalid dates", () => {
    const conflicts = analyzeTimelineConflicts({
      Migraines: [
        { date: "2035-04-01", type: "Treatment" },
        { date: "2024-02-01", type: "Onset" },
        { date: "2024-02-01", type: "Diagnosis" },
      ],
      PTSD: [
        { date: "bad-date", type: "Other" },
      ],
    });

    expect(conflicts.some((line) => line.includes("future timeline date"))).toBe(true);
    expect(conflicts.some((line) => line.includes("multiple event types on 2024-02-01"))).toBe(true);
    expect(conflicts.some((line) => line.includes("missing or invalid date"))).toBe(true);
  });
});
