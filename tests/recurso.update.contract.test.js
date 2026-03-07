import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import bcrypt from 'bcryptjs';

import { createServer } from '../src/server/createServer.js';
import User from '../src/core/models/user.js';

function extractCreatedId(body) {
  return body?.data?._id || body?.id || body?._id || null;
}

async function authenticateMasterAgent(app) {
  const email = `recurso.update.contract.${Date.now()}@example.com`;
  const senha = 'Senha@123456';
  const senhaHash = await bcrypt.hash(senha, 10);
  const cpf = String(Date.now()).slice(-11).padStart(11, '0');

  await User.create({
    email,
    senha: senhaHash,
    cpf,
    role: 'master',
    ativo: true,
    primeiro_acesso: false,
    senha_provisoria: false,
    nome: 'Teste Contrato Recurso Update',
  });

  const agent = request.agent(app);
  const loginRes = await agent
    .post('/gestor/login')
    .type('form')
    .send({ email, senha });

  assert.ok(
    loginRes.status >= 300 && loginRes.status < 400,
    `Login master deve redirecionar, recebido ${loginRes.status}`,
  );

  return { agent, authEmail: email };
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

test('PUT /gestor/api/recursos/:id sem unidade_id retorna 400', async () => {
  const prevMongoMemory = process.env.MONGO_MEMORY;
  process.env.MONGO_MEMORY = '1';

  const { app, close } = await createServer({ skipDb: false });
  const teardownGuard = installTeardownSuppression();

  const { agent, authEmail } = await authenticateMasterAgent(app);

  const unidadeId = '000000000000000000000010';
  const suffix = String((Date.now() % 9000) + 1000);
  const createPayload = {
    unidade_id: unidadeId,
    tipo: 'carro',
    placa: `TST-${suffix}`,
    chassi: `CHASSI-${Date.now()}`,
    renavam: String(Date.now()),
    ano: 2024,
    mod: 2025,
    marca: 'Marca Teste',
    modelo: 'Modelo Teste',
    cor: 'preto',
  };

  try {
    const createRes = await agent
      .post('/gestor/api/recursos')
      .query({ unidadeId })
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send(createPayload);

    assert.equal(
      createRes.status,
      201,
      `Setup falhou: esperava 201 ao criar recurso de teste, veio ${createRes.status} com body ${JSON.stringify(createRes.body)}`,
    );

    const recursoId = extractCreatedId(createRes.body);
    assert.ok(recursoId, `Setup falhou: resposta de criação sem id. body=${JSON.stringify(createRes.body)}`);

    const updateRes = await agent
      .put(`/gestor/api/recursos/${recursoId}`)
      .query({ unidadeId })
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({
        tipo: 'carro',
      });

    assert.equal(
      updateRes.status,
      400,
      `Contrato violado: sem unidade_id no body deveria retornar 400, veio ${updateRes.status} com body ${JSON.stringify(updateRes.body)}`,
    );
  } finally {
    try {
      try {
        await User.deleteMany({ email: authEmail });
      } catch {}

      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
      if (prevMongoMemory === undefined) delete process.env.MONGO_MEMORY;
      else process.env.MONGO_MEMORY = prevMongoMemory;
    }
  }
});

test('PUT /gestor/api/recursos/:id com unidade_id malformado retorna 400', async () => {
  const prevMongoMemory = process.env.MONGO_MEMORY;
  process.env.MONGO_MEMORY = '1';

  const { app, close } = await createServer({ skipDb: false });
  const teardownGuard = installTeardownSuppression();

  const { agent, authEmail } = await authenticateMasterAgent(app);

  const unidadeId = '000000000000000000000010';
  const suffix = String((Date.now() % 9000) + 1000);
  const createPayload = {
    unidade_id: unidadeId,
    tipo: 'carro',
    placa: `TSM-${suffix}`,
    chassi: `CHASSIM-${Date.now()}`,
    renavam: String(Date.now()),
    ano: 2024,
    mod: 2025,
    marca: 'Marca Teste',
    modelo: 'Modelo Teste',
    cor: 'preto',
  };

  try {
    const createRes = await agent
      .post('/gestor/api/recursos')
      .query({ unidadeId })
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send(createPayload);

    assert.equal(
      createRes.status,
      201,
      `Setup falhou: esperava 201 ao criar recurso de teste, veio ${createRes.status} com body ${JSON.stringify(createRes.body)}`,
    );

    const recursoId = extractCreatedId(createRes.body);
    assert.ok(recursoId, `Setup falhou: resposta de criação sem id. body=${JSON.stringify(createRes.body)}`);

    const updateRes = await agent
      .put(`/gestor/api/recursos/${recursoId}`)
      .query({ unidadeId })
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({
        unidade_id: 'unidade-malformada',
        tipo: 'carro',
      });

    assert.equal(
      updateRes.status,
      400,
      `Contrato violado: unidade_id malformado deveria retornar 400, veio ${updateRes.status} com body ${JSON.stringify(updateRes.body)}`,
    );
  } finally {
    try {
      try {
        await User.deleteMany({ email: authEmail });
      } catch {}

      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
      if (prevMongoMemory === undefined) delete process.env.MONGO_MEMORY;
      else process.env.MONGO_MEMORY = prevMongoMemory;
    }
  }
});

test('PUT /gestor/api/recursos/:id com req.params.id malformado retorna 400', async () => {
  const prevMongoMemory = process.env.MONGO_MEMORY;
  process.env.MONGO_MEMORY = '1';

  const { app, close } = await createServer({ skipDb: false });
  const teardownGuard = installTeardownSuppression();

  const { agent, authEmail } = await authenticateMasterAgent(app);

  try {
    const updateRes = await agent
      .put('/gestor/api/recursos/id-malformado')
      .query({ unidadeId: '000000000000000000000010' })
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({
        unidade_id: '000000000000000000000010',
        tipo: 'carro',
      });

    assert.equal(
      updateRes.status,
      400,
      `Contrato violado: req.params.id malformado deveria retornar 400, veio ${updateRes.status} com body ${JSON.stringify(updateRes.body)}`,
    );
  } finally {
    try {
      try {
        await User.deleteMany({ email: authEmail });
      } catch {}

      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
      if (prevMongoMemory === undefined) delete process.env.MONGO_MEMORY;
      else process.env.MONGO_MEMORY = prevMongoMemory;
    }
  }
});
