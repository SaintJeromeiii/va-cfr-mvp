const fs = require('fs');
const path = require('path');

const workspaceRoot = process.cwd();
const approvedPath = path.join('/tmp','approved_matches.json');
const dataPath = path.join(workspaceRoot,'data','conditions.json');

function readJson(p){ return JSON.parse(fs.readFileSync(p,'utf8')); }
function writeJson(p,obj){ fs.writeFileSync(p,JSON.stringify(obj,null,2)+'\n'); }

if(!fs.existsSync(approvedPath)){
  console.error('Approved file not found:', approvedPath);
  process.exit(2);
}
if(!fs.existsSync(dataPath)){
  console.error('Data file not found:', dataPath);
  process.exit(2);
}

const approved = readJson(approvedPath);
const data = readJson(dataPath);

const ts = Date.now();
const backupPath = dataPath + '.bak.approved.' + ts;
fs.copyFileSync(dataPath, backupPath);
console.log('Backup written to', backupPath);

const applied = [];
let added = 0, updated = 0, skipped = 0;

approved.forEach(a => {
  const matchId = a.match_id;
  const cond = data.find(c => c.id === matchId);
  if(!cond){
    skipped++;
    applied.push(Object.assign({}, a, {status:'no_condition_found'}));
    return;
  }

  // ensure cfr array exists
  cond.cfr = cond.cfr || [];

  const exists = cond.cfr.find(entry => String(entry.diagnostic_code) === String(a.diagnostic_code));
  if(!exists){
    const entry = {
      section: '38 CFR Appendix B (parsed)',
      diagnostic_code: String(a.diagnostic_code),
      title: a.appendix_name,
      source: '/tmp/ecfr_pages/appendixB_matches.json',
      url: 'file:///tmp/ecfr_pages/appendixB_matches.json'
    };
    cond.cfr.push(entry);
    added++;
    applied.push(Object.assign({}, a, {status:'added'}));
  } else {
    updated++;
    applied.push(Object.assign({}, a, {status:'already_present'}));
  }

  // set flags
  if(a.confidence === 'high'){
    cond.va_verified = true;
    cond.diagnostic_code = String(a.diagnostic_code);
  } else if(a.confidence === 'medium'){
    cond.best_effort = true;
    // don't overwrite existing diagnostic_code if present with a different primary value
    if(!cond.diagnostic_code) cond.diagnostic_code = String(a.diagnostic_code);
    cond.cfr_best_effort_search = cond.cfr_best_effort_search || 'Appendix B match ('+a.diagnostic_code+')';
  }
});

writeJson(dataPath, data);
writeJson(path.join('/tmp','applied_approved_matches.json'), applied);

console.log('Applied summary: added=',added,'updated=',updated,'skipped=',skipped);
console.log('Details written to /tmp/applied_approved_matches.json');
process.exit(0);
