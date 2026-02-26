require('dotenv').config();

const express = require("express");
const path = require("path");
const fs = require("fs");
const livereload = require("livereload");
const connectLiveReload = require("connect-livereload");
const morgan = require('morgan');

const app = express();
// --- LIVE RELOAD (local dev only) ---
if (process.env.NODE_ENV !== "production") {
  const livereload = require("livereload");
  const connectLiveReload = require("connect-livereload");

  const liveReloadServer = livereload.createServer({
    port: 35730   // 👈 change port so it never conflicts
  });

  liveReloadServer.watch(path.join(__dirname, "public"));
  liveReloadServer.watch(path.join(__dirname, "data"));

  app.use(connectLiveReload({ port: 35730 }));
}

app.use(morgan('dev'));

const DATA_PATH = path.join(__dirname, "data", "conditions.json");
const TASKS_PATH = path.join(__dirname, "data", "tasks.json");

app.use(express.json());

function ensureTasksFile() {
  try {
    if (!fs.existsSync(TASKS_PATH)) {
      fs.writeFileSync(TASKS_PATH, JSON.stringify([], null, 2), 'utf8');
    }
  } catch (err) {
    console.error('Could not create tasks file:', err.message);
  }
}

function loadTasks() {
  ensureTasksFile();
  try {
    const raw = fs.readFileSync(TASKS_PATH, 'utf8');
    const data = JSON.parse(raw || '[]');
    if (!Array.isArray(data)) return [];
    return data;
  } catch (err) {
    console.error('Failed to load tasks:', err.message);
    return [];
  }
}

function saveTasks(tasks) {
  try {
    fs.writeFileSync(TASKS_PATH, JSON.stringify(tasks, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Failed to save tasks:', err.message);
    return false;
  }
}

// Serve frontend files from /public
app.use(express.static(path.join(__dirname, "public")));

// -------- Data loader + validator --------
function loadConditions() {
  const raw = fs.readFileSync(DATA_PATH, "utf-8");

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error("❌ conditions.json is invalid JSON:", err.message);
    throw err;
  }

  if (!Array.isArray(data)) {
    throw new Error("conditions.json must be a JSON array []");
  }

  const seen = new Set();
  data.forEach((c, i) => {
    if (!c.id || typeof c.id !== "string") {
      throw new Error(`Condition at index ${i} is missing a string 'id'`);
    }
    if (seen.has(c.id)) {
      throw new Error(`Duplicate id found: '${c.id}'`);
    }
    seen.add(c.id);

    if (!c.name || typeof c.name !== "string") {
      throw new Error(`Condition '${c.id}' is missing a string 'name'`);
    }

    if (!Array.isArray(c.cfr) || c.cfr.length === 0) {
      throw new Error(`Condition '${c.id}' must have a non-empty 'cfr' array`);
    }

    c.cfr.forEach((r, j) => {
      if (!r.section || !r.diagnostic_code || !r.title || !r.url) {
        throw new Error(
          `Condition '${c.id}' cfr[${j}] missing section/diagnostic_code/title/url`
        );
      }
    });
  });

  console.log(`✅ Loaded ${data.length} conditions`);
  return data;
}

// -------- API routes --------
app.get("/api/conditions", (req, res) => {
  const conditions = loadConditions();
  res.json(conditions);
});

// Tasks API ------------------------------------------------
app.get('/api/tasks', (req, res) => {
  const tasks = loadTasks();
  res.json(tasks);
});

app.post('/api/tasks', (req, res) => {
  const body = req.body;
  if (!body || !body.id || !body.title) {
    return res.status(400).json({ error: 'Task must include id and title' });
  }

  const tasks = loadTasks();
  const exists = tasks.some(t => t.id === body.id);
  if (exists) {
    // update existing
    const idx = tasks.findIndex(t => t.id === body.id);
    tasks[idx] = Object.assign({}, tasks[idx], body);
  } else {
    tasks.push(body);
  }

  const ok = saveTasks(tasks);
  if (!ok) return res.status(500).json({ error: 'Could not persist task' });
  res.json({ success: true, task: body });
});

// Overwrite entire tasks list (useful for client-side sync)
app.put('/api/tasks', (req, res) => {
  const body = req.body;
  if (!Array.isArray(body)) return res.status(400).json({ error: 'Expected an array of tasks' });
  const ok = saveTasks(body);
  if (!ok) return res.status(500).json({ error: 'Could not persist tasks' });
  res.json({ success: true, count: body.length });
});

app.get("/api/conditions/:id", (req, res) => {
  const conditions = loadConditions();
  const item = conditions.find((c) => c.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Not found" });
  res.json(item);
});

// -------- SPA deep-link route --------
// Allows refreshing /condition/:id without breaking JS/CSS loading
app.get("/condition/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// -------- Error handling middleware --------
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something went wrong!');
});

// -------- Start server (ONLY ONCE) --------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`VA CFR MVP running on port ${PORT}`);
});
