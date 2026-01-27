#!/usr/bin/env node
// Script de teste: lista grupos de turnos de uma escala, deleta o primeiro e valida remoção.
// Uso: node scripts/test_delete_grupo_turno.js <escalaId>
// Requer que servidor esteja rodando localmente.

import fetch from 'node-fetch';

async function main(){
  const escalaId = process.argv[2];
  if(!escalaId){
    console.error('Uso: node scripts/test_delete_grupo_turno.js <escalaId>');
    process.exit(1);
  }
  const base = 'http://localhost:3000'; // ajuste se porta diferente
  const getUrl = `${base}/api/escalas/${escalaId}`;
  console.log('[teste] GET inicial', getUrl);
  const ini = await fetch(getUrl).then(r=> r.json()).catch(e=> { console.error('Falha GET inicial', e); return null; });
  const grupos = ini && (ini.data?.grupos_turnos || ini.grupos_turnos || []);
  console.log(`[teste] grupos encontrados: ${grupos.length}`);
  if(!grupos.length){ console.log('Nenhum grupo para testar exclusão.'); return; }
  const alvo = grupos[0];
  const gid = alvo.id || alvo._id;
  console.log('[teste] deletando grupo id=', gid);
  const delUrl = `${base}/api/escalas/${escalaId}/grupos-turnos/${encodeURIComponent(gid)}`;
  const del = await fetch(delUrl, { method:'DELETE' });
  console.log('[teste] status DELETE', del.status);
  const delBody = await del.text();
  console.log('[teste] corpo DELETE', delBody.slice(0,300));
  const after = await fetch(getUrl).then(r=> r.json()).catch(e=> { console.error('Falha GET pós-delete', e); return null; });
  const gruposAfter = after && (after.data?.grupos_turnos || after.grupos_turnos || []);
  const ainda = gruposAfter.find(g=> (g.id||g._id) === gid);
  console.log('[teste] grupos após:', gruposAfter.map(g=> g.id));
  if(ainda){
    console.error('[teste] FALHA: grupo ainda presente');
    process.exitCode = 2;
  } else {
    console.log('[teste] SUCESSO: grupo removido');
  }
}

main();
