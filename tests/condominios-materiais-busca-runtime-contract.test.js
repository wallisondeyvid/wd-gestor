import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import test, { after } from 'node:test';
import request from 'supertest';

import CondBemMaterial from '../src/core/models/cond_bem_material.js';
import CondNatMaterial from '../src/core/models/cond_nat_material.js';
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

function buildUniqueEmail(prefix = 'materiais-busca-runtime') {
  const id = nextSequence();
  return `${prefix}.${Date.now()}.${id}@example.com`;
}

function buildUniqueCpf() {
  const id = nextSequence();
  return String(30000000000 + id).slice(-11);
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
  email = buildUniqueEmail('user-materiais-busca'),
  nome = 'Usuario Materiais Busca',
  role = 'diretor',
  unidadeId = null,
  globalRole = undefined,
} = {}) {
  return User.create({
    email,
    senha: await getPasswordHash(),
    nome,
    cpf: buildUniqueCpf(),
    role,
    unidade_id: unidadeId,
    global_role: globalRole,
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
  const unidade = await Unidade.findById(unidadeId) || await createEnabledUnit(uniqueLabel('Unidade Diretor'), unidadeId);
  const user = await createUser({
    email: buildUniqueEmail('diretor-materiais-busca'),
    nome: 'Diretor Materiais Busca',
    role: 'diretor',
    unidadeId: unidade._id,
  });

  await UserMembership.create({
    user_id: user._id,
    unidade_id: unidade._id,
    papel_contextual: 'gestor',
    status: 'active',
    origem: 'condominios-materiais-busca-runtime-contract-test',
  });

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: user.email });
  assert.equal(loginRes.status, 303, String(loginRes.status));
  assert.equal(loginRes.headers.location, '/gestor/dashboard');

  return { agent, unidade, user };
}

async function createAdminAgent(app) {
  const user = await createUser({
    email: buildUniqueEmail('admin-materiais-busca'),
    nome: 'Admin Materiais Busca',
    role: 'admin',
    unidadeId: null,
    globalRole: 'admin',
  });

  const agent = request.agent(app);
  const loginRes = await login(agent, { email: user.email });
  assert.equal(loginRes.status, 303, String(loginRes.status));
  assert.equal(loginRes.headers.location, '/gestor/dashboard');

  return { agent, user };
}

async function createNatureza({ unidadeId, tipo = 'Móvel', nome = uniqueLabel('Natureza Material') }) {
  return CondNatMaterial.create({
    unidade_id: unidadeId,
    tipo,
    nome,
  });
}

async function createMaterial({
  unidadeId,
  naturezaId,
  tipo = 'Móvel',
  serie = uniqueLabel('SERIE').slice(0, 15),
  marca = '',
  modelo = '',
  cor = '',
} = {}) {
  return CondBemMaterial.create({
    unidade_id: unidadeId,
    natureza_id: naturezaId,
    tipo,
    serie,
    marca,
    modelo,
    cor,
  });
}

function listMateriais(requester, query = '') {
  return requester
    .get(`/condominios/api/materiais/busca${query}`)
    .set('Accept', 'application/json')
    .set('Connection', 'close');
}

function materialIds(body) {
  return (Array.isArray(body) ? body : []).map((item) => String(item._id));
}

function assertArrayResponse(res) {
  assert.equal(Array.isArray(res.body), true, JSON.stringify(res.body));
}

test('GET /condominios/api/materiais/busca sem sessao retorna contrato observavel atual', async () => {
  const { app } = await getRuntimeContext();

  const res = await listMateriais(request(app));

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body, []);
});

test('GET /condominios/api/materiais/busca sem query unidade limita usuario comum aos materiais permitidos', async () => {
  const { app } = await getRuntimeContext();
  const { agent, unidade } = await createDiretorAgent(app, { unidadeId: '507f1f77bcf86cd799439710' });
  const outraUnidade = await createEnabledUnit(uniqueLabel('Outra Unidade Materiais'), '507f1f77bcf86cd799439711');

  const naturezaPermitida = await createNatureza({ unidadeId: unidade._id, tipo: 'Móvel', nome: 'Cadeira Permitida Runtime' });
  const naturezaExterna = await createNatureza({ unidadeId: outraUnidade._id, tipo: 'Móvel', nome: 'Mesa Externa Runtime' });

  const materialPermitido = await createMaterial({
    unidadeId: unidade._id,
    naturezaId: naturezaPermitida._id,
    tipo: 'Móvel',
    serie: `MAT${nextSequence()}A`,
    marca: 'Marca A',
  });
  await createMaterial({
    unidadeId: outraUnidade._id,
    naturezaId: naturezaExterna._id,
    tipo: 'Móvel',
    serie: `MAT${nextSequence()}B`,
    marca: 'Marca B',
  });

  const res = await listMateriais(agent);

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assertArrayResponse(res);
  assert.deepEqual(materialIds(res.body), [String(materialPermitido._id)]);
  assert.equal(String(res.body[0].unidade_id), String(unidade._id));
  assert.equal(String(res.body[0].natureza._id), String(naturezaPermitida._id));
  assert.equal(res.body[0].nome, 'Cadeira Permitida Runtime');
});

test('GET /condominios/api/materiais/busca com query unidade da propria unidade retorna materiais da unidade', async () => {
  const { app } = await getRuntimeContext();
  const { agent, unidade } = await createDiretorAgent(app, { unidadeId: '507f1f77bcf86cd799439720' });
  const natureza = await createNatureza({ unidadeId: unidade._id, tipo: 'Fixo', nome: 'Armario Runtime' });
  const material = await createMaterial({
    unidadeId: unidade._id,
    naturezaId: natureza._id,
    tipo: 'Fixo',
    serie: `MAT${nextSequence()}C`,
    modelo: 'Modelo Armario',
  });

  const res = await listMateriais(agent, `?unidade=${unidade._id}`);

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assertArrayResponse(res);
  assert.deepEqual(materialIds(res.body), [String(material._id)]);
  assert.equal(String(res.body[0].unidade_id), String(unidade._id));
});

test('GET /condominios/api/materiais/busca com query unidade fora do escopo do usuario comum retorna lista vazia', async () => {
  const { app } = await getRuntimeContext();
  const { agent, unidade } = await createDiretorAgent(app, { unidadeId: '507f1f77bcf86cd799439730' });
  const outraUnidade = await createEnabledUnit(uniqueLabel('Unidade Fora Escopo'), '507f1f77bcf86cd799439731');

  const naturezaPermitida = await createNatureza({ unidadeId: unidade._id, tipo: 'Móvel', nome: 'Item Local Runtime' });
  const naturezaExterna = await createNatureza({ unidadeId: outraUnidade._id, tipo: 'Móvel', nome: 'Item Externo Runtime' });

  await createMaterial({
    unidadeId: unidade._id,
    naturezaId: naturezaPermitida._id,
    tipo: 'Móvel',
    serie: `MAT${nextSequence()}D`,
  });
  const materialExterno = await createMaterial({
    unidadeId: outraUnidade._id,
    naturezaId: naturezaExterna._id,
    tipo: 'Móvel',
    serie: `MAT${nextSequence()}E`,
    marca: 'Marca Externa',
  });

  const res = await listMateriais(agent, `?unidade=${outraUnidade._id}`);

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assertArrayResponse(res);
  assert.deepEqual(res.body, []);
});

test('GET /condominios/api/materiais/busca para admin sem query unidade mantém leitura ampla', async () => {
  const { app } = await getRuntimeContext();
  const { agent } = await createAdminAgent(app);
  const unidadeA = await createEnabledUnit(uniqueLabel('Admin Unidade A'), '507f1f77bcf86cd799439740');
  const unidadeB = await createEnabledUnit(uniqueLabel('Admin Unidade B'), '507f1f77bcf86cd799439741');

  const naturezaA = await createNatureza({ unidadeId: unidadeA._id, tipo: 'Móvel', nome: 'Admin Natureza A' });
  const naturezaB = await createNatureza({ unidadeId: unidadeB._id, tipo: 'Fixo', nome: 'Admin Natureza B' });

  const materialA = await createMaterial({
    unidadeId: unidadeA._id,
    naturezaId: naturezaA._id,
    tipo: 'Móvel',
    serie: `MAT${nextSequence()}F`,
  });
  const materialB = await createMaterial({
    unidadeId: unidadeB._id,
    naturezaId: naturezaB._id,
    tipo: 'Fixo',
    serie: `MAT${nextSequence()}G`,
  });

  const res = await listMateriais(agent);

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assertArrayResponse(res);
  const ids = new Set(materialIds(res.body));
  assert.equal(ids.has(String(materialA._id)), true, JSON.stringify(res.body));
  assert.equal(ids.has(String(materialB._id)), true, JSON.stringify(res.body));
  assert.equal(res.body.some((item) => String(item.unidade_id) === String(unidadeA._id)), true, JSON.stringify(res.body));
  assert.equal(res.body.some((item) => String(item.unidade_id) === String(unidadeB._id)), true, JSON.stringify(res.body));
});

test('GET /condominios/api/materiais/busca para admin com query unidade explicita filtra pela unidade informada', async () => {
  const { app } = await getRuntimeContext();
  const { agent } = await createAdminAgent(app);
  const unidadeA = await createEnabledUnit(uniqueLabel('Admin Filtro Unidade A'), '507f1f77bcf86cd799439750');
  const unidadeB = await createEnabledUnit(uniqueLabel('Admin Filtro Unidade B'), '507f1f77bcf86cd799439751');

  const naturezaA = await createNatureza({ unidadeId: unidadeA._id, tipo: 'Móvel', nome: 'Filtro Admin A' });
  const naturezaB = await createNatureza({ unidadeId: unidadeB._id, tipo: 'Móvel', nome: 'Filtro Admin B' });

  const materialA = await createMaterial({
    unidadeId: unidadeA._id,
    naturezaId: naturezaA._id,
    tipo: 'Móvel',
    serie: `MAT${nextSequence()}H`,
  });
  await createMaterial({
    unidadeId: unidadeB._id,
    naturezaId: naturezaB._id,
    tipo: 'Móvel',
    serie: `MAT${nextSequence()}I`,
  });

  const res = await listMateriais(agent, `?unidade=${unidadeA._id}`);

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assertArrayResponse(res);
  assert.deepEqual(materialIds(res.body), [String(materialA._id)]);
  assert.equal(String(res.body[0].unidade_id), String(unidadeA._id));
});

test('GET /condominios/api/materiais/busca preserva filtros de tipo e natureza com resposta em array simples', async () => {
  const { app } = await getRuntimeContext();
  const { agent, unidade } = await createDiretorAgent(app, { unidadeId: '507f1f77bcf86cd799439760' });

  const naturezaMovel = await createNatureza({ unidadeId: unidade._id, tipo: 'Móvel', nome: 'Filtro Natureza Movel' });
  const naturezaFixa = await createNatureza({ unidadeId: unidade._id, tipo: 'Fixo', nome: 'Filtro Natureza Fixa' });

  const materialMovel = await createMaterial({
    unidadeId: unidade._id,
    naturezaId: naturezaMovel._id,
    tipo: 'Móvel',
    serie: `MAT${nextSequence()}J`,
    cor: 'Azul',
  });
  await createMaterial({
    unidadeId: unidade._id,
    naturezaId: naturezaFixa._id,
    tipo: 'Fixo',
    serie: `MAT${nextSequence()}K`,
    cor: 'Preto',
  });

  const res = await listMateriais(agent, `?tipo=Móvel&natureza=${naturezaMovel._id}`);

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assertArrayResponse(res);
  assert.equal('ok' in res.body, false);
  assert.equal('success' in res.body, false);
  assert.deepEqual(materialIds(res.body), [String(materialMovel._id)]);
  assert.equal(res.body[0].tipo, 'Móvel');
  assert.equal(String(res.body[0].natureza._id), String(naturezaMovel._id));
});