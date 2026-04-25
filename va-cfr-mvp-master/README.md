# VA CFR Finder

An educational tool for exploring common VA disability conditions and their related 38 CFR rating references.

## Current Project

The active app lives at the repository root:

- [package.json](/Users/jeromeanderson/va-cfr-mvp/va-cfr-mvp-master/package.json)
- [server.js](/Users/jeromeanderson/va-cfr-mvp/va-cfr-mvp-master/server.js)
- [public/](/Users/jeromeanderson/va-cfr-mvp/va-cfr-mvp-master/public)
- [data/conditions.json](/Users/jeromeanderson/va-cfr-mvp/va-cfr-mvp-master/data/conditions.json)

The nested [va-cfr-mvp/](/Users/jeromeanderson/va-cfr-mvp/va-cfr-mvp-master/va-cfr-mvp) folder is a legacy snapshot and is not used by the active server.

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
- Removal of the unused `public/js/intelligence.js` experimental script
- Jest coverage for parsing, validation, storage migrations, workspace export/share logic, evidence binder logic, evidence graph helpers, workspace UI helpers, detail view/interactions, timeline logic, and API behavior
- Cleanup of inline debug code and repository metadata
