import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import bcrypt from 'bcryptjs';

import { createServer } from '../src/server/createServer.js';
import User from '../src/core/models/user.js';
import Unidade from '../src/core/models/unidade.js';
import Modulo from '../src/core/models/modulo.js';

let uniqueCounter = 0;

function nextCounter() {
  uniqueCounter += 1;
  return uniqueCounter;
}

function uniqueFourDigits() {
  return String((Date.now() + nextCounter()) % 10000).padStart(4, '0');
}

function uniqueElevenDigits() {
  return String(Date.now() + nextCounter()).slice(-11).padStart(11, '0');
}

function extractCreatedId(body) {
  return body?.data?._id || body?.id || body?._id || null;
}

function normalizeId(value) {
  return String(value || '');
}

function assertMissingUnitScope(response, message) {
  assert.equal(
    response.status,
    400,
    `${message}: esperado 400 UNIDADE_ID_REQUIRED, veio ${response.status} com body ${JSON.stringify(response.body)}`,
  );
  assert.deepEqual(
    response.body,
    {
      success: false,
      error: 'UNIDADE_ID_REQUIRED',
    },
    `${message}: body inesperado ${JSON.stringify(response.body)}`,
  );
}

function buildRecursoPayload({ unidadeId, prefix = 'TST' }) {
  const suffix = uniqueFourDigits();
  const serial = String(Date.now() + nextCounter()).slice(-12).toUpperCase();

  return {
    unidade_id: normalizeId(unidadeId),
    tipo: 'carro',
    placa: `${prefix}-${suffix}`,
    chassi: `CHASSI-${serial}`,
    renavam: uniqueElevenDigits(),
    ano: 2024,
    mod: 2025,
    marca: 'Marca Teste',
    modelo: 'Modelo Teste',
    cor: 'preto',
  };
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
    },
  };
}

async function closeWithTeardownGuard(close, teardownGuard) {
  if (typeof close !== 'function') return;

  teardownGuard.startShutdown();
  await close({ stopMemoryServer: true });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function authenticateAgent(app, { role, unidadeId, nomeBase }) {
  const email = `recurso.isolation.${role}.${Date.now()}.${nextCounter()}@example.com`;
  const senha = 'Senha@123456';
  const senhaHash = await bcrypt.hash(senha, 10);

  const user = {
    email,
    senha: senhaHash,
    cpf: uniqueElevenDigits(),
    role,
    ativo: true,
    primeiro_acesso: false,
    senha_provisoria: false,
    nome: `${nomeBase} ${nextCounter()}`,
  };

  if (unidadeId) {
    user.unidade_id = unidadeId;
  }

  await User.create(user);

  const agent = request.agent(app);
  const loginRes = await agent
    .post('/gestor/login')
    .type('form')
    .send({ email, senha });

  assert.ok(
    loginRes.status >= 300 && loginRes.status < 400,
    `Login ${role} deve redirecionar, recebido ${loginRes.status} com body ${JSON.stringify(loginRes.body)}`,
  );

  return { agent, email };
}

async function createModuloAndUnits() {
  const moduloGestor = await Modulo.create({
    nome: 'gestor',
    status: 'ativo',
    url_base: '/gestor',
  });

  const unidadeA = await Unidade.create({
    nome: `Unidade A ${Date.now()}-${nextCounter()}`,
    pessoaTipo: 'pj',
    is_principal: true,
    ativa: true,
    modulosAcessiveis: [moduloGestor._id],
  });

  const unidadeB = await Unidade.create({
    nome: `Unidade B ${Date.now()}-${nextCounter()}`,
    pessoaTipo: 'pj',
    ativa: true,
    unidade_principal_id: unidadeA._id,
    modulosAcessiveis: [moduloGestor._id],
  });

  return { unidadeA, unidadeB };
}

async function createRecursoViaApi(agent, payload) {
  const res = await agent
    .post('/gestor/api/recursos')
    .query({ unidadeId: payload.unidade_id })
    .set('Accept', 'application/json')
    .set('Connection', 'close')
    .send(payload);

  assert.equal(
    res.status,
    201,
    `Setup falhou: criar recurso deveria retornar 201, veio ${res.status} com body ${JSON.stringify(res.body)}`,
  );

  const id = extractCreatedId(res.body);
  assert.ok(id, `Setup falhou: criação sem id. body=${JSON.stringify(res.body)}`);
  return id;
}

function assertBlockedByUnitIsolation(res, scenario) {
  const allowedStatuses = [400, 403, 404];
  assert.ok(
    allowedStatuses.includes(res.status),
    `Isolamento por unidade violado (${scenario}): esperado status em ${allowedStatuses.join(', ')}, veio ${res.status} com body ${JSON.stringify(res.body)}`,
  );
}

async function withResourceIsolationHarness(run) {
  const prevMongoMemory = process.env.MONGO_MEMORY;
  process.env.MONGO_MEMORY = '1';

  const { app, close } = await createServer({ skipDb: false });
  const teardownGuard = installTeardownSuppression();

  let masterEmail = null;
  let diretorEmail = null;

  try {
    const { unidadeA, unidadeB } = await createModuloAndUnits();

    const masterAuth = await authenticateAgent(app, {
      role: 'master',
      nomeBase: 'Teste Isolamento Master',
    });
    masterEmail = masterAuth.email;

    const diretorAuth = await authenticateAgent(app, {
      role: 'diretor',
      unidadeId: unidadeA._id,
      nomeBase: 'Teste Isolamento Diretor',
    });
    diretorEmail = diretorAuth.email;

    await run({
      unidadeA,
      unidadeB,
      masterAgent: masterAuth.agent,
      diretorAgent: diretorAuth.agent,
    });
  } finally {
    try {
      const emailsToDelete = [masterEmail, diretorEmail].filter(Boolean);
      if (emailsToDelete.length > 0) {
        try {
          await User.deleteMany({ email: { $in: emailsToDelete } });
        } catch {}
      }

      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
      if (prevMongoMemory === undefined) delete process.env.MONGO_MEMORY;
      else process.env.MONGO_MEMORY = prevMongoMemory;
    }
  }
}

test('GET /gestor/api/recursos com unidadeId fora do escopo retorna 400 UNIDADE_ID_REQUIRED sem auth-context ativo', async () => {
  await withResourceIsolationHarness(async ({ unidadeA, masterAgent, diretorAgent }) => {
    const moduloGestor = await Modulo.findOne({ nome: 'gestor' });
    assert.ok(moduloGestor?._id, 'Setup falhou: modulo gestor não encontrado para criar unidade fora do escopo.');

    const unidadeForaDoEscopo = await Unidade.create({
      nome: `Unidade Fora ${Date.now()}-${nextCounter()}`,
      pessoaTipo: 'pj',
      ativa: true,
      modulosAcessiveis: [moduloGestor._id],
    });

    const recursoPayload = buildRecursoPayload({ unidadeId: unidadeForaDoEscopo._id, prefix: 'LFO' });
    await createRecursoViaApi(masterAgent, recursoPayload);

    const res = await diretorAgent
      .get('/gestor/api/recursos')
      .query({ unidadeId: String(unidadeForaDoEscopo._id) })
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assertMissingUnitScope(res, 'Listagem com unidade fora do escopo para diretor sem auth-context ativo');
  });
});

test('GET /gestor/api/recursos com unidadeId dentro do escopo retorna 400 UNIDADE_ID_REQUIRED sem auth-context ativo', async () => {
  await withResourceIsolationHarness(async ({ unidadeA, masterAgent, diretorAgent }) => {
    const recursoPayload = buildRecursoPayload({ unidadeId: unidadeA._id, prefix: 'LDP' });
    const recursoId = await createRecursoViaApi(masterAgent, recursoPayload);

    const res = await diretorAgent
      .get('/gestor/api/recursos')
      .query({ unidadeId: String(unidadeA._id) })
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assertMissingUnitScope(res, 'Listagem com unidade dentro do escopo para diretor sem auth-context ativo');
  });
});

test('GET /gestor/api/recursos sem unidadeId retorna 400 UNIDADE_ID_REQUIRED sem auth-context ativo', async () => {
  await withResourceIsolationHarness(async ({ unidadeB, masterAgent, diretorAgent }) => {
    const moduloGestor = await Modulo.findOne({ nome: 'gestor' });
    assert.ok(moduloGestor?._id, 'Setup falhou: modulo gestor não encontrado para criar unidade fora do escopo.');

    const unidadeForaDoEscopo = await Unidade.create({
      nome: `Unidade Fora Lista ${Date.now()}-${nextCounter()}`,
      pessoaTipo: 'pj',
      ativa: true,
      modulosAcessiveis: [moduloGestor._id],
    });

    const recursoEmEscopo = buildRecursoPayload({ unidadeId: unidadeB._id, prefix: 'LSC' });
    const recursoForaDoEscopo = buildRecursoPayload({ unidadeId: unidadeForaDoEscopo._id, prefix: 'LNO' });
    const recursoEmEscopoId = await createRecursoViaApi(masterAgent, recursoEmEscopo);
    const recursoForaDoEscopoId = await createRecursoViaApi(masterAgent, recursoForaDoEscopo);

    const res = await diretorAgent
      .get('/gestor/api/recursos')
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assertMissingUnitScope(res, 'Listagem agregada sem unidadeId para diretor sem auth-context ativo');
  });
});

test('GET /gestor/api/recursos sem unidadeId e placa curta retorna 400 UNIDADE_ID_REQUIRED sem auth-context ativo', async () => {
  await withResourceIsolationHarness(async ({ unidadeA, unidadeB, masterAgent, diretorAgent }) => {
    const moduloGestor = await Modulo.findOne({ nome: 'gestor' });
    assert.ok(moduloGestor?._id, 'Setup falhou: modulo gestor não encontrado para criar unidade fora do escopo.');

    const unidadeForaDoEscopo = await Unidade.create({
      nome: `Unidade Fora Placa Curta ${Date.now()}-${nextCounter()}`,
      pessoaTipo: 'pj',
      ativa: true,
      modulosAcessiveis: [moduloGestor._id],
    });

    const recursoEmEscopoComMatch = buildRecursoPayload({ unidadeId: unidadeA._id, prefix: 'AAA' });
    const recursoEmEscopoSemMatch = buildRecursoPayload({ unidadeId: unidadeB._id, prefix: 'BBB' });
    const recursoForaDoEscopoComMatch = buildRecursoPayload({ unidadeId: unidadeForaDoEscopo._id, prefix: 'AXA' });

    const recursoEmEscopoComMatchId = await createRecursoViaApi(masterAgent, recursoEmEscopoComMatch);
    const recursoEmEscopoSemMatchId = await createRecursoViaApi(masterAgent, recursoEmEscopoSemMatch);
    const recursoForaDoEscopoComMatchId = await createRecursoViaApi(masterAgent, recursoForaDoEscopoComMatch);

    const res = await diretorAgent
      .get('/gestor/api/recursos')
      .query({ placa: 'A' })
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assertMissingUnitScope(res, 'Listagem sem unidadeId com placa curta para diretor sem auth-context ativo');
  });
});

test('GET /gestor/api/recursos sem unidadeId e placa válida retorna 400 UNIDADE_ID_REQUIRED sem auth-context ativo', async () => {
  await withResourceIsolationHarness(async ({ unidadeA, unidadeB, masterAgent, diretorAgent }) => {
    const moduloGestor = await Modulo.findOne({ nome: 'gestor' });
    assert.ok(moduloGestor?._id, 'Setup falhou: modulo gestor não encontrado para criar unidade fora do escopo.');

    const unidadeForaDoEscopo = await Unidade.create({
      nome: `Unidade Fora Placa Dois Caracteres Agregada ${Date.now()}-${nextCounter()}`,
      pessoaTipo: 'pj',
      ativa: true,
      modulosAcessiveis: [moduloGestor._id],
    });

    const recursoEmEscopoComMatchA = buildRecursoPayload({ unidadeId: unidadeA._id, prefix: 'AXA' });
    const recursoEmEscopoComMatchB = buildRecursoPayload({ unidadeId: unidadeB._id, prefix: 'AXA' });
    const recursoEmEscopoSemMatch = buildRecursoPayload({ unidadeId: unidadeB._id, prefix: 'BBB' });
    const recursoForaDoEscopoComMatch = buildRecursoPayload({ unidadeId: unidadeForaDoEscopo._id, prefix: 'AXA' });

    const recursoEmEscopoComMatchAId = await createRecursoViaApi(masterAgent, recursoEmEscopoComMatchA);
    const recursoEmEscopoComMatchBId = await createRecursoViaApi(masterAgent, recursoEmEscopoComMatchB);
    const recursoEmEscopoSemMatchId = await createRecursoViaApi(masterAgent, recursoEmEscopoSemMatch);
    const recursoForaDoEscopoComMatchId = await createRecursoViaApi(masterAgent, recursoForaDoEscopoComMatch);

    const res = await diretorAgent
      .get('/gestor/api/recursos')
      .query({ placa: 'XA' })
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assertMissingUnitScope(res, 'Listagem sem unidadeId com placa válida para diretor sem auth-context ativo');
  });
});

test('GET /gestor/api/recursos sem unidadeId com placa em minúsculas retorna 400 UNIDADE_ID_REQUIRED sem auth-context ativo', async () => {
  await withResourceIsolationHarness(async ({ unidadeA, unidadeB, masterAgent, diretorAgent }) => {
    const moduloGestor = await Modulo.findOne({ nome: 'gestor' });
    assert.ok(moduloGestor?._id, 'Setup falhou: modulo gestor não encontrado para criar unidade fora do escopo.');

    const unidadeForaDoEscopo = await Unidade.create({
      nome: `Unidade Fora Normalizacao Placa ${Date.now()}-${nextCounter()}`,
      pessoaTipo: 'pj',
      ativa: true,
      modulosAcessiveis: [moduloGestor._id],
    });

    const recursoEmEscopoComMatchA = buildRecursoPayload({ unidadeId: unidadeA._id, prefix: 'AXA' });
    const recursoEmEscopoComMatchB = buildRecursoPayload({ unidadeId: unidadeB._id, prefix: 'AXA' });
    const recursoEmEscopoSemMatch = buildRecursoPayload({ unidadeId: unidadeB._id, prefix: 'BBB' });
    const recursoForaDoEscopoComMatch = buildRecursoPayload({ unidadeId: unidadeForaDoEscopo._id, prefix: 'AXA' });

    const recursoEmEscopoComMatchAId = await createRecursoViaApi(masterAgent, recursoEmEscopoComMatchA);
    const recursoEmEscopoComMatchBId = await createRecursoViaApi(masterAgent, recursoEmEscopoComMatchB);
    const recursoEmEscopoSemMatchId = await createRecursoViaApi(masterAgent, recursoEmEscopoSemMatch);
    const recursoForaDoEscopoComMatchId = await createRecursoViaApi(masterAgent, recursoForaDoEscopoComMatch);

    const respostaNormalizada = await diretorAgent
      .get('/gestor/api/recursos')
      .query({ placa: 'XA' })
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    const respostaAlternativa = await diretorAgent
      .get('/gestor/api/recursos')
      .query({ placa: 'xa' })
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assertMissingUnitScope(respostaNormalizada, 'Listagem sem unidadeId com placa normalizada para diretor sem auth-context ativo');
    assertMissingUnitScope(respostaAlternativa, 'Listagem sem unidadeId com placa em minúsculas para diretor sem auth-context ativo');
  });
});

test('GET /gestor/api/recursos com unidadeId dentro do escopo e placa curta retorna 400 UNIDADE_ID_REQUIRED sem auth-context ativo', async () => {
  await withResourceIsolationHarness(async ({ unidadeA, unidadeB, masterAgent, diretorAgent }) => {
    const moduloGestor = await Modulo.findOne({ nome: 'gestor' });
    assert.ok(moduloGestor?._id, 'Setup falhou: modulo gestor não encontrado para criar unidade fora do escopo.');

    const unidadeForaDoEscopo = await Unidade.create({
      nome: `Unidade Fora Placa Curta Unidade ${Date.now()}-${nextCounter()}`,
      pessoaTipo: 'pj',
      ativa: true,
      modulosAcessiveis: [moduloGestor._id],
    });

    const recursoNaUnidadeInformadaComMatch = buildRecursoPayload({ unidadeId: unidadeB._id, prefix: 'AXA' });
    const recursoNaUnidadeInformadaSemMatch = buildRecursoPayload({ unidadeId: unidadeB._id, prefix: 'BBB' });
    const recursoOutraUnidadeEscopo = buildRecursoPayload({ unidadeId: unidadeA._id, prefix: 'AAA' });
    const recursoForaDoEscopo = buildRecursoPayload({ unidadeId: unidadeForaDoEscopo._id, prefix: 'ABA' });

    const recursoNaUnidadeInformadaComMatchId = await createRecursoViaApi(masterAgent, recursoNaUnidadeInformadaComMatch);
    const recursoNaUnidadeInformadaSemMatchId = await createRecursoViaApi(masterAgent, recursoNaUnidadeInformadaSemMatch);
    const recursoOutraUnidadeEscopoId = await createRecursoViaApi(masterAgent, recursoOutraUnidadeEscopo);
    const recursoForaDoEscopoId = await createRecursoViaApi(masterAgent, recursoForaDoEscopo);

    const res = await diretorAgent
      .get('/gestor/api/recursos')
      .query({ unidadeId: String(unidadeB._id), placa: 'A' })
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assertMissingUnitScope(res, 'Listagem com unidadeId no escopo e placa curta para diretor sem auth-context ativo');
  });
});

test('GET /gestor/api/recursos com unidadeId dentro do escopo e placa válida retorna 400 UNIDADE_ID_REQUIRED sem auth-context ativo', async () => {
  await withResourceIsolationHarness(async ({ unidadeA, unidadeB, masterAgent, diretorAgent }) => {
    const moduloGestor = await Modulo.findOne({ nome: 'gestor' });
    assert.ok(moduloGestor?._id, 'Setup falhou: modulo gestor não encontrado para criar unidade fora do escopo.');

    const unidadeForaDoEscopo = await Unidade.create({
      nome: `Unidade Fora Placa Dois Caracteres ${Date.now()}-${nextCounter()}`,
      pessoaTipo: 'pj',
      ativa: true,
      modulosAcessiveis: [moduloGestor._id],
    });

    const recursoNaUnidadeInformadaComMatch = buildRecursoPayload({ unidadeId: unidadeB._id, prefix: 'AXA' });
    const recursoNaUnidadeInformadaSemMatch = buildRecursoPayload({ unidadeId: unidadeB._id, prefix: 'BBB' });
    const recursoOutraUnidadeEscopoComMatch = buildRecursoPayload({ unidadeId: unidadeA._id, prefix: 'AXA' });
    const recursoForaDoEscopoComMatch = buildRecursoPayload({ unidadeId: unidadeForaDoEscopo._id, prefix: 'AXA' });

    const recursoNaUnidadeInformadaComMatchId = await createRecursoViaApi(masterAgent, recursoNaUnidadeInformadaComMatch);
    const recursoNaUnidadeInformadaSemMatchId = await createRecursoViaApi(masterAgent, recursoNaUnidadeInformadaSemMatch);
    const recursoOutraUnidadeEscopoComMatchId = await createRecursoViaApi(masterAgent, recursoOutraUnidadeEscopoComMatch);
    const recursoForaDoEscopoComMatchId = await createRecursoViaApi(masterAgent, recursoForaDoEscopoComMatch);

    const res = await diretorAgent
      .get('/gestor/api/recursos')
      .query({ unidadeId: String(unidadeB._id), placa: 'XA' })
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assertMissingUnitScope(res, 'Listagem com unidadeId no escopo e placa válida para diretor sem auth-context ativo');
  });
});

test('GET /gestor/api/recursos com unidadeId dentro do escopo e placa em minúsculas retorna 400 UNIDADE_ID_REQUIRED sem auth-context ativo', async () => {
  await withResourceIsolationHarness(async ({ unidadeA, unidadeB, masterAgent, diretorAgent }) => {
    const moduloGestor = await Modulo.findOne({ nome: 'gestor' });
    assert.ok(moduloGestor?._id, 'Setup falhou: modulo gestor não encontrado para criar unidade fora do escopo.');

    const unidadeForaDoEscopo = await Unidade.create({
      nome: `Unidade Fora Normalizacao Placa Unidade ${Date.now()}-${nextCounter()}`,
      pessoaTipo: 'pj',
      ativa: true,
      modulosAcessiveis: [moduloGestor._id],
    });

    const recursoNaUnidadeInformadaComMatch = buildRecursoPayload({ unidadeId: unidadeB._id, prefix: 'AXA' });
    const recursoNaUnidadeInformadaSemMatch = buildRecursoPayload({ unidadeId: unidadeB._id, prefix: 'BBB' });
    const recursoOutraUnidadeEscopoComMatch = buildRecursoPayload({ unidadeId: unidadeA._id, prefix: 'AXA' });
    const recursoForaDoEscopoComMatch = buildRecursoPayload({ unidadeId: unidadeForaDoEscopo._id, prefix: 'AXA' });

    const recursoNaUnidadeInformadaComMatchId = await createRecursoViaApi(masterAgent, recursoNaUnidadeInformadaComMatch);
    const recursoNaUnidadeInformadaSemMatchId = await createRecursoViaApi(masterAgent, recursoNaUnidadeInformadaSemMatch);
    const recursoOutraUnidadeEscopoComMatchId = await createRecursoViaApi(masterAgent, recursoOutraUnidadeEscopoComMatch);
    const recursoForaDoEscopoComMatchId = await createRecursoViaApi(masterAgent, recursoForaDoEscopoComMatch);

    const respostaNormalizada = await diretorAgent
      .get('/gestor/api/recursos')
      .query({ unidadeId: String(unidadeB._id), placa: 'XA' })
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    const respostaAlternativa = await diretorAgent
      .get('/gestor/api/recursos')
      .query({ unidadeId: String(unidadeB._id), placa: 'xa' })
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assertMissingUnitScope(respostaNormalizada, 'Listagem com unidadeId no escopo e placa normalizada para diretor sem auth-context ativo');
    assertMissingUnitScope(respostaAlternativa, 'Listagem com unidadeId no escopo e placa em minúsculas para diretor sem auth-context ativo');
  });
});

test('GET /gestor/api/recursos com unidadeId fora do escopo e placa curta retorna 400 UNIDADE_ID_REQUIRED sem auth-context ativo', async () => {
  await withResourceIsolationHarness(async ({ unidadeA, masterAgent, diretorAgent }) => {
    const moduloGestor = await Modulo.findOne({ nome: 'gestor' });
    assert.ok(moduloGestor?._id, 'Setup falhou: modulo gestor não encontrado para criar unidade fora do escopo.');

    const unidadeForaDoEscopo = await Unidade.create({
      nome: `Unidade Fora Placa Curta Escopo ${Date.now()}-${nextCounter()}`,
      pessoaTipo: 'pj',
      ativa: true,
      modulosAcessiveis: [moduloGestor._id],
    });

    const recursoForaDoEscopoComMatch = buildRecursoPayload({ unidadeId: unidadeForaDoEscopo._id, prefix: 'AXA' });
    const recursoForaDoEscopoSemMatch = buildRecursoPayload({ unidadeId: unidadeForaDoEscopo._id, prefix: 'BBB' });
    const recursoDentroDoEscopo = buildRecursoPayload({ unidadeId: unidadeA._id, prefix: 'AAA' });

    await createRecursoViaApi(masterAgent, recursoForaDoEscopoComMatch);
    await createRecursoViaApi(masterAgent, recursoForaDoEscopoSemMatch);
    await createRecursoViaApi(masterAgent, recursoDentroDoEscopo);

    const res = await diretorAgent
      .get('/gestor/api/recursos')
      .query({ unidadeId: String(unidadeForaDoEscopo._id), placa: 'A' })
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assertMissingUnitScope(res, 'Listagem com unidadeId fora do escopo e placa curta para diretor sem auth-context ativo');
  });
});

test('GET /gestor/api/recursos com unidadeId fora do escopo e placa válida retorna 400 UNIDADE_ID_REQUIRED sem auth-context ativo', async () => {
  await withResourceIsolationHarness(async ({ unidadeA, masterAgent, diretorAgent }) => {
    const moduloGestor = await Modulo.findOne({ nome: 'gestor' });
    assert.ok(moduloGestor?._id, 'Setup falhou: modulo gestor não encontrado para criar unidade fora do escopo.');

    const unidadeForaDoEscopo = await Unidade.create({
      nome: `Unidade Fora Placa Dois Caracteres Escopo ${Date.now()}-${nextCounter()}`,
      pessoaTipo: 'pj',
      ativa: true,
      modulosAcessiveis: [moduloGestor._id],
    });

    const recursoForaDoEscopoComMatch = buildRecursoPayload({ unidadeId: unidadeForaDoEscopo._id, prefix: 'AXA' });
    const recursoForaDoEscopoSemMatch = buildRecursoPayload({ unidadeId: unidadeForaDoEscopo._id, prefix: 'BBB' });
    const recursoDentroDoEscopoComMatch = buildRecursoPayload({ unidadeId: unidadeA._id, prefix: 'AXA' });

    await createRecursoViaApi(masterAgent, recursoForaDoEscopoComMatch);
    await createRecursoViaApi(masterAgent, recursoForaDoEscopoSemMatch);
    await createRecursoViaApi(masterAgent, recursoDentroDoEscopoComMatch);

    const res = await diretorAgent
      .get('/gestor/api/recursos')
      .query({ unidadeId: String(unidadeForaDoEscopo._id), placa: 'XA' })
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assertMissingUnitScope(res, 'Listagem com unidadeId fora do escopo e placa válida para diretor sem auth-context ativo');
  });
});

test('GET /gestor/api/recursos com unidadeId fora do escopo e placa em minúsculas retorna 400 UNIDADE_ID_REQUIRED sem auth-context ativo', async () => {
  await withResourceIsolationHarness(async ({ unidadeA, masterAgent, diretorAgent }) => {
    const moduloGestor = await Modulo.findOne({ nome: 'gestor' });
    assert.ok(moduloGestor?._id, 'Setup falhou: modulo gestor não encontrado para criar unidade fora do escopo.');

    const unidadeForaDoEscopo = await Unidade.create({
      nome: `Unidade Fora Normalizacao Placa Escopo ${Date.now()}-${nextCounter()}`,
      pessoaTipo: 'pj',
      ativa: true,
      modulosAcessiveis: [moduloGestor._id],
    });

    const recursoForaDoEscopoComMatch = buildRecursoPayload({ unidadeId: unidadeForaDoEscopo._id, prefix: 'AXA' });
    const recursoForaDoEscopoSemMatch = buildRecursoPayload({ unidadeId: unidadeForaDoEscopo._id, prefix: 'BBB' });
    const recursoDentroDoEscopoComMatch = buildRecursoPayload({ unidadeId: unidadeA._id, prefix: 'AXA' });

    await createRecursoViaApi(masterAgent, recursoForaDoEscopoComMatch);
    await createRecursoViaApi(masterAgent, recursoForaDoEscopoSemMatch);
    await createRecursoViaApi(masterAgent, recursoDentroDoEscopoComMatch);

    const respostaNormalizada = await diretorAgent
      .get('/gestor/api/recursos')
      .query({ unidadeId: String(unidadeForaDoEscopo._id), placa: 'XA' })
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    const respostaAlternativa = await diretorAgent
      .get('/gestor/api/recursos')
      .query({ unidadeId: String(unidadeForaDoEscopo._id), placa: 'xa' })
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assertMissingUnitScope(respostaNormalizada, 'Listagem com unidadeId fora do escopo e placa normalizada para diretor sem auth-context ativo');
    assertMissingUnitScope(respostaAlternativa, 'Listagem com unidadeId fora do escopo e placa em minúsculas para diretor sem auth-context ativo');
  });
});

test('GET /gestor/api/recursos/:id com unidade correta retorna 400 UNIDADE_ID_REQUIRED sem auth-context ativo', async () => {
  await withResourceIsolationHarness(async ({ unidadeA, masterAgent, diretorAgent }) => {
    const recursoPayload = buildRecursoPayload({ unidadeId: unidadeA._id, prefix: 'GUA' });
    const recursoId = await createRecursoViaApi(masterAgent, recursoPayload);

    const res = await diretorAgent
      .get(`/gestor/api/recursos/${recursoId}`)
      .query({ unidadeId: String(unidadeA._id) })
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assertMissingUnitScope(res, 'GET por id na unidade correta para diretor sem auth-context ativo');
  });
});

test('GET /gestor/api/recursos/:id cross-unidade deve bloquear acesso', async () => {
  await withResourceIsolationHarness(async ({ unidadeA, unidadeB, masterAgent, diretorAgent }) => {
    const recursoPayload = buildRecursoPayload({ unidadeId: unidadeB._id, prefix: 'GXB' });
    const recursoId = await createRecursoViaApi(masterAgent, recursoPayload);

    const res = await diretorAgent
      .get(`/gestor/api/recursos/${recursoId}`)
      .query({ unidadeId: String(unidadeA._id) })
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assertBlockedByUnitIsolation(res, 'GET por id cross-unidade');
  });
});

test('GET /gestor/api/recursos/:id com id inválido retorna erro', async () => {
  await withResourceIsolationHarness(async ({ unidadeA, diretorAgent }) => {
    const res = await diretorAgent
      .get('/gestor/api/recursos/id-malformado')
      .query({ unidadeId: String(unidadeA._id) })
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(
      res.status,
      400,
      `Contrato violado: id inválido em GET por id deveria retornar 400, veio ${res.status} com body ${JSON.stringify(res.body)}`,
    );
    assert.equal(
      res.body?.success,
      false,
      `Contrato violado: id inválido em GET por id deveria retornar success=false, veio ${JSON.stringify(res.body)}`,
    );
  });
});

test('PUT /gestor/api/recursos/:id na unidade correta retorna 400 UNIDADE_ID_REQUIRED sem auth-context ativo', async () => {
  await withResourceIsolationHarness(async ({ unidadeA, masterAgent, diretorAgent }) => {
    const recursoPayload = buildRecursoPayload({ unidadeId: unidadeA._id, prefix: 'PUA' });
    const recursoId = await createRecursoViaApi(masterAgent, recursoPayload);

    const updateRes = await diretorAgent
      .put(`/gestor/api/recursos/${recursoId}`)
      .query({ unidadeId: String(unidadeA._id) })
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({
        ...recursoPayload,
        modelo: 'Modelo Atualizado Diretor',
      });

    assertMissingUnitScope(updateRes, 'PUT na unidade correta para diretor sem auth-context ativo');
  });
});

test('PUT /gestor/api/recursos/:id cross-unidade deve bloquear update', async () => {
  await withResourceIsolationHarness(async ({ unidadeA, unidadeB, masterAgent, diretorAgent }) => {
    const recursoPayload = buildRecursoPayload({ unidadeId: unidadeB._id, prefix: 'PXB' });
    const recursoId = await createRecursoViaApi(masterAgent, recursoPayload);

    const updateRes = await diretorAgent
      .put(`/gestor/api/recursos/${recursoId}`)
      .query({ unidadeId: String(unidadeA._id) })
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({
        ...recursoPayload,
        unidade_id: String(unidadeA._id),
        modelo: 'Tentativa Cross Unidade',
      });

    assertBlockedByUnitIsolation(updateRes, 'PUT cross-unidade');
  });
});

test('PUT /gestor/api/recursos/:id sem unidade_id retorna 400', async () => {
  await withResourceIsolationHarness(async ({ unidadeA, masterAgent, diretorAgent }) => {
    const recursoPayload = buildRecursoPayload({ unidadeId: unidadeA._id, prefix: 'PMS' });
    const recursoId = await createRecursoViaApi(masterAgent, recursoPayload);

    const updateRes = await diretorAgent
      .put(`/gestor/api/recursos/${recursoId}`)
      .query({ unidadeId: String(unidadeA._id) })
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({
        tipo: 'carro',
      });

    assert.equal(
      updateRes.status,
      400,
      `Contrato violado: update sem unidade_id deveria retornar 400, veio ${updateRes.status} com body ${JSON.stringify(updateRes.body)}`,
    );
  });
});

test('DELETE /gestor/api/recursos/:id na unidade correta retorna 400 UNIDADE_ID_REQUIRED sem auth-context ativo', async () => {
  await withResourceIsolationHarness(async ({ unidadeA, masterAgent, diretorAgent }) => {
    const recursoPayload = buildRecursoPayload({ unidadeId: unidadeA._id, prefix: 'DUA' });
    const recursoId = await createRecursoViaApi(masterAgent, recursoPayload);

    const deleteRes = await diretorAgent
      .delete(`/gestor/api/recursos/${recursoId}`)
      .query({ unidadeId: String(unidadeA._id) })
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assertMissingUnitScope(deleteRes, 'DELETE na unidade correta para diretor sem auth-context ativo');
  });
});

test('DELETE /gestor/api/recursos/:id cross-unidade deve bloquear delete', async () => {
  await withResourceIsolationHarness(async ({ unidadeA, unidadeB, masterAgent, diretorAgent }) => {
    const recursoPayload = buildRecursoPayload({ unidadeId: unidadeB._id, prefix: 'DXB' });
    const recursoId = await createRecursoViaApi(masterAgent, recursoPayload);

    const deleteRes = await diretorAgent
      .delete(`/gestor/api/recursos/${recursoId}`)
      .query({ unidadeId: String(unidadeA._id) })
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assertBlockedByUnitIsolation(deleteRes, 'DELETE cross-unidade');
  });
});

test('POST /gestor/api/recursos com unidade correta retorna 400 UNIDADE_ID_REQUIRED sem auth-context ativo', async () => {
  await withResourceIsolationHarness(async ({ unidadeA, diretorAgent }) => {
    const payload = buildRecursoPayload({ unidadeId: unidadeA._id, prefix: 'POA' });

    const createRes = await diretorAgent
      .post('/gestor/api/recursos')
      .query({ unidadeId: String(unidadeA._id) })
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send(payload);

    assertMissingUnitScope(createRes, 'POST na unidade correta para diretor sem auth-context ativo');
  });
});

test('POST /gestor/api/recursos com placa duplicada na mesma unidade deve bloquear criacao', async () => {
  await withResourceIsolationHarness(async ({ unidadeA, masterAgent }) => {
    const recursoExistente = buildRecursoPayload({ unidadeId: unidadeA._id, prefix: 'DPL' });
    await createRecursoViaApi(masterAgent, recursoExistente);

    const recursoDuplicadoMesmaUnidade = buildRecursoPayload({ unidadeId: unidadeA._id, prefix: 'NPL' });
    recursoDuplicadoMesmaUnidade.placa = recursoExistente.placa;

    const createRes = await masterAgent
      .post('/gestor/api/recursos')
      .query({ unidadeId: String(unidadeA._id) })
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send(recursoDuplicadoMesmaUnidade);

    assert.equal(
      createRes.status,
      400,
      `Contrato violado: create com placa duplicada na mesma unidade deve retornar 400, veio ${createRes.status} com body ${JSON.stringify(createRes.body)}`,
    );
    assert.equal(
      createRes.body?.success,
      false,
      `Contrato violado: create com placa duplicada na mesma unidade deve retornar success=false, veio ${JSON.stringify(createRes.body)}`,
    );
    assert.equal(
      createRes.body?.message,
      'Placa já cadastrada',
      `Contrato violado: create com placa duplicada na mesma unidade deve bloquear a duplicidade com mensagem explicita, veio ${JSON.stringify(createRes.body)}`,
    );
  });
});

test('POST /gestor/api/recursos com placa duplicada em outra unidade deve permitir criacao', async () => {
  await withResourceIsolationHarness(async ({ unidadeA, unidadeB, masterAgent }) => {
    const recursoExistente = buildRecursoPayload({ unidadeId: unidadeA._id, prefix: 'DPL' });
    await createRecursoViaApi(masterAgent, recursoExistente);

    const recursoDuplicadoOutraUnidade = buildRecursoPayload({ unidadeId: unidadeB._id, prefix: 'NVO' });
    recursoDuplicadoOutraUnidade.placa = recursoExistente.placa;

    const createRes = await masterAgent
      .post('/gestor/api/recursos')
      .query({ unidadeId: String(unidadeB._id) })
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send(recursoDuplicadoOutraUnidade);

    assert.equal(
      createRes.status,
      201,
      `Contrato violado: create com placa duplicada em outra unidade deve retornar 201, veio ${createRes.status} com body ${JSON.stringify(createRes.body)}`,
    );

    const createdId = extractCreatedId(createRes.body);
    assert.ok(createdId, `Contrato violado: create com placa duplicada em outra unidade deve retornar id criado, veio ${JSON.stringify(createRes.body)}`);
  });
});

test('POST /gestor/api/recursos com chassi duplicado na mesma unidade deve bloquear criacao', async () => {
  await withResourceIsolationHarness(async ({ unidadeA, masterAgent }) => {
    const recursoExistente = buildRecursoPayload({ unidadeId: unidadeA._id, prefix: 'DCH' });
    await createRecursoViaApi(masterAgent, recursoExistente);

    const recursoDuplicadoMesmaUnidade = buildRecursoPayload({ unidadeId: unidadeA._id, prefix: 'MCH' });
    recursoDuplicadoMesmaUnidade.chassi = recursoExistente.chassi;

    const createRes = await masterAgent
      .post('/gestor/api/recursos')
      .query({ unidadeId: String(unidadeA._id) })
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send(recursoDuplicadoMesmaUnidade);

    assert.equal(
      createRes.status,
      400,
      `Contrato violado: create com chassi duplicado na mesma unidade deve retornar 400, veio ${createRes.status} com body ${JSON.stringify(createRes.body)}`,
    );
    assert.equal(
      createRes.body?.success,
      false,
      `Contrato violado: create com chassi duplicado na mesma unidade deve retornar success=false, veio ${JSON.stringify(createRes.body)}`,
    );
    assert.equal(
      createRes.body?.message,
      'Chassi já cadastrado',
      `Contrato violado: create com chassi duplicado na mesma unidade deve bloquear a duplicidade com mensagem explicita, veio ${JSON.stringify(createRes.body)}`,
    );
  });
});

test('POST /gestor/api/recursos com chassi duplicado em outra unidade deve permitir criacao', async () => {
  await withResourceIsolationHarness(async ({ unidadeA, unidadeB, masterAgent }) => {
    const recursoExistente = buildRecursoPayload({ unidadeId: unidadeA._id, prefix: 'DCH' });
    await createRecursoViaApi(masterAgent, recursoExistente);

    const recursoDuplicadoOutraUnidade = buildRecursoPayload({ unidadeId: unidadeB._id, prefix: 'NCH' });
    recursoDuplicadoOutraUnidade.chassi = recursoExistente.chassi;

    const createRes = await masterAgent
      .post('/gestor/api/recursos')
      .query({ unidadeId: String(unidadeB._id) })
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send(recursoDuplicadoOutraUnidade);

    assert.equal(
      createRes.status,
      201,
      `Contrato violado: create com chassi duplicado em outra unidade deve retornar 201, veio ${createRes.status} com body ${JSON.stringify(createRes.body)}`,
    );

    const createdId = extractCreatedId(createRes.body);
    assert.ok(createdId, `Contrato violado: create com chassi duplicado em outra unidade deve retornar id criado, veio ${JSON.stringify(createRes.body)}`);
  });
});

test('POST /gestor/api/recursos com renavam duplicado na mesma unidade deve bloquear criacao', async () => {
  await withResourceIsolationHarness(async ({ unidadeA, masterAgent }) => {
    const recursoExistente = buildRecursoPayload({ unidadeId: unidadeA._id, prefix: 'DRN' });
    await createRecursoViaApi(masterAgent, recursoExistente);

    const recursoDuplicadoMesmaUnidade = buildRecursoPayload({ unidadeId: unidadeA._id, prefix: 'MRN' });
    recursoDuplicadoMesmaUnidade.renavam = recursoExistente.renavam;

    const createRes = await masterAgent
      .post('/gestor/api/recursos')
      .query({ unidadeId: String(unidadeA._id) })
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send(recursoDuplicadoMesmaUnidade);

    assert.equal(
      createRes.status,
      400,
      `Contrato violado: create com renavam duplicado na mesma unidade deve retornar 400, veio ${createRes.status} com body ${JSON.stringify(createRes.body)}`,
    );
    assert.equal(
      createRes.body?.success,
      false,
      `Contrato violado: create com renavam duplicado na mesma unidade deve retornar success=false, veio ${JSON.stringify(createRes.body)}`,
    );
    assert.equal(
      createRes.body?.message,
      'RENAVAM já cadastrado',
      `Contrato violado: create com renavam duplicado na mesma unidade deve bloquear a duplicidade com mensagem explicita, veio ${JSON.stringify(createRes.body)}`,
    );
  });
});

test('POST /gestor/api/recursos com renavam duplicado em outra unidade deve permitir criacao', async () => {
  await withResourceIsolationHarness(async ({ unidadeA, unidadeB, masterAgent }) => {
    const recursoExistente = buildRecursoPayload({ unidadeId: unidadeA._id, prefix: 'DRN' });
    await createRecursoViaApi(masterAgent, recursoExistente);

    const recursoDuplicadoOutraUnidade = buildRecursoPayload({ unidadeId: unidadeB._id, prefix: 'NRN' });
    recursoDuplicadoOutraUnidade.renavam = recursoExistente.renavam;

    const createRes = await masterAgent
      .post('/gestor/api/recursos')
      .query({ unidadeId: String(unidadeB._id) })
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send(recursoDuplicadoOutraUnidade);

    assert.equal(
      createRes.status,
      201,
      `Contrato violado: create com renavam duplicado em outra unidade deve retornar 201, veio ${createRes.status} com body ${JSON.stringify(createRes.body)}`,
    );

    const createdId = extractCreatedId(createRes.body);
    assert.ok(createdId, `Contrato violado: create com renavam duplicado em outra unidade deve retornar id criado, veio ${JSON.stringify(createRes.body)}`);
  });
});

test('POST /gestor/api/recursos sem unidade_id retorna 400', async () => {
  await withResourceIsolationHarness(async ({ unidadeA, diretorAgent }) => {
    const payload = buildRecursoPayload({ unidadeId: unidadeA._id, prefix: 'PMS' });
    delete payload.unidade_id;

    const createRes = await diretorAgent
      .post('/gestor/api/recursos')
      .query({ unidadeId: String(unidadeA._id) })
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send(payload);

    assert.equal(
      createRes.status,
      400,
      `Contrato violado: create sem unidade_id deveria retornar 400, veio ${createRes.status} com body ${JSON.stringify(createRes.body)}`,
    );
  });
});

test('POST /gestor/api/recursos cross-unidade deve bloquear criação', async () => {
  await withResourceIsolationHarness(async ({ unidadeA, unidadeB, diretorAgent }) => {
    const payload = buildRecursoPayload({ unidadeId: unidadeB._id, prefix: 'PXU' });

    const createRes = await diretorAgent
      .post('/gestor/api/recursos')
      .query({ unidadeId: String(unidadeA._id) })
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send(payload);

    assertBlockedByUnitIsolation(createRes, 'POST cross-unidade');
  });
});
