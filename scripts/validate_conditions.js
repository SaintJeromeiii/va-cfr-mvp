const fs = require('fs');
const path = require('path');
const p = path.join(process.cwd(), 'data', 'conditions.json');
const raw = fs.readFileSync(p, 'utf8');
try {
  const data = JSON.parse(raw);
  console.log('Parsed length', Array.isArray(data) ? data.length : 'not-array');
  const seen = new Set();
  for (let i = 0; i < data.length; i++) {
    const c = data[i];
    if (!c.id || typeof c.id !== 'string') throw new Error('Missing id at ' + i);
    if (seen.has(c.id)) throw new Error('Duplicate id ' + c.id + ' at ' + i);
    seen.add(c.id);
    if (!c.name || typeof c.name !== 'string') throw new Error('Missing name for ' + c.id);
    if (!Array.isArray(c.cfr) || c.cfr.length === 0) throw new Error('Missing cfr[] for ' + c.id);
    c.cfr.forEach((r, j) => {
      if (!r.section || !r.diagnostic_code || !r.title || !r.url) throw new Error('Condition ' + c.id + ' cfr[' + j + '] missing fields');
    });
  }
  console.log('Validation passed');
} catch (e) {
  console.error('ERROR:', e && e.message);
  process.exit(1);
}
