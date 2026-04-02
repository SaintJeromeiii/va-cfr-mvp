const fs = require('fs');
const path = require('path');

const appendixPath = '/tmp/ecfr_pages/appendixB_text.txt';
const conditionsPath = path.resolve(__dirname, '..', 'data', 'conditions.json');
const outPairs = '/tmp/ecfr_pages/appendixB_pairs.json';
const outMatches = '/tmp/ecfr_pages/appendixB_matches.json';

function normalize(s) {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(s) {
  return new Set(normalize(s).split(' ').filter(Boolean));
}

function jaccard(a, b) {
  const A = Array.from(a);
  const B = Array.from(b);
  const inter = A.filter(x => b.has(x)).length;
  const uni = new Set([...A, ...B]).size;
  return uni === 0 ? 0 : inter / uni;
}

try {
  const txt = fs.readFileSync(appendixPath, 'utf8');
  const lines = txt.split(/\r?\n/);
  const entries = [];

  for (let i = 0; i < lines.length; i++) {
    const codeMatch = lines[i].trim().match(/^([0-9]{3,4})$/);
    if (codeMatch) {
      const code = codeMatch[1];
      // find next non-empty line for name
      let name = '';
      for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        const nl = lines[j].trim();
        if (nl) { name = nl; break; }
      }
      if (!name) name = '(no title found)';
      entries.push({ diagnostic_code: code, name });
    }
  }

  fs.mkdirSync(path.dirname(outPairs), { recursive: true });
  fs.writeFileSync(outPairs, JSON.stringify(entries, null, 2));

  const conditionsRaw = fs.readFileSync(conditionsPath, 'utf8');
  let conditions;
  try {
    conditions = JSON.parse(conditionsRaw);
  } catch (parseErr) {
    // Fallback: tolerate slightly-broken JSON by regex-extracting id+name pairs
    const arr = [];
    const objRe = /\{[\s\S]*?"id"\s*:\s*"([^\"]+)"[\s\S]*?"name"\s*:\s*"([^\"]+)"[\s\S]*?\}/g;
    let m;
    while ((m = objRe.exec(conditionsRaw)) !== null) {
      arr.push({ id: m[1], name: m[2], aliases: [] });
    }
    if (arr.length === 0) {
      // try name then id ordering
      const objRe2 = /\{[\s\S]*?"name"\s*:\s*"([^\"]+)"[\s\S]*?"id"\s*:\s*"([^\"]+)"[\s\S]*?\}/g;
      while ((m = objRe2.exec(conditionsRaw)) !== null) {
        arr.push({ id: m[2], name: m[1], aliases: [] });
      }
    }
    conditions = arr;
  }

  const condIndex = conditions.map(c => {
    const allNames = [c.name].concat(c.aliases || []);
    return {
      id: c.id,
      name: c.name,
      allNames,
      normAll: allNames.map(normalize),
      tokenSets: allNames.map(a => tokens(a))
    };
  });

  const matches = entries.map(e => {
    const eNorm = normalize(e.name);
    const eTokens = tokens(e.name);
    let best = { score: 0, cond: null, matchedName: null, substring: false };
    for (const c of condIndex) {
      for (let k = 0; k < c.normAll.length; k++) {
        const nameNorm = c.normAll[k];
        const tset = c.tokenSets[k];
        const score = jaccard(eTokens, tset);
        const substr = nameNorm.includes(eNorm) || eNorm.includes(nameNorm);
        const boosted = substr ? Math.max(score, 0.99) : score;
        if (boosted > best.score) {
          best = { score: boosted, cond: c, matchedName: c.allNames[k], substring: substr };
        }
      }
    }
    let confidence = 'low';
    if (best.score >= 0.99 || best.substring) confidence = 'high';
    else if (best.score >= 0.5) confidence = 'medium';

    return {
      diagnostic_code: e.diagnostic_code,
      appendix_name: e.name,
      best_match: best.cond ? { id: best.cond.id, name: best.cond.name, matched_alias: best.matchedName } : null,
      score: Number(best.score.toFixed(3)),
      confidence,
      notes: best.cond ? (best.substring ? 'substring match' : 'token overlap') : 'no candidate'
    };
  });

  fs.writeFileSync(outMatches, JSON.stringify(matches, null, 2));

  console.log('Parsed', entries.length, 'entries; wrote', outPairs, 'and', outMatches);
} catch (err) {
  console.error('Error:', err && err.message);
  process.exit(2);
}
