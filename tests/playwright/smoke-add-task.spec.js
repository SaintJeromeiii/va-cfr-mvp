const { test, expect } = require('@playwright/test');

test('smoke: add task via UI', async ({ page }) => {
  const base = page.context()._options.baseURL || 'http://localhost:3000';
  await page.goto(base);

  await page.waitForSelector('button[data-add]', { timeout: 10000 });
  const firstAdd = page.locator('button[data-add]').first();
  const firstId = await firstAdd.getAttribute('data-add');
  await firstAdd.click();

  // ensure add task UI available and click add button
  await page.waitForSelector('#addTaskBtn', { timeout: 5000 });
  await page.click('#addTaskBtn');
  await page.waitForSelector('#addTaskForm:not(.hidden)', { timeout: 5000 });

  await page.fill('#addTask_title', 'Follow up: request records');
  // submit
  await page.click('#addTask_submit');

  // wait a bit for localStorage update
  await page.waitForTimeout(500);

  const stateRaw = await page.evaluate(() => localStorage.getItem('vaCfrFinderState'));
  const state = stateRaw ? JSON.parse(stateRaw) : null;
  expect(state).not.toBeNull();
  const tasks = state && state.tasks ? state.tasks : null;
  expect(Array.isArray(tasks)).toBeTruthy();
});
