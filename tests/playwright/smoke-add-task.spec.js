const { test, expect } = require('@playwright/test');

test('smoke: add task via UI', async ({ page, request }) => {
  const base = page.context()._options.baseURL || 'http://localhost:3000';
  // attach debug listeners early to capture console / page errors
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err));
  page.on('requestfailed', req => console.log('REQ FAILED:', req.url(), req.failure()?.errorText));

  // register a fresh user and set the session cookie so the UI is authenticated
  const uname = `smoke_ui_${Date.now().toString(16).slice(6)}`;
  const pwd = 'smoke-pass';
  const reg = await request.post(base + '/api/register', { data: { username: uname, password: pwd } });
  const setCookie = reg.headers()['set-cookie'] || '';
  const sid = (setCookie.split(';')[0] || '').split('=')[1] || null;
  if (sid) {
    // add cookie using the registered base URL so it applies to deployed domains
    await page.context().addCookies([{ name: 'sid', value: sid, url: base }]);
  }
  await page.goto(base);

  // click the main "Add Task" button (more stable than condition-specific buttons)
  const mainAddBtn = page.getByRole('button', { name: /^Add Task$/i });
  await expect(mainAddBtn).toBeVisible({ timeout: 15000 });
  await mainAddBtn.click();

  // ensure add task UI available and click add button
  const addUiBtn = page.locator('#addTaskBtn');
  await expect(addUiBtn).toBeVisible({ timeout: 10000 });
  await addUiBtn.click();
  const addForm = page.locator('#addTaskForm');
  await expect(addForm).toBeVisible({ timeout: 10000 });

  const titleInput = page.locator('#addTask_title');
  await expect(titleInput).toBeVisible({ timeout: 10000 });
  await titleInput.fill('Follow up: request records');

  // submit and wait for the POST /api/tasks response instead of a fixed timeout
  // ensure submit control is visible, then submit and wait for POST
  const submitBtn = page.locator('#addTask_submit');
  await expect(submitBtn).toBeVisible({ timeout: 15000 });
  const [response] = await Promise.all([
    page.waitForResponse(r => r.url().includes('/api/tasks') && r.request().method() === 'POST', { timeout: 30000 }),
    submitBtn.click()
  ]);
  expect(response.ok()).toBeTruthy();

  // read state from localStorage and assert
  const stateRaw = await page.evaluate(() => localStorage.getItem('vaCfrFinderState'));
  const state = stateRaw ? JSON.parse(stateRaw) : null;
  expect(state).not.toBeNull();
  const tasks = state && state.tasks ? state.tasks : null;
  expect(Array.isArray(tasks)).toBeTruthy();
});

page.on('console', msg => console.log('PAGE LOG:', msg.text()));
page.on('pageerror', err => console.log('PAGE ERROR:', err));
page.on('requestfailed', req => console.log('REQ FAILED:', req.url(), req.failure()?.errorText));
