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
import Funcionario from '../src/core/models/Funcionario.js';
import Ferias from '../models/ferias.js';
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
  const unidadeAId = oid('111111111111111111111111');
  const unidadeBId = oid('222222222222222222222222');

  return {
    unidadeAId,
    unidadeBId,
    docs: [
      {
        _id: unidadeAId,
        codigo: 'U001',
        nome: 'Unidade A',
        pessoaTipo: 'pj',
        is_principal: true,
        unidade_principal_id: null,
      },
      {
        _id: unidadeBId,
        codigo: 'U002',
        nome: 'Unidade B',
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
    funcionarioA1Id: oid('bbbbbbbbbbbbbbbbbbbbbbbb'),
    funcionarioA2Id: oid('cccccccccccccccccccccccc'),
    funcionarioB1Id: oid('dddddddddddddddddddddddd'),
    unidadeSemFuncionariosId: oid('eeeeeeeeeeeeeeeeeeeeeeee'),
  };
}

async function seedUnits() {
  const fixture = buildUnitDocs();
  const ids = buildFixtureIds();
  await Unidade.insertMany([
    ...fixture.docs,
    {
      _id: ids.unidadeSemFuncionariosId,
      codigo: 'U099',
      nome: 'Unidade Vazia',
      pessoaTipo: 'pj',
      is_principal: true,
      unidade_principal_id: null,
    },
  ]);
  return { ...fixture, unidadeSemFuncionariosId: ids.unidadeSemFuncionariosId };
}

async function seedFuncionarios(units) {
  const ids = buildFixtureIds();
  await Funcionario.insertMany([
    {
      _id: ids.funcionarioA1Id,
      codigo: 'FUNC00001',
      unidade_id: units.unidadeAId,
      nome: 'Ana Ferreira',
      rg: 'RG0001',
      cpf: '11111111111',
      data_nascimento: new Date('1990-01-01T00:00:00.000Z'),
      sexo: 'F',
      email: 'ana.ferreira@example.com',
      telefone: '(11) 99999-1111',
      ativo: true,
    },
    {
      _id: ids.funcionarioA2Id,
      codigo: 'FUNC00002',
      unidade_id: units.unidadeAId,
      nome: 'Bruno Costa',
      rg: 'RG0002',
      cpf: '22222222222',
      data_nascimento: new Date('1991-02-02T00:00:00.000Z'),
      sexo: 'M',
      email: 'bruno.costa@example.com',
      telefone: '(11) 99999-2222',
      ativo: true,
    },
    {
      _id: ids.funcionarioB1Id,
      codigo: 'FUNC00003',
      unidade_id: units.unidadeBId,
      nome: 'Carla Lima',
      rg: 'RG0003',
      cpf: '33333333333',
      data_nascimento: new Date('1992-03-03T00:00:00.000Z'),
      sexo: 'F',
      email: 'carla.lima@example.com',
      telefone: '(11) 99999-3333',
      ativo: true,
    },
  ]);
  return ids;
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
  const ids = await seedFuncionarios(units);
  const authIds = buildFixtureIds();
  const senha = 'Senha@123456';

  await createLoginUser({
    _id: authIds.authUserId,
    email: 'auth.ferias@example.com',
    senha,
    nome: 'Usuario Ferias',
    cpf: '44444444444',
    role: 'user',
    unidadeId: units.unidadeAId,
  });

  const agent = request.agent(app);
  const loginRes = await agent
    .post('/escalas/login')
    .type('form')
    .send({ email: 'auth.ferias@example.com', senha });

  assert.ok(loginRes.status >= 300 && loginRes.status < 400, `Login real deve redirecionar, recebido ${loginRes.status}`);
  return { agent, units, ids };
}

async function seedFerias(records) {
  if (!records.length) return;
  await Ferias.insertMany(records);
}

function makeFerias({ funcionarioId, funcionarioNome, inicioISO, fimISO, ano, dias = 1 }) {
  return {
    funcionarioId,
    funcionarioNome,
    inicioISO,
    fimISO,
    ano,
    dias,
    origem: 'manual',
    situacao: 'ativo',
  };
}

async function getFerias(agent, query) {
  return agent
    .get('/escalas/api/ferias')
    .query(query);
}

function assertObservableFeriasShape(item) {
  assert.equal(typeof item._id, 'string');
  assert.equal(typeof item.funcionarioId, 'string');
  assert.equal(typeof item.funcionarioNome, 'string');
  assert.equal(typeof item.inicioISO, 'string');
  assert.equal(typeof item.fimISO, 'string');
  assert.equal(typeof item.ano, 'number');
}

test('GET /escalas/api/ferias sem sessao retorna a tela de login', async () => {
  const { app } = await createServer();

  const res = await request(app)
    .get('/escalas/api/ferias')
    .redirects(0)
    .query({ funcionarioId: String(buildFixtureIds().funcionarioA1Id), ano: '2026' });

  assert.equal(res.status, 200);
  assert.equal(res.type, 'text/html');
  assert.match(String(res.text || ''), /<!DOCTYPE html>/i);
});

test('GET /escalas/api/ferias com funcionarioId e unidadeId juntos retorna 400', async () => {
  const { app } = await createServer();
  const { agent, units, ids } = await buildAuthenticatedAgent(app);

  const res = await getFerias(agent, { funcionarioId: String(ids.funcionarioA1Id), unidadeId: String(units.unidadeAId), ano: '2026' });

  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { ok: false, error: 'Informe apenas UNIDADE ou FUNCIONÁRIO (exclusivos).', success: false });
});

test('GET /escalas/api/ferias sem funcionarioId e sem unidadeId retorna 400', async () => {
  const { app } = await createServer();
  const { agent } = await buildAuthenticatedAgent(app);

  const res = await getFerias(agent, { ano: '2026' });

  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { ok: false, error: 'Informe uma UNIDADE ou um FUNCIONÁRIO.', success: false });
});

test('GET /escalas/api/ferias sem ano retorna 400', async () => {
  const { app } = await createServer();
  const { agent, ids } = await buildAuthenticatedAgent(app);

  const res = await getFerias(agent, { funcionarioId: String(ids.funcionarioA1Id) });

  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { ok: false, error: 'Ano obrigatório.', success: false });
});

test('GET /escalas/api/ferias com ano invalido retorna 400', async () => {
  const { app } = await createServer();
  const { agent, ids } = await buildAuthenticatedAgent(app);

  const res = await getFerias(agent, { funcionarioId: String(ids.funcionarioA1Id), ano: '1899' });

  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { ok: false, error: 'Ano inválido.', success: false });
});

test('GET /escalas/api/ferias com unidadeId invalido retorna 400', async () => {
  const { app } = await createServer();
  const { agent } = await buildAuthenticatedAgent(app);

  const res = await getFerias(agent, { unidadeId: 'nao-e-objectid', ano: '2026' });

  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { ok: false, error: 'unidadeId inválido.', success: false });
});

test('GET /escalas/api/ferias com unidade sem funcionarios retorna 200 com data vazio', async () => {
  const { app } = await createServer();
  const { agent, units } = await buildAuthenticatedAgent(app);

  const res = await getFerias(agent, { unidadeId: String(units.unidadeSemFuncionariosId), ano: '2026' });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true, data: [], success: true });
});

test('GET /escalas/api/ferias com funcionarioId retorna apenas registros do funcionario no ano informado', async () => {
  const { app } = await createServer();
  const { agent, ids } = await buildAuthenticatedAgent(app);

  await seedFerias([
    makeFerias({ funcionarioId: String(ids.funcionarioA1Id), funcionarioNome: 'Ana Ferreira', inicioISO: '2026-02-10', fimISO: '2026-02-12', ano: 2026, dias: 3 }),
    makeFerias({ funcionarioId: String(ids.funcionarioA1Id), funcionarioNome: 'Ana Ferreira', inicioISO: '2025-01-05', fimISO: '2025-01-06', ano: 2025, dias: 2 }),
    makeFerias({ funcionarioId: String(ids.funcionarioA2Id), funcionarioNome: 'Bruno Costa', inicioISO: '2026-01-01', fimISO: '2026-01-02', ano: 2026, dias: 2 }),
  ]);

  const res = await getFerias(agent, { funcionarioId: String(ids.funcionarioA1Id), ano: '2026' });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.ok(Array.isArray(res.body.data));
  assert.equal(res.body.data.length, 1);
  assertObservableFeriasShape(res.body.data[0]);
  assert.equal(res.body.data[0].funcionarioId, String(ids.funcionarioA1Id));
  assert.equal(res.body.data[0].funcionarioNome, 'Ana Ferreira');
  assert.equal(res.body.data[0].inicioISO, '2026-02-10');
  assert.equal(res.body.data[0].fimISO, '2026-02-12');
  assert.equal(res.body.data[0].ano, 2026);
});

test('GET /escalas/api/ferias com unidadeId retorna apenas registros da unidade e ordenados por inicioISO e funcionarioNome', async () => {
  const { app } = await createServer();
  const { agent, units, ids } = await buildAuthenticatedAgent(app);

  await seedFerias([
    makeFerias({ funcionarioId: String(ids.funcionarioB1Id), funcionarioNome: 'Carla Lima', inicioISO: '2026-01-01', fimISO: '2026-01-02', ano: 2026, dias: 2 }),
    makeFerias({ funcionarioId: String(ids.funcionarioA2Id), funcionarioNome: 'Bruno Costa', inicioISO: '2026-01-15', fimISO: '2026-01-18', ano: 2026, dias: 4 }),
    makeFerias({ funcionarioId: String(ids.funcionarioA1Id), funcionarioNome: 'Ana Ferreira', inicioISO: '2026-01-15', fimISO: '2026-01-16', ano: 2026, dias: 2 }),
  ]);

  const res = await getFerias(agent, { unidadeId: String(units.unidadeAId), ano: '2026' });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.ok(Array.isArray(res.body.data));
  assert.equal(res.body.data.length, 2);
  res.body.data.forEach(assertObservableFeriasShape);
  assert.deepEqual(
    res.body.data.map((item) => ({ funcionarioNome: item.funcionarioNome, inicioISO: item.inicioISO })),
    [
      { funcionarioNome: 'Ana Ferreira', inicioISO: '2026-01-15' },
      { funcionarioNome: 'Bruno Costa', inicioISO: '2026-01-15' },
    ],
  );
});