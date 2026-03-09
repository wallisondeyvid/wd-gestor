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

    assert.ok(
      res.status >= 400,
      `Contrato violado: id inválido em GET por id deveria retornar erro HTTP, veio ${res.status} com body ${JSON.stringify(res.body)}`,
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
