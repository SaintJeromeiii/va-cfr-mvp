// ===========================
// Task Panel + Next Best Action
// ===========================

function taskEnsure(state) {
  if (!state.tasks) state.tasks = [];
  return state.tasks;
}

function taskSave(state) {
  if (typeof saveAppState === "function") saveAppState(state);
  else localStorage.setItem("vaCfrFinderState", JSON.stringify(state));
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
  const exists = tasks.some(x => taskDedupKey(x) === key);
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

function taskDelete(state, id) {
  const tasks = taskEnsure(state);
  const idx = tasks.findIndex(x => x.id === id);
  if (idx >= 0) tasks.splice(idx, 1);
}

function taskClearDone(state) {
  state.tasks = (taskEnsure(state)).filter(t => !t.done);
}

function renderTasks() {
  const host = document.getElementById("taskPanel");
  const status = document.getElementById("taskStatus");
  if (!host) return;

  const state = getAppState();
  const tasks = taskEnsure(state);

  // Sort: undone first by score, then done
  const sorted = [...tasks].sort((a, b) => {
    if (!!a.done !== !!b.done) return a.done ? 1 : -1;
    return taskScore(b) - taskScore(a);
  });

  host.innerHTML = "";

  if (status) {
    const undone = sorted.filter(t => !t.done).length;
    const done = sorted.filter(t => t.done).length;
    status.textContent = `Undone: ${undone} • Done: ${done} • Next Best Action is top-most undone task.`;
  }

  if (!sorted.length) {
    host.innerHTML = `<div style="font-size:12px; opacity:.85;">No tasks yet. Click “Auto-add from Dashboard”.</div>`;
    return;
  }

  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.flexDirection = "column";
  wrap.style.gap = "10px";

  sorted.forEach((t, idx) => {
    const card = document.createElement("div");
    card.style.border = "1px solid #ddd";
    card.style.borderRadius = "12px";
    card.style.padding = "10px";
    card.style.opacity = t.done ? "0.6" : "1";

    const top = document.createElement("div");
    top.style.display = "flex";
    top.style.justifyContent = "space-between";
    top.style.alignItems = "baseline";
    top.innerHTML = `
      <div style="font-size:12px;">
        <strong>${idx === 0 && !t.done ? "⭐ Next:" : ""}</strong>
        <strong>${t.title}</strong>
      </div>
      <div style="font-size:12px; opacity:.85;">
        ${(t.meta?.lane || "general").toUpperCase()} • score ${taskScore(t)}
      </div>
    `;
    card.appendChild(top);

    const meta = document.createElement("div");
    meta.style.fontSize = "12px";
    meta.style.opacity = ".85";
    meta.style.marginTop = "4px";
    meta.textContent = `Created: ${t.at}${t.doneAt ? ` • Done: ${t.doneAt}` : ""}`;
    card.appendChild(meta);

    const btnRow = document.createElement("div");
    btnRow.style.display = "flex";
    btnRow.style.gap = "8px";
    btnRow.style.marginTop = "8px";
    btnRow.style.flexWrap = "wrap";

    const doneBtn = document.createElement("button");
    doneBtn.type = "button";
    doneBtn.textContent = t.done ? "Mark Undone" : "Mark Done";
    doneBtn.addEventListener("click", () => {
      const s = getAppState();
      taskMarkDone(s, t.id, !t.done);
      taskSave(s);
      renderTasks();
    });
    btnRow.appendChild(doneBtn);

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => {
      const s = getAppState();
      taskDelete(s, t.id);
      taskSave(s);
      renderTasks();
    });
    btnRow.appendChild(delBtn);

    card.appendChild(btnRow);
    wrap.appendChild(card);
  });

  host.appendChild(wrap);
}

document.getElementById("taskRefreshBtn")?.addEventListener("click", renderTasks);
document.getElementById("taskAutoBtn")?.addEventListener("click", tasksAutoAddFromDashboard);
document.getElementById("taskClearDoneBtn")?.addEventListener("click", () => {
  const s = getAppState();
  taskClearDone(s);
  taskSave(s);
  renderTasks();
});

// Call renderTasks() once after the UI loads
renderTasks();