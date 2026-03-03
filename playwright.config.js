const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests/playwright',
  timeout: 30_000,
  expect: { timeout: 5000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'playwright-junit.xml' }]
  ],
  webServer: {
    command: 'node server.js',
    port: 3000,
    timeout: 120000,
    reuseExistingServer: !process.env.CI
  },
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    headless: true,
    viewport: { width: 1280, height: 800 },
    actionTimeout: 5000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
});
