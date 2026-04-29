# VA CFR Finder

An educational tool for exploring common VA disability conditions and their related 38 CFR rating references.

## Current Project

The active app lives at the repository root:

- [package.json](/Users/jeromeanderson/va-cfr-mvp/va-cfr-mvp-master/package.json)
- [server.js](/Users/jeromeanderson/va-cfr-mvp/va-cfr-mvp-master/server.js)
- [public/](/Users/jeromeanderson/va-cfr-mvp/va-cfr-mvp-master/public)
- [data/conditions.json](/Users/jeromeanderson/va-cfr-mvp/va-cfr-mvp-master/data/conditions.json)

## Scripts

- `npm run dev` starts the app with live reload.
- `npm start` starts the production server.
- `npm test` runs the automated test suite.
- `npm run format` formats the repo with Prettier.

## Improvements Added

- Shared condition loading and validation logic in `lib/conditions.js`
- A reusable Express app factory in `lib/app.js`
- Browser-safe utility modules for command parsing, search/result ranking, timeline sorting, shared notifications, storage/state persistence, workspace export/share behavior, workspace tool/panel orchestration, evidence binder aggregation, evidence graph rendering, workspace UI rendering, workspace narrative/timeline drafting, secondary-condition cards, and detail view/interactions
- In-page feedback and secondary-link controls replacing most browser alert/prompt UX
- Removal of unused placeholder UI panels and duplicate controls so the page reflects the active feature set
- Shared confirm modal for destructive actions, cleaner workspace panel grouping, and more structured export text output
- Live workspace cards now surface relationship summaries and next-step guidance before export
- Workspace guidance now flags likely missing support for linked secondary conditions, including missing evidence links and missing nexus/timeline notes
- A claim-wide workspace risk strip now surfaces top gaps like missing support, missing notes, disconnected items, and checklist coverage at a glance
- Workspace risk chips are now clickable and jump attention to the affected condition cards
- Quick Start Claim Plans now let users scaffold common workspace setups from the homepage instead of building every relationship by hand
- Guided Claim Builder now lets users choose a primary condition and stage suggested related issues in one structured workflow
- Document Intake now lets users paste source text to detect likely conditions, dates, and candidate notes/timeline entries for the workspace
- Evidence Strength scoring now distinguishes weak, moderate, and strong support on each workspace condition instead of only checklist completion
- VA Rating Estimator now lets users enter a current combined rating, model projected workspace percentages, and estimate a potential combined-rating increase
- Claim Strategy Coach now turns the current workspace into a plain-English theory summary with strengths, weak spots, and next actions
- Evidence Hub now provides a searchable workspace-wide view of saved evidence items with filters by scope, type, condition, and label-only status
- Workspace packet export now supports audience-specific output modes for quick review, veteran-facing summaries, and representative-facing review packets
- Guided onboarding now adds a Start Here flow plus a sticky workspace summary with primary-condition, snapshot, rating, and blocker context
- Claim Theory Builder now stores structured direct, secondary, aggravation, and increase theories and carries them through strategy summaries, packet exports, snapshots, and backups
- Guided Nexus Builder now helps users turn secondary-condition logic into a reusable nexus draft and append it directly into condition notes
- Saved rating scenarios now let users keep named conservative, moderate, or aggressive estimate setups and reload them later
- A reusable document library now stores intake text like DBQ notes, lay statements, and medical summaries so users can reload and reanalyze them across claims
- Evidence Library now stores reusable evidence links and excerpts that can be attached across multiple workspace conditions
- Restore points now support milestone labels plus compare/restore history so major claim revisions are easier to track over time
- Workspace conditions can now be filtered by search text, support level, status, body system, and note presence for larger claims
- Workspace Dashboard now highlights the current primary condition, projected rating context, restore/theory counts, strongest claims, weakest claims, and next-best actions in one place
- Claim Workspaces / Profiles now let users save separate local workspaces for different veterans, alternate theories, or milestone claim versions and reload them cleanly
- Granular evidence gap detection now surfaces diagnosis, severity/impact, timeline, relationship, and checklist weaknesses across workspace cards and health summaries
- Section-based readiness scoring now breaks each condition into diagnosis, severity, nexus, timeline, and evidence readiness instead of only one broad support signal
- Packet Review Mode now audits the current workspace for missing theories, thin secondaries, missing evidence, timeline conflicts, and overly aggressive rating assumptions before export
- Submission-Prep Mode now generates a final handoff review with strongest claims, weakest claims, verification steps, and assumptions to review before sharing the packet externally
- Condition-specific coaching now gives more targeted next-step guidance inside workspace cards and the detail view instead of only generic gap messaging
- Evidence Library records now surface suggested workspace targets automatically based on label, excerpt, tags, and condition/body-system matches
- Record-to-Claim Mapper now breaks pasted records into likely supported conditions, claim elements, quoted excerpts, confidence hints, and follow-up prompts
- Evidence Coverage Matrix now shows which workspace conditions already have diagnosis, severity, timeline, and nexus support and which claim elements are still missing
- Missing coverage cells in the Evidence Coverage Matrix now jump directly into the right condition area and can drop in starter text for notes or timeline work
- Smart Packet Assembler now combines selected sections like overview, theory review, coach output, submission prep, narrative, timeline, binder, and coverage into one configurable handoff draft
- Structured theories now get reviewer-style scoring and feedback so users can see whether each theory is strong, moderate, or still needs work
- Printable packet output can now open in a cleaner browser-friendly format for easier review, printing, and representative handoff
- Condition detail views now show a compact readiness and provenance summary strip so the user can see the weakest section before editing notes, timeline, or evidence
- Generated and inferred content is now labeled with a provenance layer so the app distinguishes user-entered, inferred, and generated material more clearly
- VA Rating Estimator now supports scenario comparison so users can compare conservative, moderate, and aggressive projection paths from the same workspace
- Workspace Timeline now runs a conflict check for invalid dates, future dates, and same-day multi-event collisions
- One-click multi-packet export now downloads quick-review, veteran, and representative packets together
- Guided condition forms now give condition-specific structured prompts inside the detail view and can append a reusable summary into notes
- Evidence duplicate / conflict review now surfaces duplicate library records plus conflicting attached dates and labels in a dedicated workspace panel
- Representative Handoff now generates a representative-facing review summary with strongest claims, weak spots, evidence conflicts, and next actions
- Auto Next Actions now turns top blockers, missing milestones, and evidence conflicts into a prioritized workspace action queue
- Claim Milestone Tracker now captures claim-stage events like intent to file, C&P exams, decisions, and appeal steps and can export them to CSV
- Printable packet output now includes a cover sheet, summary cards, stronger review framing, and better page-break behavior for printing
- Evidence Library CSV import/export now gives the app a cleaner data portability path for reusable evidence records
- Timeline-to-narrative synthesis now converts dated workspace events into a draft paragraph that can feed claim-writing and review workflows
- Workspace Snapshots now let users save and restore named claim checkpoints, including notes, timeline entries, evidence links, checklist state, and workspace relationships
- Full Backup export/import now lets users archive or restore the entire local workspace state, including snapshots, activity history, relationships, notes, timelines, and evidence links
- Mobile and tablet spacing has been tightened with better wrapping for navigation, dashboard cards, detail summaries, and dense workspace controls
- The bundled condition dataset now includes a broader 30-condition starter library across mental health, auditory, neurological, musculoskeletal, respiratory, digestive, cardiovascular, skin, and genitourinary categories
- The homepage now includes a curated condition-browsing layer with popular-condition shortcuts and category cards so users can find common claims faster without relying only on search
- The browse layer now remembers recent conditions, supports pinned favorites, and offers common-secondary bundles for faster workspace scaffolding
- Featured homepage condition cards now show common connection hints, and a first-time guided setup wizard now helps new users choose between a primary-condition path, a secondary bundle, or a quick-start plan
- The onboarding wizard now remembers its last-used path and selections locally, and featured condition cards now explain why each condition is a common starting point
- The onboarding wizard state is now included in full backups and workspace profiles, so the `Start Here` flow restores exactly where the user left it
- The homepage now includes a live recommended-next-action card plus a local usage snapshot that surfaces the most-used conditions, bundles, and quick-start plans
- Homepage favorites, recent conditions, and usage snapshot history are now included in full backups and workspace profiles so the personalized browse experience survives restores
- Document Intake now includes a richer evidence extractor that pulls out likely providers, symptoms, diagnosis/severity/nexus phrases, and dates, with one-click actions into notes, timelines, and the evidence library
- Document Intake now supports `.pdf` and `.docx` extraction in addition to plain-text files, so uploaded records can flow into the same intake and evidence workflow
- The Evidence Extractor now includes an excerpt review workspace where users can edit, reject, and de-duplicate extracted phrases before applying them
- The extractor now also supports before-apply previews for note summaries, timeline entries, and evidence-record output so users can verify generated results before committing them
- Extractor previews now compare against existing notes, timeline entries, and evidence links on the target condition so likely duplicates are visible before apply
- A one-click `Apply Only New Items` action now skips duplicate note, timeline, and evidence output automatically when the extractor already overlaps the target condition
- The extractor can now build a small condition-specific draft packet bundle with notes, timeline, evidence, and duplicate-check context for copy/download before anything is applied
- Saved draft packets can now be compared side by side so users can review changes across notes, timeline, evidence, and duplicate-check sections
- Saved draft packets can now be applied back to their target condition from the library, with duplicate-safe note, timeline, and evidence promotion
- Saved draft packets can now be tagged by purpose, such as `nexus draft`, `timeline-heavy`, or `rep handoff candidate`, so the library is easier to scan later
- The saved packet library can now be filtered by purpose tag and target condition, which makes larger packet sets much easier to narrow quickly
- The saved packet library can now also be sorted by newest, target condition, or purpose tag so filtered packet sets are easier to organize
- Important saved packets can now be pinned to the top of the library so key draft packets stay visible regardless of sort order
- Saved packets can now be archived out of the active library view and restored later with an archived-packets view, so older drafts can be hidden without being deleted
- The saved packet library now supports bulk selection, bulk archive/restore, and bulk apply actions so larger packet sets can be managed much faster
- The saved packet library now also supports bulk retagging and bulk delete actions, so packet cleanup and reorganization are faster once the library grows
- The bulk packet toolbar now includes one-click saved tag presets like `Nexus Draft`, `Rep Handoff`, `Timeline Review`, and `Severity Review` for faster packet triage
- You can also save and delete your own custom packet tag presets locally, and they appear alongside the built-in presets in the bulk packet toolbar
- Custom packet presets are now included in full backup exports/imports and saved workspace profiles, so your preset workflows carry across restores and profile loads
- Extractor application history now shows which extracted phrases were applied to which condition, when, and from which source document
- Guided condition forms now include stronger digestive-condition prompts, and Representative Handoff now includes a compact review snapshot above the full handoff text
- Removal of the unused `public/js/intelligence.js` experimental script
- Jest coverage for parsing, validation, storage migrations, workspace export/share logic, evidence binder logic, evidence graph helpers, workspace UI helpers, detail view/interactions, timeline logic, and API behavior
- Cleanup of inline debug code and repository metadata
