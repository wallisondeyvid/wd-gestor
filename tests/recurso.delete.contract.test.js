import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import bcrypt from 'bcryptjs';

import { createServer } from '../src/server/createServer.js';
import User from '../src/core/models/user.js';

async function authenticateMasterAgent(app) {
  const email = `recurso.delete.contract.${Date.now()}@example.com`;
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
    nome: 'Teste Contrato Recurso Delete',
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

test('DELETE /gestor/api/recursos/:id com req.params.id malformado retorna 400', async () => {
  const prevMongoMemory = process.env.MONGO_MEMORY;
  process.env.MONGO_MEMORY = '1';

  const { app, close } = await createServer({ skipDb: false });
  const teardownGuard = installTeardownSuppression();

  const { agent, authEmail } = await authenticateMasterAgent(app);

  try {
    const deleteRes = await agent
      .delete('/gestor/api/recursos/id-malformado')
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(
      deleteRes.status,
      400,
      `Contrato violado: req.params.id malformado no delete deveria retornar 400, veio ${deleteRes.status} com body ${JSON.stringify(deleteRes.body)}`,
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

test('DELETE /gestor/api/recursos/:id com req.params.id valido porem inexistente retorna 404', async () => {
  const prevMongoMemory = process.env.MONGO_MEMORY;
  process.env.MONGO_MEMORY = '1';

  const { app, close } = await createServer({ skipDb: false });
  const teardownGuard = installTeardownSuppression();

  const { agent, authEmail } = await authenticateMasterAgent(app);

  try {
    const deleteRes = await agent
      .delete('/gestor/api/recursos/ffffffffffffffffffffffff')
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(
      deleteRes.status,
      404,
      `Contrato violado: req.params.id valido porem inexistente no delete deveria retornar 404, veio ${deleteRes.status} com body ${JSON.stringify(deleteRes.body)}`,
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

test('DELETE /gestor/api/recursos/:id com req.params.id existente retorna 200 e deleted true', async () => {
  const prevMongoMemory = process.env.MONGO_MEMORY;
  process.env.MONGO_MEMORY = '1';

  const { app, close } = await createServer({ skipDb: false });
  const teardownGuard = installTeardownSuppression();

  const { agent, authEmail } = await authenticateMasterAgent(app);

  try {
    const unique = String(Date.now());
    const createRes = await agent
      .post('/gestor/api/recursos')
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({
        unidade_id: '507f1f77bcf86cd799439011',
        tipo: 'carro',
        placa: `ABC-${unique.slice(-4).padStart(4, '0')}`,
        chassi: `9BWZZZ${unique.slice(-11).padStart(11, '0')}`,
        renavam: unique.slice(-11).padStart(11, '0'),
        ano: 2020,
        mod: 2021,
        marca: 'FIAT',
        modelo: 'UNO',
        cor: 'BRANCO',
      });

    assert.equal(
      createRes.status,
      201,
      `Precondicao violada: criacao de recurso deveria retornar 201, veio ${createRes.status} com body ${JSON.stringify(createRes.body)}`,
    );

    const recursoId = String(
      createRes.body?.data?._id
      || createRes.body?.data?.id
      || createRes.body?.id
      || createRes.body?._id
      || '',
    );

    assert.ok(
      recursoId,
      `Precondicao violada: resposta de criacao nao retornou id do recurso. Body: ${JSON.stringify(createRes.body)}`,
    );

    const deleteRes = await agent
      .delete(`/gestor/api/recursos/${recursoId}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(
      deleteRes.status,
      200,
      `Contrato violado: req.params.id existente no delete deveria retornar 200, veio ${deleteRes.status} com body ${JSON.stringify(deleteRes.body)}`,
    );

    const deletePayload = deleteRes.body?.data || deleteRes.body;

    assert.equal(
      deletePayload?.deleted,
      true,
      `Contrato violado: body.deleted deveria ser true, veio ${JSON.stringify(deleteRes.body)}`,
    );

    assert.equal(
      String(deletePayload?.id),
      recursoId,
      `Contrato violado: body.id deveria ser igual ao recursoId criado (${recursoId}), veio ${JSON.stringify(deleteRes.body)}`,
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
