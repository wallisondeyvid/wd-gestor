import test, { after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import bcrypt from 'bcryptjs';

process.env.ENABLE_ESCALAS = '1';
process.env.MONGO_MEMORY = '1';

import { createServer } from '../src/server/createServer.js';
import Unidade from '../src/core/models/unidade.js';
import User from '../src/core/models/user.js';
import Ferias from '../models/ferias.js';
import Ausencia from '../models/ausencia.js';
import { disconnectMongo } from '../src/core/db/connect.js';

after(async () => {
  await disconnectMongo({ stopMemoryServer: true });
});

afterEach(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase();
  }
});

function oid(hex) {
  return new mongoose.Types.ObjectId(hex);
}

function buildUnitDocs() {
  const matrizAId = oid('111111111111111111111111');

  return {
    matrizAId,
    docs: [
      {
        _id: matrizAId,
        codigo: 'U001',
        nome: 'Matriz A',
        pessoaTipo: 'pj',
        is_principal: true,
        unidade_principal_id: null,
      },
    ],
  };
}

function buildFixtureIds() {
  return {
    authUserId: oid('aaaaaaaaaaaaaaaaaaaaaaaa'),
    funcionarioId: oid('bbbbbbbbbbbbbbbbbbbbbbbb'),
  };
}

async function seedUnits() {
  const fixture = buildUnitDocs();
  await Unidade.insertMany(fixture.docs);
  return fixture;
}

async function createLoginUser({ _id, email, senha, nome, cpf, role, unidadeId = null }) {
  const senhaHash = await bcrypt.hash(senha, 10);
  await User.create({
    _id,
    email,
    senha: senhaHash,
    cpf,
    role,
    ativo: true,
    primeiro_acesso: false,
    senha_provisoria: false,
    nome,
    unidade_id: unidadeId,
  });
}

async function buildAuthenticatedAgent(app) {
  const units = await seedUnits();
  const ids = buildFixtureIds();
  const senha = 'Senha@123456';

  await createLoginUser({
    _id: ids.authUserId,
    email: 'auth.disponibilidade@example.com',
    senha,
    nome: 'Usuario Disponibilidade',
    cpf: '44444444444',
    role: 'user',
    unidadeId: units.matrizAId,
  });

  const agent = request.agent(app);
  const loginRes = await agent
    .post('/escalas/login')
    .type('form')
    .send({ email: 'auth.disponibilidade@example.com', senha });

  assert.ok(loginRes.status >= 300 && loginRes.status < 400, `Login real deve redirecionar, recebido ${loginRes.status}`);
  return { agent, ids };
}

async function seedFerias(records) {
  if (!records.length) return;
  await Ferias.insertMany(records);
}

async function seedAusencias(records) {
  if (!records.length) return;
  await Ausencia.insertMany(records);
}

function makeFerias({ funcionarioId, funcionarioNome = 'Funcionario Disponivel', inicioISO, fimISO, ano = 2026 }) {
  return {
    funcionarioId,
    funcionarioNome,
    inicioISO,
    fimISO,
    ano,
    dias: 1,
    origem: 'manual',
    situacao: 'ativo',
  };
}

function makeAusencia({ funcionarioId, funcionarioNome = 'Funcionario Disponivel', tipo = 'atestado', inicioISO, fimISO }) {
  return {
    funcionarioId,
    funcionarioNome,
    tipo,
    inicioISO,
    fimISO,
    origem: 'manual',
    situacao: 'ativo',
  };
}

async function getDisponibilidade(agent, query) {
  return agent
    .get('/escalas/api/disponibilidade-funcionario')
    .query(query);
}

function assertSuccessShape(body, funcionarioId, inicio, fim) {
  assert.equal(body.ok, true);
  assert.ok(body.data);
  assert.deepEqual(body.data.base, { inicio, fim });
  assert.equal(body.data.funcionarioId, funcionarioId);
  assert.ok(Array.isArray(body.data.blocked));
  assert.ok(Array.isArray(body.data.free));
  body.data.blocked.forEach((item) => {
    assert.equal(typeof item.inicio, 'string');
    assert.equal(typeof item.fim, 'string');
    assert.equal(typeof item.tipo, 'string');
  });
  body.data.free.forEach((item) => {
    assert.equal(typeof item.inicio, 'string');
    assert.equal(typeof item.fim, 'string');
  });
}

test('GET /escalas/api/disponibilidade-funcionario sem sessao retorna a tela de login', async () => {
  const { app } = await createServer();
  const funcionarioId = String(buildFixtureIds().funcionarioId);

  const res = await request(app)
    .get('/escalas/api/disponibilidade-funcionario')
    .redirects(0)
    .query({ funcionarioId, inicio: '2026-01-01', fim: '2026-01-01' });

  assert.equal(res.status, 200);
  assert.equal(res.type, 'text/html');
  assert.match(String(res.text || ''), /<!DOCTYPE html>/i);
});

test('GET /escalas/api/disponibilidade-funcionario sem funcionarioId retorna 400', async () => {
  const { app } = await createServer();
  const { agent } = await buildAuthenticatedAgent(app);

  const res = await getDisponibilidade(agent, { inicio: '2026-01-01', fim: '2026-01-02' });

  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { ok: false, error: 'Parâmetros obrigatórios: funcionarioId, inicio, fim', success: false });
});

test('GET /escalas/api/disponibilidade-funcionario sem inicio retorna 400', async () => {
  const { app } = await createServer();
  const { agent, ids } = await buildAuthenticatedAgent(app);

  const res = await getDisponibilidade(agent, { funcionarioId: String(ids.funcionarioId), fim: '2026-01-02' });

  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { ok: false, error: 'Parâmetros obrigatórios: funcionarioId, inicio, fim', success: false });
});

test('GET /escalas/api/disponibilidade-funcionario sem fim retorna 400', async () => {
  const { app } = await createServer();
  const { agent, ids } = await buildAuthenticatedAgent(app);

  const res = await getDisponibilidade(agent, { funcionarioId: String(ids.funcionarioId), inicio: '2026-01-01' });

  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { ok: false, error: 'Parâmetros obrigatórios: funcionarioId, inicio, fim', success: false });
});

test('GET /escalas/api/disponibilidade-funcionario com funcionarioId invalido retorna 400', async () => {
  const { app } = await createServer();
  const { agent } = await buildAuthenticatedAgent(app);

  const res = await getDisponibilidade(agent, { funcionarioId: 'nao-e-objectid', inicio: '2026-01-01', fim: '2026-01-02' });

  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { ok: false, error: 'funcionarioId inválido', success: false });
});

test('GET /escalas/api/disponibilidade-funcionario com data invalida retorna 400', async () => {
  const { app } = await createServer();
  const { agent, ids } = await buildAuthenticatedAgent(app);

  const res = await getDisponibilidade(agent, { funcionarioId: String(ids.funcionarioId), inicio: '01/01/2026', fim: '2026-01-02' });

  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { ok: false, error: 'Formato de data deve ser YYYY-MM-DD', success: false });
});

test('GET /escalas/api/disponibilidade-funcionario com fim anterior a inicio retorna 400', async () => {
  const { app } = await createServer();
  const { agent, ids } = await buildAuthenticatedAgent(app);

  const res = await getDisponibilidade(agent, { funcionarioId: String(ids.funcionarioId), inicio: '2026-01-05', fim: '2026-01-04' });

  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { ok: false, error: 'fim anterior a inicio', success: false });
});

test('GET /escalas/api/disponibilidade-funcionario com janela acima de 370 dias retorna 400', async () => {
  const { app } = await createServer();
  const { agent, ids } = await buildAuthenticatedAgent(app);

  const res = await getDisponibilidade(agent, { funcionarioId: String(ids.funcionarioId), inicio: '2026-01-01', fim: '2027-01-06' });

  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { ok: false, error: 'Janela muito extensa (>370 dias)', success: false });
});

test('GET /escalas/api/disponibilidade-funcionario sem bloqueios retorna free cobrindo todo o periodo', async () => {
  const { app } = await createServer();
  const { agent, ids } = await buildAuthenticatedAgent(app);
  const funcionarioId = String(ids.funcionarioId);

  const res = await getDisponibilidade(agent, { funcionarioId, inicio: '2026-01-01', fim: '2026-01-03' });

  assert.equal(res.status, 200);
  assertSuccessShape(res.body, funcionarioId, '2026-01-01', '2026-01-03');
  assert.deepEqual(res.body.data.blocked, []);
  assert.deepEqual(res.body.data.free, [{ inicio: '2026-01-01', fim: '2026-01-03' }]);
});

test('GET /escalas/api/disponibilidade-funcionario com ferias simples gera blocked ferias e complemento em free', async () => {
  const { app } = await createServer();
  const { agent, ids } = await buildAuthenticatedAgent(app);
  const funcionarioId = String(ids.funcionarioId);
  await seedFerias([
    makeFerias({ funcionarioId, inicioISO: '2026-01-02', fimISO: '2026-01-03' }),
  ]);

  const res = await getDisponibilidade(agent, { funcionarioId, inicio: '2026-01-01', fim: '2026-01-05' });

  assert.equal(res.status, 200);
  assertSuccessShape(res.body, funcionarioId, '2026-01-01', '2026-01-05');
  assert.deepEqual(res.body.data.blocked, [{ inicio: '2026-01-02', fim: '2026-01-03', tipo: 'ferias' }]);
  assert.deepEqual(res.body.data.free, [
    { inicio: '2026-01-01', fim: '2026-01-01' },
    { inicio: '2026-01-04', fim: '2026-01-05' },
  ]);
});

test('GET /escalas/api/disponibilidade-funcionario com ausencia simples gera blocked ausencia', async () => {
  const { app } = await createServer();
  const { agent, ids } = await buildAuthenticatedAgent(app);
  const funcionarioId = String(ids.funcionarioId);
  await seedAusencias([
    makeAusencia({ funcionarioId, inicioISO: '2026-01-02', fimISO: '2026-01-02' }),
  ]);

  const res = await getDisponibilidade(agent, { funcionarioId, inicio: '2026-01-01', fim: '2026-01-03' });

  assert.equal(res.status, 200);
  assertSuccessShape(res.body, funcionarioId, '2026-01-01', '2026-01-03');
  assert.deepEqual(res.body.data.blocked, [{ inicio: '2026-01-02', fim: '2026-01-02', tipo: 'ausencia' }]);
  assert.deepEqual(res.body.data.free, [
    { inicio: '2026-01-01', fim: '2026-01-01' },
    { inicio: '2026-01-03', fim: '2026-01-03' },
  ]);
});

test('GET /escalas/api/disponibilidade-funcionario faz clip de bloco começando antes do periodo', async () => {
  const { app } = await createServer();
  const { agent, ids } = await buildAuthenticatedAgent(app);
  const funcionarioId = String(ids.funcionarioId);
  await seedFerias([
    makeFerias({ funcionarioId, inicioISO: '2025-12-28', fimISO: '2026-01-02' }),
  ]);

  const res = await getDisponibilidade(agent, { funcionarioId, inicio: '2026-01-01', fim: '2026-01-05' });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.blocked, [{ inicio: '2026-01-01', fim: '2026-01-02', tipo: 'ferias' }]);
  assert.deepEqual(res.body.data.free, [{ inicio: '2026-01-03', fim: '2026-01-05' }]);
});

test('GET /escalas/api/disponibilidade-funcionario faz clip de bloco terminando depois do periodo', async () => {
  const { app } = await createServer();
  const { agent, ids } = await buildAuthenticatedAgent(app);
  const funcionarioId = String(ids.funcionarioId);
  await seedAusencias([
    makeAusencia({ funcionarioId, inicioISO: '2026-01-04', fimISO: '2026-01-10' }),
  ]);

  const res = await getDisponibilidade(agent, { funcionarioId, inicio: '2026-01-01', fim: '2026-01-05' });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.blocked, [{ inicio: '2026-01-04', fim: '2026-01-05', tipo: 'ausencia' }]);
  assert.deepEqual(res.body.data.free, [{ inicio: '2026-01-01', fim: '2026-01-03' }]);
});

test('GET /escalas/api/disponibilidade-funcionario mescla blocos adjacentes do mesmo tipo', async () => {
  const { app } = await createServer();
  const { agent, ids } = await buildAuthenticatedAgent(app);
  const funcionarioId = String(ids.funcionarioId);
  await seedFerias([
    makeFerias({ funcionarioId, inicioISO: '2026-01-02', fimISO: '2026-01-03' }),
    makeFerias({ funcionarioId, inicioISO: '2026-01-04', fimISO: '2026-01-04' }),
  ]);

  const res = await getDisponibilidade(agent, { funcionarioId, inicio: '2026-01-01', fim: '2026-01-05' });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.blocked, [{ inicio: '2026-01-02', fim: '2026-01-04', tipo: 'ferias' }]);
  assert.deepEqual(res.body.data.free, [
    { inicio: '2026-01-01', fim: '2026-01-01' },
    { inicio: '2026-01-05', fim: '2026-01-05' },
  ]);
});

test('GET /escalas/api/disponibilidade-funcionario mescla blocos sobrepostos do mesmo tipo', async () => {
  const { app } = await createServer();
  const { agent, ids } = await buildAuthenticatedAgent(app);
  const funcionarioId = String(ids.funcionarioId);
  await seedAusencias([
    makeAusencia({ funcionarioId, inicioISO: '2026-01-02', fimISO: '2026-01-04' }),
    makeAusencia({ funcionarioId, inicioISO: '2026-01-03', fimISO: '2026-01-05' }),
  ]);

  const res = await getDisponibilidade(agent, { funcionarioId, inicio: '2026-01-01', fim: '2026-01-06' });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.blocked, [{ inicio: '2026-01-02', fim: '2026-01-05', tipo: 'ausencia' }]);
  assert.deepEqual(res.body.data.free, [
    { inicio: '2026-01-01', fim: '2026-01-01' },
    { inicio: '2026-01-06', fim: '2026-01-06' },
  ]);
});

test('GET /escalas/api/disponibilidade-funcionario mescla ferias e ausencia colidindo em tipo misto', async () => {
  const { app } = await createServer();
  const { agent, ids } = await buildAuthenticatedAgent(app);
  const funcionarioId = String(ids.funcionarioId);
  await seedFerias([
    makeFerias({ funcionarioId, inicioISO: '2026-01-02', fimISO: '2026-01-03' }),
  ]);
  await seedAusencias([
    makeAusencia({ funcionarioId, inicioISO: '2026-01-03', fimISO: '2026-01-05' }),
  ]);

  const res = await getDisponibilidade(agent, { funcionarioId, inicio: '2026-01-01', fim: '2026-01-06' });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.blocked, [{ inicio: '2026-01-02', fim: '2026-01-05', tipo: 'misto' }]);
  assert.deepEqual(res.body.data.free, [
    { inicio: '2026-01-01', fim: '2026-01-01' },
    { inicio: '2026-01-06', fim: '2026-01-06' },
  ]);
});

test('GET /escalas/api/disponibilidade-funcionario com blocked cobrindo tudo retorna free vazio', async () => {
  const { app } = await createServer();
  const { agent, ids } = await buildAuthenticatedAgent(app);
  const funcionarioId = String(ids.funcionarioId);
  await seedFerias([
    makeFerias({ funcionarioId, inicioISO: '2026-01-01', fimISO: '2026-01-07' }),
  ]);

  const res = await getDisponibilidade(agent, { funcionarioId, inicio: '2026-01-01', fim: '2026-01-07' });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.blocked, [{ inicio: '2026-01-01', fim: '2026-01-07', tipo: 'ferias' }]);
  assert.deepEqual(res.body.data.free, []);
});

test('GET /escalas/api/disponibilidade-funcionario retorna multiplos intervalos livres entre bloqueios', async () => {
  const { app } = await createServer();
  const { agent, ids } = await buildAuthenticatedAgent(app);
  const funcionarioId = String(ids.funcionarioId);
  await seedFerias([
    makeFerias({ funcionarioId, inicioISO: '2026-01-02', fimISO: '2026-01-03' }),
  ]);
  await seedAusencias([
    makeAusencia({ funcionarioId, inicioISO: '2026-01-05', fimISO: '2026-01-06' }),
  ]);

  const res = await getDisponibilidade(agent, { funcionarioId, inicio: '2026-01-01', fim: '2026-01-07' });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.blocked, [
    { inicio: '2026-01-02', fim: '2026-01-03', tipo: 'ferias' },
    { inicio: '2026-01-05', fim: '2026-01-06', tipo: 'ausencia' },
  ]);
  assert.deepEqual(res.body.data.free, [
    { inicio: '2026-01-01', fim: '2026-01-01' },
    { inicio: '2026-01-04', fim: '2026-01-04' },
    { inicio: '2026-01-07', fim: '2026-01-07' },
  ]);
});