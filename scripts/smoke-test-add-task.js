const { JSDOM, VirtualConsole } = require('jsdom');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function runWithRetries(fn, attempts = 3) {
  let i = 0;
  while (i < attempts) {
    try { return await fn(); } catch (e) {
      i++;
      if (i >= attempts) throw e;
      const backoff = Math.pow(2, i) * 300;
      console.warn('Attempt', i, 'failed, retrying after', backoff, 'ms');
      await sleep(backoff);
    }
  }
}

async function main() {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('log', (m) => console.log('JSDOM_LOG:', m));
  virtualConsole.on('error', (e) => console.error('JSDOM_ERR:', e));

  try {
    const dom = await JSDOM.fromURL('http://localhost:3000', {
      resources: 'usable',
      runScripts: 'dangerously',
      virtualConsole,
      pretendToBeVisual: true,
    });

    // polyfill fetch resolution
    if (typeof global.fetch === 'function') {
      const realFetch = global.fetch.bind(global);
      dom.window.fetch = async (url, opts) => {
        const resolved = new URL(url, dom.window.location.href).toString();
        console.log('JSDOM_FETCH:', resolved);
        return await realFetch(resolved, opts);
      };
    }

    // wait for initial scripts
    await new Promise(r => setTimeout(r, 500));

    // wait for results to render (existence of first Add button)
    let attempts = 0;
    while (attempts < 30) {
      const btn = dom.window.document.querySelector('button[data-add]');
      if (btn) break;
      await new Promise(r => setTimeout(r, 200));
      attempts++;
    }

    const firstAddBtn = dom.window.document.querySelector('button[data-add]');
    if (!firstAddBtn) {
      console.log('No results/add button found; aborting');
      process.exit(1);
    }

    const firstId = firstAddBtn.getAttribute('data-add');
    if (typeof dom.window.showDetail === 'function') {
      dom.window.showDetail(firstId, true);
      await new Promise(r => setTimeout(r, 300));
    } else {
      dom.window.history.pushState({ id: firstId, jump: '' }, '', `/condition/${firstId}`);
    }


    // fill inline add task form
    const addBtn = dom.window.document.getElementById('addTaskBtn');
    if (!addBtn) { console.log('No addTaskBtn found'); process.exit(1); }
    addBtn.click();

    // wait for form to appear
    attempts = 0;
    while (attempts < 20) {
      const panel = dom.window.document.getElementById('addTaskForm');
      if (panel && !panel.classList.contains('hidden')) break;
      await new Promise(r => setTimeout(r, 100));
      attempts++;
    }

    const titleInp = dom.window.document.getElementById('addTask_title');
    const dueInp = dom.window.document.getElementById('addTask_due');
    const prSel = dom.window.document.getElementById('addTask_priority');
    const attachCb = dom.window.document.getElementById('addTask_attach');
    const submit = dom.window.document.getElementById('addTask_submit');
    if (!titleInp || !submit) { console.log('Add task form missing'); process.exit(1); }

    titleInp.value = 'Follow up: request records';
    dueInp.value = '';
    prSel.value = '';
    attachCb.checked = true;
    submit.click();

    await new Promise(r => setTimeout(r, 400));

    const stateRaw = dom.window.localStorage.getItem('vaCfrFinderState');
    const state = stateRaw ? JSON.parse(stateRaw) : null;

    console.log('SMOKE_ADD_TASK_RESULT:', JSON.stringify({ state }, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('SMOKE_ADD_TASK_ERROR:', err);
    throw err;
  }
}

runWithRetries(main).catch(err => { console.error('SMOKE_ADD_TASK_ERROR:', err && err.message); process.exit(2); });
