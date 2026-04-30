# VA CFR Finder Launch Checklist

Use this before making the app available to a public audience.

## Required environment

- `NODE_ENV=production`
- `TRUST_PROXY=1` when deployed behind a reverse proxy/load balancer
- `ADMIN_SECRET=<strong random secret>` if admin endpoints are enabled
- `CORS_ORIGIN=<public https origin>` only if cross-origin browser access is needed
- `SESSION_ROTATE_ON_LOGIN=true` unless you have a reason to keep concurrent sessions
- `MAX_SESSIONS_PER_USER` set to a small, documented value
- `AUDIT_LOG_RETENTION_DAYS` set to your retention policy
- `AUTH_RATE_LIMIT_MAX`, `FEEDBACK_RATE_LIMIT_MAX`, and `ANALYTICS_RATE_LIMIT_MAX` reviewed for beta traffic

## Security

- Serve only over HTTPS.
- Verify cookies include `HttpOnly`, `SameSite=Strict`, and `Secure` in production.
- Keep user/session/workspace data out of Git. Runtime user data under `data/users/*/` is ignored.
- Set file permissions so only the app process can read/write runtime data.
- Use a strong `ADMIN_SECRET`; do not reuse passwords or commit it to the repo.
- Confirm auth rate limiting is active for login/register endpoints.
- Review admin endpoints before exposing the app publicly.

## Data and privacy

- Publish a privacy/safety notice before launch.
- Confirm users can download local data and clear browser-local claim data.
- Back up `data/users`, `data/tasks.json`, and `data/feedback.log` daily if using file storage.
- Test a restore from backup before launch.
- Prefer moving public-user data to a database before broad launch.
- Do not ask users to submit private medical details in feedback.

## Content accuracy

- Verify high-traffic conditions manually before launch:
  - tinnitus
  - PTSD
  - migraines
  - spine/back
  - radiculopathy/sciatica
  - sleep apnea
  - knees/shoulders
- Confirm every condition has current source links.
- Update the visible `DATA_LAST_REVIEWED` date when data is reviewed.

## QA

- Check `/healthz` returns `ok`.
- Check `/readyz` returns `ok` before sending beta traffic.
- Run `node scripts/validate_conditions.js`.
- Run `npm run test:e2e`.
- Smoke test mobile widths for search, workspace, auth, export, and feedback.
- Test signed-in workspace sync on a clean browser profile.
- Test guest/local-only mode and data export.

## Operational notes

- Monitor server logs for errors after launch.
- Review `data/feedback.log` regularly for incorrect CFR reports and condition requests.
- Review `data/analytics.log` only for aggregate usage patterns; do not treat it as user research about private claim details.
- Keep a rollback plan: record the last known-good Git commit before deployment.
