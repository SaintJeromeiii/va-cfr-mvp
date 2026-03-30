Deployment guide — va-cfr-mvp

Quick Docker (local)

1. Create a `.env` with at least:

   ADMIN_SECRET=your-strong-secret
   NODE_ENV=production

2. Build and run (production compose):

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

3. The app will be available at http://localhost:3000 (or your host IP). Data is persisted to `./data`.

Render

- Create a new Web Service on Render and connect your GitHub repo.
- Use the existing `Dockerfile` (Render will build the image).
- Set environment variables: `ADMIN_SECRET`, `NODE_ENV=production`, `PORT=3000`.
- Add a persistent disk or attach an External Service for backups if you want `data/` persisted.

Heroku (Docker)

- Create an app and enable container stack.
- Push the Docker image or use GitHub integration with Render-equivalent steps.
- Set required env vars in Heroku dashboard.

Heroku (quick Git/GitHub deploy)

- I added `Procfile` and `app.json` to this repo to enable Heroku and One-Click deploy.
- To deploy via the Heroku CLI:

```bash
# login
heroku login

# create app (or use existing)
heroku create your-app-name

# set required env vars
heroku config:set ADMIN_SECRET=your-secret NODE_ENV=production TRUST_PROXY=1

# push main (or your branch)
git push heroku main

# open the app
heroku open
```

- To enable One-Click deploy from GitHub (Heroku button):
   - Use `app.json` in repo; on Heroku dashboard choose "Deploy -> GitHub" and connect the repo, or use the "Deploy to Heroku" button with `app.json`.

Notes:
- If you prefer container-based deploy, use the existing `Dockerfile` and follow Heroku container registry docs:

```bash
heroku container:login
heroku create your-app-name
heroku container:push web --app your-app-name
heroku container:release web --app your-app-name
```

Production checklist

- Ensure `ADMIN_SECRET` is set.
- Use `NODE_ENV=production`.
- Ensure cookie `Secure` flag is enabled (server detects `NODE_ENV`).
- Set up TLS (Let’s Encrypt via platform or use Cloudflare).
- Configure backups for `data/` or migrate to a DB.
 
S3 Backup instructions

- To enable automated backups of the `data/` folder to S3, set these env vars on Heroku or your host:
   - `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET` (and optional `S3_PREFIX`).
- The repo includes `scripts/backup-data-to-s3.js` and an npm script `backup:data`.

Run the backup locally:
```bash
S3_BUCKET=your-bucket AWS_REGION=us-east-1 npm run backup:data
```

On Heroku you can schedule backups using the Heroku Scheduler add-on and run:
```bash
npm run backup:data
```

CORS and proxy notes

- The server enables CORS only when `CORS_ORIGIN` is set. Set `CORS_ORIGIN` to the allowed origin (e.g. `https://your-domain.com`).
- If you run the app behind a reverse proxy (NGINX, Cloudflare, Render), set `TRUST_PROXY=1` so the app marks cookies `Secure` correctly and honors proxy headers.

Environment variables summary

- `ADMIN_SECRET` — required for admin endpoints.
- `NODE_ENV=production` — enables production behavior.
- `CORS_ORIGIN` — optional, restrict allowed origins for CORS.
- `TRUST_PROXY=1` — set when running behind a trusted reverse proxy.

Next steps I can do:
- Add `helmet`, CORS, and rate-limiting to `server.js`.
- Add a small `docker-compose.prod.yml` (already added).
- Prepare a Render/Heroku-specific `render.yaml` or `Procfile` if you want.
