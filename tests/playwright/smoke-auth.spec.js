const { test, expect } = require('@playwright/test');

test('smoke: auth flow', async ({ page, request }) => {
  const base = page.context()._options.baseURL || 'http://localhost:3000';
  const uname = `smoke_${Date.now().toString(16).slice(4)}`;
  const pwd = 'smoke-pass';

  const reg = await request.post(base + '/api/register', { data: { username: uname, password: pwd } });
  expect(reg.ok()).toBeTruthy();
  const setCookie = reg.headers()['set-cookie'] || '';
  const cookie = setCookie.split(';')[0];

  const me = await request.get(base + '/api/me', { headers: { Cookie: cookie } });
  expect(me.ok()).toBeTruthy();
  const meJson = await me.json();
  expect(meJson.username).toBe(uname);

  // logout
  await request.post(base + '/api/logout', { headers: { Cookie: cookie } });

  // login
  const login = await request.post(base + '/api/login', { data: { username: uname, password: pwd } });
  expect(login.ok()).toBeTruthy();
  const setCookie2 = login.headers()['set-cookie'] || '';
  const cookie2 = setCookie2.split(';')[0];

  const me2 = await request.get(base + '/api/me', { headers: { Cookie: cookie2 } });
  const me2Json = await me2.json();
  expect(me2Json.username).toBe(uname);

  const tasks = await request.get(base + '/api/tasks', { headers: { Cookie: cookie2 } });
  const tasksJson = await tasks.json();
  expect(Array.isArray(tasksJson)).toBeTruthy();
});
