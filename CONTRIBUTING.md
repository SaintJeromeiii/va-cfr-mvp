## Contributing

Run the server locally and execute Playwright smoke tests:

1. Install dependencies:

```bash
npm ci
npx playwright install --with-deps
```

2. Start the server (in another terminal):

```bash
npm start
```

3. Run Playwright tests locally:

```bash
npx playwright test
```

If you need to run the smoke scripts (legacy):

```bash
npm run smoke:auth
npm run smoke:add-task
```

For CI behavior: tests run with retries on CI and upload artifacts (reports, traces, screenshots).
