import test from 'node:test';
import assert from 'node:assert/strict';
import fetch from 'node-fetch';

// Teste mínimo: verifica que GET /escalas/api/escalas/:id retorna unidadeId (ou equivalente)
// Requer que a app esteja rodando localmente. Ajuste BASE_URL conforme necessário.
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function getJson(url){
  const r = await fetch(url, { headers: { 'Accept': 'application/json' }, credentials: 'include' });
  const txt = await r.text();
  let js = null; try { js = JSON.parse(txt); } catch { js = null; }
  return { ok: r.ok, status: r.status, body: js, raw: txt };
}

// Helper: tenta extrair id da URL atual (?id=...)
function getIdFromEnv(){
  return process.env.ESCALA_ID || '';
}

test('API Escalas deve retornar unidadeId no payload', async (t) => {
  const id = getIdFromEnv();
  if(!id){
    console.warn('[SKIP] Defina ESCALA_ID para rodar este teste contra uma escala existente.');
    return;
  }
  const urls = [
    `${BASE_URL}/escalas/api/escalas/${encodeURIComponent(id)}`,
    `${BASE_URL}/api/escalas/${encodeURIComponent(id)}`
  ];
  let resp = null;
  for(const u of urls){
    const r = await getJson(u);
    if(r.ok && r.body) { resp = r; break; }
  }
  assert.ok(resp && resp.ok, 'Resposta inválida da API');
  const d = resp.body && (resp.body.data || resp.body);
  assert.ok(d, 'Payload vazio');
  const uid = d.unidade_id || d.unidadeId || (d.unidadeObj && (d.unidadeObj.id || d.unidadeObj._id));
  assert.ok(uid, 'unidadeId ausente no payload da escala');
});
