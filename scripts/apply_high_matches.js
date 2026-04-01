const fs = require('fs')
const path = require('path')
const matchesPath = '/tmp/ecfr_pages/appendixB_matches.json'
const dataPath = path.resolve(process.cwd(), 'data', 'conditions.json')
const backupPath = dataPath + '.bak.' + Date.now()

function loadJSON(p){ return JSON.parse(fs.readFileSync(p,'utf8')) }

let matches = loadJSON(matchesPath)
let high = matches.filter(m => m.confidence === 'high' && m.best_match && m.best_match.id)
if(!high.length){ console.error('No high-confidence matches found'); process.exit(1) }

fs.copyFileSync(dataPath, backupPath)
console.log('Backup written to', backupPath)

let data = loadJSON(dataPath)
let idIndex = {}
for(let i=0;i<data.length;i++) idIndex[data[i].id] = i

let applied = []
for(const m of high){
  const cid = m.best_match.id
  const idx = idIndex[cid]
  if(idx === undefined) {
    console.warn('No condition with id', cid, 'for DC', m.diagnostic_code)
    continue
  }
  const cond = data[idx]
  // add top-level diagnostic_code if missing
  if(!cond.diagnostic_code) cond.diagnostic_code = m.diagnostic_code
  // set va_verified
  cond.va_verified = true
  // append to cfr array
  if(!Array.isArray(cond.cfr)) cond.cfr = []
  cond.cfr.push({
    section: '38 CFR Appendix B (parsed)',
    diagnostic_code: String(m.diagnostic_code),
    title: m.appendix_name,
    source: matchesPath
  })
  applied.push({id: cid, diagnostic_code: m.diagnostic_code, name: cond.name})
}

fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8')
console.log('Applied', applied.length, 'high-confidence matches.');
console.log('Details written to /tmp/applied_high_matches.json')
fs.writeFileSync('/tmp/applied_high_matches.json', JSON.stringify(applied, null, 2), 'utf8')
