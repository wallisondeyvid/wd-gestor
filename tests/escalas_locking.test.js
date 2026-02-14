import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createServer } from '../src/server/createServer.js';
import { disconnectMongo } from '../src/core/db/connect.js';

let app; let registerErrorHandlers; let closeServer;

async function setupServer() {
  // Habilita módulo Escalas no servidor de teste
  process.env.ENABLE_ESCALAS = '1';
  // Bypass de auth no ambiente de teste
  process.env.NODE_ENV = 'test';
  process.env.SKIP_AUTH = '1';
  // Usa DB real/local (fallback padrão já cuida se não houver URI)
  const built = await createServer({ skipDb: false, skipAuth: true, deferErrorHandlers: true });
  app = built.app; registerErrorHandlers = built.registerErrorHandlers; closeServer = built.close;
  await Promise.resolve(registerErrorHandlers());
}

after(async () => {
  try {
    if (typeof closeServer === 'function') {
      await closeServer({ stopMemoryServer: true });
    } else {
      await disconnectMongo({ stopMemoryServer: true });
    }
  } catch {}
  if (String(process.env.DEBUG_HANDLES || '').trim() === '1') {
    const handles = typeof process._getActiveHandles === 'function' ? process._getActiveHandles() : [];
    const requests = typeof process._getActiveRequests === 'function' ? process._getActiveRequests() : [];
    const handleNames = handles.map((item) => item?.constructor?.name || typeof item);
    const requestNames = requests.map((item) => item?.constructor?.name || typeof item);
    console.log('[DEBUG_HANDLES] activeHandles:', handleNames);
    console.log('[DEBUG_HANDLES] activeRequests:', requestNames);
  }
});

async function criarEscalaBasica() {
  const hoje = new Date();
  const iso = (d)=> d.toISOString().slice(0,10);
  const ini = iso(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()));
  const fim = iso(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()+3));
  const body = {
    descricao: 'Escala Teste Lock',
    periodo: { ini, fim },
    classificacao: 'ordinaria',
    equipes: [ { id: 'EQ1', nome: 'EQ1', descricao: 'Equipe 1', componentes: [] } ],
    gruposTurnos: [ { id: 'g1', turnos: [ { ini: '08:00', fim: '12:00' } ] } ]
  };
  const res = await request(app)
    .post('/escalas/api/escalas')
    .set('Accept','application/json')
    .send(body);
  assert.equal(res.status, 201, 'Falha ao criar escala de teste');
  assert.ok(res.body?.id, 'Sem id retornado ao criar escala');
  return { id: res.body.id, periodo: body.periodo };
}

async function fecharEscala(id) {
  const res = await request(app)
    .put(`/escalas/api/escalas/${id}/status`)
    .set('Accept','application/json')
    .send({ status: 'fechada' });
  assert.equal(res.status, 200, 'Falha ao fechar escala');
  assert.equal((res.body?.status || res.body?.data?.status), 'fechada');
}

// Setup único do servidor
await setupServer();

test('Escala fechada deve responder 423 em operações bloqueadas', async () => {
  const { id, periodo } = await criarEscalaBasica();
  await fecharEscala(id);

  // 1) Remover grupo por equivalência de turnos: deve priorizar 423 mesmo sem body turnos
  {
    const r = await request(app)
      .post(`/escalas/api/escalas/${id}/grupos-turnos/remove-by-turnos`)
      .set('Accept','application/json')
      .send({});
    assert.equal(r.status, 423, `Esperado 423 Locked, recebido ${r.status}`);
    assert.match(JSON.stringify(r.body||{}), /ESCALA_FECHADA/);
  }

  // 2) PUT /escalas/:id alterando equipes (campos gerais): 423
  {
    const r = await request(app)
      .put(`/escalas/api/escalas/${id}`)
      .set('Accept','application/json')
      .send({ equipes: [ { id: 'EQ1', componentes: [] } ] });
    assert.equal(r.status, 423, `Esperado 423 Locked em PUT /escalas/:id, recebido ${r.status}`);
  }

  // 3) DELETE recurso: 423 (bloqueio geral)
  {
    const r = await request(app)
      .delete(`/escalas/api/escalas/${id}/equipes/EQ1/recursos/R1`)
      .set('Accept','application/json');
    assert.equal(r.status, 423, `Esperado 423 Locked em DELETE recurso, recebido ${r.status}`);
  }

  // 4) DELETE alocação de recurso por dia/turno: 423 célula bloqueada
  {
    const dia = (periodo.ini||'').slice(0,10);
    const r = await request(app)
      .delete(`/escalas/api/escalas/${id}/equipes/EQ1/recursos/R1/alocacao`)
      .query({ dia, turnoId: '08:00-12:00' })
      .set('Accept','application/json');
    assert.equal(r.status, 423, `Esperado 423 Locked em DELETE alocação, recebido ${r.status}`);
  }

  // 5) Alias POST alocacao/delete: 423 célula bloqueada (mirror)
  {
    const dia = (periodo.ini||'').slice(0,10);
    const r = await request(app)
      .post(`/escalas/api/escalas/${id}/equipes/EQ1/recursos/R1/alocacao/delete`)
      .send({ dia, turnoId: '08:00-12:00' })
      .set('Accept','application/json');
    assert.equal(r.status, 423, `Esperado 423 Locked em POST alocacao/delete, recebido ${r.status}`);
  }
});
