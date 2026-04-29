// ===========================
// Task Panel + Next Best Action
// ===========================

function taskEnsure(state) {
  if (!state.tasks) state.tasks = [];
  return state.tasks;
}

function taskSave(state) {
  if (typeof saveAppState === "function") {
    saveAppState(state);
  } else {
    localStorage.setItem("vaCfrFinderState", JSON.stringify(state));
  }
  showNotification("Workspace auto-saved!");
}

// Server sync helpers
async function fetchTasksFromServer() {
  try {
    const res = await fetch('/api/tasks', { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch tasks');
    const tasks = await res.json();
    return Array.isArray(tasks) ? tasks : [];
  } catch (e) {
    console.warn('fetchTasksFromServer failed:', e && e.message);
    return [];
  }
}

async function postTaskToServer(task) {
  try {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(task)
    });
    const body = await res.json();
    return res.ok ? body : null;
  } catch (e) {
    console.warn('postTaskToServer failed:', e && e.message);
    return null;
  }
}

function laneWeight(lane) {
  // Higher = more important
  switch (lane) {
    case "nexus": return 100;
    case "diagnosis": return 80;
    case "severity": return 60;
    case "in_service": return 40;
    default: return 20;
  }
}

function taskScore(t) {
  const w = laneWeight(t.meta?.lane);
  const age = t.at ? (Date.now() - new Date(t.at).getTime()) : 0;
  const agePenalty = Math.min(20, Math.floor(age / (1000 * 60 * 60 * 24))); // days
  return w - agePenalty;
}

function taskDedupKey(t) {
  const lane = t.meta?.lane || "";
  const cond = t.meta?.conditionId || "";
  const kw = t.meta?.keyword || "";
  const kind = t.meta?.kind || "";
  return `${lane}::${cond}::${kind}::${kw}::${t.title}`.toLowerCase();
}

function taskAdd(state, title, meta = {}) {
  const tasks = taskEnsure(state);
  const t = {
    id: `task_${Math.random().toString(16).slice(2)}`,
    at: new Date().toISOString(),
    title,
    done: false,
    meta
  };
  const key = taskDedupKey(t);
  console.log('Generated task key:', key); // Debugging log
  const exists = tasks.some(x => taskDedupKey(x) === key);
  console.log('Task already exists:', exists); // Debugging log
  if (!exists) tasks.push(t);
  return !exists;
}

function parseDateInput(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function formatDateShort(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString();
  } catch (e) { return ''; }
}

function taskMarkDone(state, id, done = true) {
  const tasks = taskEnsure(state);
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  t.done = done;
  t.doneAt = done ? new Date().toISOString() : null;
}

async function saveAllTasksToServer(tasks) {
  try {
    const res = await fetch('/api/tasks', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tasks)
    });
    return res.ok;
  } catch (e) {
    console.warn('saveAllTasksToServer failed:', e && e.message);
    return false;
  }
}

function getAuthToken() {
  return localStorage.getItem('vaCfrAuthToken');
}

function setAuthToken(token) {
  if (!token) localStorage.removeItem('vaCfrAuthToken');
  else localStorage.setItem('vaCfrAuthToken', token);
}

async function doLoginFlow() {
  // show an inline login/register panel and await user action
  return await new Promise((resolve) => {
    if (document.getElementById('loginPanel')) return resolve(null);

    const panel = document.createElement('div');
    panel.id = 'loginPanel';
    panel.style.position = 'fixed';
    panel.style.right = '16px';
    panel.style.bottom = '16px';
    panel.style.padding = '12px';
    panel.style.background = 'white';
    panel.style.border = '1px solid #ccc';
    panel.style.zIndex = 9999;
    panel.style.boxShadow = '0 2px 8px rgba(0,0,0,.12)';

    panel.innerHTML = `
      <div style="font-weight:600; margin-bottom:6px">Login</div>
      <input id="lp_user" placeholder="username" style="display:block; margin-bottom:6px; width:200px" />
      <input id="lp_pass" placeholder="password" type="password" style="display:block; margin-bottom:6px; width:200px" />
      <div style="display:flex; gap:6px">
        <button id="lp_login">Login</button>
        <button id="lp_register">Register</button>
        <button id="lp_close">Close</button>
      </div>
    `;

    document.body.appendChild(panel);

    async function doAction(endpoint) {
      const u = document.getElementById('lp_user').value.trim();
      const p = document.getElementById('lp_pass').value;
      if (!u || !p) return showNotification('username and password required');
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: u, password: p })
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          return showNotification(body.error || 'Auth failed');
        }
        const b = await res.json().catch(() => ({}));
        showNotification(`Logged in as ${b.username || u}`);
        panel.remove();
        resolve(true);
      } catch (e) {
        console.warn('auth error', e && e.message);
        showNotification('Auth error');
      }
    }

    document.getElementById('lp_login').addEventListener('click', () => doAction('/api/login'));
    document.getElementById('lp_register').addEventListener('click', () => doAction('/api/register'));
    document.getElementById('lp_close').addEventListener('click', () => { panel.remove(); resolve(null); });
  });
}

// Initialize the visible auth UI (login/register/logout) and wire handlers
function setAuthStateDisplay(user) {
  const display = document.getElementById('auth_user_display');
  const loginBtn = document.getElementById('auth_login');
  const registerBtn = document.getElementById('auth_register');
  const logoutBtn = document.getElementById('auth_logout');
  const userInput = document.getElementById('auth_user');
  if (user && user.username) {
    if (display) display.textContent = `Signed in: ${user.username}`;
    if (loginBtn) loginBtn.classList.add('hidden');
    if (registerBtn) registerBtn.classList.add('hidden');
    if (userInput) userInput.classList.add('hidden');
    if (logoutBtn) logoutBtn.classList.remove('hidden');
  } else {
    if (display) display.textContent = 'Not signed in';
    if (loginBtn) loginBtn.classList.remove('hidden');
    if (registerBtn) registerBtn.classList.remove('hidden');
    if (userInput) userInput.classList.remove('hidden');
    if (logoutBtn) logoutBtn.classList.add('hidden');
  }
}

async function refreshAuthState() {
  try {
    const res = await fetch('/api/me', { credentials: 'include' });
    if (!res.ok) return setAuthStateDisplay(null);
    const body = await res.json().catch(() => null);
    setAuthStateDisplay(body && body.username ? body : null);
  } catch (e) {
    console.warn('refreshAuthState failed', e && e.message);
    setAuthStateDisplay(null);
  }
}

function initAuthUI() {
  const loginBtn = document.getElementById('auth_login');
  const registerBtn = document.getElementById('auth_register');
  const logoutBtn = document.getElementById('auth_logout');
  const userInput = document.getElementById('auth_user');
  const passInput = document.getElementById('auth_pass');

  if (loginBtn) loginBtn.addEventListener('click', async () => {
    const u = (userInput?.value || '').trim();
    const p = passInput?.value || '';
    if (!u || !p) return showNotification('username and password required');
    try {
      const res = await fetch('/api/login', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p })
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        return showNotification(b.error || 'Login failed');
      }
      const b = await res.json().catch(() => ({}));
      showNotification(`Logged in as ${b.username || u}`);
      await refreshAuthState();
      if (window.vaCfrWorkspaceSync) await window.vaCfrWorkspaceSync();
    } catch (e) {
      console.warn('login error', e && e.message);
      showNotification('Login error');
    }
  });

  if (registerBtn) registerBtn.addEventListener('click', async () => {
    const u = (userInput?.value || '').trim();
    const p = passInput?.value || '';
    if (!u || !p) return showNotification('username and password required');
    try {
      const res = await fetch('/api/register', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p })
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        return showNotification(b.error || 'Register failed');
      }
      const b = await res.json().catch(() => ({}));
      showNotification(`Registered and signed in as ${b.username || u}`);
      await refreshAuthState();
      if (window.vaCfrWorkspaceSync) await window.vaCfrWorkspaceSync();
    } catch (e) {
      console.warn('register error', e && e.message);
      showNotification('Register error');
    }
  });

  if (logoutBtn) logoutBtn.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/logout', { method: 'POST', credentials: 'include' });
      if (!res.ok) return showNotification('Logout failed');
      showNotification('Signed out');
      await refreshAuthState();
      if (window.vaCfrWorkspaceSync) await window.vaCfrWorkspaceSync();
    } catch (e) {
      console.warn('logout error', e && e.message);
      showNotification('Logout error');
    }
  });

  // initial state
  refreshAuthState();
}

function taskDelete(state, id) {
  const tasks = taskEnsure(state);
  const idx = tasks.findIndex(x => x.id === id);
  if (idx >= 0) tasks.splice(idx, 1);
}

function taskToggleDone(state, id) {
  const tasks = taskEnsure(state);
  const t = tasks.find(x => x.id === id);
  if (!t) return false;
  t.done = !t.done;
  t.doneAt = t.done ? new Date().toISOString() : null;
  return true;
}

function taskClearDone(state) {
  state.tasks = (taskEnsure(state)).filter(t => !t.done);
}

function renderTasks() {
  const host = document.getElementById("taskList") || document.getElementById("wsList");
  if (!host) return;

  // expose as a list for assistive tech
  try { host.setAttribute('role','list'); } catch (e) {}

  const state = getAppState();
  let tasks = taskEnsure(state).slice();

  // apply filters
  const filter = (document.getElementById('taskFilter')?.value) || 'all';
  if (filter === 'pending') tasks = tasks.filter(t => !t.done);
  if (filter === 'done') tasks = tasks.filter(t => t.done);

  // apply sort
  const sort = (document.getElementById('taskSort')?.value) || 'created';
  if (sort === 'due') {
    tasks.sort((a,b) => {
      const da = a.meta?.dueDate || '';
      const db = b.meta?.dueDate || '';
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return new Date(da) - new Date(db);
    });
  } else if (sort === 'priority') {
    const rank = (p) => p === 'high' ? 3 : p === 'medium' ? 2 : 1;
    tasks.sort((a,b) => (rank(b.meta?.priority) - rank(a.meta?.priority)) || (new Date(a.at) - new Date(b.at)));
  } else {
    tasks.sort((a,b) => new Date(b.at) - new Date(a.at));
  }

  console.log('Tasks to render:', tasks); // Debugging log

  host.innerHTML = "";

  if (!tasks.length) {
    host.innerHTML = `<div style="font-size:12px; opacity:.85;">No tasks yet. Click “Auto-add from Dashboard”.</div>`;
    return;
  }

  tasks.forEach((task) => {
    const card = document.createElement('div');
    card.className = 'wsCard entering';
    card.tabIndex = 0;
    card.setAttribute('role','listitem');
    // trigger enter transition on next frame
    requestAnimationFrame(() => { try { card.classList.remove('entering'); } catch (e) {} });

    const left = document.createElement('div');
    left.style.flex = '1';

    const title = document.createElement('div');
    title.innerHTML = escapeHtml(task.title) + (task.meta && task.meta.conditionId ? ` <span style="opacity:.8; font-size:12px">— ${escapeHtml(task.meta.conditionId)}</span>` : '');
    // meta row: priority badge and due date
    const metaRow = document.createElement('div');
    metaRow.style.display = 'flex';
    metaRow.style.gap = '8px';
    metaRow.style.marginTop = '6px';

    if (task.meta && task.meta.priority) {
      const p = document.createElement('span');
      p.className = `task-badge priority-${(task.meta.priority||'low')}`;
      p.textContent = (task.meta.priority || '').toUpperCase();
      metaRow.appendChild(p);
    }
    if (task.meta && task.meta.dueDate) {
      const d = document.createElement('span');
      d.className = 'task-due';
      d.textContent = `Due ${formatDateShort(task.meta.dueDate)}`;
      metaRow.appendChild(d);
    }
    if (metaRow.childElementCount) title.appendChild(metaRow);
    left.appendChild(title);

    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.gap = '8px';
    controls.style.alignItems = 'center';

    const doneCb = document.createElement('input');
    doneCb.type = 'checkbox';
    doneCb.checked = !!task.done;
    doneCb.setAttribute('aria-label', `Mark task ${task.title} as done`);
    doneCb.addEventListener('change', async () => {
      const s = getAppState();
      const ok = taskToggleDone(s, task.id);
      if (ok) {
        taskSave(s);
        renderTasks();
        updateTaskProgress();
        await saveAllTasksToServer(s.tasks || []);
      }
    });

    const delBtn = document.createElement('button');
    delBtn.textContent = 'Delete';
    delBtn.setAttribute('aria-label', `Delete task ${task.title}`);
    delBtn.addEventListener('click', async () => {
      if (!confirm('Delete this task?')) return;
      // animate removal, then delete from state
      try {
        card.classList.add('exiting');
      } catch (e) {}
      const finish = async () => {
        const s = getAppState();
        taskDelete(s, task.id);
        taskSave(s);
        renderTasks();
        updateTaskProgress();
        await saveAllTasksToServer(s.tasks || []);
        addRecentActivity(`Deleted task: ${task.title}`);
      };
      let handled = false;
      const onEnd = (ev) => {
        if (ev && ev.target !== card) return;
        if (handled) return; handled = true;
        card.removeEventListener('transitionend', onEnd);
        finish();
      };
      card.addEventListener('transitionend', onEnd);
      // fallback in 350ms
      setTimeout(() => { if (!handled) { handled = true; try { card.removeEventListener('transitionend', onEnd); } catch (e) {} finish(); } }, 400);
    });

    controls.appendChild(doneCb);
    
    // Inline due-date editor
    const dueContainer = document.createElement('div');
    dueContainer.className = 'task-meta';
    const dueBtn = document.createElement('button');
    dueBtn.className = 'task-btn';
    dueBtn.textContent = task.meta?.dueDate ? `Due: ${formatDateShort(task.meta.dueDate)}` : 'Set Due';
    dueBtn.setAttribute('aria-label', `Set due date for ${task.title}`);
    dueContainer.appendChild(dueBtn);

    dueBtn.addEventListener('click', () => {
      // replace with date input + save/cancel
      const input = document.createElement('input');
      input.type = 'date';
      if (task.meta?.dueDate) {
        input.value = (new Date(task.meta.dueDate)).toISOString().slice(0,10);
      }
      input.className = 'task-due-input';
      const save = document.createElement('button'); save.textContent = 'Save'; save.className = 'task-btn';
      const cancel = document.createElement('button'); cancel.textContent = 'Cancel'; cancel.className = 'task-btn';

      // swap to inline input
      dueContainer.innerHTML = '';
      dueContainer.appendChild(input);

      const oldIso = task.meta?.dueDate || null;
      let undoTimer = null;

      async function commitDue() {
        const val = input.value;
        const iso = parseDateInput(val);
        const st = getAppState();
        const t = st.tasks.find(x => x.id === task.id);
        if (!t) return;
        if (iso) { t.meta = t.meta || {}; t.meta.dueDate = iso; } else if (t.meta) { delete t.meta.dueDate; }
        taskSave(st);
        await saveAllTasksToServer(st.tasks || []);
        renderTasks();
        showUndoDue(oldIso);
      }

      function showUndoDue(prev) {
        const undo = document.createElement('button');
        undo.textContent = 'Undo';
        undo.className = 'task-btn undo-btn';
        dueContainer.appendChild(undo);
        if (undoTimer) clearTimeout(undoTimer);
        undoTimer = setTimeout(() => { try { undo.remove(); } catch (e) {} }, 5000);
        undo.addEventListener('click', async () => {
          const st = getAppState();
          const t = st.tasks.find(x => x.id === task.id);
          if (!t) return;
          if (prev) { t.meta = t.meta || {}; t.meta.dueDate = prev; } else if (t.meta) { delete t.meta.dueDate; }
          taskSave(st);
          await saveAllTasksToServer(st.tasks || []);
          renderTasks();
          if (undoTimer) clearTimeout(undoTimer);
        });
      }

      input.addEventListener('change', commitDue);
      input.addEventListener('blur', commitDue);
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); commitDue(); }
        if (ev.key === 'Escape') { renderTasks(); }
      });
    });

    // Inline priority editor
    const prContainer = document.createElement('div');
    prContainer.className = 'task-meta';
    const prBtn = document.createElement('button');
    prBtn.className = 'task-btn';
    prBtn.textContent = task.meta?.priority ? `Priority: ${task.meta.priority}` : 'Priority';
    prBtn.setAttribute('aria-label', `Set priority for ${task.title}`);
    prContainer.appendChild(prBtn);

    prBtn.addEventListener('click', () => {
      const sel = document.createElement('select');
      const o0 = document.createElement('option'); o0.value=''; o0.textContent='(none)';
      const o1 = document.createElement('option'); o1.value='low'; o1.textContent='Low';
      const o2 = document.createElement('option'); o2.value='medium'; o2.textContent='Medium';
      const o3 = document.createElement('option'); o3.value='high'; o3.textContent='High';
      sel.appendChild(o0); sel.appendChild(o1); sel.appendChild(o2); sel.appendChild(o3);
      sel.value = task.meta?.priority || '';
      const save = document.createElement('button'); save.textContent = 'Save'; save.className = 'task-btn';
      const cancel = document.createElement('button'); cancel.textContent = 'Cancel'; cancel.className = 'task-btn';

      prContainer.innerHTML = '';
      prContainer.appendChild(sel);

      const oldPr = task.meta?.priority || null;
      let undoTimerPr = null;

      async function commitPr() {
        const val = sel.value || '';
        const st = getAppState();
        const t = st.tasks.find(x => x.id === task.id);
        if (!t) return;
        if (val) { t.meta = t.meta || {}; t.meta.priority = val; } else if (t.meta) { delete t.meta.priority; }
        taskSave(st);
        await saveAllTasksToServer(st.tasks || []);
        renderTasks();
        showUndoPr(oldPr);
      }

      function showUndoPr(prev) {
        const undo = document.createElement('button');
        undo.textContent = 'Undo';
        undo.className = 'task-btn undo-btn';
        prContainer.appendChild(undo);
        if (undoTimerPr) clearTimeout(undoTimerPr);
        undoTimerPr = setTimeout(() => { try { undo.remove(); } catch (e) {} }, 5000);
        undo.addEventListener('click', async () => {
          const st = getAppState();
          const t = st.tasks.find(x => x.id === task.id);
          if (!t) return;
          if (prev) { t.meta = t.meta || {}; t.meta.priority = prev; } else if (t.meta) { delete t.meta.priority; }
          taskSave(st);
          await saveAllTasksToServer(st.tasks || []);
          renderTasks();
          if (undoTimerPr) clearTimeout(undoTimerPr);
        });
      }

      sel.addEventListener('change', commitPr);
      sel.addEventListener('blur', commitPr);
      sel.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') renderTasks(); });
    });

    controls.appendChild(delBtn);
    controls.appendChild(dueContainer);
    controls.appendChild(prContainer);

    // keyboard actions for the card: Enter/Space toggles done, Delete/d removes, p opens priority
    card.addEventListener('keydown', async (ev) => {
      try {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); doneCb.click(); }
        else if (ev.key === 'Delete' || ev.key === 'd') { ev.preventDefault(); delBtn.click(); }
        else if (ev.key === 'p' || ev.key === 'P') { ev.preventDefault(); prBtn.click(); const sel = prContainer.querySelector('select'); if (sel) sel.focus(); }
        else if (ev.key === 'u' || ev.key === 'U') { ev.preventDefault(); const undo = card.querySelector('.undo-btn'); if (undo) undo.click(); }
      } catch (e) { console.warn('card key handler', e && e.message); }
    });

    card.appendChild(left);
    card.appendChild(controls);
    card.style.display = 'flex';
    card.style.alignItems = 'center';

    host.appendChild(card);
  });
}

// Update task progress
function updateTaskProgress() {
  const state = getAppState();
  const tasks = state.tasks || [];
  const completed = tasks.filter(task => task.done).length;
  const progress = tasks.length ? (completed / tasks.length) * 100 : 0;

  const progressBar = document.getElementById('taskProgress');
  if (progressBar) progressBar.value = progress;
}

// Add recent activity
function addRecentActivity(activity) {
  const recentActivityList = document.querySelector('#recentActivity ul');
  if (recentActivityList) {
    const li = document.createElement('li');
    li.textContent = activity;
    recentActivityList.prepend(li);
  }
}

const searchHistory = [];

function addSearchToHistory(query) {
  if (!query || searchHistory.includes(query)) return;

  searchHistory.push(query);
  const historyList = document.querySelector('#searchHistory ul');
  if (historyList) {
    const li = document.createElement('li');
    li.textContent = query;
    li.addEventListener('click', () => {
      document.getElementById('q').value = query;
      renderResults(query);
    });
    historyList.prepend(li);
  }
}

document.getElementById("taskRefreshBtn")?.addEventListener("click", renderTasks);
document.getElementById("taskAutoBtn")?.addEventListener("click", tasksAutoAddFromDashboard);
document.getElementById("taskClearDoneBtn")?.addEventListener("click", () => {
  const s = getAppState();
  taskClearDone(s);
  taskSave(s);
  renderTasks();
  updateTaskProgress();
});

document.getElementById("clearWorkspaceBtn")?.addEventListener("click", () => {
  if (confirm("Are you sure you want to clear your workspace? This action cannot be undone.")) {
    localStorage.removeItem("vaCfrFinderState");
    const state = getAppState();
    state.tasks = [];
    renderTasks(state);
    updateTaskProgress();
    showNotification("Workspace cleared!");
  }
});

// Example usage
function showAddTaskForm() {
  const panel = document.getElementById('addTaskForm');
  const title = document.getElementById('addTask_title');
  const due = document.getElementById('addTask_due');
  const pr = document.getElementById('addTask_priority');
  const attach = document.getElementById('addTask_attach');
  const submit = document.getElementById('addTask_submit');
  const cancel = document.getElementById('addTask_cancel');
  if (!panel) return;
  panel.classList.remove('hidden');
  title.focus();

  // prefill attach if a condition is open
  let currentCondId = null;
  try { if (history && history.state && history.state.id) currentCondId = history.state.id; } catch (e) {}
  if (!currentCondId) {
    const m = window.location.pathname.match(/\/condition\/([^\/\?]+)/);
    if (m) currentCondId = decodeURIComponent(m[1]);
  }
  attach.checked = !!currentCondId;

  function cleanup() {
    panel.classList.add('hidden');
    title.value = '';
    due.value = '';
    pr.value = '';
    attach.checked = false;
    submit.removeEventListener('click', onSubmit);
    cancel.removeEventListener('click', onCancel);
  }

  async function onSubmit() {
    const taskTitle = (title.value || '').trim();
    if (!taskTitle) return showNotification('Task title required');
    const dueIso = parseDateInput(due.value || '');
    const priority = (pr.value || '') || undefined;
    const state = getAppState();
    const meta = { lane: 'general' };
    if (attach.checked && currentCondId) meta.conditionId = currentCondId;
    if (dueIso) meta.dueDate = dueIso;
    if (priority) meta.priority = priority;
    const added = taskAdd(state, taskTitle, meta);
    if (added) {
      taskSave(state);
      const created = (state.tasks || []).find(x => taskDedupKey(x) === taskDedupKey({ title: taskTitle, meta }));
      if (created) postTaskToServer(created).then(r => { if (r && r.success) console.log('Task persisted to server:', created.id); });
      renderTasks();
      updateTaskProgress();
      addRecentActivity(`Added task: ${taskTitle}` + (meta.conditionId ? ` (attached to ${meta.conditionId})` : ''));
      showNotification('Task added successfully!');
    } else {
      showNotification('Task already exists!');
    }
    cleanup();
  }

  function onCancel() { cleanup(); }

  submit.addEventListener('click', onSubmit);
  cancel.addEventListener('click', onCancel);
  // keyboard: Enter submits from title, Escape cancels
  title.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); onSubmit(); }
    if (ev.key === 'Escape') { ev.preventDefault(); onCancel(); }
  });
}

document.getElementById('addTaskBtn')?.addEventListener('click', () => { showAddTaskForm(); });

document.getElementById('searchCfrBtn')?.addEventListener('click', () => {
  // Contextual CFR search: if a condition detail is open, open its primary CFR ref;
  // otherwise fallback to an eCFR search using the current query input.
  let currentCondId = null;
  try {
    if (history && history.state && history.state.id) currentCondId = history.state.id;
  } catch (e) {}

  if (!currentCondId) {
    const m = window.location.pathname.match(/\/condition\/([^\/\?]+)/);
    if (m) currentCondId = decodeURIComponent(m[1]);
  }

  const openUrl = (url) => {
    try {
      window.open(url, '_blank');
    } catch (e) {
      // best-effort: if popup blocked or not available, log and notify
      console.error('Could not open CFR URL:', e && e.message);
      showNotification('Opening CFR in a new tab failed.');
    }
  };

  if (currentCondId && typeof getConditionById === 'function') {
    const cond = getConditionById(currentCondId);
    const primary = (cond && Array.isArray(cond.cfr) && cond.cfr[0]) ? cond.cfr[0] : null;
    if (primary && primary.url) {
      openUrl(primary.url);
      addRecentActivity(`Searched CFR: ${cond.name}`);
      return;
    }
  }

  // Fallback: open eCFR search for the query in the `#q` input
  const q = (document.getElementById('q')?.value || '').trim();
  const searchUrl = q ? `https://www.ecfr.gov/current/search?q=${encodeURIComponent(q)}` : 'https://www.ecfr.gov/';
  openUrl(searchUrl);
  addRecentActivity('Searched CFR');
});

document.getElementById('q')?.addEventListener('change', (e) => {
  addSearchToHistory(e.target.value);
});

// If using jsPDF in browser, ensure <script src="https://cdn.jsdelivr.net/npm/jspdf@latest/dist/jspdf.umd.min.js"></script> is loaded in index.html
// Then use: const { jsPDF } = window.jspdf;

document.getElementById('exportPdfBtn')?.addEventListener('click', () => {
  const doc = new jsPDF();
  const workspace = document.getElementById('workspace');
  if (workspace) {
    doc.text('Workspace', 10, 10);
    doc.text(workspace.innerText, 10, 20);
    doc.save('workspace.pdf');
  }
});

document.getElementById('darkModeToggle')?.addEventListener('click', () => {
  document.body.classList.toggle('dark-mode');
});

function showNotification(message) {
  const notification = document.getElementById('notification');
  if (notification) {
    notification.textContent = message;
    notification.classList.remove('hidden');
    setTimeout(() => {
      notification.classList.add('hidden');
    }, 3000);
  }
}

function getAppState() {
  const savedState = localStorage.getItem('vaCfrFinderState');
  return savedState ? JSON.parse(savedState) : { tasks: [] };
}

function restoreWorkspace() {
  const savedState = localStorage.getItem("vaCfrFinderState");
  if (savedState) {
    const state = JSON.parse(savedState);
    renderTasks(state);
    updateTaskProgress();
    showNotification("Workspace restored!");
  }
}

// Example usage
showNotification('Task added successfully!');

// Call renderTasks() once after the UI loads
renderTasks();

// Restore workspace when the page loads
document.addEventListener("DOMContentLoaded", () => {
  restoreWorkspace();
  // wire auth UI
  try { initAuthUI(); } catch (e) { console.warn('initAuthUI failed', e && e.message); }
  // merge server tasks into local workspace
  (async () => {
    const serverTasks = await fetchTasksFromServer();
    if (!serverTasks.length) return;
    const state = getAppState();
    let changed = false;
    serverTasks.forEach(t => {
      const exists = (state.tasks || []).some(x => x.id === t.id || taskDedupKey(x) === taskDedupKey(t));
      if (!exists) {
        taskEnsure(state).push(t);
        changed = true;
      }
    });
    if (changed) {
      taskSave(state);
      renderTasks();
      updateTaskProgress();
      showNotification('Merged tasks from server');
    }
  })();
});