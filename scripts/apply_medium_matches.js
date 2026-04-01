const fs = require('fs')
const path = require('path')
const matchesPath = '/tmp/ecfr_pages/appendixB_matches.json'
const dataPath = path.resolve(process.cwd(), 'data', 'conditions.json')
const backupPath = dataPath + '.bak.medium.' + Date.now()

function loadJSON(p){ return JSON.parse(fs.readFileSync(p,'utf8')) }

let matches = loadJSON(matchesPath)
let medium = matches.filter(m => m.confidence === 'medium' && m.best_match && m.best_match.id)
if(!medium.length){ console.error('No medium-confidence matches found'); process.exit(1) }

fs.copyFileSync(dataPath, backupPath)
console.log('Backup written to', backupPath)

let data = loadJSON(dataPath)
let idIndex = {}
for(let i=0;i<data.length;i++) idIndex[data[i].id] = i

let applied = []
for(const m of medium){
  const cid = m.best_match.id
  const idx = idIndex[cid]
  if(idx === undefined) {
    console.warn('No condition with id', cid, 'for DC', m.diagnostic_code)
    continue
  }
  const cond = data[idx]
  // add top-level diagnostic_code if missing
  if(!cond.diagnostic_code) cond.diagnostic_code = m.diagnostic_code
  // mark best_effort
  cond.best_effort = true
  cond.cfr_best_effort_search = cond.cfr_best_effort_search || `Appendix B match (${m.diagnostic_code})`
  // append to cfr array with source and not va_verified
  if(!Array.isArray(cond.cfr)) cond.cfr = []
  cond.cfr.push({
    section: '38 CFR Appendix B (best-effort)',
    diagnostic_code: String(m.diagnostic_code),
    title: m.appendix_name,
    source: matchesPath
  })
  applied.push({id: cid, diagnostic_code: m.diagnostic_code, name: cond.name})
}

fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8')
console.log('Applied', applied.length, 'medium-confidence matches.');
console.log('Details written to /tmp/applied_medium_matches.json')
fs.writeFileSync('/tmp/applied_medium_matches.json', JSON.stringify(applied, null, 2), 'utf8')
