const { JSDOM, VirtualConsole } = require('jsdom');

(async () => {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('log', (msg) => console.log('JSDOM_LOG:', msg));
  virtualConsole.on('error', (err) => console.error('JSDOM_ERROR:', err));

  try {
    const dom = await JSDOM.fromURL('http://localhost:3000', {
      resources: 'usable',
      runScripts: 'dangerously',
      virtualConsole,
      pretendToBeVisual: true,
    });

    // Ensure fetch is available inside the JSDOM window (Node provides global fetch)
    if (typeof global.fetch === 'function') {
      const realFetch = global.fetch.bind(global);
      dom.window.fetch = async (url, opts) => {
        try {
          const resolved = new URL(url, dom.window.location.href).toString();
          console.log('JSDOM_FETCH:', resolved);
          const r = await realFetch(resolved, opts);
          return r;
        } catch (e) {
          console.error('JSDOM_FETCH_ERROR:', e && e.message);
          throw e;
        }
      };
    }

    // If init() didn't run automatically, call it explicitly.
    try {
      const qExists = !!dom.window.document.getElementById('q');
      const filtExists = !!dom.window.document.getElementById('systemFilter');
      const resExists = !!dom.window.document.getElementById('results');
      console.log('DOM_ELEM_PRESENCE:', { qExists, filtExists, resExists });

      if (typeof dom.window.init === 'function') {
        console.log('CALLING_INIT');
        try { dom.window.init(); } catch (e) { console.error('INIT_CALL_ERROR:', e && e.message); }
      } else {
        console.log('NO_INIT_FN');
      }
    } catch (e) {
      console.error('INIT_CHECK_ERROR:', e && e.message);
    }

    // Wait for scripts to load and init to run
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        resolve();
      }, 3000);

      // If app sets a global or modifies DOM, detect it
      const check = () => {
        const results = dom.window.document.getElementById('results');
        if (results && results.children.length > 0) {
          clearTimeout(timeout);
          resolve();
        }
      };

      dom.window.document.addEventListener('DOMContentLoaded', () => {
        // give scripts some time
        setTimeout(check, 500);
        setTimeout(check, 1200);
        setTimeout(check, 2200);
      });
    });

    const resultsEl = dom.window.document.getElementById('results');
    console.log('CONDITIONS_WINDOW_LEN:', (dom.window.CONDITIONS && dom.window.CONDITIONS.length) || 0);
    const out = { count: 0, items: [] };
    if (resultsEl) {
      out.count = resultsEl.children.length;
      for (const ch of Array.from(resultsEl.children).slice(0, 20)) {
        const id = ch.querySelector('button[data-add]')?.getAttribute('data-add') || null;
        const name = ch.querySelector('strong')?.textContent || ch.textContent.slice(0,80);
        out.items.push({ id, name });
      }
    }

    console.log('HEADLESS_CHECK_RESULT:' + JSON.stringify(out));
    process.exit(0);
  } catch (err) {
    console.error('HEADLESS_CHECK_ERROR:', err);
    process.exit(2);
  }
})();
