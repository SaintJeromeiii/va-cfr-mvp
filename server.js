require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const morgan = require('morgan');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

const app = express();

// live-reload disabled in this environment

app.use(morgan('dev'));
app.use(express.json());

// Security: enable sensible defaults in production
// Trust proxy when running behind a reverse proxy (set TRUST_PROXY=1 or run in production)
if (process.env.TRUST_PROXY === '1' || process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Helmet adds many safe HTTP headers. Enable fully in production,
// but disable HSTS and CSP upgrade-insecure-requests in development
try {
  if (process.env.NODE_ENV === 'production') {
    app.use(helmet());
  } else {
    app.use(
      helmet({
        contentSecurityPolicy: false,
        hsts: false,
      })
    );
  }
} catch (e) { console.warn('helmet not enabled', e && e.message); }

// Enable CORS only when CORS_ORIGIN is explicitly set (avoid permissive defaults)
if (process.env.CORS_ORIGIN) {
  try { app.use(cors({ origin: process.env.CORS_ORIGIN, credentials: true })); } catch (e) { console.warn('cors not enabled', e && e.message); }
}

// Basic rate limiting in production
if (process.env.NODE_ENV === 'production') {
  try {
    const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });
    app.use(limiter);
  } catch (e) { console.warn('rateLimit not enabled', e && e.message); }
}

let authLimiter = (req, res, next) => next();
let feedbackLimiter = (req, res, next) => next();
try {
  authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '20', 10),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many sign-in attempts. Please wait and try again.' }
  });
} catch (e) { console.warn('auth rateLimit not enabled', e && e.message); }
try {
  feedbackLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: parseInt(process.env.FEEDBACK_RATE_LIMIT_MAX || '10', 10),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many feedback submissions. Please wait and try again.' }
  });
} catch (e) { console.warn('feedback rateLimit not enabled', e && e.message); }

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
const FEEDBACK_FILE = path.join(DATA_DIR, 'feedback.jsonl');
const ANALYTICS_FILE = path.join(DATA_DIR, 'analytics.jsonl');
const STARTED_AT = new Date().toISOString();

function ensureDataDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_DIR)) fs.mkdirSync(USERS_DIR, { recursive: true });
  if (!fs.existsSync(GLOBAL_TASKS)) fs.writeFileSync(GLOBAL_TASKS, JSON.stringify([], null, 2));
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify({}, null, 2));
  if (!fs.existsSync(SESSIONS_FILE)) fs.writeFileSync(SESSIONS_FILE, JSON.stringify({}, null, 2));
}
ensureDataDirs();

function appendJsonl(filePath, entry) {
  ensureDataDirs();
  fs.appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf8');
}

function readJsonl(filePath, limit = 100) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
    return lines.slice(-limit).map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean).reverse();
  } catch {
    return [];
  }
}

function productionWarnings() {
  const warnings = [];
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.ADMIN_SECRET) warnings.push('ADMIN_SECRET is not set');
    if (!process.env.TRUST_PROXY && !app.get('trust proxy')) warnings.push('TRUST_PROXY is not enabled for secure proxy deployments');
    if (!process.env.SESSION_ROTATE_ON_LOGIN) warnings.push('SESSION_ROTATE_ON_LOGIN is not explicitly configured');
  }
  if (!fs.existsSync(CONDITIONS_PATH)) warnings.push('conditions.json is missing');
  return warnings;
}

function dataFileStatus(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) {
      if (fallback !== null) fs.writeFileSync(filePath, fallback, 'utf8');
      else return { ok: false, exists: false };
    }
    fs.accessSync(filePath, fs.constants.R_OK | fs.constants.W_OK);
    return { ok: true, exists: true };
  } catch (e) {
    return { ok: false, exists: fs.existsSync(filePath), error: e && e.message };
  }
}

function productionReadinessChecks() {
  const checks = [];
  const add = (name, ok, message) => checks.push({ name, ok: !!ok, message });
  add('node_env_production', process.env.NODE_ENV === 'production', 'Set NODE_ENV=production for launch.');
  add('trust_proxy', process.env.TRUST_PROXY === '1' || process.env.NODE_ENV === 'production', 'Set TRUST_PROXY=1 behind HTTPS reverse proxies.');
  add('admin_secret', !!process.env.ADMIN_SECRET && String(process.env.ADMIN_SECRET).length >= 24, 'Set a strong ADMIN_SECRET (24+ chars).');
  add('cors_origin', !!process.env.CORS_ORIGIN, 'Set CORS_ORIGIN to the production origin if cross-origin requests are needed.');
  add('users_file_writable', dataFileStatus(USERS_FILE, '{}').ok, 'User store must be readable/writable.');
  add('sessions_file_writable', dataFileStatus(SESSIONS_FILE, '{}').ok, 'Session store must be readable/writable.');
  add('tasks_file_writable', dataFileStatus(GLOBAL_TASKS, '[]').ok, 'Task store must be readable/writable.');
  add('feedback_file_writable', dataFileStatus(FEEDBACK_FILE, '').ok, 'Feedback log must be readable/writable.');
  add('analytics_file_writable', dataFileStatus(ANALYTICS_FILE, '').ok, 'Analytics log must be readable/writable.');
  return checks;
}

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

function userWorkspacesPath(username) {
  if (!username) return path.join(DATA_DIR, 'workspaces.json');
  const dir = path.join(USERS_DIR, username);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'workspaces.json');
}

function emptyWorkspaceStore() {
  return { version: 1, activeProjectId: 'default', projects: [] };
}

function normalizeProjectData(input) {
  const data = input && typeof input === 'object' ? input : {};
  const objectMap = (value) => (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};
  return {
    checklists: objectMap(data.checklists || data.evidenceStates),
    notes: objectMap(data.notes),
    timelines: objectMap(data.timelines),
    evidenceLinks: objectMap(data.evidenceLinks),
    evidenceRelations: objectMap(data.evidenceRelations)
  };
}

function normalizeWorkspaceStore(input) {
  const base = emptyWorkspaceStore();
  if (!input || typeof input !== 'object') return base;
  const projects = Array.isArray(input.projects) ? input.projects : [];
  const cleanProjects = projects
    .filter(p => p && typeof p === 'object')
    .slice(0, 50)
    .map((p, idx) => {
      const id = String(p.id || `claim-${idx + 1}`).slice(0, 100);
      const name = String(p.name || 'Claim Packet').slice(0, 120);
      const workspace = p.workspace && typeof p.workspace === 'object' ? p.workspace : {};
      const nodes = Array.isArray(workspace.nodes) ? workspace.nodes.filter(x => typeof x === 'string').slice(0, 200) : [];
      const primaryId = typeof workspace.primaryId === 'string' ? workspace.primaryId : '';
      const links = Array.isArray(workspace.links)
        ? workspace.links
          .filter(l => l && typeof l.from === 'string' && typeof l.to === 'string')
          .slice(0, 400)
          .map(l => ({
            from: l.from,
            to: l.to,
            type: typeof l.type === 'string' ? l.type.slice(0, 80) : 'Secondary to'
          }))
        : [];
      return {
        id,
        name,
        updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : new Date().toISOString(),
        workspace: { nodes, primaryId, links },
        data: normalizeProjectData(p.data || p)
      };
    });
  return {
    version: 1,
    activeProjectId: typeof input.activeProjectId === 'string' ? input.activeProjectId : (cleanProjects[0] && cleanProjects[0].id) || 'default',
    projects: cleanProjects
  };
}

function loadWorkspacesForUser(username) {
  ensureDataDirs();
  const p = userWorkspacesPath(username);
  try {
    if (!fs.existsSync(p)) fs.writeFileSync(p, JSON.stringify(emptyWorkspaceStore(), null, 2), 'utf8');
    return normalizeWorkspaceStore(JSON.parse(fs.readFileSync(p, 'utf8') || '{}'));
  } catch {
    return emptyWorkspaceStore();
  }
}

function saveWorkspacesForUser(username, store) {
  ensureDataDirs();
  const p = userWorkspacesPath(username);
  fs.writeFileSync(p, JSON.stringify(normalizeWorkspaceStore(store), null, 2), 'utf8');
}

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

// Claim workspace endpoints. Authenticated users get account-level sync; guests
// may still use localStorage in the browser and receive 401 here.
app.get('/api/workspaces', (req, res) => {
  const token = sidFromReq(req) || (req.get('authorization') || '').replace(/^Bearer\s+/, '');
  const user = getUserByToken(token);
  if (!user) return res.status(401).json({ error: 'unauthenticated' });
  return res.json(loadWorkspacesForUser(user.username));
});

app.put('/api/workspaces', (req, res) => {
  const token = sidFromReq(req) || (req.get('authorization') || '').replace(/^Bearer\s+/, '');
  const user = getUserByToken(token);
  if (!user) return res.status(401).json({ error: 'unauthenticated' });
  const body = normalizeWorkspaceStore(req.body || {});
  try {
    saveWorkspacesForUser(user.username, body);
    return res.json({ success: true, ...body });
  } catch (e) {
    console.error('Could not persist workspaces', e);
    return res.status(500).json({ error: 'Could not persist workspaces' });
  }
});

app.post('/api/feedback', feedbackLimiter, (req, res) => {
  const type = String((req.body && req.body.type) || 'general').slice(0, 40);
  const message = String((req.body && req.body.message) || '').trim();
  const conditionId = String((req.body && req.body.conditionId) || '').slice(0, 120);
  const sourceUrl = String((req.body && req.body.sourceUrl) || '').slice(0, 500);
  if (!message || message.length < 5) return res.status(400).json({ error: 'feedback message required' });
  if (message.length > 2000) return res.status(400).json({ error: 'feedback message too long' });
  const token = sidFromReq(req) || (req.get('authorization') || '').replace(/^Bearer\s+/, '');
  const user = getUserByToken(token);
  try {
    ensureDataDirs();
    const entry = {
      ts: new Date().toISOString(),
      type,
      conditionId,
      sourceUrl,
      message,
      user: user ? user.username : null
    };
    fs.appendFileSync(path.join(DATA_DIR, 'feedback.log'), JSON.stringify(entry) + '\n', 'utf8');
    return res.json({ ok: true });
  } catch (e) {
    console.error('Could not save feedback', e);
    return res.status(500).json({ error: 'Could not save feedback' });
  }
});

// Auth endpoints
app.post('/api/register', authLimiter, (req, res) => {
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
  // Mark cookies Secure when running in production or when trust proxy is enabled
  if (process.env.NODE_ENV === 'production' || app.get('trust proxy')) cookie += '; Secure';
  res.setHeader('Set-Cookie', cookie);
  res.json({ username });
});

app.post('/api/login', authLimiter, (req, res) => {
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
  if (process.env.NODE_ENV === 'production' || app.get('trust proxy')) cookie += '; Secure';
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
  res.status(500).send('Something went wrong!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`VA CFR MVP running on port ${PORT}`));
