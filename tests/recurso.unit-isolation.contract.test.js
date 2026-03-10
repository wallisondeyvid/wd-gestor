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

test('GET /gestor/api/recursos com unidadeId fora do escopo retorna 200 com lista vazia', async () => {
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

    assert.equal(
      res.status,
      200,
      `Contrato violado: listagem com unidade fora do escopo atualmente retorna 200, veio ${res.status} com body ${JSON.stringify(res.body)}`,
    );
    assert.equal(
      res.body?.success,
      true,
      `Contrato violado: listagem com unidade fora do escopo atualmente retorna success=true, veio ${JSON.stringify(res.body)}`,
    );
    assert.deepEqual(
      res.body?.data,
      [],
      `Contrato violado: listagem com unidade fora do escopo atualmente retorna lista vazia, veio ${JSON.stringify(res.body)}`,
    );
  });
});

test('GET /gestor/api/recursos com unidadeId dentro do escopo retorna 200 com item existente', async () => {
  await withResourceIsolationHarness(async ({ unidadeA, masterAgent, diretorAgent }) => {
    const recursoPayload = buildRecursoPayload({ unidadeId: unidadeA._id, prefix: 'LDP' });
    const recursoId = await createRecursoViaApi(masterAgent, recursoPayload);

    const res = await diretorAgent
      .get('/gestor/api/recursos')
      .query({ unidadeId: String(unidadeA._id) })
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(
      res.status,
      200,
      `Contrato violado: listagem com unidade dentro do escopo atualmente retorna 200, veio ${res.status} com body ${JSON.stringify(res.body)}`,
    );
    assert.equal(
      res.body?.success,
      true,
      `Contrato violado: listagem com unidade dentro do escopo atualmente retorna success=true, veio ${JSON.stringify(res.body)}`,
    );
    assert.ok(
      Array.isArray(res.body?.data),
      `Contrato violado: listagem com unidade dentro do escopo atualmente retorna data como array, veio ${JSON.stringify(res.body)}`,
    );

    const item = res.body.data.find((entry) => normalizeId(entry?._id || entry?.id) === normalizeId(recursoId));
    assert.ok(
      item,
      `Contrato violado: listagem com unidade dentro do escopo atualmente retorna o recurso criado, veio ${JSON.stringify(res.body)}`,
    );
    assert.equal(
      item?.placa,
      recursoPayload.placa,
      `Contrato violado: listagem com unidade dentro do escopo atualmente preserva a placa do recurso, veio ${JSON.stringify(res.body)}`,
    );
  });
});

test('GET /gestor/api/recursos sem unidadeId agrega apenas recursos do escopo', async () => {
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

    assert.equal(
      res.status,
      200,
      `Contrato violado: listagem sem unidadeId atualmente retorna 200, veio ${res.status} com body ${JSON.stringify(res.body)}`,
    );
    assert.equal(
      res.body?.success,
      true,
      `Contrato violado: listagem sem unidadeId atualmente retorna success=true, veio ${JSON.stringify(res.body)}`,
    );
    assert.ok(
      Array.isArray(res.body?.data),
      `Contrato violado: listagem sem unidadeId atualmente retorna data como array, veio ${JSON.stringify(res.body)}`,
    );

    const itemEmEscopo = res.body.data.find((entry) => normalizeId(entry?._id || entry?.id) === normalizeId(recursoEmEscopoId));
    assert.ok(
      itemEmEscopo,
      `Contrato violado: listagem sem unidadeId atualmente inclui recurso do escopo, veio ${JSON.stringify(res.body)}`,
    );

    const itemForaDoEscopo = res.body.data.find((entry) => normalizeId(entry?._id || entry?.id) === normalizeId(recursoForaDoEscopoId));
    assert.equal(
      itemForaDoEscopo,
      undefined,
      `Contrato violado: listagem sem unidadeId atualmente exclui recurso fora do escopo, veio ${JSON.stringify(res.body)}`,
    );
  });
});

test('GET /gestor/api/recursos sem unidadeId ignora placa de 1 caractere e agrega apenas recursos do escopo do diretor', async () => {
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

    assert.equal(
      res.status,
      200,
      `Contrato violado: listagem sem unidadeId com placa de 1 caractere atualmente retorna 200, veio ${res.status} com body ${JSON.stringify(res.body)}`,
    );
    assert.equal(
      res.body?.success,
      true,
      `Contrato violado: listagem sem unidadeId com placa de 1 caractere atualmente retorna success=true, veio ${JSON.stringify(res.body)}`,
    );
    assert.ok(
      Array.isArray(res.body?.data),
      `Contrato violado: listagem sem unidadeId com placa de 1 caractere atualmente retorna data como array, veio ${JSON.stringify(res.body)}`,
    );
    assert.equal(
      res.body.data.length,
      2,
      `Contrato violado: listagem sem unidadeId com placa de 1 caractere atualmente agrega apenas os 2 recursos em escopo, veio ${JSON.stringify(res.body)}`,
    );

    const itemEmEscopoComMatch = res.body.data.find((entry) => normalizeId(entry?._id || entry?.id) === normalizeId(recursoEmEscopoComMatchId));
    assert.ok(
      itemEmEscopoComMatch,
      `Contrato violado: listagem sem unidadeId com placa de 1 caractere atualmente inclui recurso do escopo cuja placa combina, veio ${JSON.stringify(res.body)}`,
    );

    const itemEmEscopoSemMatch = res.body.data.find((entry) => normalizeId(entry?._id || entry?.id) === normalizeId(recursoEmEscopoSemMatchId));
    assert.ok(
      itemEmEscopoSemMatch,
      `Contrato violado: listagem sem unidadeId com placa de 1 caractere atualmente ignora o filtro curto e inclui recurso do escopo cuja placa não combina, veio ${JSON.stringify(res.body)}`,
    );

    const itemForaDoEscopoComMatch = res.body.data.find((entry) => normalizeId(entry?._id || entry?.id) === normalizeId(recursoForaDoEscopoComMatchId));
    assert.equal(
      itemForaDoEscopoComMatch,
      undefined,
      `Contrato violado: listagem sem unidadeId com placa de 1 caractere atualmente mantém agregação apenas no escopo, veio ${JSON.stringify(res.body)}`,
    );

    for (const item of res.body.data) {
      assert.equal(
        item?.createdAt,
        undefined,
        `Contrato violado: listagem sem unidadeId com placa de 1 caractere atualmente nao expõe createdAt no item, veio ${JSON.stringify(item)}`,
      );
      assert.equal(
        item?.updatedAt,
        undefined,
        `Contrato violado: listagem sem unidadeId com placa de 1 caractere atualmente nao expõe updatedAt no item, veio ${JSON.stringify(item)}`,
      );
      assert.equal(
        item?.unidade_id?.createdAt,
        undefined,
        `Contrato violado: listagem sem unidadeId com placa de 1 caractere atualmente nao expõe createdAt na unidade populada, veio ${JSON.stringify(item)}`,
      );
      assert.equal(
        item?.unidade_id?.updatedAt,
        undefined,
        `Contrato violado: listagem sem unidadeId com placa de 1 caractere atualmente nao expõe updatedAt na unidade populada, veio ${JSON.stringify(item)}`,
      );
    }
  });
});

test('GET /gestor/api/recursos sem unidadeId e placa de 2 caracteres aplica filtro e mantém agregação no escopo do diretor', async () => {
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

    assert.equal(
      res.status,
      200,
      `Contrato violado: listagem sem unidadeId com placa de 2 caracteres atualmente retorna 200, veio ${res.status} com body ${JSON.stringify(res.body)}`,
    );
    assert.equal(
      res.body?.success,
      true,
      `Contrato violado: listagem sem unidadeId com placa de 2 caracteres atualmente retorna success=true, veio ${JSON.stringify(res.body)}`,
    );
    assert.ok(
      Array.isArray(res.body?.data),
      `Contrato violado: listagem sem unidadeId com placa de 2 caracteres atualmente retorna data como array, veio ${JSON.stringify(res.body)}`,
    );
    assert.equal(
      res.body.data.length,
      2,
      `Contrato violado: listagem sem unidadeId com placa de 2 caracteres atualmente agrega apenas os itens em escopo que combinam com o filtro, veio ${JSON.stringify(res.body)}`,
    );

    const itemEmEscopoComMatchA = res.body.data.find((entry) => normalizeId(entry?._id || entry?.id) === normalizeId(recursoEmEscopoComMatchAId));
    assert.ok(
      itemEmEscopoComMatchA,
      `Contrato violado: listagem sem unidadeId com placa de 2 caracteres atualmente inclui recurso em escopo da unidade A cuja placa combina, veio ${JSON.stringify(res.body)}`,
    );

    const itemEmEscopoComMatchB = res.body.data.find((entry) => normalizeId(entry?._id || entry?.id) === normalizeId(recursoEmEscopoComMatchBId));
    assert.ok(
      itemEmEscopoComMatchB,
      `Contrato violado: listagem sem unidadeId com placa de 2 caracteres atualmente inclui recurso em escopo da unidade B cuja placa combina, veio ${JSON.stringify(res.body)}`,
    );

    const itemEmEscopoSemMatch = res.body.data.find((entry) => normalizeId(entry?._id || entry?.id) === normalizeId(recursoEmEscopoSemMatchId));
    assert.equal(
      itemEmEscopoSemMatch,
      undefined,
      `Contrato violado: listagem sem unidadeId com placa de 2 caracteres atualmente exclui recurso em escopo cuja placa não combina, veio ${JSON.stringify(res.body)}`,
    );

    const itemForaDoEscopoComMatch = res.body.data.find((entry) => normalizeId(entry?._id || entry?.id) === normalizeId(recursoForaDoEscopoComMatchId));
    assert.equal(
      itemForaDoEscopoComMatch,
      undefined,
      `Contrato violado: listagem sem unidadeId com placa de 2 caracteres atualmente exclui recurso fora do escopo mesmo quando a placa combina, veio ${JSON.stringify(res.body)}`,
    );

    for (const item of res.body.data) {
      assert.ok(
        [normalizeId(unidadeA._id), normalizeId(unidadeB._id)].includes(normalizeId(item?.unidade_id?._id)),
        `Contrato violado: listagem sem unidadeId com placa de 2 caracteres atualmente mantém agregação apenas no escopo do diretor, veio ${JSON.stringify(item)}`,
      );
      assert.equal(
        item?.createdAt,
        undefined,
        `Contrato violado: listagem sem unidadeId com placa de 2 caracteres atualmente nao expõe createdAt no item, veio ${JSON.stringify(item)}`,
      );
      assert.equal(
        item?.updatedAt,
        undefined,
        `Contrato violado: listagem sem unidadeId com placa de 2 caracteres atualmente nao expõe updatedAt no item, veio ${JSON.stringify(item)}`,
      );
      assert.equal(
        item?.unidade_id?.createdAt,
        undefined,
        `Contrato violado: listagem sem unidadeId com placa de 2 caracteres atualmente nao expõe createdAt na unidade populada, veio ${JSON.stringify(item)}`,
      );
      assert.equal(
        item?.unidade_id?.updatedAt,
        undefined,
        `Contrato violado: listagem sem unidadeId com placa de 2 caracteres atualmente nao expõe updatedAt na unidade populada, veio ${JSON.stringify(item)}`,
      );
    }
  });
});

test('GET /gestor/api/recursos sem unidadeId com placa em minusculas preserva o mesmo match observavel da forma normalizada no escopo do diretor', async () => {
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

    assert.equal(
      respostaAlternativa.status,
      200,
      `Contrato violado: listagem sem unidadeId com placa em minusculas atualmente retorna 200, veio ${respostaAlternativa.status} com body ${JSON.stringify(respostaAlternativa.body)}`,
    );
    assert.equal(
      respostaAlternativa.body?.success,
      true,
      `Contrato violado: listagem sem unidadeId com placa em minusculas atualmente retorna success=true, veio ${JSON.stringify(respostaAlternativa.body)}`,
    );
    assert.ok(
      Array.isArray(respostaAlternativa.body?.data),
      `Contrato violado: listagem sem unidadeId com placa em minusculas atualmente retorna data como array, veio ${JSON.stringify(respostaAlternativa.body)}`,
    );

    const idsNormalizados = respostaNormalizada.body.data
      .map((entry) => normalizeId(entry?._id || entry?.id))
      .sort();
    const idsAlternativos = respostaAlternativa.body.data
      .map((entry) => normalizeId(entry?._id || entry?.id))
      .sort();
    const idsEsperados = [
      normalizeId(recursoEmEscopoComMatchAId),
      normalizeId(recursoEmEscopoComMatchBId),
    ].sort();

    assert.deepEqual(
      idsNormalizados,
      idsEsperados,
      `Contrato violado: listagem sem unidadeId com placa normalizada atualmente retorna apenas os recursos em escopo que combinam com o filtro, veio ${JSON.stringify(respostaNormalizada.body)}`,
    );
    assert.deepEqual(
      idsAlternativos,
      idsEsperados,
      `Contrato violado: listagem sem unidadeId com placa em minusculas atualmente preserva o filtro apenas para recursos em escopo que combinam com a forma normalizada equivalente, veio ${JSON.stringify(respostaAlternativa.body)}`,
    );
    assert.deepEqual(
      idsAlternativos,
      idsNormalizados,
      `Contrato violado: listagem sem unidadeId com placa em minusculas atualmente produz o mesmo match observavel da forma normalizada equivalente, veio normalizado=${JSON.stringify(respostaNormalizada.body)} alternativo=${JSON.stringify(respostaAlternativa.body)}`,
    );

    const itemEmEscopoSemMatch = respostaAlternativa.body.data.find((entry) => normalizeId(entry?._id || entry?.id) === normalizeId(recursoEmEscopoSemMatchId));
    assert.equal(
      itemEmEscopoSemMatch,
      undefined,
      `Contrato violado: listagem sem unidadeId com placa em minusculas atualmente exclui recurso em escopo cuja placa nao combina, veio ${JSON.stringify(respostaAlternativa.body)}`,
    );

    const itemForaDoEscopoComMatch = respostaAlternativa.body.data.find((entry) => normalizeId(entry?._id || entry?.id) === normalizeId(recursoForaDoEscopoComMatchId));
    assert.equal(
      itemForaDoEscopoComMatch,
      undefined,
      `Contrato violado: listagem sem unidadeId com placa em minusculas atualmente mantem a restricao ao escopo do diretor, veio ${JSON.stringify(respostaAlternativa.body)}`,
    );

    for (const item of respostaAlternativa.body.data) {
      assert.ok(
        [normalizeId(unidadeA._id), normalizeId(unidadeB._id)].includes(normalizeId(item?.unidade_id?._id)),
        `Contrato violado: listagem sem unidadeId com placa em minusculas atualmente continua restrita ao escopo do diretor, veio ${JSON.stringify(item)}`,
      );
    }
  });
});

test('GET /gestor/api/recursos com unidadeId dentro do escopo ignora placa de 1 caractere e mantém recorte na unidade informada', async () => {
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

    assert.equal(
      res.status,
      200,
      `Contrato violado: listagem com unidadeId dentro do escopo e placa de 1 caractere atualmente retorna 200, veio ${res.status} com body ${JSON.stringify(res.body)}`,
    );
    assert.equal(
      res.body?.success,
      true,
      `Contrato violado: listagem com unidadeId dentro do escopo e placa de 1 caractere atualmente retorna success=true, veio ${JSON.stringify(res.body)}`,
    );
    assert.ok(
      Array.isArray(res.body?.data),
      `Contrato violado: listagem com unidadeId dentro do escopo e placa de 1 caractere atualmente retorna data como array, veio ${JSON.stringify(res.body)}`,
    );
    assert.equal(
      res.body.data.length,
      2,
      `Contrato violado: listagem com unidadeId dentro do escopo e placa de 1 caractere atualmente mantém recorte apenas na unidade informada, veio ${JSON.stringify(res.body)}`,
    );

    const itemNaUnidadeInformadaComMatch = res.body.data.find((entry) => normalizeId(entry?._id || entry?.id) === normalizeId(recursoNaUnidadeInformadaComMatchId));
    assert.ok(
      itemNaUnidadeInformadaComMatch,
      `Contrato violado: listagem com unidadeId dentro do escopo e placa de 1 caractere atualmente inclui item da unidade informada cuja placa combina, veio ${JSON.stringify(res.body)}`,
    );

    const itemNaUnidadeInformadaSemMatch = res.body.data.find((entry) => normalizeId(entry?._id || entry?.id) === normalizeId(recursoNaUnidadeInformadaSemMatchId));
    assert.ok(
      itemNaUnidadeInformadaSemMatch,
      `Contrato violado: listagem com unidadeId dentro do escopo e placa de 1 caractere atualmente ignora o filtro curto e inclui item da unidade informada cuja placa não combina, veio ${JSON.stringify(res.body)}`,
    );

    const itemOutraUnidadeEscopo = res.body.data.find((entry) => normalizeId(entry?._id || entry?.id) === normalizeId(recursoOutraUnidadeEscopoId));
    assert.equal(
      itemOutraUnidadeEscopo,
      undefined,
      `Contrato violado: listagem com unidadeId dentro do escopo e placa de 1 caractere atualmente exclui itens de outra unidade do escopo, veio ${JSON.stringify(res.body)}`,
    );

    const itemForaDoEscopo = res.body.data.find((entry) => normalizeId(entry?._id || entry?.id) === normalizeId(recursoForaDoEscopoId));
    assert.equal(
      itemForaDoEscopo,
      undefined,
      `Contrato violado: listagem com unidadeId dentro do escopo e placa de 1 caractere atualmente exclui itens fora do escopo, veio ${JSON.stringify(res.body)}`,
    );

    for (const item of res.body.data) {
      assert.equal(
        normalizeId(item?.unidade_id?._id),
        normalizeId(unidadeB._id),
        `Contrato violado: listagem com unidadeId dentro do escopo e placa de 1 caractere atualmente mantém todos os itens presos a unidadeId informado, veio ${JSON.stringify(item)}`,
      );
      assert.equal(
        item?.createdAt,
        undefined,
        `Contrato violado: listagem com unidadeId dentro do escopo e placa de 1 caractere atualmente nao expõe createdAt no item, veio ${JSON.stringify(item)}`,
      );
      assert.equal(
        item?.updatedAt,
        undefined,
        `Contrato violado: listagem com unidadeId dentro do escopo e placa de 1 caractere atualmente nao expõe updatedAt no item, veio ${JSON.stringify(item)}`,
      );
      assert.equal(
        item?.unidade_id?.createdAt,
        undefined,
        `Contrato violado: listagem com unidadeId dentro do escopo e placa de 1 caractere atualmente nao expõe createdAt na unidade populada, veio ${JSON.stringify(item)}`,
      );
      assert.equal(
        item?.unidade_id?.updatedAt,
        undefined,
        `Contrato violado: listagem com unidadeId dentro do escopo e placa de 1 caractere atualmente nao expõe updatedAt na unidade populada, veio ${JSON.stringify(item)}`,
      );
    }
  });
});

test('GET /gestor/api/recursos com unidadeId dentro do escopo e placa de 2 caracteres recorta a resposta na unidade informada', async () => {
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

    assert.equal(
      res.status,
      200,
      `Contrato violado: listagem com unidadeId dentro do escopo e placa de 2 caracteres atualmente retorna 200, veio ${res.status} com body ${JSON.stringify(res.body)}`,
    );
    assert.equal(
      res.body?.success,
      true,
      `Contrato violado: listagem com unidadeId dentro do escopo e placa de 2 caracteres atualmente retorna success=true, veio ${JSON.stringify(res.body)}`,
    );
    assert.ok(
      Array.isArray(res.body?.data),
      `Contrato violado: listagem com unidadeId dentro do escopo e placa de 2 caracteres atualmente retorna data como array, veio ${JSON.stringify(res.body)}`,
    );
    assert.equal(
      res.body.data.length,
      1,
      `Contrato violado: listagem com unidadeId dentro do escopo e placa de 2 caracteres atualmente recorta a resposta para apenas o item que casa na unidade informada, veio ${JSON.stringify(res.body)}`,
    );

    const itemNaUnidadeInformadaComMatch = res.body.data.find((entry) => normalizeId(entry?._id || entry?.id) === normalizeId(recursoNaUnidadeInformadaComMatchId));
    assert.ok(
      itemNaUnidadeInformadaComMatch,
      `Contrato violado: listagem com unidadeId dentro do escopo e placa de 2 caracteres atualmente inclui item da unidade informada cuja placa combina, veio ${JSON.stringify(res.body)}`,
    );
    assert.equal(
      normalizeId(itemNaUnidadeInformadaComMatch?.unidade_id?._id),
      normalizeId(unidadeB._id),
      `Contrato violado: listagem com unidadeId dentro do escopo e placa de 2 caracteres atualmente mantém o item retornado preso a unidadeId informado, veio ${JSON.stringify(itemNaUnidadeInformadaComMatch)}`,
    );

    const itemNaUnidadeInformadaSemMatch = res.body.data.find((entry) => normalizeId(entry?._id || entry?.id) === normalizeId(recursoNaUnidadeInformadaSemMatchId));
    assert.equal(
      itemNaUnidadeInformadaSemMatch,
      undefined,
      `Contrato violado: listagem com unidadeId dentro do escopo e placa de 2 caracteres atualmente exclui item da mesma unidade cuja placa não combina, veio ${JSON.stringify(res.body)}`,
    );

    const itemOutraUnidadeEscopoComMatch = res.body.data.find((entry) => normalizeId(entry?._id || entry?.id) === normalizeId(recursoOutraUnidadeEscopoComMatchId));
    assert.equal(
      itemOutraUnidadeEscopoComMatch,
      undefined,
      `Contrato violado: listagem com unidadeId dentro do escopo e placa de 2 caracteres atualmente continua priorizando o recorte por unidade informada e exclui item de outra unidade do escopo, veio ${JSON.stringify(res.body)}`,
    );

    const itemForaDoEscopoComMatch = res.body.data.find((entry) => normalizeId(entry?._id || entry?.id) === normalizeId(recursoForaDoEscopoComMatchId));
    assert.equal(
      itemForaDoEscopoComMatch,
      undefined,
      `Contrato violado: listagem com unidadeId dentro do escopo e placa de 2 caracteres atualmente exclui item fora do escopo, veio ${JSON.stringify(res.body)}`,
    );

    assert.equal(
      itemNaUnidadeInformadaComMatch?.createdAt,
      undefined,
      `Contrato violado: listagem com unidadeId dentro do escopo e placa de 2 caracteres atualmente nao expõe createdAt no item, veio ${JSON.stringify(itemNaUnidadeInformadaComMatch)}`,
    );
    assert.equal(
      itemNaUnidadeInformadaComMatch?.updatedAt,
      undefined,
      `Contrato violado: listagem com unidadeId dentro do escopo e placa de 2 caracteres atualmente nao expõe updatedAt no item, veio ${JSON.stringify(itemNaUnidadeInformadaComMatch)}`,
    );
    assert.equal(
      itemNaUnidadeInformadaComMatch?.unidade_id?.createdAt,
      undefined,
      `Contrato violado: listagem com unidadeId dentro do escopo e placa de 2 caracteres atualmente nao expõe createdAt na unidade populada, veio ${JSON.stringify(itemNaUnidadeInformadaComMatch)}`,
    );
    assert.equal(
      itemNaUnidadeInformadaComMatch?.unidade_id?.updatedAt,
      undefined,
      `Contrato violado: listagem com unidadeId dentro do escopo e placa de 2 caracteres atualmente nao expõe updatedAt na unidade populada, veio ${JSON.stringify(itemNaUnidadeInformadaComMatch)}`,
    );
  });
});

test('GET /gestor/api/recursos com unidadeId dentro do escopo e placa em minusculas preserva o mesmo conjunto observavel da forma normalizada equivalente', async () => {
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

    assert.equal(
      respostaAlternativa.status,
      200,
      `Contrato violado: listagem com unidadeId dentro do escopo e placa em minusculas atualmente retorna 200, veio ${respostaAlternativa.status} com body ${JSON.stringify(respostaAlternativa.body)}`,
    );
    assert.equal(
      respostaAlternativa.body?.success,
      true,
      `Contrato violado: listagem com unidadeId dentro do escopo e placa em minusculas atualmente retorna success=true, veio ${JSON.stringify(respostaAlternativa.body)}`,
    );
    assert.ok(
      Array.isArray(respostaAlternativa.body?.data),
      `Contrato violado: listagem com unidadeId dentro do escopo e placa em minusculas atualmente retorna data como array, veio ${JSON.stringify(respostaAlternativa.body)}`,
    );
    assert.equal(
      respostaNormalizada.status,
      200,
      `Contrato violado: listagem com unidadeId dentro do escopo e placa normalizada equivalente atualmente retorna 200, veio ${respostaNormalizada.status} com body ${JSON.stringify(respostaNormalizada.body)}`,
    );
    assert.equal(
      respostaNormalizada.body?.success,
      true,
      `Contrato violado: listagem com unidadeId dentro do escopo e placa normalizada equivalente atualmente retorna success=true, veio ${JSON.stringify(respostaNormalizada.body)}`,
    );
    assert.ok(
      Array.isArray(respostaNormalizada.body?.data),
      `Contrato violado: listagem com unidadeId dentro do escopo e placa normalizada equivalente atualmente retorna data como array, veio ${JSON.stringify(respostaNormalizada.body)}`,
    );

    const idsNormalizados = respostaNormalizada.body.data
      .map((entry) => normalizeId(entry?._id || entry?.id))
      .sort();
    const idsAlternativos = respostaAlternativa.body.data
      .map((entry) => normalizeId(entry?._id || entry?.id))
      .sort();
    const idsEsperados = [normalizeId(recursoNaUnidadeInformadaComMatchId)];

    assert.deepEqual(
      idsNormalizados,
      idsEsperados,
      `Contrato violado: listagem com unidadeId dentro do escopo e placa normalizada equivalente atualmente recorta a resposta para apenas o item que casa na unidade informada, veio ${JSON.stringify(respostaNormalizada.body)}`,
    );
    assert.deepEqual(
      idsAlternativos,
      idsEsperados,
      `Contrato violado: listagem com unidadeId dentro do escopo e placa em minusculas atualmente preserva o recorte na unidade informada e retorna apenas o item que casa com a forma normalizada equivalente, veio ${JSON.stringify(respostaAlternativa.body)}`,
    );
    assert.deepEqual(
      idsAlternativos,
      idsNormalizados,
      `Contrato violado: listagem com unidadeId dentro do escopo e placa em minusculas atualmente produz o mesmo conjunto observavel da forma normalizada equivalente, veio normalizado=${JSON.stringify(respostaNormalizada.body)} alternativo=${JSON.stringify(respostaAlternativa.body)}`,
    );

    const itemNaUnidadeInformadaSemMatch = respostaAlternativa.body.data.find((entry) => normalizeId(entry?._id || entry?.id) === normalizeId(recursoNaUnidadeInformadaSemMatchId));
    assert.equal(
      itemNaUnidadeInformadaSemMatch,
      undefined,
      `Contrato violado: listagem com unidadeId dentro do escopo e placa em minusculas atualmente exclui item da mesma unidade cuja placa nao combina, veio ${JSON.stringify(respostaAlternativa.body)}`,
    );

    const itemOutraUnidadeEscopoComMatch = respostaAlternativa.body.data.find((entry) => normalizeId(entry?._id || entry?.id) === normalizeId(recursoOutraUnidadeEscopoComMatchId));
    assert.equal(
      itemOutraUnidadeEscopoComMatch,
      undefined,
      `Contrato violado: listagem com unidadeId dentro do escopo e placa em minusculas atualmente continua priorizando o recorte por unidade informada e exclui item de outra unidade do escopo, veio ${JSON.stringify(respostaAlternativa.body)}`,
    );

    const itemForaDoEscopoComMatch = respostaAlternativa.body.data.find((entry) => normalizeId(entry?._id || entry?.id) === normalizeId(recursoForaDoEscopoComMatchId));
    assert.equal(
      itemForaDoEscopoComMatch,
      undefined,
      `Contrato violado: listagem com unidadeId dentro do escopo e placa em minusculas atualmente exclui item fora do escopo, veio ${JSON.stringify(respostaAlternativa.body)}`,
    );

    for (const resposta of [respostaNormalizada, respostaAlternativa]) {
      for (const item of resposta.body.data) {
        assert.equal(
          normalizeId(item?.unidade_id?._id),
          normalizeId(unidadeB._id),
          `Contrato violado: listagem com unidadeId dentro do escopo e placa em minusculas atualmente mantém todos os itens presos a unidadeId informado, veio ${JSON.stringify(item)}`,
        );
        assert.equal(
          item?.createdAt,
          undefined,
          `Contrato violado: listagem com unidadeId dentro do escopo e placa em minusculas atualmente nao expõe createdAt no item, veio ${JSON.stringify(item)}`,
        );
        assert.equal(
          item?.updatedAt,
          undefined,
          `Contrato violado: listagem com unidadeId dentro do escopo e placa em minusculas atualmente nao expõe updatedAt no item, veio ${JSON.stringify(item)}`,
        );
        assert.equal(
          item?.unidade_id?.createdAt,
          undefined,
          `Contrato violado: listagem com unidadeId dentro do escopo e placa em minusculas atualmente nao expõe createdAt na unidade populada, veio ${JSON.stringify(item)}`,
        );
        assert.equal(
          item?.unidade_id?.updatedAt,
          undefined,
          `Contrato violado: listagem com unidadeId dentro do escopo e placa em minusculas atualmente nao expõe updatedAt na unidade populada, veio ${JSON.stringify(item)}`,
        );
      }
    }
  });
});

test('GET /gestor/api/recursos com unidadeId fora do escopo e placa de 1 caractere mantém isolamento e retorna lista vazia', async () => {
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

    assert.equal(
      res.status,
      200,
      `Contrato violado: listagem com unidadeId fora do escopo e placa de 1 caractere atualmente retorna 200, veio ${res.status} com body ${JSON.stringify(res.body)}`,
    );
    assert.equal(
      res.body?.success,
      true,
      `Contrato violado: listagem com unidadeId fora do escopo e placa de 1 caractere atualmente retorna success=true, veio ${JSON.stringify(res.body)}`,
    );
    assert.ok(
      Array.isArray(res.body?.data),
      `Contrato violado: listagem com unidadeId fora do escopo e placa de 1 caractere atualmente retorna data como array, veio ${JSON.stringify(res.body)}`,
    );
    assert.deepEqual(
      res.body?.data,
      [],
      `Contrato violado: listagem com unidadeId fora do escopo e placa de 1 caractere atualmente mantém o isolamento prevalecendo sobre a placa curta e retorna lista vazia, veio ${JSON.stringify(res.body)}`,
    );
  });
});

test('GET /gestor/api/recursos com unidadeId fora do escopo e placa de 2 caracteres mantém isolamento e retorna lista vazia', async () => {
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

    assert.equal(
      res.status,
      200,
      `Contrato violado: listagem com unidadeId fora do escopo e placa de 2 caracteres atualmente retorna 200, veio ${res.status} com body ${JSON.stringify(res.body)}`,
    );
    assert.equal(
      res.body?.success,
      true,
      `Contrato violado: listagem com unidadeId fora do escopo e placa de 2 caracteres atualmente retorna success=true, veio ${JSON.stringify(res.body)}`,
    );
    assert.ok(
      Array.isArray(res.body?.data),
      `Contrato violado: listagem com unidadeId fora do escopo e placa de 2 caracteres atualmente retorna data como array, veio ${JSON.stringify(res.body)}`,
    );
    assert.deepEqual(
      res.body?.data,
      [],
      `Contrato violado: listagem com unidadeId fora do escopo e placa de 2 caracteres atualmente mantém o isolamento prevalecendo mesmo com filtro válido e retorna lista vazia, veio ${JSON.stringify(res.body)}`,
    );
  });
});

test('GET /gestor/api/recursos com unidadeId fora do escopo e placa em minusculas preserva o mesmo resultado observavel da forma normalizada equivalente', async () => {
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

    assert.equal(
      respostaNormalizada.status,
      200,
      `Contrato violado: listagem com unidadeId fora do escopo e placa normalizada equivalente atualmente retorna 200, veio ${respostaNormalizada.status} com body ${JSON.stringify(respostaNormalizada.body)}`,
    );
    assert.equal(
      respostaNormalizada.body?.success,
      true,
      `Contrato violado: listagem com unidadeId fora do escopo e placa normalizada equivalente atualmente retorna success=true, veio ${JSON.stringify(respostaNormalizada.body)}`,
    );
    assert.ok(
      Array.isArray(respostaNormalizada.body?.data),
      `Contrato violado: listagem com unidadeId fora do escopo e placa normalizada equivalente atualmente retorna data como array, veio ${JSON.stringify(respostaNormalizada.body)}`,
    );
    assert.deepEqual(
      respostaNormalizada.body?.data,
      [],
      `Contrato violado: listagem com unidadeId fora do escopo e placa normalizada equivalente atualmente mantém o isolamento prevalecendo e retorna lista vazia, veio ${JSON.stringify(respostaNormalizada.body)}`,
    );

    assert.equal(
      respostaAlternativa.status,
      200,
      `Contrato violado: listagem com unidadeId fora do escopo e placa em minusculas atualmente retorna 200, veio ${respostaAlternativa.status} com body ${JSON.stringify(respostaAlternativa.body)}`,
    );
    assert.equal(
      respostaAlternativa.body?.success,
      true,
      `Contrato violado: listagem com unidadeId fora do escopo e placa em minusculas atualmente retorna success=true, veio ${JSON.stringify(respostaAlternativa.body)}`,
    );
    assert.ok(
      Array.isArray(respostaAlternativa.body?.data),
      `Contrato violado: listagem com unidadeId fora do escopo e placa em minusculas atualmente retorna data como array, veio ${JSON.stringify(respostaAlternativa.body)}`,
    );
    assert.deepEqual(
      respostaAlternativa.body?.data,
      [],
      `Contrato violado: listagem com unidadeId fora do escopo e placa em minusculas atualmente mantém o isolamento prevalecendo e retorna lista vazia, veio ${JSON.stringify(respostaAlternativa.body)}`,
    );

    assert.deepEqual(
      respostaAlternativa.body?.data,
      respostaNormalizada.body?.data,
      `Contrato violado: listagem com unidadeId fora do escopo e placa em minusculas atualmente nao altera o resultado observavel em relacao a forma normalizada equivalente, veio normalizado=${JSON.stringify(respostaNormalizada.body)} alternativo=${JSON.stringify(respostaAlternativa.body)}`,
    );
  });
});

test('GET /gestor/api/recursos/:id com unidade correta retorna 200', async () => {
  await withResourceIsolationHarness(async ({ unidadeA, masterAgent, diretorAgent }) => {
    const recursoPayload = buildRecursoPayload({ unidadeId: unidadeA._id, prefix: 'GUA' });
    const recursoId = await createRecursoViaApi(masterAgent, recursoPayload);

    const res = await diretorAgent
      .get(`/gestor/api/recursos/${recursoId}`)
      .query({ unidadeId: String(unidadeA._id) })
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(
      res.status,
      200,
      `Contrato violado: GET por id na unidade correta deveria retornar 200, veio ${res.status} com body ${JSON.stringify(res.body)}`,
    );

    const data = res.body?.data || res.body;
    const returnedId = normalizeId(data?._id || data?.id);
    assert.equal(
      returnedId,
      normalizeId(recursoId),
      `Contrato violado: GET por id deveria retornar o recurso solicitado (${recursoId}), veio ${JSON.stringify(res.body)}`,
    );
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

test('PUT /gestor/api/recursos/:id na unidade correta retorna 200', async () => {
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

    assert.equal(
      updateRes.status,
      200,
      `Contrato violado: update na unidade correta deveria retornar 200, veio ${updateRes.status} com body ${JSON.stringify(updateRes.body)}`,
    );

    const updated = updateRes.body?.data || updateRes.body;
    assert.equal(
      updated?.modelo,
      'Modelo Atualizado Diretor',
      `Contrato violado: update deveria persistir modelo alterado, veio ${JSON.stringify(updateRes.body)}`,
    );
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

test('DELETE /gestor/api/recursos/:id na unidade correta retorna 200', async () => {
  await withResourceIsolationHarness(async ({ unidadeA, masterAgent, diretorAgent }) => {
    const recursoPayload = buildRecursoPayload({ unidadeId: unidadeA._id, prefix: 'DUA' });
    const recursoId = await createRecursoViaApi(masterAgent, recursoPayload);

    const deleteRes = await diretorAgent
      .delete(`/gestor/api/recursos/${recursoId}`)
      .query({ unidadeId: String(unidadeA._id) })
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(
      deleteRes.status,
      200,
      `Contrato violado: delete na unidade correta deveria retornar 200, veio ${deleteRes.status} com body ${JSON.stringify(deleteRes.body)}`,
    );

    const payload = deleteRes.body?.data || deleteRes.body;
    assert.equal(
      payload?.deleted,
      true,
      `Contrato violado: delete deveria retornar deleted=true, veio ${JSON.stringify(deleteRes.body)}`,
    );
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

test('POST /gestor/api/recursos com unidade correta retorna 201', async () => {
  await withResourceIsolationHarness(async ({ unidadeA, diretorAgent }) => {
    const payload = buildRecursoPayload({ unidadeId: unidadeA._id, prefix: 'POA' });

    const createRes = await diretorAgent
      .post('/gestor/api/recursos')
      .query({ unidadeId: String(unidadeA._id) })
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send(payload);

    assert.equal(
      createRes.status,
      201,
      `Contrato violado: create na unidade correta deveria retornar 201, veio ${createRes.status} com body ${JSON.stringify(createRes.body)}`,
    );

    const createdId = extractCreatedId(createRes.body);
    assert.ok(createdId, `Contrato violado: create deveria retornar id criado, veio ${JSON.stringify(createRes.body)}`);
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
