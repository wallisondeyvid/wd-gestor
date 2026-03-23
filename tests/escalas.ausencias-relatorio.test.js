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
    email: 'auth.ausencias@example.com',
    senha,
    nome: 'Usuario Ausencias',
    cpf: '44444444444',
    role: 'user',
    unidadeId: units.unidadeAId,
  });

  const agent = request.agent(app);
  const loginRes = await agent
    .post('/escalas/login')
    .type('form')
    .send({ email: 'auth.ausencias@example.com', senha });

  assert.ok(loginRes.status >= 300 && loginRes.status < 400, `Login real deve redirecionar, recebido ${loginRes.status}`);
  return { agent, units, ids };
}

async function seedAusencias(records) {
  if (!records.length) return;
  await Ausencia.insertMany(records);
}

function makeAusencia({ funcionarioId, funcionarioNome, tipo = 'atestado', inicioISO, fimISO, motivo = null, autorizadorId = null, autorizadorNome = null }) {
  return {
    funcionarioId,
    funcionarioNome,
    tipo,
    inicioISO,
    fimISO,
    motivo,
    autorizadorId,
    autorizadorNome,
    origem: 'manual',
    situacao: 'ativo',
  };
}

function binaryParser(res, callback) {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

async function getAusenciasRelatorio(agent, query) {
  return agent
    .get('/escalas/api/ausencias/relatorio')
    .buffer(true)
    .parse(binaryParser)
    .query(query);
}

function getObservableJsonBody(res) {
  if (Buffer.isBuffer(res.body)) {
    return JSON.parse(res.body.toString('utf8'));
  }
  return res.body;
}

function assertPdfHeaders(res) {
  assert.match(String(res.headers['content-type'] || ''), /application\/pdf/i);
  assert.equal(res.headers['content-disposition'], 'inline; filename="relatorio-ausencias.pdf"');
  assert.ok(Buffer.isBuffer(res.body));
  assert.ok(res.body.length > 0);
}

test('GET /escalas/api/ausencias/relatorio sem sessao retorna a tela de login', async () => {
  const { app } = await createServer();

  const res = await request(app)
    .get('/escalas/api/ausencias/relatorio')
    .redirects(0)
    .query({ funcionarioId: String(buildFixtureIds().funcionarioA1Id), inicio: '2026-01-10', fim: '2026-01-12' });

  assert.equal(res.status, 200);
  assert.equal(res.type, 'text/html');
  assert.match(String(res.text || ''), /<!DOCTYPE html>/i);
});

test('GET /escalas/api/ausencias/relatorio com funcionarioId e unidadeId juntos retorna 400', async () => {
  const { app } = await createServer();
  const { agent, units, ids } = await buildAuthenticatedAgent(app);

  const res = await getAusenciasRelatorio(agent, { funcionarioId: String(ids.funcionarioA1Id), unidadeId: String(units.unidadeAId), inicio: '2026-01-10', fim: '2026-01-12' });

  assert.equal(res.status, 400);
  assert.deepEqual(getObservableJsonBody(res), { ok: false, error: 'Use UNIDADE ou FUNCIONÁRIO (exclusivos).', success: false });
});

test('GET /escalas/api/ausencias/relatorio sem funcionarioId e sem unidadeId retorna 400', async () => {
  const { app } = await createServer();
  const { agent } = await buildAuthenticatedAgent(app);

  const res = await getAusenciasRelatorio(agent, { inicio: '2026-01-10', fim: '2026-01-12' });

  assert.equal(res.status, 400);
  assert.deepEqual(getObservableJsonBody(res), { ok: false, error: 'Informe uma UNIDADE ou um FUNCIONÁRIO.', success: false });
});

test('GET /escalas/api/ausencias/relatorio sem inicio retorna 400', async () => {
  const { app } = await createServer();
  const { agent, ids } = await buildAuthenticatedAgent(app);

  const res = await getAusenciasRelatorio(agent, { funcionarioId: String(ids.funcionarioA1Id), fim: '2026-01-12' });

  assert.equal(res.status, 400);
  assert.deepEqual(getObservableJsonBody(res), { ok: false, error: 'Período obrigatório', success: false });
});

test('GET /escalas/api/ausencias/relatorio sem fim retorna 400', async () => {
  const { app } = await createServer();
  const { agent, ids } = await buildAuthenticatedAgent(app);

  const res = await getAusenciasRelatorio(agent, { funcionarioId: String(ids.funcionarioA1Id), inicio: '2026-01-10' });

  assert.equal(res.status, 400);
  assert.deepEqual(getObservableJsonBody(res), { ok: false, error: 'Período obrigatório', success: false });
});

test('GET /escalas/api/ausencias/relatorio com unidadeId invalido retorna 400', async () => {
  const { app } = await createServer();
  const { agent } = await buildAuthenticatedAgent(app);

  const res = await getAusenciasRelatorio(agent, { unidadeId: 'nao-e-objectid', inicio: '2026-01-10', fim: '2026-01-12' });

  assert.equal(res.status, 400);
  assert.deepEqual(getObservableJsonBody(res), { ok: false, error: 'unidadeId inválido.', success: false });
});

test('GET /escalas/api/ausencias/relatorio com funcionarioId valido retorna 200 com Content-Type application/pdf', async () => {
  const { app } = await createServer();
  const { agent, ids } = await buildAuthenticatedAgent(app);

  await seedAusencias([
    makeAusencia({ funcionarioId: String(ids.funcionarioA1Id), funcionarioNome: 'Ana Ferreira', tipo: 'atestado', inicioISO: '2026-01-11', fimISO: '2026-01-12' }),
    makeAusencia({ funcionarioId: String(ids.funcionarioB1Id), funcionarioNome: 'Carla Lima', tipo: 'falta', inicioISO: '2026-01-11', fimISO: '2026-01-12' }),
  ]);

  const res = await getAusenciasRelatorio(agent, { funcionarioId: String(ids.funcionarioA1Id), inicio: '2026-01-10', fim: '2026-01-15' });

  assert.equal(res.status, 200);
  assert.match(String(res.headers['content-type'] || ''), /application\/pdf/i);
  assert.ok(Buffer.isBuffer(res.body));
  assert.ok(res.body.length > 0);
});

test('GET /escalas/api/ausencias/relatorio com funcionarioId valido retorna Content-Disposition inline com relatorio-ausencias.pdf', async () => {
  const { app } = await createServer();
  const { agent, ids } = await buildAuthenticatedAgent(app);

  await seedAusencias([
    makeAusencia({ funcionarioId: String(ids.funcionarioA1Id), funcionarioNome: 'Ana Ferreira', tipo: 'atestado', inicioISO: '2026-01-11', fimISO: '2026-01-12' }),
  ]);

  const res = await getAusenciasRelatorio(agent, { funcionarioId: String(ids.funcionarioA1Id), inicio: '2026-01-10', fim: '2026-01-15' });

  assert.equal(res.status, 200);
  assert.equal(res.headers['content-disposition'], 'inline; filename="relatorio-ausencias.pdf"');
});

test('GET /escalas/api/ausencias/relatorio com unidadeId valida e funcionarios retorna 200 com PDF', async () => {
  const { app } = await createServer();
  const { agent, units, ids } = await buildAuthenticatedAgent(app);

  await seedAusencias([
    makeAusencia({ funcionarioId: String(ids.funcionarioA1Id), funcionarioNome: 'Ana Ferreira', tipo: 'atestado', inicioISO: '2026-01-11', fimISO: '2026-01-12' }),
    makeAusencia({ funcionarioId: String(ids.funcionarioA2Id), funcionarioNome: 'Bruno Costa', tipo: 'falta', inicioISO: '2026-01-13', fimISO: '2026-01-14' }),
    makeAusencia({ funcionarioId: String(ids.funcionarioB1Id), funcionarioNome: 'Carla Lima', tipo: 'atestado', inicioISO: '2026-01-11', fimISO: '2026-01-12' }),
  ]);

  const res = await getAusenciasRelatorio(agent, { unidadeId: String(units.unidadeAId), inicio: '2026-01-10', fim: '2026-01-15' });

  assert.equal(res.status, 200);
  assertPdfHeaders(res);
});

test('GET /escalas/api/ausencias/relatorio com unidadeId valida sem funcionarios congela o comportamento real atual', async () => {
  const { app } = await createServer();
  const { agent, units, ids } = await buildAuthenticatedAgent(app);

  await seedAusencias([
    makeAusencia({ funcionarioId: String(ids.funcionarioA1Id), funcionarioNome: 'Ana Ferreira', tipo: 'atestado', inicioISO: '2026-01-11', fimISO: '2026-01-12' }),
    makeAusencia({ funcionarioId: String(ids.funcionarioB1Id), funcionarioNome: 'Carla Lima', tipo: 'falta', inicioISO: '2026-01-11', fimISO: '2026-01-12' }),
  ]);

  const res = await getAusenciasRelatorio(agent, { unidadeId: String(units.unidadeSemFuncionariosId), inicio: '2026-01-10', fim: '2026-01-15' });

  assert.equal(res.status, 200);
  assertPdfHeaders(res);
});

test('GET /escalas/api/ausencias/relatorio em erro interno retorna 500 com a mensagem atual', async () => {
  const { app } = await createServer();
  const { agent, ids } = await buildAuthenticatedAgent(app);
  const originalFind = Ausencia.find;

  Ausencia.find = () => {
    throw new Error('falha simulada');
  };

  try {
    const res = await getAusenciasRelatorio(agent, { funcionarioId: String(ids.funcionarioA1Id), inicio: '2026-01-10', fim: '2026-01-15' });

    assert.equal(res.status, 500);
    assert.deepEqual(getObservableJsonBody(res), { ok: false, error: 'Erro ao gerar relatório', success: false });
  } finally {
    Ausencia.find = originalFind;
  }
});