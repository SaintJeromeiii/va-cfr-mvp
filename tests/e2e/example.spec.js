const { test, expect } = require('@playwright/test');

test('homepage responds', async ({ page }) => {
  const resp = await page.goto('http://127.0.0.1:3000', { waitUntil: 'domcontentloaded', timeout: 30000 });
  expect(resp && resp.ok()).toBeTruthy();
  await expect(page.locator('body')).not.toBeHidden();
});
