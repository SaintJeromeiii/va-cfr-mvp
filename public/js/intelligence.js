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
    const res = await fetch('/api/tasks');
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tasks)
    });
    return res.ok;
  } catch (e) {
    console.warn('saveAllTasksToServer failed:', e && e.message);
    return false;
  }
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
  const host = document.getElementById("wsList");
  if (!host) return;

  const state = getAppState();
  const tasks = taskEnsure(state);

  console.log('Tasks to render:', tasks); // Debugging log

  host.innerHTML = "";

  if (!tasks.length) {
    host.innerHTML = `<div style="font-size:12px; opacity:.85;">No tasks yet. Click “Auto-add from Dashboard”.</div>`;
    return;
  }

  tasks.forEach((task) => {
    const card = document.createElement('div');
    card.className = 'wsCard';

    const left = document.createElement('div');
    left.style.flex = '1';

    const title = document.createElement('div');
    title.innerHTML = escapeHtml(task.title) + (task.meta && task.meta.conditionId ? ` <span style="opacity:.8; font-size:12px">— ${escapeHtml(task.meta.conditionId)}</span>` : '');
    left.appendChild(title);

    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.gap = '8px';

    const doneCb = document.createElement('input');
    doneCb.type = 'checkbox';
    doneCb.checked = !!task.done;
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
    delBtn.addEventListener('click', async () => {
      if (!confirm('Delete this task?')) return;
      const s = getAppState();
      taskDelete(s, task.id);
      taskSave(s);
      renderTasks();
      updateTaskProgress();
      await saveAllTasksToServer(s.tasks || []);
      addRecentActivity(`Deleted task: ${task.title}`);
    });

    controls.appendChild(doneCb);
    controls.appendChild(delBtn);

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
document.getElementById('addTaskBtn')?.addEventListener('click', () => {
  const taskTitle = prompt('Enter the task title:'); // Ask the user for a task title
  console.log('Task title entered:', taskTitle); // Debugging log
  if (!taskTitle) return showNotification('No task title entered!');

  // Try to detect a currently-open condition (detail view)
  let currentCondId = null;
  try {
    if (history && history.state && history.state.id) currentCondId = history.state.id;
  } catch {}
  if (!currentCondId) {
    const m = window.location.pathname.match(/\/condition\/([^\/\?]+)/);
    if (m) currentCondId = decodeURIComponent(m[1]);
  }

  let attachTo = null;
  if (currentCondId) {
    // Ask user whether to attach task to the open condition
    const cond = (typeof getConditionById === 'function') ? getConditionById(currentCondId) : null;
    const label = cond ? `${cond.name} (${currentCondId})` : currentCondId;
    const attach = confirm(`Attach this task to the currently open condition: ${label}?`);
    if (attach) attachTo = currentCondId;
  }

  const state = getAppState();
  const meta = { lane: 'general' };
  if (attachTo) meta.conditionId = attachTo;

  const added = taskAdd(state, taskTitle, meta);
  if (added) {
    taskSave(state);
    // find the task we just added (by dedup key)
    const key = taskDedupKey({ title: taskTitle, meta });
    const created = (state.tasks || []).find(x => taskDedupKey(x) === key);
    if (created) {
      postTaskToServer(created).then(r => {
        if (r && r.success) console.log('Task persisted to server:', created.id);
      });
    }
    renderTasks();
    updateTaskProgress();
    addRecentActivity(`Added task: ${taskTitle}` + (attachTo ? ` (attached to ${attachTo})` : ''));
    showNotification('Task added successfully!');
  } else {
    showNotification('Task already exists!');
  }
});

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