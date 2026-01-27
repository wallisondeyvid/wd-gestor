// Diagnóstico de erro de sintaxe ao carregar módulo Escalas
// Uso: node scripts/diagnose-escalas-imports.js
// Objetivo: identificar qual arquivo dentro de src/modules/escalas/app gera SyntaxError (Unexpected reserved word)

import fs from 'fs';
import path from 'path';
import url from 'url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..'); // scripts/..
const ESCALAS_DIR = path.join(ROOT, 'src', 'modules', 'escalas', 'app');

function listJsFiles(dir){
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes:true });
  for(const ent of entries){
    if(ent.name.startsWith('.')) continue;
    const full = path.join(dir, ent.name);
    if(ent.isDirectory()) out.push(...listJsFiles(full));
    else if(ent.isFile() && ent.name.endsWith('.js')) out.push(full);
  }
  return out;
}

(async ()=>{
  console.log('[diagnose-escalas] Iniciando varredura em', ESCALAS_DIR);
  if(!fs.existsSync(ESCALAS_DIR)){
    console.error('[diagnose-escalas] Diretório não encontrado');
    process.exit(2);
  }
  const files = listJsFiles(ESCALAS_DIR).sort();
  console.log('[diagnose-escalas] Total de arquivos .js:', files.length);
  let failures = 0;
  for(const f of files){
    const rel = path.relative(ROOT, f);
    const spec = url.pathToFileURL(f).href;
    try {
      await import(spec);
      console.log(' OK  ', rel);
    } catch(e){
      failures++;
      console.log(' FAIL', rel, '->', e.name+':', e.message.split('\n')[0]);
      if(e instanceof SyntaxError){
        console.log('  >> Provável arquivo culpado (SyntaxError). Pare a varredura para investigar.');
        break; // interrompe na primeira SyntaxError para focar
      }
    }
  }
  console.log('[diagnose-escalas] Concluído. Falhas:', failures);
  if(failures){
    console.log('\nSugestões próximas etapas:');
    console.log(' 1) Abrir o arquivo FAIL e verificar sintaxe moderna incompatível com versão do Node.');
    console.log(' 2) Executar: node -v  (recomendado >= 18)');
    console.log(' 3) Se o erro for em import alias (#core/#models), testar substituindo por caminho relativo temporário.');
  }
})();
