"use strict";

const {
  analyzeEvidenceConflicts,
  analyzeTimelineConflicts,
  analyzeRecordToClaimMapper,
  applyWorkspaceBackup,
  extractEvidenceSignals,
  buildAssembledPacketText,
  buildEvidenceLibraryCsv,
  buildCoverageStarter,
  buildExtractorDraftPacketText,
  buildExtractorPacketBulkActionPlan,
  buildExtractorPacketPresetOptions,
  buildExtractorPacketPreview,
  buildWorkspaceBackup,
  computeExtractorApplyNewPlan,
  compareExtractorPacketRecords,
  compareExtractorPreview,
  buildExtractorEvidencePreview,
  buildExtractorDraft,
  buildExtractorNoteSummary,
  buildExtractorTimelinePreview,
  buildMilestonesCsv,
  buildNexusDraft,
  buildPacketReviewSnapshot,
  buildPrintablePacketHtml,
  buildSubmissionPrepSnapshot,
  buildSymptomFormSummary,
  computeEvidenceCoverageMatrix,
  getConditionGuidedFormSchema,
  conditionSpecificCoaching,
  computeConditionReadinessSnapshot,
  createExtractorHistoryEntry,
  createExtractorPacketRecord,
  createEvidenceLibraryRecord,
  createDocumentRecord,
  emptyWorkspaceBackup,
  estimateScenarioSnapshot,
  filterExtractorPacketSelection,
  getExtractorPacketPresetTags,
  parseEvidenceCsv,
  pruneExtractorDraft,
  loadFavoriteConditions,
  loadExtractorPacketCustomPresets,
  loadHomeUsageStats,
  loadOnboardingWizardState,
  loadRecentConditions,
  normalizeExtractorPacketTags,
  saveFavoriteConditions,
  saveExtractorPacketCustomPresets,
  saveHomeUsageStats,
  saveOnboardingWizardState,
  saveRecentConditions,
  scoreTheoryRecord,
  suggestEvidenceTargets,
  workspaceProfileSummary,
} = require("../public/app");

describe("guided upgrade helpers", () => {
  beforeEach(() => {
    const store = {};
    global.localStorage = {
      getItem: (key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
      setItem: (key, value) => { store[key] = String(value); },
      removeItem: (key) => { delete store[key]; },
      clear: () => {
        Object.keys(store).forEach((key) => delete store[key]);
      },
    };
  });

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
      sourceType: "inferred",
      sourceName: "sleep-study.pdf",
      fileName: "sleep-study.pdf",
    });

    expect(record.name).toBe("Sleep Study");
    expect(record.type).toBe("Medical record");
    expect(record.sourceType).toBe("inferred");
    expect(record.sourceName).toBe("sleep-study.pdf");
    expect(record.fileName).toBe("sleep-study.pdf");
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

  test("returns a condition-specific guided form schema and summary", () => {
    const schema = getConditionGuidedFormSchema({
      name: "Migraines",
      aliases: ["headaches"],
      body_system: "Neurological Conditions",
    });
    const summary = buildSymptomFormSummary(
      { name: "Migraines", aliases: ["headaches"], body_system: "Neurological Conditions" },
      {
        frequency: "3-4 times per week",
        prostrating: "Twice monthly",
      },
    );

    expect(schema.title).toMatch(/Migraine/i);
    expect(schema.fields.some((field) => field.key === "frequency")).toBe(true);
    expect(summary).toContain("Headache frequency: 3-4 times per week");
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

  test("scores condition readiness by section and highlights the weakest gap", () => {
    const readiness = computeConditionReadinessSnapshot(
      {
        id: "migraines",
        evidence_checklist: ["Diagnosis", "Frequency log", "Lay statement"],
      },
      {
        notes: "Frequent headaches affect work and sleep. Neurology treatment note confirms diagnosis.",
        evidenceLinks: [{ id: "a" }],
        timeline: [{ date: "2024-02-01", type: "Diagnosis" }],
        evidenceState: { 0: true, 1: true },
        theories: [{ subjectId: "migraines", parentId: "ptsd" }],
        workspaceState: { primaryId: "ptsd", links: [{ from: "ptsd", to: "migraines", type: "Secondary to" }] },
      },
    );

    expect(readiness.scores.diagnosis).toBeGreaterThan(50);
    expect(readiness.scores.timeline).toBeGreaterThan(40);
    expect(readiness.overall).toBeGreaterThan(55);
    expect(typeof readiness.nextAction).toBe("string");
  });

  test("suggests likely workspace targets for evidence records", () => {
    const suggestions = suggestEvidenceTargets(
      {
        label: "Neurology migraines note",
        excerpt: "Headache frequency worsened after PTSD-related sleep disruption.",
        type: "Medical record",
        tags: ["migraines", "sleep"],
      },
      [
        { id: "ptsd", name: "PTSD", body_system: "Mental Disorders", aliases: [] },
        { id: "migraines", name: "Migraines", body_system: "Neurological Conditions", aliases: ["headaches"] },
        { id: "tinnitus", name: "Tinnitus", body_system: "Auditory", aliases: [] },
      ],
    );

    expect(suggestions[0].id).toBe("migraines");
    expect(suggestions.some((entry) => entry.id === "ptsd")).toBe(true);
  });

  test("reviews packet blockers across theory, timeline, and rating posture", () => {
    const review = buildPacketReviewSnapshot({
      items: [
        { id: "ptsd", name: "PTSD", evidence_checklist: ["Diagnosis"] },
        { id: "migraines", name: "Migraines", evidence_checklist: ["Diagnosis", "Nexus"] },
      ],
      primaryId: "ptsd",
      links: [{ from: "ptsd", to: "migraines", type: "Secondary to" }],
      theories: [],
      notesById: {
        ptsd: "Diagnosis and symptoms documented.",
        migraines: "Headaches continue.",
      },
      evidenceLinksById: {
        ptsd: [{ id: "ev1" }],
        migraines: [],
      },
      timelineById: {
        ptsd: [{ date: "bad-date", type: "Other" }],
        migraines: [],
      },
      evidenceStateById: {
        ptsd: { 0: true },
        migraines: {},
      },
      currentRating: 70,
      projected: { migraines: 70 },
    });

    expect(review.summary.warnings).toBeGreaterThan(0);
    expect(review.findings.some((finding) => finding.text.includes("No structured claim theory"))).toBe(true);
    expect(review.findings.some((finding) => finding.text.includes("migraines") || finding.text.includes("Migraines"))).toBe(true);
  });

  test("generates condition-specific coaching prompts", () => {
    const tips = conditionSpecificCoaching(
      {
        id: "migraines",
        name: "Migraines",
        aliases: ["headaches"],
        body_system: "Neurological Conditions",
        evidence_checklist: ["Diagnosis", "Frequency log"],
      },
      {
        primaryId: "ptsd",
        links: [{ from: "ptsd", to: "migraines", type: "Secondary to" }],
      },
      {
        notes: "Headaches interrupt work and sleep.",
        evidenceLinks: [],
        timeline: [],
        evidenceState: {},
        theories: [],
      },
    );

    expect(tips.some((tip) => /headaches|frequency|prostrating/i.test(tip))).toBe(true);
  });

  test("summarizes submission-prep posture for handoff", () => {
    const prep = buildSubmissionPrepSnapshot({
      items: [{ id: "ptsd", name: "PTSD" }],
      review: { summary: { errors: 0, warnings: 2, infos: 1 }, findings: [{ text: "Attach evidence link", severity: "warn" }] },
      strongest: [{ item: { name: "PTSD" }, readiness: { overall: 80 }, strength: { label: "Strong" } }],
      weakest: [{ item: { name: "Migraines" }, readiness: { nextAction: "Add timeline detail." } }],
      theories: [{ id: "theory-1" }],
      primary: { id: "ptsd", name: "PTSD" },
    });

    expect(prep.status).toMatch(/review|staged|cleanup/i);
    expect(prep.verify.length).toBeGreaterThan(0);
  });

  test("summarizes workspace profiles for the profile manager", () => {
    expect(workspaceProfileSummary({
      backup: {
        workspaceState: {
          nodes: ["ptsd", "migraines"],
          links: [{ from: "ptsd", to: "migraines" }],
        },
        snapshots: [{ id: "snap-1" }],
      },
    })).toBe("2 conditions • 1 link • 1 restore point");
  });

  test("maps a record into claim elements, excerpts, and likely conditions", () => {
    const result = analyzeRecordToClaimMapper(
      "The Veteran reports migraine headaches since 2022. Neurology treatment notes document frequency and worsening after PTSD-related sleep disruption.",
      [
        { id: "migraines", name: "Migraines", aliases: ["headaches"], body_system: "Neurological Conditions" },
        { id: "ptsd", name: "PTSD", aliases: [], body_system: "Mental Disorders" },
      ],
    );

    expect(result.globalElements).toEqual(expect.arrayContaining(["diagnosis", "severity", "timeline"]));
    const migraineEntry = result.conditions.find((entry) => entry.name === "Migraines");
    expect(migraineEntry).toBeTruthy();
    expect(migraineEntry.excerpts.length).toBeGreaterThan(0);
  });

  test("extracts richer evidence signals from document text", () => {
    const result = extractEvidenceSignals(
      "Dr. Smith at Neurology Clinic diagnosed migraine headaches in 2024-02-01. The Veteran reports prostrating headaches twice a month that cause missed work. Symptoms worsened due to PTSD-related sleep disruption.",
      [
        { id: "migraines", name: "Migraines", aliases: ["headaches"], body_system: "Neurological Conditions" },
        { id: "ptsd", name: "PTSD", aliases: [], body_system: "Mental Health" },
      ],
    );

    expect(result.dates).toContain("2024-02-01");
    expect(result.providers.some((item) => /smith|neurology/i.test(item))).toBe(true);
    expect(result.symptoms).toEqual(expect.arrayContaining(["headache", "migraine", "missed work"]));
    expect(result.diagnosisPhrases.length).toBeGreaterThan(0);
    expect(result.severityPhrases.length).toBeGreaterThan(0);
    expect(result.nexusPhrases.length).toBeGreaterThan(0);
    expect(result.likelyTargets.some((item) => item.name === "Migraines")).toBe(true);
  });

  test("builds an extractor note summary for a target condition", () => {
    const note = buildExtractorNoteSummary({
      providers: ["Dr. Smith"],
      dates: ["2024-02-01"],
      symptoms: ["migraine", "missed work"],
      diagnosisPhrases: ["Dr. Smith diagnosed migraine headaches."],
      severityPhrases: ["Headaches cause missed work twice monthly."],
      nexusPhrases: ["Symptoms worsened due to PTSD-related sleep disruption."],
    }, "Migraines");

    expect(note).toContain("Extracted evidence summary for Migraines");
    expect(note).toContain("Dr. Smith");
    expect(note).toContain("2024-02-01");
    expect(note).toContain("migraine");
  });

  test("builds extractor timeline and evidence previews", () => {
    const extractor = {
      providers: ["Dr. Smith"],
      dates: ["2024-02-01", "2024-03-15"],
      symptoms: ["migraine", "missed work"],
      diagnosisPhrases: ["Neurology note diagnosed migraines."],
      severityPhrases: ["Missed work twice monthly."],
      nexusPhrases: ["Worsened due to PTSD-related sleep disruption."],
    };

    const timeline = buildExtractorTimelinePreview(extractor, "Migraines");
    const evidence = buildExtractorEvidencePreview(extractor, {
      targetName: "Migraines",
      labelBase: "Extracted record evidence",
      type: "Medical record",
      tags: ["sleep", "nexus"],
      fallbackText: "Fallback text",
    });

    expect(timeline).toHaveLength(2);
    expect(timeline[0].date).toBe("2024-02-01");
    expect(timeline[0].note).toMatch(/Migraines/);
    expect(evidence.label).toBe("Extracted record evidence — Migraines");
    expect(evidence.type).toBe("Medical record");
    expect(evidence.tags).toEqual(expect.arrayContaining(["sleep", "nexus", "migraine", "missed work"]));
    expect(evidence.excerpt).toContain("Neurology note diagnosed migraines.");
  });

  test("compares extractor previews against existing condition content", () => {
    const compare = compareExtractorPreview(
      {
        noteSummary: "[Extracted evidence summary for Migraines]\nDiagnosis phrases: Neurology note diagnosed migraines.",
        timelineEntries: [
          { date: "2024-02-01", type: "Other", note: "Document extractor imported date for Migraines (Dr. Smith)." },
          { date: "2024-03-01", type: "Other", note: "Document extractor imported date for Migraines (Dr. Smith)." },
        ],
        evidenceRecord: {
          label: "Extracted record evidence — Migraines",
          excerpt: "Neurology note diagnosed migraines.",
          date: "2024-02-01",
        },
      },
      {
        notes: "Other notes\n\n[Extracted evidence summary for Migraines]\nDiagnosis phrases: Neurology note diagnosed migraines.",
        timeline: [
          { date: "2024-02-01", note: "Document extractor imported date for Migraines (Dr. Smith)." },
        ],
        evidenceLinks: [
          { label: "Extracted record evidence — Migraines", note: "Neurology note diagnosed migraines.", date: "2024-02-01" },
        ],
      },
    );

    expect(compare.noteStatus.status).toBe("duplicate");
    expect(compare.timelineStatus.status).toBe("mixed");
    expect(compare.duplicateTimelineCount).toBe(1);
    expect(compare.evidenceStatus.status).toBe("duplicate");
  });

  test("builds an apply-only-new plan from extractor preview state", () => {
    const plan = computeExtractorApplyNewPlan(
      {
        noteSummary: "[Extracted evidence summary for Migraines]\nNew details here.",
        timelineEntries: [
          { date: "2024-02-01", type: "Other", note: "Document extractor imported date for Migraines (Dr. Smith)." },
          { date: "2024-03-01", type: "Other", note: "Document extractor imported date for Migraines (Dr. Smith)." },
        ],
        evidenceRecord: {
          label: "Extracted record evidence — Migraines",
          excerpt: "New excerpt",
          date: "2024-03-01",
        },
      },
      {
        notes: "Existing notes only.",
        timeline: [
          { date: "2024-02-01", note: "Document extractor imported date for Migraines (Dr. Smith)." },
        ],
        evidenceLinks: [],
      },
    );

    expect(plan.noteSummary).toContain("New details here.");
    expect(plan.timelineEntries).toHaveLength(1);
    expect(plan.timelineEntries[0].date).toBe("2024-03-01");
    expect(plan.evidenceRecord.label).toContain("Migraines");
  });

  test("builds an extractor draft packet bundle", () => {
    const packet = buildExtractorDraftPacketText(
      {
        target: { name: "Migraines" },
        noteSummary: "[Extracted evidence summary for Migraines]\nNew details here.",
        timelineEntries: [
          { date: "2024-03-01", type: "Other", note: "Document extractor imported date for Migraines (Dr. Smith)." },
        ],
        evidenceRecord: {
          label: "Extracted record evidence — Migraines",
          type: "Medical record",
          date: "2024-03-01",
          tags: ["migraine", "missed work"],
          excerpt: "New excerpt",
        },
        compare: {
          noteStatus: { detail: "This summary will append new note content." },
          timelineStatus: { detail: "All 1 timeline entry is new." },
          evidenceStatus: { detail: "This evidence record looks new for the target condition." },
        },
      },
      { sourceName: "neurology-note.pdf" },
    );

    expect(packet).toContain("[Extractor Draft Packet: Migraines]");
    expect(packet).toContain("Source: neurology-note.pdf");
    expect(packet).toContain("[Timeline Draft]");
    expect(packet).toContain("Extracted record evidence — Migraines");
    expect(packet).toContain("[Duplicate Check]");
  });

  test("compares two saved extractor draft packets by section", () => {
    const compare = compareExtractorPacketRecords(
      {
        title: "Packet A",
        text: "[Extractor Draft Packet: Migraines]\nSource: one\n\n[Notes Summary]\nNote A\n\n[Timeline Draft]\n2024-01-01 • Other\nA\n",
      },
      {
        title: "Packet B",
        text: "[Extractor Draft Packet: Migraines]\nSource: two\n\n[Notes Summary]\nNote B updated\n\n[Timeline Draft]\n2024-01-01 • Other\nA\n\n[Evidence Draft]\nLabel: New\n",
      },
    );

    expect(compare.text).toContain("Left: Packet A");
    expect(compare.text).toContain("Right: Packet B");
    expect(compare.findings.some((finding) => finding.section === "Notes Summary" && finding.status === "changed")).toBe(true);
    expect(compare.findings.some((finding) => finding.section === "Evidence Draft" && finding.status === "added")).toBe(true);
  });

  test("rebuilds extractor preview state from a saved packet", () => {
    const preview = buildExtractorPacketPreview({
      targetId: "migraines",
      targetName: "Migraines",
      text: [
        "[Extractor Draft Packet: Migraines]",
        "Source: neurology-note.pdf",
        "",
        "[Notes Summary]",
        "Summary text",
        "",
        "[Timeline Draft]",
        "2024-03-01 • Other",
        "Timeline note",
        "",
        "[Evidence Draft]",
        "Label: Extracted record evidence — Migraines",
        "Type: Medical record",
        "Date: 2024-03-01",
        "Tags: migraine, missed work",
        "Excerpt: Evidence excerpt",
      ].join("\n"),
    });

    expect(preview.target.name).toBe("Migraines");
    expect(preview.noteSummary).toBe("Summary text");
    expect(preview.timelineEntries[0].date).toBe("2024-03-01");
    expect(preview.evidenceRecord.label).toContain("Migraines");
    expect(preview.evidenceRecord.tags).toEqual(["migraine", "missed work"]);
  });

  test("builds and prunes extractor drafts for review mode", () => {
    const draft = buildExtractorDraft({
      providers: ["Dr. Smith", "dr. smith", "  "],
      symptoms: ["migraine", "migraine", "missed work"],
      dates: ["2024-02-01", "2024-02-01"],
      diagnosisPhrases: [" Diagnosed migraines. ", "Diagnosed migraines."],
      severityPhrases: ["Missed work twice monthly."],
      nexusPhrases: ["Worsened due to PTSD.", "worsened due to PTSD."],
    });

    expect(draft.providers).toEqual(["Dr. Smith"]);
    expect(draft.symptoms).toEqual(["migraine", "missed work"]);

    const pruned = pruneExtractorDraft({
      ...draft,
      diagnosisPhrases: [...draft.diagnosisPhrases, "  "],
      nexusPhrases: [...draft.nexusPhrases, "Worsened due to PTSD."],
    });

    expect(pruned.diagnosisPhrases).toEqual(["Diagnosed migraines."]);
    expect(pruned.nexusPhrases).toEqual(["Worsened due to PTSD."]);
  });

  test("creates extractor history entries with normalized selected phrases", () => {
    const entry = createExtractorHistoryEntry({
      action: "timeline",
      targetId: "migraines",
      targetName: "Migraines",
      sourceName: "neurology-note.pdf",
      selected: {
        providers: ["Dr. Smith"],
        dates: ["2024-02-01"],
        symptoms: ["migraine"],
        diagnosisPhrases: ["Neurology note diagnosed migraines."],
        severityPhrases: [],
        nexusPhrases: ["Symptoms worsened due to PTSD-related sleep disruption."],
      },
    });

    expect(entry.action).toBe("timeline");
    expect(entry.targetId).toBe("migraines");
    expect(entry.sourceName).toBe("neurology-note.pdf");
    expect(entry.providers).toEqual(["Dr. Smith"]);
    expect(entry.dates).toEqual(["2024-02-01"]);
    expect(entry.nexusPhrases.length).toBe(1);
  });

  test("creates extractor packet records with target metadata", () => {
    const packet = createExtractorPacketRecord({
      targetId: "migraines",
      targetName: "Migraines",
      sourceName: "neurology-note.pdf",
      title: "Migraines Draft Packet",
      tags: ["nexus draft", "rep handoff candidate"],
      pinned: true,
      archived: true,
      text: "packet body",
      compare: { noteStatus: { status: "new" } },
    });

    expect(packet.targetId).toBe("migraines");
    expect(packet.targetName).toBe("Migraines");
    expect(packet.sourceName).toBe("neurology-note.pdf");
    expect(packet.title).toBe("Migraines Draft Packet");
    expect(packet.tags).toEqual(["nexus draft", "rep handoff candidate"]);
    expect(packet.pinned).toBe(true);
    expect(packet.archived).toBe(true);
    expect(packet.text).toBe("packet body");
  });

  test("normalizes packet selection and summarizes bulk actions", () => {
    const packets = [
      { id: "one", targetId: "migraines", archived: false },
      { id: "two", targetId: "", archived: true },
      { id: "three", targetId: "ptsd", archived: false },
    ];

    const selection = filterExtractorPacketSelection(packets, ["one", "missing", "one", "three"]);
    const plan = buildExtractorPacketBulkActionPlan(
      packets.filter((packet) => selection.includes(packet.id))
    );

    expect(selection).toEqual(["one", "three"]);
    expect(plan.selectedCount).toBe(2);
    expect(plan.activeCount).toBe(2);
    expect(plan.archivedCount).toBe(0);
    expect(plan.appliableCount).toBe(2);
  });

  test("normalizes extractor packet purpose tags from text or arrays", () => {
    expect(normalizeExtractorPacketTags(" nexus draft, rep handoff candidate , ")).toEqual([
      "nexus draft",
      "rep handoff candidate",
    ]);
    expect(normalizeExtractorPacketTags([" timeline-heavy ", "", "severity-focused"])).toEqual([
      "timeline-heavy",
      "severity-focused",
    ]);
  });

  test("returns saved packet tag presets as normalized tag sets", () => {
    expect(getExtractorPacketPresetTags("nexus_draft")).toEqual([
      "nexus draft",
      "evidence gap review",
    ]);
    expect(getExtractorPacketPresetTags("rep_handoff")).toEqual([
      "rep handoff candidate",
      "theory review",
    ]);
    expect(getExtractorPacketPresetTags("missing")).toEqual([]);
  });

  test("stores custom packet presets and merges them into preset options", () => {
    saveExtractorPacketCustomPresets([
      {
        id: "my_rep_set",
        label: "My Rep Set",
        tags: [" rep handoff candidate ", " theory review "],
      },
    ]);

    const stored = loadExtractorPacketCustomPresets();
    const options = buildExtractorPacketPresetOptions();

    expect(stored).toEqual([
      {
        id: "my_rep_set",
        label: "My Rep Set",
        tags: ["rep handoff candidate", "theory review"],
      },
    ]);
    expect(options.some((option) => option.id === "custom:my_rep_set" && option.label === "My Rep Set")).toBe(true);
    expect(getExtractorPacketPresetTags("custom:my_rep_set")).toEqual([
      "rep handoff candidate",
      "theory review",
    ]);
  });

  test("includes custom packet presets in backups and restores them", () => {
    saveExtractorPacketCustomPresets([
      {
        id: "my_set",
        label: "My Set",
        tags: ["nexus draft", "theory review"],
      },
    ]);

    const backup = buildWorkspaceBackup();
    expect(backup.extractorPacketCustomPresets).toEqual([
      {
        id: "my_set",
        label: "My Set",
        tags: ["nexus draft", "theory review"],
      },
    ]);

    saveExtractorPacketCustomPresets([]);
    applyWorkspaceBackup({
      ...emptyWorkspaceBackup(),
      extractorPacketCustomPresets: backup.extractorPacketCustomPresets,
    });

    expect(loadExtractorPacketCustomPresets()).toEqual([
      {
        id: "my_set",
        label: "My Set",
        tags: ["nexus draft", "theory review"],
      },
    ]);
  });

  test("includes homepage favorites, recents, and usage stats in backups and restores them", () => {
    saveRecentConditions(["migraines", "ptsd"]);
    saveFavoriteConditions(["tinnitus", "migraines"]);
    saveHomeUsageStats({
      conditions: { migraines: 4 },
      bundles: { "bundle-ptsd-chain": 2 },
      plans: { noise_exposure: 1 },
    });

    const backup = buildWorkspaceBackup();
    expect(backup.recentConditions).toEqual(["migraines", "ptsd"]);
    expect(backup.favoriteConditions).toEqual(["tinnitus", "migraines"]);
    expect(backup.homeUsage).toEqual({
      conditions: { migraines: 4 },
      bundles: { "bundle-ptsd-chain": 2 },
      plans: { noise_exposure: 1 },
    });

    saveRecentConditions([]);
    saveFavoriteConditions([]);
    saveHomeUsageStats({ conditions: {}, bundles: {}, plans: {} });

    applyWorkspaceBackup({
      ...emptyWorkspaceBackup(),
      recentConditions: backup.recentConditions,
      favoriteConditions: backup.favoriteConditions,
      homeUsage: backup.homeUsage,
    });

    expect(loadRecentConditions()).toEqual(["migraines", "ptsd"]);
    expect(loadFavoriteConditions()).toEqual(["tinnitus", "migraines"]);
    expect(loadHomeUsageStats()).toEqual({
      conditions: { migraines: 4 },
      bundles: { "bundle-ptsd-chain": 2 },
      plans: { noise_exposure: 1 },
    });
  });

  test("includes onboarding wizard preferences in backups and restores them", () => {
    saveOnboardingWizardState({
      mode: "bundle",
      step: 2,
      primaryId: "ptsd",
      bundleId: "bundle-ptsd-chain",
      planId: "noise_exposure",
    });

    const backup = buildWorkspaceBackup();
    expect(backup.onboardingWizardState).toEqual({
      mode: "bundle",
      step: 2,
      primaryId: "ptsd",
      bundleId: "bundle-ptsd-chain",
      planId: "noise_exposure",
    });

    saveOnboardingWizardState({});
    applyWorkspaceBackup({
      ...emptyWorkspaceBackup(),
      onboardingWizardState: backup.onboardingWizardState,
    });

    expect(loadOnboardingWizardState()).toEqual({
      mode: "bundle",
      step: 2,
      primaryId: "ptsd",
      bundleId: "bundle-ptsd-chain",
      planId: "noise_exposure",
    });
  });

  test("scores structured theories with reviewer-style feedback", () => {
    const scored = scoreTheoryRecord(
      {
        type: "Secondary service connection",
        subjectId: "migraines",
        parentId: "ptsd",
        summary: "Migraines are worsened by PTSD-related sleep disruption and work stress, causing frequent prostrating headaches.",
      },
      {
        subject: { id: "migraines", body_system: "Neurological Conditions" },
        parent: { id: "ptsd" },
      },
    );

    expect(scored.score).toBeGreaterThan(50);
    expect(["Strong", "Moderate", "Needs work"]).toContain(scored.tier);
  });

  test("builds printable packet html with provenance and sections", () => {
    const html = buildPrintablePacketHtml(
      [{ id: "ptsd", name: "PTSD", body_system: "Mental Disorders" }],
      {
        audience: "representative",
        primary: { name: "PTSD" },
        theories: [{ type: "Direct service connection", subjectName: "PTSD", parentName: "" }],
      },
    );

    expect(html).toContain("VA CFR Finder Printable Packet");
    expect(html).toContain("Provenance:");
    expect(html).toContain("Reviewer Summary Sheet");
    expect(html).toContain("PTSD");
  });

  test("builds an evidence coverage matrix across core claim elements", () => {
    localStorage.setItem("vaCfrNotes:migraines", "Diagnosis confirmed. Frequent headaches affect work and sleep. Secondary to PTSD.");
    localStorage.setItem("vaCfrTimeline:migraines", JSON.stringify([{ date: "2024-02-01", type: "Diagnosis" }]));
    localStorage.setItem("vaCfrEvidenceLinks:migraines", JSON.stringify([{ label: "Neurology note", note: "Provider documents headache frequency.", type: "Medical record" }]));

    const matrix = computeEvidenceCoverageMatrix(
      [{ id: "migraines", name: "Migraines" }],
      { primaryId: "ptsd", links: [{ from: "ptsd", to: "migraines", type: "Secondary to" }] },
    );

    expect(matrix.rows[0].cells.diagnosis).toBe(true);
    expect(matrix.rows[0].cells.severity).toBe(true);
    expect(matrix.rows[0].cells.timeline).toBe(true);
    expect(matrix.rows[0].cells.nexus).toBe(true);
  });

  test("builds starter guidance for missing coverage actions", () => {
    const starter = buildCoverageStarter(
      "migraines",
      "nexus",
      { primaryId: "ptsd", links: [{ from: "ptsd", to: "migraines", type: "Secondary to" }] },
    );

    expect(starter.jump).toBe("notes");
    expect(starter.noteTemplate).toContain("Nexus starter");
    expect(starter.noteTemplate).toContain("ptsd");
  });

  test("assembles a combined packet with selected sections", () => {
    const text = buildAssembledPacketText({
      audience: "review",
      include: {
        overview: false,
        coach: false,
        submission: false,
        theories: true,
        narrative: false,
        timeline: false,
        binder: false,
        coverage: true,
      },
    });

    expect(text).toContain("Smart Packet Assembler");
    expect(text).toContain("STRUCTURED THEORY REVIEW");
    expect(text).toContain("EVIDENCE COVERAGE MATRIX");
  });

  test("detects evidence duplicates and conflicting attached dates", () => {
    localStorage.setItem("vaCfrWorkspace:v4", JSON.stringify({
      nodes: ["migraines", "ptsd"],
      primaryId: "ptsd",
      links: [{ from: "ptsd", to: "migraines", type: "Secondary to" }],
    }));
    localStorage.setItem("vaCfrEvidenceLibrary:v1", JSON.stringify([
      {
        id: "lib-1",
        label: "Neurology note",
        url: "https://example.test/note",
        type: "Medical record",
        excerpt: "",
        tags: [],
      },
      {
        id: "lib-2",
        label: "Neurology note",
        url: "https://example.test/note",
        type: "Medical record",
        excerpt: "",
        tags: [],
      },
    ]));
    localStorage.setItem("vaCfrEvidenceLinks:migraines", JSON.stringify([
      { id: "a", label: "Neurology note", url: "https://example.test/note", type: "Medical record", date: "2024-01-01" },
    ]));
    localStorage.setItem("vaCfrEvidenceLinks:ptsd", JSON.stringify([
      { id: "b", label: "Neurology note", url: "https://example.test/note", type: "Medical record", date: "2024-02-01" },
    ]));

    const findings = analyzeEvidenceConflicts();

    expect(findings.some((finding) => finding.type === "duplicate-url")).toBe(true);
    expect(findings.some((finding) => finding.type === "duplicate-label")).toBe(true);
    expect(findings.some((finding) => finding.type === "conflicting-date")).toBe(true);
  });

  test("builds and parses evidence library csv rows", () => {
    const csv = buildEvidenceLibraryCsv([
      {
        label: "Neurology note",
        url: "https://example.test/note",
        type: "Medical record",
        excerpt: "Headaches worsened.",
        tags: ["migraines", "sleep"],
      },
    ]);
    const parsed = parseEvidenceCsv(csv);

    expect(csv).toContain("Neurology note");
    expect(parsed).toHaveLength(1);
    expect(parsed[0].label).toBe("Neurology note");
    expect(parsed[0].tags).toEqual(["migraines", "sleep"]);
  });

  test("builds milestone csv export rows", () => {
    const csv = buildMilestonesCsv([
      { date: "2024-01-01", stage: "Intent to file", note: "Started claim planning" },
      { date: "2024-03-15", stage: "C&P exam", note: "Migraine exam completed" },
    ]);

    expect(csv).toContain('"date","stage","note"');
    expect(csv).toContain("Intent to file");
    expect(csv).toContain("C&P exam");
  });
});
