# User Testing Checklist

Use this checklist before sharing the test link.

## Environment Readiness

- [ ] Render service status is `Live`.
- [ ] Service is deployed from the intended branch and latest commit.
- [ ] Required env vars are set: `NODE_ENV=production`, `ADMIN_SECRET`, `TRUST_PROXY=1`.
- [ ] Public URL opens in an incognito/private browser window.

## Smoke Test (2-3 minutes)

- [ ] Homepage loads without blocking errors.
- [ ] Search works (try at least one condition term).
- [ ] Opening a condition detail view works.
- [ ] Workspace add/remove actions work.
- [ ] Export/share actions you care about for this test pass.

## Safety and Scope

- [ ] No sensitive personal information is preloaded in the app.
- [ ] Testers are told this is a pre-release/test environment.
- [ ] Testers are told data may change/reset.
- [ ] Admin secrets are not shared with testers.

## Tester Operations

- [ ] A test script (tasks to try) is ready.
- [ ] A feedback template is ready and shared.
- [ ] A single location for bug reports is ready (GitHub Issues, form, etc.).
- [ ] You have one owner (you) triaging tester feedback daily.

## Suggested Test Tasks

1. Search for two conditions and open both detail views.
2. Add at least three items to the workspace and create one linked relationship.
3. Add one evidence note and one timeline event.
4. Generate one export artifact and report whether it matches expectations.
5. Report one confusing part of the UI, even if nothing breaks.
