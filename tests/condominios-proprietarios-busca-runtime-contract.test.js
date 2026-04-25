import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import test, { after } from 'node:test';
import request from 'supertest';

import CondAndar from '../src/core/models/cond_andar.js';
import CondBloco from '../src/core/models/cond_bloco.js';
import CondHabitacao from '../src/core/models/cond_habitacao.js';
import CondMorador from '../src/core/models/cond_morador.js';
import CondProprietario from '../src/core/models/cond_proprietario.js';
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

function buildUniqueEmail(prefix = 'proprietarios-busca-runtime') {
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
  email = buildUniqueEmail('diretor-proprietarios-busca'),
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
    email: buildUniqueEmail('diretor-proprietarios-busca'),
    nome: 'Diretor Proprietarios Busca',
    role: 'diretor',
    unidadeId: unidade._id,
  });

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidade._id,
    papel_contextual: 'gestor',
    status: 'active',
    origem: 'condominios-proprietarios-busca-runtime-contract-test',
  });

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: user.email });
  assert.equal(loginRes.status, 303, String(loginRes.status));
  assert.equal(loginRes.headers.location, '/gestor/dashboard');

  return { agent, unidade };
}

function listProprietarios(agent, query = '') {
  return agent
    .get(`/condominios/api/proprietarios/busca${query}`)
    .set('Accept', 'application/json')
    .set('Connection', 'close');
}

test('GET /condominios/api/proprietarios/busca retorna apenas proprietarios visiveis e preserva resposta enriquecida', async () => {
  const { app } = await getRuntimeContext();
  const { agent, unidade } = await createDiretorAgent(app, { unidadeId: '507f1f77bcf86cd799439910' });
  const outraUnidade = await createEnabledUnit(uniqueLabel('Outra Unidade'), '507f1f77bcf86cd799439911');

  const bloco = await CondBloco.create({ unidade_id: unidade._id, nome: 'Bloco Azul' });
  const andar = await CondAndar.create({ unidade_id: unidade._id, nome: '1 Andar' });

  const ownerUser = await CondUsuario.create({
    email: 'proprietario.enriquecido@example.com',
    nome: 'Proprietario Enriquecido',
    rg: 'RG-321',
    cpf: '12345678901',
    data_nascimento: new Date('1990-01-15T00:00:00.000Z'),
    sexo: 'M',
    pai: 'Pai Runtime',
    mae: 'Mae Runtime',
    telefone: '11999999999',
    whatsapp: true,
    unidade_id: unidade._id,
  });

  const esperado = await CondProprietario.create({
    unidade_id: unidade._id,
    cond_usuario_id: ownerUser._id,
    nome: 'Nome Local Ignorado',
    tipo: 'pf',
    rg: 'RG-LOCAL',
    cpf: '99999999999',
    contato_email: 'local@example.com',
    contato_telefone: '11888888888',
    whatsapp: false,
    ativo: true,
  });

  const habitacao = await CondHabitacao.create({
    unidade_id: unidade._id,
    bloco_id: bloco._id,
    andar_id: andar._id,
    numero: '101',
    tipo: 'apartamento',
    proprietario_id: esperado._id,
    ativa: true,
  });

  await CondMorador.create({
    unidade_id: unidade._id,
    habitacao_id: habitacao._id,
    cond_usuario_id: ownerUser._id,
    nome: 'Morador Mesmo Proprietario',
    email: ownerUser.email,
    cpf: ownerUser.cpf,
    ativo: true,
  });

  const ownerUserExterno = await CondUsuario.create({
    email: 'externo@example.com',
    nome: 'Proprietario Externo',
    unidade_id: outraUnidade._id,
  });

  const proprietarioExterno = await CondProprietario.create({
    unidade_id: outraUnidade._id,
    cond_usuario_id: ownerUserExterno._id,
    nome: 'Proprietario Externo',
    tipo: 'pf',
    ativo: true,
  });

  await CondHabitacao.create({
    unidade_id: outraUnidade._id,
    numero: '202',
    tipo: 'apartamento',
    proprietario_id: proprietarioExterno._id,
    ativa: true,
  });

  const res = await listProprietarios(agent);

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(Array.isArray(res.body), true, JSON.stringify(res.body));
  assert.equal(res.body.length, 1, JSON.stringify(res.body));
  assert.equal(String(res.body[0]?._id), String(esperado._id), JSON.stringify(res.body));
  assert.equal(String(res.body[0]?.unidade_id), String(unidade._id), JSON.stringify(res.body));
  assert.equal(res.body[0]?.nome, 'Proprietario Enriquecido', JSON.stringify(res.body));
  assert.equal(res.body[0]?.tipo, 'pf', JSON.stringify(res.body));
  assert.equal(res.body[0]?.rg, 'RG-321', JSON.stringify(res.body));
  assert.equal(res.body[0]?.cpf, '12345678901', JSON.stringify(res.body));
  assert.equal(res.body[0]?.data_nascimento, '1990-01-15T00:00:00.000Z', JSON.stringify(res.body));
  assert.equal(res.body[0]?.sexo, 'M', JSON.stringify(res.body));
  assert.equal(res.body[0]?.pai, 'Pai Runtime', JSON.stringify(res.body));
  assert.equal(res.body[0]?.mae, 'Mae Runtime', JSON.stringify(res.body));
  assert.equal(res.body[0]?.email, 'proprietario.enriquecido@example.com', JSON.stringify(res.body));
  assert.equal(res.body[0]?.telefone, '11999999999', JSON.stringify(res.body));
  assert.equal(res.body[0]?.whatsapp, true, JSON.stringify(res.body));
  assert.equal(res.body[0]?.ativo, true, JSON.stringify(res.body));
  assert.deepEqual(res.body[0]?.vinculos, [{
    unidade_id: String(unidade._id),
    habitacao_id: String(habitacao._id),
    morador: true,
    proprietario: true,
    hab_label: 'Bloco Azul - 1 Andar - 101'
  }], JSON.stringify(res.body));
});