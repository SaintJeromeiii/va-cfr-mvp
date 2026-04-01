const { test } = require('@playwright/test');

test('capture console and network', async ({ page }) => {
  const logs = [];
  page.on('console', m => logs.push({ type: m.type(), text: m.text() }));
  page.on('pageerror', e => logs.push({ type: 'pageerror', text: e.message }));
  const responses = [];
  page.on('response', r => responses.push({ url: r.url(), status: r.status() }));

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'playwright-screenshot.png', fullPage: true });

  console.log('===CONSOLE LOGS===');
  console.log(JSON.stringify(logs, null, 2));
  console.log('===RESPONSES===');
  console.log(JSON.stringify(responses.slice(-20), null, 2));
});
