# Quarantined / Flaky Tests

This file tracks tests that are temporarily quarantined (skipped) due to flakiness.

Format:
- test path — reason — PR/Run that showed flakiness — owner

Current status:
- None at the moment — smoke tests passed locally and in the latest CI run after fixing reporter/Node issues.

Guidelines:
- When a test is observed failing intermittently across CI runs, create a small PR that:
  - Marks the test with `test.skip()` or wraps the flaky tests in `test.describe.skip()`.
  - Adds an entry here describing the failure, link to the failing run, and a short plan to fix.
  - Labels the PR with `quarantine` and assigns the owner.
- Quarantine PRs should be short-lived and tracked; follow-up fixes must be created within 2 weeks.

How to unquarantine:
- Reproduce the failure locally or via a targeted CI job.
- Fix the root cause (timing, selector instability, shared global state, external dependency).
- Replace `test.skip()` with the fixed test and add a regression test if appropriate.
