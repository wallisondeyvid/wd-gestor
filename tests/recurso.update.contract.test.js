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

test('PUT /gestor/api/recursos/:id com req.params.id valido porem inexistente retorna 404', async () => {
  const prevMongoMemory = process.env.MONGO_MEMORY;
  process.env.MONGO_MEMORY = '1';

  const { app, close } = await createServer({ skipDb: false });
  const teardownGuard = installTeardownSuppression();

  const { agent, authEmail } = await authenticateMasterAgent(app);

  try {
    const updateRes = await agent
      .put('/gestor/api/recursos/ffffffffffffffffffffffff')
      .query({ unidadeId: '000000000000000000000010' })
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({
        unidade_id: '000000000000000000000010',
        tipo: 'carro',
      });

    assert.equal(
      updateRes.status,
      404,
      `Contrato violado: req.params.id valido porem inexistente deveria retornar 404, veio ${updateRes.status} com body ${JSON.stringify(updateRes.body)}`,
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

test('PUT /gestor/api/recursos/:id com id existente e placa invalida retorna 400', async () => {
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
    placa: `TPV-${suffix}`,
    chassi: `CHASSIPV-${Date.now()}`,
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
        unidade_id: unidadeId,
        tipo: 'carro',
        placa: 'INVALIDA',
      });

    assert.equal(
      updateRes.status,
      400,
      `Contrato violado: placa invalida deveria retornar 400, veio ${updateRes.status} com body ${JSON.stringify(updateRes.body)}`,
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

test('PUT /gestor/api/recursos/:id com placa que pertence a outro recurso retorna 400', async () => {
  const prevMongoMemory = process.env.MONGO_MEMORY;
  process.env.MONGO_MEMORY = '1';

  const { app, close } = await createServer({ skipDb: false });
  const teardownGuard = installTeardownSuppression();

  const { agent, authEmail } = await authenticateMasterAgent(app);

  const unidadeId = '000000000000000000000010';
  const suffixA = String((Date.now() % 9000) + 1000);
  const suffixB = String((((Date.now() + 1) % 9000) + 1000));

  const createPayloadA = {
    unidade_id: unidadeId,
    tipo: 'carro',
    placa: `TPA-${suffixA}`,
    chassi: `CHASSITPA-${Date.now()}`,
    renavam: String(Date.now()),
    ano: 2024,
    mod: 2025,
    marca: 'Marca Teste',
    modelo: 'Modelo Teste',
    cor: 'preto',
  };

  const createPayloadB = {
    unidade_id: unidadeId,
    tipo: 'carro',
    placa: `TPB-${suffixB}`,
    chassi: `CHASSITPB-${Date.now() + 1}`,
    renavam: String(Date.now() + 1),
    ano: 2024,
    mod: 2025,
    marca: 'Marca Teste',
    modelo: 'Modelo Teste',
    cor: 'preto',
  };

  try {
    const createResA = await agent
      .post('/gestor/api/recursos')
      .query({ unidadeId })
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send(createPayloadA);

    assert.equal(
      createResA.status,
      201,
      `Setup falhou: esperava 201 ao criar recurso A, veio ${createResA.status} com body ${JSON.stringify(createResA.body)}`,
    );

    const createResB = await agent
      .post('/gestor/api/recursos')
      .query({ unidadeId })
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send(createPayloadB);

    assert.equal(
      createResB.status,
      201,
      `Setup falhou: esperava 201 ao criar recurso B, veio ${createResB.status} com body ${JSON.stringify(createResB.body)}`,
    );

    const recursoIdA = extractCreatedId(createResA.body);
    assert.ok(recursoIdA, `Setup falhou: resposta de criação A sem id. body=${JSON.stringify(createResA.body)}`);

    const updateRes = await agent
      .put(`/gestor/api/recursos/${recursoIdA}`)
      .query({ unidadeId })
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({
        unidade_id: unidadeId,
        tipo: 'carro',
        placa: createPayloadB.placa,
      });

    assert.equal(
      updateRes.status,
      400,
      `Contrato violado: placa de outro recurso deveria retornar 400, veio ${updateRes.status} com body ${JSON.stringify(updateRes.body)}`,
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

test('PUT /gestor/api/recursos/:id com id existente e chassi que pertence a outro recurso retorna 400', async () => {
  const prevMongoMemory = process.env.MONGO_MEMORY;
  process.env.MONGO_MEMORY = '1';

  const { app, close } = await createServer({ skipDb: false });
  const teardownGuard = installTeardownSuppression();

  const { agent, authEmail } = await authenticateMasterAgent(app);

  const unidadeId = '000000000000000000000010';
  const baseTs = Date.now();
  const suffixA = String((baseTs % 9000) + 1000);
  const suffixB = String((((baseTs + 1) % 9000) + 1000));

  const createPayloadA = {
    unidade_id: unidadeId,
    tipo: 'carro',
    placa: `TCA-${suffixA}`,
    chassi: `CHASSITCA-${baseTs}`,
    renavam: String(baseTs),
    ano: 2024,
    mod: 2025,
    marca: 'Marca Teste',
    modelo: 'Modelo Teste',
    cor: 'preto',
  };

  const createPayloadB = {
    unidade_id: unidadeId,
    tipo: 'carro',
    placa: `TCB-${suffixB}`,
    chassi: `CHASSITCB-${baseTs + 1}`,
    renavam: String(baseTs + 1),
    ano: 2024,
    mod: 2025,
    marca: 'Marca Teste',
    modelo: 'Modelo Teste',
    cor: 'preto',
  };

  try {
    const createResA = await agent
      .post('/gestor/api/recursos')
      .query({ unidadeId })
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send(createPayloadA);

    assert.equal(
      createResA.status,
      201,
      `Setup falhou: esperava 201 ao criar recurso A, veio ${createResA.status} com body ${JSON.stringify(createResA.body)}`,
    );

    const createResB = await agent
      .post('/gestor/api/recursos')
      .query({ unidadeId })
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send(createPayloadB);

    assert.equal(
      createResB.status,
      201,
      `Setup falhou: esperava 201 ao criar recurso B, veio ${createResB.status} com body ${JSON.stringify(createResB.body)}`,
    );

    const recursoIdA = extractCreatedId(createResA.body);
    assert.ok(recursoIdA, `Setup falhou: resposta de criação A sem id. body=${JSON.stringify(createResA.body)}`);

    const updateRes = await agent
      .put(`/gestor/api/recursos/${recursoIdA}`)
      .query({ unidadeId })
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({
        unidade_id: unidadeId,
        tipo: 'carro',
        chassi: createPayloadB.chassi,
      });

    assert.equal(
      updateRes.status,
      400,
      `Contrato violado: chassi de outro recurso deveria retornar 400, veio ${updateRes.status} com body ${JSON.stringify(updateRes.body)}`,
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

test('PUT /gestor/api/recursos/:id com id existente e renavam que pertence a outro recurso retorna 400', async () => {
  const prevMongoMemory = process.env.MONGO_MEMORY;
  process.env.MONGO_MEMORY = '1';

  const { app, close } = await createServer({ skipDb: false });
  const teardownGuard = installTeardownSuppression();

  const { agent, authEmail } = await authenticateMasterAgent(app);

  const unidadeId = '000000000000000000000010';
  const baseTs = Date.now();
  const suffixA = String((baseTs % 9000) + 1000);
  const suffixB = String((((baseTs + 1) % 9000) + 1000));

  const createPayloadA = {
    unidade_id: unidadeId,
    tipo: 'carro',
    placa: `TRA-${suffixA}`,
    chassi: `CHASSITRA-${baseTs}`,
    renavam: String(baseTs),
    ano: 2024,
    mod: 2025,
    marca: 'Marca Teste',
    modelo: 'Modelo Teste',
    cor: 'preto',
  };

  const createPayloadB = {
    unidade_id: unidadeId,
    tipo: 'carro',
    placa: `TRB-${suffixB}`,
    chassi: `CHASSITRB-${baseTs + 1}`,
    renavam: String(baseTs + 1),
    ano: 2024,
    mod: 2025,
    marca: 'Marca Teste',
    modelo: 'Modelo Teste',
    cor: 'preto',
  };

  try {
    const createResA = await agent
      .post('/gestor/api/recursos')
      .query({ unidadeId })
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send(createPayloadA);

    assert.equal(
      createResA.status,
      201,
      `Setup falhou: esperava 201 ao criar recurso A, veio ${createResA.status} com body ${JSON.stringify(createResA.body)}`,
    );

    const createResB = await agent
      .post('/gestor/api/recursos')
      .query({ unidadeId })
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send(createPayloadB);

    assert.equal(
      createResB.status,
      201,
      `Setup falhou: esperava 201 ao criar recurso B, veio ${createResB.status} com body ${JSON.stringify(createResB.body)}`,
    );

    const recursoIdA = extractCreatedId(createResA.body);
    assert.ok(recursoIdA, `Setup falhou: resposta de criação A sem id. body=${JSON.stringify(createResA.body)}`);

    const updateRes = await agent
      .put(`/gestor/api/recursos/${recursoIdA}`)
      .query({ unidadeId })
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({
        unidade_id: unidadeId,
        tipo: 'carro',
        renavam: createPayloadB.renavam,
      });

    assert.equal(
      updateRes.status,
      400,
      `Contrato violado: renavam de outro recurso deveria retornar 400, veio ${updateRes.status} com body ${JSON.stringify(updateRes.body)}`,
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

test('PUT /gestor/api/recursos/:id com mesma placa do proprio recurso nao retorna 400 por duplicidade', async () => {
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
    placa: `TMS-${suffix}`,
    chassi: `CHASSITMS-${Date.now()}`,
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
        unidade_id: unidadeId,
        tipo: createPayload.tipo,
        placa: createPayload.placa,
        chassi: createPayload.chassi,
        renavam: createPayload.renavam,
        ano: createPayload.ano,
        mod: createPayload.mod,
        marca: createPayload.marca,
        modelo: createPayload.modelo,
        cor: createPayload.cor,
      });

    assert.notEqual(
      updateRes.status,
      400,
      `Contrato violado: mantendo a mesma placa do proprio recurso nao deveria retornar 400 por duplicidade, veio ${updateRes.status} com body ${JSON.stringify(updateRes.body)}`,
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

test('PUT /gestor/api/recursos/:id com mesmo chassi do proprio recurso nao retorna 400 por duplicidade', async () => {
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
    placa: `TMC-${suffix}`,
    chassi: `CHASSITMC-${Date.now()}`,
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
        unidade_id: unidadeId,
        tipo: createPayload.tipo,
        placa: createPayload.placa,
        chassi: createPayload.chassi,
        renavam: createPayload.renavam,
        ano: createPayload.ano,
        mod: createPayload.mod,
        marca: createPayload.marca,
        modelo: createPayload.modelo,
        cor: createPayload.cor,
      });

    assert.notEqual(
      updateRes.status,
      400,
      `Contrato violado: mantendo o mesmo chassi do proprio recurso nao deveria retornar 400 por duplicidade, veio ${updateRes.status} com body ${JSON.stringify(updateRes.body)}`,
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

test('PUT /gestor/api/recursos/:id com mesmo renavam do proprio recurso nao retorna 400 por duplicidade', async () => {
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
    placa: `TMR-${suffix}`,
    chassi: `CHASSITMR-${Date.now()}`,
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
        unidade_id: unidadeId,
        tipo: createPayload.tipo,
        placa: createPayload.placa,
        chassi: createPayload.chassi,
        renavam: createPayload.renavam,
        ano: createPayload.ano,
        mod: createPayload.mod,
        marca: createPayload.marca,
        modelo: createPayload.modelo,
        cor: createPayload.cor,
      });

    assert.notEqual(
      updateRes.status,
      400,
      `Contrato violado: mantendo o mesmo renavam do proprio recurso nao deveria retornar 400 por duplicidade, veio ${updateRes.status} com body ${JSON.stringify(updateRes.body)}`,
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
