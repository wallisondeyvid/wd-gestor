#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, extname } from 'path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const PATTERN = /\.\.\/(?:\.\.\/){2,}/; // captura ../../../../ (3+ níveis no total)
let offenders = [];

function scan(dir){
  for(const entry of readdirSync(dir)){
    const full = join(dir, entry);
    const st = statSync(full);
    if(st.isDirectory()) scan(full); else if(['.js','.mjs','.cjs'].includes(extname(full))){
      const content = readFileSync(full,'utf8');
      if(PATTERN.test(content)){
        offenders.push(full.replace(ROOT+"\\",''));
      }
    }
  }
}

try {
  scan(SRC);
  if(offenders.length){
    console.log('[lint-paths] Imports profundos encontrados:');
    offenders.forEach(f=>console.log(' -', f));
    process.exitCode = 2;
  } else {
    console.log('[lint-paths] OK - nenhum import profundo (../../..) encontrado.');
  }
} catch(e){
  console.error('[lint-paths] erro:', e.message);
  process.exit(1);
}
