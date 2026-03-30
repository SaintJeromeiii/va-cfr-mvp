# Changelog

## Unreleased

- CI: Fixed Playwright CI flakiness by running single job with retries and unique artifact names.
- CI: Added `test:e2e` and `test:e2e:install` npm scripts for Playwright.
- CI: Disabled in-PR test reporter to avoid fork/token failures.
- Dependencies: Applied safe minor/patch upgrades (see `npm outdated` results prior to upgrade).

## Merged PRs
- Merge: add-deploy-workflow-pr — CI fixes and scripts (PR #19)
