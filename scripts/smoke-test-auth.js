const fetch = global.fetch || require('node-fetch');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function runWithRetries(fn, attempts = 3) {
  let i = 0;
  while (i < attempts) {
    try { return await fn(); } catch (e) {
      i++;
      if (i >= attempts) throw e;
      const backoff = Math.pow(2, i) * 250;
      console.warn('Attempt', i, 'failed, retrying after', backoff, 'ms');
      await sleep(backoff);
    }
  }
}

async function main() {
  const base = 'http://localhost:3000';
    const uname = `smoke_${Date.now().toString(16).slice(4)}`;
    const pwd = 'smoke-pass';

    console.log('TEST: registering', uname);
    let res = await fetch(base + '/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: uname, password: pwd }),
    });

    const setCookie = res.headers.get('set-cookie') || '';
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('REGISTER_FAILED', res.status, body);
      process.exit(2);
    }
    console.log('REGISTER_OK', body);

    // use cookie for authenticated request
    const cookie = setCookie.split(';')[0];
    res = await fetch(base + '/api/me', { headers: { Cookie: cookie } });
    const me = await res.json().catch(() => ({}));
    if (!res.ok || !me.username) {
      console.error('ME_CHECK_FAILED', res.status, me);
      process.exit(3);
    }
    console.log('ME_OK', me.username === uname ? 'username matches' : me);

    // logout
    res = await fetch(base + '/api/logout', { method: 'POST', headers: { Cookie: cookie } });
    console.log('LOGOUT_STATUS', res.status);

    // login again
    res = await fetch(base + '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: uname, password: pwd }),
    });
    const setCookie2 = res.headers.get('set-cookie') || '';
    const b2 = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('LOGIN_FAILED', res.status, b2);
      process.exit(4);
    }
    const cookie2 = setCookie2.split(';')[0];
    res = await fetch(base + '/api/me', { headers: { Cookie: cookie2 } });
    const me2 = await res.json().catch(() => ({}));
    if (!res.ok || me2.username !== uname) {
      console.error('ME_AFTER_LOGIN_FAILED', res.status, me2);
      process.exit(5);
    }
    console.log('ME_AFTER_LOGIN_OK', me2.username);

    // fetch tasks as authenticated user
    res = await fetch(base + '/api/tasks', { headers: { Cookie: cookie2 } });
    const tasks = await res.json().catch(() => null);
    console.log('TASKS_OK', Array.isArray(tasks) ? `count=${tasks.length}` : tasks);

    console.log('SMOKE_AUTH_PASSED');
    process.exit(0);
}

runWithRetries(main).catch(err => {
  console.error('SMOKE_AUTH_ERROR', err && err.message);
  process.exit(2);
});
