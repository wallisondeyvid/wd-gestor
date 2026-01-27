#!/usr/bin/env node
// Verifica usos diretos de fetch('/data/ em arquivos JS fora dos utilitários aprovados
// Aprovados: public/gestor/js/utils/fetch-json.js, public/gestor/js/utils/data-url.js
// Também permitido em comentários ou strings que contenham 'LEGACY_ALLOW'
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const ALLOWED = new Set([
  path.normalize('public/gestor/js/utils/fetch-json.js'),
  path.normalize('public/gestor/js/utils/data-url.js')
]);

function isJsFile(p){ return /\.(js|mjs|cjs)$/i.test(p); }

function walk(dir){
  const out=[]; for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(entry.name.startsWith('.') ) continue;
    const full = path.join(dir, entry.name);
    if(entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  } return out;
}

const files = walk(ROOT).filter(f=> f.includes(path.sep + 'public' + path.sep) && isJsFile(f));
const offenders=[];
const PATTERN = /fetch\(\s*['"]\s*\/data\//g;
for(const file of files){
  const rel = path.relative(ROOT,file).replace(/\\/g,'/');
  if(ALLOWED.has(path.normalize(rel))) continue;
  const txt = fs.readFileSync(file,'utf8');
  if(/LEGACY_ALLOW/.test(txt)) continue;
  const matches = [...txt.matchAll(PATTERN)];
  if(matches.length){
    offenders.push({ file: rel, count: matches.length });
  }
}

if(offenders.length){
  console.error('\n[check-data-fetch] Uso direto proibido de fetch("/data/...") encontrado:');
  offenders.forEach(o=> console.error(' -', o.file, '(ocorrências:', o.count + ')'));
  console.error('\nUse window.wdgFetchGestorJson("arquivo.json") em vez de fetch("/data/..."), ou marque explicitamente como LEGACY_ALLOW se absolutamente necessário.');
  process.exit(1);
} else {
  console.log('[check-data-fetch] OK - nenhum uso direto não permitido encontrado.');
}
