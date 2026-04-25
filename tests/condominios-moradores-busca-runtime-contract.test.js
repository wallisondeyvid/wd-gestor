import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import test, { after } from 'node:test';
import request from 'supertest';

import CondAndar from '../src/core/models/cond_andar.js';
import CondBloco from '../src/core/models/cond_bloco.js';
import CondHabitacao from '../src/core/models/cond_habitacao.js';
import CondMorador from '../src/core/models/cond_morador.js';
import CondUsuario from '../src/core/models/cond_usuario.js';
import Modulo from '../src/core/models/modulo.js';
import Unidade from '../src/core/models/unidade.js';
import User from '../src/core/models/user.js';
import UserMembership from '../src/core/models/userMembership.js';
import { createServer } from '../src/server/createServer.js';

const PASSWORD = 'Senha@123456';

let sequence = 0;
let passwordHashPromise = null;
let runtimeContextPromise = null;

function nextSequence() {
  sequence += 1;
  return sequence;
}

function buildUniqueEmail(prefix = 'moradores-busca-runtime') {
  const id = nextSequence();
  return `${prefix}.${Date.now()}.${id}@example.com`;
}

function buildUniqueCpf() {
  const id = nextSequence();
  return String(10000000000 + id).slice(-11);
}

function uniqueLabel(prefix) {
  return `${prefix}-${Date.now()}-${nextSequence()}`;
}

async function getPasswordHash() {
  if (!passwordHashPromise) {
    passwordHashPromise = bcrypt.hash(PASSWORD, Number(process.env.BCRYPT_MIN_ROUNDS || 12));
  }
  return passwordHashPromise;
}

async function withEnv(overrides, fn) {
  const previous = new Map();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = String(value);
  }

  try {
    return await fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function installTeardownSuppression() {
  let shuttingDown = false;
  const originalEmit = process.emit;

  const shouldIgnore = (err) => {
    if (!shuttingDown) return false;
    return String(err?.message || err).includes('Connection was force closed');
  };

  const onUnhandledRejection = (err) => {
    if (shouldIgnore(err)) return;
    throw err instanceof Error ? err : new Error(String(err));
  };

  const onUncaughtException = (err) => {
    if (shouldIgnore(err)) return;
    throw err instanceof Error ? err : new Error(String(err));
  };

  process.emit = function patchedEmit(eventName, ...args) {
    if (
      (eventName === 'unhandledRejection' || eventName === 'uncaughtException')
      && shouldIgnore(args[0])
    ) {
      return false;
    }
    return originalEmit.call(this, eventName, ...args);
  };

  process.prependListener('unhandledRejection', onUnhandledRejection);
  process.prependListener('uncaughtException', onUncaughtException);

  return {
    startShutdown() {
      shuttingDown = true;
    },
    async remove() {
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setTimeout(resolve, 0));
      process.off('unhandledRejection', onUnhandledRejection);
      process.off('uncaughtException', onUncaughtException);
      process.emit = originalEmit;
    }
  };
}

async function closeWithTeardownGuard(close, teardownGuard) {
  if (typeof close !== 'function') return;

  teardownGuard.startShutdown();
  await close({ stopMemoryServer: true });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const teardownGuard = installTeardownSuppression();

async function getRuntimeContext() {
  if (!runtimeContextPromise) {
    runtimeContextPromise = withEnv(
      { MONGO_MEMORY: '1', WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER: undefined },
      async () => createServer()
    );
  }
  return runtimeContextPromise;
}

after(async () => {
  try {
    if (runtimeContextPromise) {
      const { close } = await runtimeContextPromise;
      await closeWithTeardownGuard(close, teardownGuard);
    }
  } finally {
    await teardownGuard.remove();
  }
});

async function ensureGestorModulo() {
  const existing = await Modulo.findOne({ nome: 'gestor' });
  if (existing) return existing;

  return Modulo.create({
    nome: 'gestor',
    status: 'ativo',
    url_base: '/gestor',
  });
}

async function createEnabledUnit(nome, forcedId) {
  const modulo = await ensureGestorModulo();
  return Unidade.create({
    _id: forcedId,
    nome,
    pessoaTipo: 'pj',
    is_principal: true,
    modulosAcessiveis: [modulo._id],
  });
}

async function createUser({
  email = buildUniqueEmail('diretor-moradores-busca'),
  nome = 'Diretor Teste',
  role = 'diretor',
  unidadeId = null,
} = {}) {
  return User.create({
    email,
    senha: await getPasswordHash(),
    nome,
    cpf: buildUniqueCpf(),
    role,
    unidade_id: unidadeId,
    ativo: true,
    primeiro_acesso: false,
    senha_provisoria: false,
  });
}

async function login(agent, { email, senha = PASSWORD }) {
  return agent
    .post('/gestor/login')
    .type('form')
    .send({ email, senha, modulo: 'gestor' });
}

async function createDiretorAgent(app, { unidadeId } = {}) {
  const unidade = await Unidade.findById(unidadeId) || await createEnabledUnit(uniqueLabel('Unidade Runtime'), unidadeId);
  const user = await createUser({
    email: buildUniqueEmail('diretor-moradores-busca'),
    nome: 'Diretor Moradores Busca',
    role: 'diretor',
    unidadeId: unidade._id,
  });

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidade._id,
    papel_contextual: 'gestor',
    status: 'active',
    origem: 'condominios-moradores-busca-runtime-contract-test',
  });

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: user.email });
  assert.equal(loginRes.status, 303, String(loginRes.status));
  assert.equal(loginRes.headers.location, '/gestor/dashboard');

  return { agent, unidade };
}

async function createHabitacao({ unidadeId, blocoId = null, andarId = null, numero = '101' }) {
  return CondHabitacao.create({
    unidade_id: unidadeId,
    bloco_id: blocoId,
    andar_id: andarId,
    numero,
    ativa: true,
  });
}

async function createMorador({
  habitacaoId,
  unidadeId,
  condUsuarioId = null,
  nome = uniqueLabel('Morador Runtime'),
  email = buildUniqueEmail('morador-runtime'),
  ativo = true,
  inquilino = false,
  responsavelEmail = '',
  responsavelNome = '',
} = {}) {
  return CondMorador.create({
    habitacao_id: habitacaoId,
    unidade_id: unidadeId,
    cond_usuario_id: condUsuarioId,
    nome,
    email,
    responsavel_email: responsavelEmail,
    responsavel_nome: responsavelNome,
    inquilino,
    ativo,
  });
}

function listMoradores(agent, query = '') {
  return agent
    .get(`/condominios/api/moradores/busca${query}`)
    .set('Accept', 'application/json')
    .set('Connection', 'close');
}

test('GET /condominios/api/moradores/busca retorna apenas moradores ativos das habitacoes visiveis e preserva a resposta enriquecida', async () => {
  const { app } = await getRuntimeContext();
  const { agent, unidade } = await createDiretorAgent(app, { unidadeId: '507f1f77bcf86cd799439810' });
  const outraUnidade = await createEnabledUnit(uniqueLabel('Outra Unidade'), '507f1f77bcf86cd799439811');

  const bloco = await CondBloco.create({ unidade_id: unidade._id, nome: 'Bloco Azul' });
  const andar = await CondAndar.create({ unidade_id: unidade._id, nome: '1 Andar' });
  const habitacaoPermitida = await createHabitacao({ unidadeId: unidade._id, blocoId: bloco._id, andarId: andar._id, numero: '101' });
  const habitacaoExterna = await createHabitacao({ unidadeId: outraUnidade._id, numero: '202' });

  const condUsuario = await CondUsuario.create({
    email: 'morador.enriquecido@example.com',
    nome: 'Morador Enriquecido',
    rg: 'RG-123',
    cpf: '12345678901',
    telefone: '11999999999',
    whatsapp: true,
    unidade_id: unidade._id,
  });

  const esperado = await createMorador({
    habitacaoId: habitacaoPermitida._id,
    unidadeId: unidade._id,
    condUsuarioId: condUsuario._id,
    nome: 'Nome Local Ignorado',
    email: 'local@example.com',
    inquilino: true,
    responsavelEmail: 'responsavel@example.com',
    responsavelNome: 'Responsavel Runtime',
  });
  await createMorador({
    habitacaoId: habitacaoPermitida._id,
    unidadeId: unidade._id,
    nome: 'Morador Inativo',
    email: 'inativo@example.com',
    ativo: false,
  });
  await createMorador({
    habitacaoId: habitacaoExterna._id,
    unidadeId: outraUnidade._id,
    nome: 'Morador Externo',
    email: 'externo@example.com',
  });

  const res = await listMoradores(agent);

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(Array.isArray(res.body), true, JSON.stringify(res.body));
  assert.equal(res.body.length, 1, JSON.stringify(res.body));
  assert.equal(String(res.body[0]?._id), String(esperado._id), JSON.stringify(res.body));
  assert.equal(String(res.body[0]?.unidade_id), String(unidade._id), JSON.stringify(res.body));
  assert.equal(res.body[0]?.nome, 'Morador Enriquecido', JSON.stringify(res.body));
  assert.equal(res.body[0]?.rg, 'RG-123', JSON.stringify(res.body));
  assert.equal(res.body[0]?.cpf, '12345678901', JSON.stringify(res.body));
  assert.equal(res.body[0]?.telefone, '11999999999', JSON.stringify(res.body));
  assert.equal(res.body[0]?.email, 'morador.enriquecido@example.com', JSON.stringify(res.body));
  assert.equal(res.body[0]?.whatsapp, true, JSON.stringify(res.body));
  assert.equal(res.body[0]?.responsavel_email, 'responsavel@example.com', JSON.stringify(res.body));
  assert.equal(res.body[0]?.responsavel_nome, 'Responsavel Runtime', JSON.stringify(res.body));
  assert.equal(res.body[0]?.inquilino, true, JSON.stringify(res.body));
  assert.equal(res.body[0]?.ativo, true, JSON.stringify(res.body));
  assert.deepEqual(res.body[0]?.vinculos, [{
    unidade_id: String(unidade._id),
    habitacao_id: String(habitacaoPermitida._id),
    morador: true,
    inquilino: true,
    hab_label: 'Bloco Azul - 1 Andar - 101'
  }], JSON.stringify(res.body));
});