const { test, expect } = require('@playwright/test');

test('basic smoke: load homepage and interact', async ({ page }) => {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  // page title
  await expect(page).toHaveTitle(/VA CFR Finder/);

  // Check core elements exist
  await expect(page.locator('#q')).toBeVisible();
  await expect(page.locator('#results')).toBeVisible();
  await expect(page.locator('#addTaskBtn')).toBeVisible();

  // Toggle dark mode (if present)
  const dm = page.locator('#darkModeToggle');
  if (await dm.count() > 0) await dm.click();

  // Perform a search for 'tinnitus'
  await page.fill('#q', 'tinnitus');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600); // short wait for UI update

  // If results rendered, click first result's link/button if available
  const firstResult = page.locator('#results').locator('a, button, .result-item').first();
  if (await firstResult.count() > 0) {
    await firstResult.click();
    await page.waitForTimeout(400);
  }

  // Open add task UI and create a task
  await page.click('#addTaskBtn');
  await expect(page.locator('#addTaskForm')).toBeVisible();
  await page.fill('#addTask_title', 'Playwright smoke task');
  await page.click('#addTask_submit');
  // verify task saved to localStorage by reading via page.evaluate
  const hasTask = await page.evaluate(() => {
    const key = 'vaCfrWorkspace:v4';
    try { return !!localStorage.getItem(key) || !!localStorage.getItem('vaCfrTasks'); } catch { return false; }
  });
  expect(hasTask).toBeTruthy();
});
