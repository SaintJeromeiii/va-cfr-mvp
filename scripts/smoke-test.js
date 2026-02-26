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

    // expose fetch that resolves relative URLs
    if (typeof global.fetch === 'function') {
      const realFetch = global.fetch.bind(global);
      dom.window.fetch = async (url, opts) => {
        try {
          const resolved = new URL(url, dom.window.location.href).toString();
          console.log('JSDOM_FETCH:', resolved);
          return await realFetch(resolved, opts);
        } catch (e) {
          console.error('JSDOM_FETCH_ERROR:', e && e.message);
          throw e;
        }
      };
    }

    // wait for initial scripts and app init to run
    await new Promise((resolve) => setTimeout(resolve, 800));

    // If init not defined, try calling it
    if (typeof dom.window.init === 'function') {
      try { dom.window.init(); } catch (e) { console.error('INIT_ERR', e); }
    }

    // wait for results to populate
    let attempts = 0;
    while (attempts < 20) {
      const btn = dom.window.document.querySelector('button[data-add]');
      if (btn) break;
      await new Promise(r => setTimeout(r, 200));
      attempts++;
    }

    const firstAdd = dom.window.document.querySelector('button[data-add]');
    if (!firstAdd) {
      console.log('SMOKE_RESULT: no add button found');
      process.exit(1);
    }

    const id = firstAdd.getAttribute('data-add');
    const name = firstAdd.closest('.result')?.querySelector('strong')?.textContent || '';

    // click it
    firstAdd.click();

    // wait for workspace to update
    await new Promise(r => setTimeout(r, 400));

    const wsRaw = dom.window.localStorage.getItem('vaCfrWorkspace:v4');
    let ws = null;
    try { ws = JSON.parse(wsRaw || 'null'); } catch (e) { ws = wsRaw; }

    const wsListEl = dom.window.document.getElementById('wsList');
    const wsHtmlPresent = !!(wsListEl && wsListEl.innerHTML && wsListEl.innerHTML.length > 20);

    const out = {
      clicked: { id, name },
      workspaceLocalStorage: ws,
      wsListHtmlPresent: wsHtmlPresent
    };

    console.log('SMOKE_RESULT:' + JSON.stringify(out, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('SMOKE_ERROR:', err);
    process.exit(2);
  }
})();
