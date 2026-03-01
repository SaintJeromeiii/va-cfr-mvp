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

    if (typeof global.fetch === 'function') {
      const realFetch = global.fetch.bind(global);
      dom.window.fetch = async (url, opts) => {
        const resolved = new URL(url, dom.window.location.href).toString();
        console.log('JSDOM_FETCH:', resolved);
        return await realFetch(resolved, opts);
      };
    }

    await new Promise(r => setTimeout(r, 700));

    // open form and fill values
    const addBtn = dom.window.document.getElementById('addTaskBtn');
    if (!addBtn) { console.log('No addTaskBtn found'); process.exit(1); }
    addBtn.click();
    // wait for panel
    let a=0; while(a<20){ const p = dom.window.document.getElementById('addTaskForm'); if(p && !p.classList.contains('hidden')) break; await new Promise(r=>setTimeout(r,100)); a++; }
    const title = dom.window.document.getElementById('addTask_title');
    const due = dom.window.document.getElementById('addTask_due');
    const pr = dom.window.document.getElementById('addTask_priority');
    const submit = dom.window.document.getElementById('addTask_submit');
    if (!title || !submit) { console.log('Add form missing'); process.exit(1); }
    title.value = 'Smoke meta task';
    due.value = new Date(Date.now() + 24*3600*1000).toISOString().slice(0,10);
    pr.value = 'high';
    submit.click();

    await new Promise(r => setTimeout(r, 600));

    const stateRaw = dom.window.localStorage.getItem('vaCfrFinderState');
    const state = stateRaw ? JSON.parse(stateRaw) : null;
    if (!state || !state.tasks || !state.tasks.length) {
      console.error('NO_TASK_CREATED');
      process.exit(2);
    }

    const t = state.tasks[state.tasks.length - 1];
    console.log('SMOKE_TASK_META:', JSON.stringify({ title: t.title, priority: t.meta?.priority, due: t.meta?.dueDate }, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('SMOKE_TASK_META_ERROR:', err);
    process.exit(3);
  }
})();
