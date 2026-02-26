const { JSDOM, VirtualConsole } = require('jsdom');

(async () => {
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

    // stub prompt and confirm
    dom.window.prompt = (msg) => {
      console.log('PROMPT_CALLED:', msg);
      return 'Follow up: request records';
    };
    dom.window.confirm = (msg) => {
      console.log('CONFIRM_CALLED:', msg);
      return true; // attach to current condition
    };

    // wait briefly
    await new Promise(r => setTimeout(r, 200));

    const addBtn = dom.window.document.getElementById('addTaskBtn');
    if (!addBtn) {
      console.log('No addTaskBtn found');
      process.exit(1);
    }

    addBtn.click();

    await new Promise(r => setTimeout(r, 400));

    const stateRaw = dom.window.localStorage.getItem('vaCfrFinderState');
    const state = stateRaw ? JSON.parse(stateRaw) : null;

    console.log('SMOKE_ADD_TASK_RESULT:', JSON.stringify({ state }, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('SMOKE_ADD_TASK_ERROR:', err);
    process.exit(2);
  }
})();
