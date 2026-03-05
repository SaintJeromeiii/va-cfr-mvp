const { defineConfig } = require('@playwright/test');
const path = require('path');

module.exports = defineConfig({
  testDir: 'tests/playwright',
  timeout: 120_000,
  expect: { timeout: 20000 },
  // Increase retries on CI to reduce flakiness; limit workers on CI for stability
  retries: process.env.CI ? 5 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report' }],
    ['junit', { outputFile: path.join(process.cwd(), 'playwright-junit.xml') }]
  ],
  webServer: {
    command: 'node server.js',
    port: 3000,
    timeout: 120000,
    reuseExistingServer: true
  },
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    headless: true,
    viewport: { width: 1280, height: 800 },
    actionTimeout: 30000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // store test artifacts under a consistent folder so CI can upload them
    video: 'retain-on-failure'
  },
});
