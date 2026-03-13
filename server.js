require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const morgan = require('morgan');
const crypto = require('crypto');
// Optional Sentry for error monitoring; DSN must be provided via SENTRY_DSN secret
let Sentry;
try {
  Sentry = require('@sentry/node');
  if (process.env.SENTRY_DSN) {
    Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV || 'development' });
    console.log('✅ Sentry initialized');
  }
} catch (e) {
  // ignore if package not available or DSN not set
}

const app = express();

// live-reload disabled in this environment

app.use(morgan('dev'));
app.use(express.json());
// Sentry request handler (if initialized)
if (Sentry && Sentry.Handlers && Sentry.getCurrentHub) {
  try { app.use(Sentry.Handlers.requestHandler()); } catch (e) { /* ignore */ }
}

function parseCookies(req) {
  const header = req.headers && req.headers.cookie;
  const obj = {};
  if (!header) return obj;
  header.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx > -1) {
      const key = pair.slice(0, idx).trim();
      const val = pair.slice(idx + 1).trim();
      obj[key] = decodeURIComponent(val);
    }
  });
  return obj;
}

function sidFromReq(req) {
  const cookies = parseCookies(req);
  return cookies.sid || null;
}

const DATA_DIR = path.join(__dirname, 'data');
const CONDITIONS_PATH = path.join(DATA_DIR, 'conditions.json');
const GLOBAL_TASKS = path.join(DATA_DIR, 'tasks.json');
const USERS_DIR = path.join(DATA_DIR, 'users');
const USERS_FILE = path.join(USERS_DIR, 'users.json');
const SESSIONS_FILE = path.join(USERS_DIR, 'sessions.json');

function ensureDataDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_DIR)) fs.mkdirSync(USERS_DIR, { recursive: true });
  if (!fs.existsSync(GLOBAL_TASKS)) fs.writeFileSync(GLOBAL_TASKS, JSON.stringify([], null, 2));
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify({}, null, 2));
  if (!fs.existsSync(SESSIONS_FILE)) fs.writeFileSync(SESSIONS_FILE, JSON.stringify({}, null, 2));
}
ensureDataDirs();

function loadConditions() {
  const raw = fs.readFileSync(CONDITIONS_PATH, 'utf8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error('❌ conditions.json is invalid JSON:', err.message);
    throw err;
  }
  if (!Array.isArray(data)) throw new Error('conditions.json must be a JSON array []');
  const seen = new Set();
  data.forEach((c, i) => {
    if (!c.id || typeof c.id !== 'string') throw new Error(`Condition at index ${i} is missing a string 'id'`);
    if (seen.has(c.id)) throw new Error(`Duplicate id found: '${c.id}'`);
    seen.add(c.id);
    if (!c.name || typeof c.name !== 'string') throw new Error(`Condition '${c.id}' is missing a string 'name'`);
    if (!Array.isArray(c.cfr) || c.cfr.length === 0) throw new Error(`Condition '${c.id}' must have a non-empty 'cfr' array`);
    c.cfr.forEach((r, j) => {
      if (!r.section || !r.diagnostic_code || !r.title || !r.url) {
        throw new Error(`Condition '${c.id}' cfr[${j}] missing section/diagnostic_code/title/url`);
      }
    });
  });
  console.log(`✅ Loaded ${data.length} conditions`);
  return data;
}

// Users / sessions / tasks helpers (file-based)
function loadUsers() { ensureDataDirs(); try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8') || '{}'); } catch { return {}; } }
function saveUsers(u) { ensureDataDirs(); fs.writeFileSync(USERS_FILE, JSON.stringify(u, null, 2), 'utf8'); }
function loadSessions() { ensureDataDirs(); try { return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8') || '{}'); } catch { return {}; } }
function saveSessions(s) { ensureDataDirs(); fs.writeFileSync(SESSIONS_FILE, JSON.stringify(s, null, 2), 'utf8'); }

function genToken() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
const MAX_SESSIONS_PER_USER = parseInt(process.env.MAX_SESSIONS_PER_USER || '5', 10);
const DEFAULT_ROTATE_ON_LOGIN = (typeof process.env.SESSION_ROTATE_ON_LOGIN === 'undefined') ? true : (String(process.env.SESSION_ROTATE_ON_LOGIN).toLowerCase() !== 'false');

function hashPassword(password) {
  const salt = crypto.randomBytes(12).toString('hex');
  const derived = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}$${derived}`;
}
function verifyPassword(password, stored) {
  if (!stored) return false;
  const [salt, derived] = stored.split('$');
  if (!salt || !derived) return false;
  const check = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  try { return crypto.timingSafeEqual(Buffer.from(check, 'hex'), Buffer.from(derived, 'hex')); } catch { return false; }
}

function getUserByToken(token) {
  if (!token) return null;
  const sessions = loadSessions();
  const raw = sessions[token];
  if (!raw) return null;
  // support legacy string -> username mapping and new object mapping
  let username = null;
  let expires = null;
  if (typeof raw === 'string') username = raw;
  else if (raw && typeof raw === 'object') { username = raw.username; expires = raw.expires; }
  if (!username) return null;
  // check expiry
  if (expires && Date.now() > expires) {
    // expired: remove session
    delete sessions[token];
    try { saveSessions(sessions); } catch (e) { console.warn('saveSessions failed', e && e.message); }
    return null;
  }
  const users = loadUsers();
  if (!users[username]) return null;
  return { username };
}

function createSessionForUser(username, daysValid = 7, invalidateOthers = false) {
  const sessions = loadSessions();
  if (invalidateOthers) {
    // remove other sessions for this user (rotate sessions)
    Object.keys(sessions).forEach(k => {
      const v = sessions[k];
      if (typeof v === 'string' && v === username) delete sessions[k];
      else if (v && v.username === username) delete sessions[k];
    });
  }
  const token = genToken();
  const now = Date.now();
  const expires = now + (daysValid * 24 * 60 * 60 * 1000);
  sessions[token] = { username, expires, createdAt: now };
  // enforce per-user session limit
  const userTokens = Object.entries(sessions).filter(([k, v]) => {
    if (!v) return false;
    if (typeof v === 'string') return v === username;
    return v.username === username;
  }).map(([k, v]) => ({ token: k, createdAt: (v && v.createdAt) || 0 }));
  if (userTokens.length > MAX_SESSIONS_PER_USER) {
    userTokens.sort((a,b) => a.createdAt - b.createdAt);
    const toRemove = userTokens.slice(0, userTokens.length - MAX_SESSIONS_PER_USER);
    toRemove.forEach(r => { delete sessions[r.token]; });
  }
  saveSessions(sessions);
  return token;
}

function clearSession(token) {
  const sessions = loadSessions();
  if (sessions[token]) delete sessions[token];
  saveSessions(sessions);
}

function cleanupExpiredSessions() {
  const sessions = loadSessions();
  let changed = false;
  Object.keys(sessions).forEach(k => {
    const v = sessions[k];
    let expires = null;
    if (!v) { delete sessions[k]; changed = true; return; }
    if (typeof v === 'string') return; // legacy string mapping has no expiry
    if (v && typeof v === 'object') expires = v.expires;
    if (expires && Date.now() > expires) { delete sessions[k]; changed = true; }
  });
  if (changed) saveSessions(sessions);
}

// run cleanup on startup and every hour
try { cleanupExpiredSessions(); } catch (e) { console.warn('initial cleanup failed', e && e.message); }
setInterval(() => { try { cleanupExpiredSessions(); } catch (e) { console.warn('cleanup failed', e && e.message); } }, 60 * 60 * 1000);

function userTasksPath(username) {
  if (!username) return GLOBAL_TASKS;
  const dir = path.join(USERS_DIR, username);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'tasks.json');
}

function loadTasksForUser(username) { ensureDataDirs(); const p = userTasksPath(username); try { if (!fs.existsSync(p)) fs.writeFileSync(p, JSON.stringify([], null, 2), 'utf8'); return JSON.parse(fs.readFileSync(p, 'utf8') || '[]'); } catch { return []; } }
function saveTasksForUser(username, tasks) { ensureDataDirs(); const p = userTasksPath(username); fs.writeFileSync(p, JSON.stringify(tasks || [], null, 2), 'utf8'); }

// --- Server-side validation helpers ---
function isIsoDateString(s) {
  if (!s || typeof s !== 'string') return false;
  const d = new Date(s);
  if (isNaN(d.getTime())) return false;
  // allow date-only strings or full ISO; best-effort sanity check
  return Math.abs(d.getTime() - Date.parse(s)) < 1000 * 60 * 60 * 24 * 365 * 100; // within 100 years
}
let ajvValidateTask = null;
try {
  const Ajv = require('ajv');
  const addFormats = require('ajv-formats');
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const taskSchema = {
    type: 'object',
    properties: {
      id: { type: 'string', minLength: 1 },
      title: { type: 'string', minLength: 1, maxLength: 500 },
      done: { type: 'boolean' },
      at: { anyOf: [{ type: 'string', format: 'date-time' }, { type: 'string', format: 'date' }] },
      doneAt: { anyOf: [{ type: 'string', format: 'date-time' }, { type: 'string', format: 'date' }] },
      meta: {
        type: 'object',
        properties: {
          dueDate: { anyOf: [{ type: 'string', format: 'date-time' }, { type: 'string', format: 'date' }] },
          priority: { type: 'string', enum: ['low', 'medium', 'high', ''] },
          lane: { type: 'string' },
          conditionId: { type: 'string' },
          keyword: { type: 'string' },
          kind: { type: 'string' }
        },
        additionalProperties: true
      }
    },
    required: ['id','title'],
    additionalProperties: true
  };
  ajvValidateTask = ajv.compile(taskSchema);
  console.log('✅ Ajv-based task validation enabled');
} catch (e) {
  console.warn('Ajv not available, using fallback validator');
}

function validateTask(t) {
  if (ajvValidateTask) {
    const ok = ajvValidateTask(t);
    if (ok) return [];
    return (ajvValidateTask.errors || []).map(err => `${err.instancePath || ''} ${err.message}`.trim());
  }
  // fallback manual validation
  const errors = [];
  if (!t || typeof t !== 'object') return ['task must be an object'];
  if (!t.id || typeof t.id !== 'string' || !t.id.trim()) errors.push('id required (non-empty string)');
  if (!t.title || typeof t.title !== 'string' || !t.title.trim()) errors.push('title required (non-empty string)');
  if (t.title && t.title.length > 500) errors.push('title too long (max 500 chars)');
  if (typeof t.done !== 'undefined' && typeof t.done !== 'boolean') errors.push('done must be boolean');
  if (t.at && !isIsoDateString(t.at)) errors.push('at must be an ISO date string');
  if (t.doneAt && !isIsoDateString(t.doneAt)) errors.push('doneAt must be an ISO date string');
  if (t.meta) {
    if (typeof t.meta !== 'object') errors.push('meta must be an object');
    else {
      const m = t.meta;
      if (m.dueDate && !isIsoDateString(m.dueDate)) errors.push('meta.dueDate must be an ISO date string');
      if (m.priority && !['low','medium','high',''].includes(String(m.priority))) errors.push("meta.priority must be one of 'low','medium','high'");
      if (m.lane && typeof m.lane !== 'string') errors.push('meta.lane must be a string');
      if (m.conditionId && typeof m.conditionId !== 'string') errors.push('meta.conditionId must be a string');
      if (m.keyword && typeof m.keyword !== 'string') errors.push('meta.keyword must be a string');
      if (m.kind && typeof m.kind !== 'string') errors.push('meta.kind must be a string');
    }
  }
  return errors;
}

// API routes
app.get('/api/conditions', (req, res) => {
  const conditions = loadConditions();
  res.json(conditions);
});

app.get('/api/conditions/:id', (req, res) => {
  const conditions = loadConditions();
  const item = conditions.find(c => c.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

// Tasks endpoints
app.get('/api/tasks', (req, res) => {
  const token = sidFromReq(req) || (req.get('authorization') || '').replace(/^Bearer\s+/, '');
  const user = getUserByToken(token);
  if (user) return res.json(loadTasksForUser(user.username));
  return res.json(loadTasksForUser(null));
});

app.post('/api/tasks', (req, res) => {
  const body = req.body;
  if (!body) return res.status(400).json({ error: 'Task body required' });
  const v = validateTask(body);
  if (v && v.length) return res.status(400).json({ error: 'validation failed', details: v });
  const token = sidFromReq(req) || (req.get('authorization') || '').replace(/^Bearer\s+/, '');
  const user = getUserByToken(token);
  try {
    upsert = (username, task) => {
      const arr = loadTasksForUser(username);
      const idx = arr.findIndex(t => t.id === task.id);
      if (idx >= 0) arr[idx] = Object.assign({}, arr[idx], task);
      else arr.push(task);
      saveTasksForUser(username, arr);
    };
    upsert(user ? user.username : null, body);
    return res.json({ success: true, task: body });
  } catch (e) {
    console.error('Could not persist task', e);
    return res.status(500).json({ error: 'Could not persist task' });
  }
});

app.put('/api/tasks', (req, res) => {
  const body = req.body;
  if (!Array.isArray(body)) return res.status(400).json({ error: 'Expected an array of tasks' });
  // validate each task before saving
  const allErrors = [];
  body.forEach((t, i) => {
    const v = validateTask(t);
    if (v && v.length) allErrors.push({ index: i, id: t && t.id, errors: v });
  });
  if (allErrors.length) return res.status(400).json({ error: 'validation failed', details: allErrors });
  const token = sidFromReq(req) || (req.get('authorization') || '').replace(/^Bearer\s+/, '');
  const user = getUserByToken(token);
  try {
    saveTasksForUser(user ? user.username : null, body);
    return res.json({ success: true, count: body.length });
  } catch (e) {
    console.error('Could not overwrite tasks', e);
    return res.status(500).json({ error: 'Could not persist tasks' });
  }
});

// Auth endpoints
app.post('/api/register', (req, res) => {
  const username = req.body && String(req.body.username || '').trim();
  const password = req.body && String(req.body.password || '');
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const users = loadUsers();
  if (users[username]) return res.status(400).json({ error: 'username exists' });
  users[username] = { password_hash: hashPassword(password) };
  saveUsers(users);
  const rotate = DEFAULT_ROTATE_ON_LOGIN;
  const token = createSessionForUser(username, 7, rotate);
  // cookie flags: HttpOnly, Path=/, Max-Age, SameSite; add Secure in production
  const maxAge = 7 * 24 * 60 * 60; // 7 days
  let cookie = `sid=${token}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Strict`;
  if (process.env.NODE_ENV === 'production') cookie += '; Secure';
  res.setHeader('Set-Cookie', cookie);
  res.json({ username });
});

app.post('/api/login', (req, res) => {
  const username = req.body && String(req.body.username || '').trim();
  const password = req.body && String(req.body.password || '');
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const users = loadUsers();
  const u = users[username];
  if (!u || !verifyPassword(password, u.password_hash)) return res.status(401).json({ error: 'invalid credentials' });
  const rotate2 = DEFAULT_ROTATE_ON_LOGIN;
  const token = createSessionForUser(username, 7, rotate2);
  const maxAge = 7 * 24 * 60 * 60; // 7 days
  let cookie = `sid=${token}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Strict`;
  if (process.env.NODE_ENV === 'production') cookie += '; Secure';
  res.setHeader('Set-Cookie', cookie);
  res.json({ username });
});

app.post('/api/logout', (req, res) => {
  const sid = sidFromReq(req);
  if (sid) clearSession(sid);
  let cookie = 'sid=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict';
  if (process.env.NODE_ENV === 'production') cookie += '; Secure';
  res.setHeader('Set-Cookie', cookie);
  res.json({ ok: true });
});

// adminAuth middleware: allow ADMIN_SECRET or logged-in user with isAdmin flag
function adminAuth(req, res, next) {
  const adminSecret = req.get('x-admin-secret') || req.body && req.body.adminSecret || req.query && req.query.adminSecret;
  if (process.env.ADMIN_SECRET && adminSecret && String(adminSecret) === String(process.env.ADMIN_SECRET)) {
    req.adminActor = { type: 'secret' };
    return next();
  }
  const token = sidFromReq(req) || (req.get('authorization') || '').replace(/^Bearer\s+/, '');
  const user = getUserByToken(token);
  if (user) {
    const users = loadUsers();
    if (users[user.username] && users[user.username].isAdmin) {
      req.adminActor = { type: 'user', username: user.username };
      return next();
    }
  }
  return res.status(403).json({ error: 'forbidden' });
}

const ADMIN_AUDIT_FILE = path.join(DATA_DIR, 'admin_actions.log');
function logAdminAction(action, info) {
  try {
    ensureDataDirs();
    const entry = { ts: new Date().toISOString(), action, info };
    fs.appendFileSync(ADMIN_AUDIT_FILE, JSON.stringify(entry) + '\n', 'utf8');
  } catch (e) { console.warn('logAdminAction failed', e && e.message); }
}

// Audit log rotation: rotate admin_actions.log to timestamped files
const AUDIT_ROTATE_RETENTION_DAYS = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || '30', 10);
function rotateAdminLog() {
  try {
    ensureDataDirs();
    if (!fs.existsSync(ADMIN_AUDIT_FILE)) return { rotated: false, reason: 'no_file' };
    const st = fs.statSync(ADMIN_AUDIT_FILE);
    if (!st || st.size === 0) return { rotated: false, reason: 'empty' };
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(DATA_DIR, `admin_actions-${ts}.log`);
    fs.renameSync(ADMIN_AUDIT_FILE, dest);
    // recreate empty audit file
    fs.writeFileSync(ADMIN_AUDIT_FILE, '', 'utf8');

    // cleanup old rotated files beyond retention (by mtime)
    if (AUDIT_ROTATE_RETENTION_DAYS > 0) {
      const files = fs.readdirSync(DATA_DIR).filter(f => f.startsWith('admin_actions-') && f.endsWith('.log'));
      const now = Date.now();
      files.forEach(fname => {
        try {
          const p = path.join(DATA_DIR, fname);
          const s = fs.statSync(p);
          const ageDays = (now - s.mtimeMs) / (1000 * 60 * 60 * 24);
          if (ageDays > AUDIT_ROTATE_RETENTION_DAYS) fs.unlinkSync(p);
        } catch (e) { /* ignore individual file errors */ }
      });
    }
    return { rotated: true, dest };
  } catch (e) {
    return { rotated: false, error: e && e.message };
  }
}

// schedule daily rotation and run once at startup
try {
  const r = rotateAdminLog();
  if (r && r.rotated) console.log('Rotated admin audit log at startup ->', r.dest);
} catch (e) { console.warn('startup rotateAdminLog failed', e && e.message); }
setInterval(() => { try { const r = rotateAdminLog(); if (r && r.rotated) console.log('Rotated admin audit log ->', r.dest); } catch (e) { console.warn('rotateAdminLog failed', e && e.message); } }, 24 * 60 * 60 * 1000);

app.post('/api/admin/revoke', adminAuth, (req, res) => {
  const { token, username } = req.body || {};
  const sessions = loadSessions();
  let changed = false;
  if (token) {
    if (sessions[token]) { delete sessions[token]; changed = true; }
  }
  if (username) {
    Object.keys(sessions).forEach(k => {
      const v = sessions[k];
      if (typeof v === 'string' && v === username) { delete sessions[k]; changed = true; }
      else if (v && v.username === username) { delete sessions[k]; changed = true; }
    });
  }
  if (changed) saveSessions(sessions);
  // audit
  try { logAdminAction('revoke_sessions', { by: req.adminActor, token, username, changed }); } catch (e) {}
  return res.json({ success: true, changed });
});

// manual rotation endpoint for admins
app.post('/api/admin/rotate-logs', adminAuth, (req, res) => {
  try {
    const result = rotateAdminLog();
    try { logAdminAction('rotate_logs', { by: req.adminActor, result }); } catch (e) {}
    return res.json({ success: true, result });
  } catch (e) {
    return res.status(500).json({ error: e && e.message });
  }
});

// Admin: list sessions (token, username, createdAt, expires)
app.get('/api/admin/sessions', (req, res) => {
  // reuse adminAuth middleware to allow adminSecret or admin user session
  return adminAuth(req, res, () => {
    const sessions = loadSessions();
    const out = Object.keys(sessions).map(k => {
      const v = sessions[k];
      if (!v) return { token: k };
      if (typeof v === 'string') return { token: k, username: v };
      return { token: k, username: v.username, createdAt: v.createdAt || null, expires: v.expires || null };
    });
    res.json(out);
  });
});

app.get('/api/me', (req, res) => {
  const token = sidFromReq(req) || (req.get('authorization') || '').replace(/^Bearer\s+/, '');
  const user = getUserByToken(token);
  if (!user) return res.status(401).json({ error: 'unauthenticated' });
  res.json({ username: user.username });
});

// Serve frontend
app.use(express.static(path.join(__dirname, 'public')));

// SPA deep link
app.get('/condition/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  // Capture error with Sentry if available
  try { if (Sentry && Sentry.captureException) Sentry.captureException(err); } catch (e) { /* ignore */ }
  res.status(500).send('Something went wrong!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`VA CFR MVP running on port ${PORT}`));
