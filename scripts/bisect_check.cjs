const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const srcPath = path.resolve('c:/Projeto3/public/escalas/js/escala_nova.js');
const tmpPath = path.resolve('c:/Projeto3/tmp/esc_trunc_check.js');

const txt = fs.readFileSync(srcPath, 'utf8');
const lines = txt.split(/\r?\n/);

fs.mkdirSync(path.dirname(tmpPath), { recursive: true });

function checkUpTo(n){
  const content = lines.slice(0, n).join('\n');
  fs.writeFileSync(tmpPath, content);
  try {
    cp.execFileSync(process.execPath, ['--check', tmpPath], { stdio: 'pipe' });
    return { ok: true, err: null };
  } catch(e){
    return { ok: false, err: String(e.stdout || e.stderr || e.message || e) };
  }
}

let lo = 1, hi = lines.length, badAt = null;
// Find first failing line count
while(lo <= hi){
  const mid = Math.floor((lo+hi)/2);
  const r = checkUpTo(mid);
  if(r.ok){
    lo = mid + 1; // need more lines to fail
  } else {
    badAt = mid;
    hi = mid - 1;
  }
}

if(badAt == null){
  console.log('Arquivo completo passou (--check ok).');
  process.exit(0);
}

// Also get last good
let lastGood = badAt - 1;
while(lastGood > 0){
  const r = checkUpTo(lastGood);
  if(r.ok) break;
  lastGood--;
}

console.log(`Primeira falha em linha ${badAt}. Última boa em linha ${lastGood}.`);
// Print a small window around the boundary
const start = Math.max(1, badAt - 10);
const end = Math.min(lines.length, badAt + 10);
console.log('Contexto próximo da falha:');
for(let i=start;i<=end;i++){
  const mark = (i===badAt?'>>':'  ');
  console.log(mark + String(i).padStart(6,' ')+': '+lines[i-1]);
}
