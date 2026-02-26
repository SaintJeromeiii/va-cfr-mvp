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

    // polyfill fetch resolution
    if (typeof global.fetch === 'function') {
      const realFetch = global.fetch.bind(global);
      dom.window.fetch = async (url, opts) => {
        const resolved = new URL(url, dom.window.location.href).toString();
        console.log('JSDOM_FETCH:', resolved);
        return await realFetch(resolved, opts);
      };
    }

    // wait for initial render
    await new Promise(r => setTimeout(r, 600));

    // find first result and open detail
    const firstAdd = dom.window.document.querySelector('button[data-add]');
    if (!firstAdd) {
      console.log('No result add button found');
      process.exit(1);
    }
    const cid = firstAdd.getAttribute('data-add');
    if (typeof dom.window.showDetail === 'function') {
      dom.window.showDetail(cid, true);
      await new Promise(r => setTimeout(r, 300));
    }

    // stub window.open to capture URL
    const opens = [];
    dom.window.open = (url, target) => { opens.push({ url, target }); return { url, target }; };

    // click the searchCfrBtn
    const btn = dom.window.document.getElementById('searchCfrBtn');
    if (!btn) { console.log('No searchCfrBtn'); process.exit(1); }
    btn.click();

    await new Promise(r => setTimeout(r, 300));

    console.log('SMOKE_SEARCH_CFR_OPENED:', JSON.stringify(opens, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('SMOKE_SEARCH_CFR_ERROR:', err);
    process.exit(2);
  }
})();
