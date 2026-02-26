const { JSDOM, VirtualConsole } = require('jsdom');

(async () => {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('log', m => console.log('JSDOM_LOG:', m));
  virtualConsole.on('error', e => console.error('JSDOM_ERR:', e));

  try {
    const dom = await JSDOM.fromURL('http://localhost:3000', {
      resources: 'usable',
      runScripts: 'dangerously',
      virtualConsole,
      pretendToBeVisual: true,
    });

    // polyfill fetch
    if (typeof global.fetch === 'function') {
      const realFetch = global.fetch.bind(global);
      dom.window.fetch = async (url, opts) => {
        const resolved = new URL(url, dom.window.location.href).toString();
        console.log('JSDOM_FETCH:', resolved);
        return await realFetch(resolved, opts);
      };
    }

    // wait for render
    await new Promise(r => setTimeout(r, 700));

    // ensure there is at least one task; if none, create one via existing flow
    const state = dom.window.getAppState();
    if (!state.tasks || !state.tasks.length) {
      // add a task via existing add button flow
      dom.window.prompt = () => 'Smoke test task';
      const addBtn = dom.window.document.getElementById('addTaskBtn');
      addBtn.click();
      await new Promise(r => setTimeout(r, 500));
    }

    // find first delete button and click it
    const del = dom.window.document.querySelector('#wsList button');
    if (!del) {
      console.log('No delete button found');
      process.exit(1);
    }
    del.click();
    await new Promise(r => setTimeout(r, 400));

    console.log('SMOKE_MANAGE_TASKS_DONE');
    process.exit(0);
  } catch (err) {
    console.error('SMOKE_MANAGE_TASKS_ERROR:', err);
    process.exit(2);
  }
})();
