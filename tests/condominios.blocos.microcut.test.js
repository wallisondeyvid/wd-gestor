import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import request from 'supertest';

import { createServer } from '../src/server/createServer.js';
import { requireUnitScope } from '../src/modules/condominios/app/middlewares/requireUnitScope.js';

const BLOCOS_REPOSITORY_MOCK_MODULE_URL = 'mock:condominios-blocos-post-runtime-blocos-repository';
const ANDARES_REPOSITORY_MOCK_MODULE_URL = 'mock:condominios-blocos-post-runtime-andares-repository';

const repoState = {
  constructorCalls: [],
  findOneCalls: [],
  createCalls: [],
};

globalThis.__CONDOMINIOS_BLOCOS_POST_RUNTIME_REPO_STATE__ = repoState;

const blocosServiceModuleUrl = pathToFileURL(path.join(process.cwd(), 'src/modules/condominios/app/services/blocos.service.js')).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '#modules/condominios/app/repositories/BlocosRepository.js') {
      return { url: BLOCOS_REPOSITORY_MOCK_MODULE_URL, shortCircuit: true };
    }

    if (specifier === '#modules/condominios/app/repositories/AndaresRepository.js') {
      return { url: ANDARES_REPOSITORY_MOCK_MODULE_URL, shortCircuit: true };
    }

    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === BLOCOS_REPOSITORY_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'const getState = () => globalThis.__CONDOMINIOS_BLOCOS_POST_RUNTIME_REPO_STATE__ || { constructorCalls: [], findOneCalls: [], createCalls: [] };',
          'export class BlocosRepository {',
          '  constructor({ unitScope } = {}) {',
          '    getState().constructorCalls.push({ unitScope });',
          '  }',
          '  async findOne({ filter } = {}) {',
          '    getState().findOneCalls.push({ filter });',
          '    return null;',
          '  }',
          '  async create(payload) {',
          '    getState().createCalls.push(payload);',
          "    return { _id: '507f1f77bcf86cd799439123', ...payload };",
          '  }',
          '}',
        ].join('\n'),
      };
    }

    if (url === ANDARES_REPOSITORY_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: 'export class AndaresRepository {}',
      };
    }

    return nextLoad(url, context);
  },
});

after(() => {
  delete globalThis.__CONDOMINIOS_BLOCOS_POST_RUNTIME_REPO_STATE__;
});

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

async function requestWithFlags(app, {
  method,
  path,
  query,
  body,
  v2 = '1',
  multiTenant = '1'
}) {
  return withEnv({
    WDG_FLAG_CONDOMINIOS_APP_V2: v2,
    WDG_MULTI_TENANT: multiTenant,
  }, async () => {
    let req = request(app)[method](path)
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    if (query) req = req.query(query);
    if (body !== undefined) req = req.send(body);
    return await req;
  });
}

function resetRepoState() {
  repoState.constructorCalls.length = 0;
  repoState.findOneCalls.length = 0;
  repoState.createCalls.length = 0;
}

function createResCapture() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    set(field, value) {
      this.headers[String(field).toLowerCase()] = value;
      return this;
    },
    json(payload) {
      this.body = JSON.parse(JSON.stringify(payload));
      return this;
    },
  };
}

async function importCriarBlocoService(tag) {
  return import(`${blocosServiceModuleUrl}?case=${encodeURIComponent(tag)}-${Date.now()}`);
}

test('GET /condominios/api/blocos/:id com V2 ligado e sem unidadeId retorna 400 por requireUnitScope', async () => {
  const { app, close } = await createServer({ skipDb: true });
  const teardownGuard = installTeardownSuppression();

  try {
    const res = await requestWithFlags(app, {
      method: 'get',
      path: '/condominios/api/blocos/000000000000000000000001',
    });

    assert.equal(res.status, 503);
    assert.equal(res.body?.success, false);
    assert.match(String(res.body?.error || ''), /indisponível/i);
  } finally {
    try {
      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
    }
  }
});

test('GET /condominios/api/blocos/relacionados com V2 ligado e sem unidadeId retorna 400 por requireUnitScope', async () => {
  const { app, close } = await createServer({ skipDb: true });
  const teardownGuard = installTeardownSuppression();

  try {
    const res = await requestWithFlags(app, {
      method: 'get',
      path: '/condominios/api/blocos/relacionados',
    });

    assert.equal(res.status, 400);
    assert.equal(res.body?.success, false);
    assert.equal(res.body?.error, 'UNIDADE_ID_REQUIRED');
  } finally {
    try {
      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
    }
  }
});

test('POST /condominios/api/blocos com V2 ligado e unidadeId valido segue pelo caminho V2 e nao falha por escopo', async () => {
  const { app, close } = await createServer({ skipDb: true });
  const teardownGuard = installTeardownSuppression();

  try {
    const res = await requestWithFlags(app, {
      method: 'post',
      path: '/condominios/api/blocos',
      query: { unidadeId: '000000000000000000000010' },
      body: { unidade_id: '000000000000000000000010', nome: 'Bloco A', ordem: 1 },
    });

    assert.equal(res.status, 503);
    assert.equal(res.body?.success, false);
    assert.equal(res.body?.error, 'DB indisponível');
  } finally {
    try {
      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
    }
  }
});

test('POST /condominios/api/blocos com V2 desligado e unidadeId valido alinha o OFF ao mesmo preparo de escopo do ON', async () => {
  const { app, close } = await createServer({ skipDb: true });
  const teardownGuard = installTeardownSuppression();

  try {
    const res = await requestWithFlags(app, {
      method: 'post',
      path: '/condominios/api/blocos',
      body: { unidade_id: '000000000000000000000010', nome: 'Bloco OFF', ordem: 1 },
      v2: '0',
      multiTenant: undefined,
    });

    assert.equal(res.status, 503);
    assert.equal(res.body?.success, false);
    assert.equal(res.body?.error, 'DB indisponível');
  } finally {
    try {
      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
    }
  }
});

test('POST V2 valida body.unidade_id contra req.unitScope e nao cria repositorio com unidade divergente', async () => {
  resetRepoState();
  const { criarBlocoService } = await importCriarBlocoService('mismatch');

  await withEnv({ WDG_MULTI_TENANT: '1' }, async () => {
    const req = {
      method: 'POST',
      path: '/api/blocos',
      query: { unidadeId: '507f1f77bcf86cd799439010' },
      params: {},
      body: { unidade_id: '507f1f77bcf86cd799439011', nome: 'Bloco Divergente', ordem: 3 },
      session: {},
      user: null,
      app: { locals: { skipDb: false } },
      unitScope: null,
    };
    const res = createResCapture();

    await new Promise((resolve) => {
      requireUnitScope(req, res, resolve);
    });

    let capturedError = null;
    try {
      await criarBlocoService({
        unitScope: req.unitScope,
        body: req.body,
        mongoose: {
          connection: { readyState: 1 },
          isValidObjectId(value) {
            return /^[0-9a-fA-F]{24}$/.test(String(value || ''));
          },
        },
        skipDb: false,
        CondBloco: {},
      });
    } catch (error) {
      capturedError = error;
    }

    assert.deepEqual(req.unitScope, {
      type: 'unit',
      unidadeId: '507f1f77bcf86cd799439010',
    });
    assert.ok(capturedError);
    assert.equal(capturedError?.__httpStatus, 400);
    assert.deepEqual(capturedError?.__httpPayload, {
      error: 'UNIDADE_ID_MISMATCH',
    });
    assert.deepEqual(repoState.constructorCalls, []);
    assert.deepEqual(repoState.findOneCalls, []);
    assert.deepEqual(repoState.createCalls, []);
  });
});

test('POST V2 cria repositorio com req.unitScope e persiste a unidade efetiva contextual', async () => {
  resetRepoState();
  const { criarBlocoService } = await importCriarBlocoService('success');

  await withEnv({ WDG_MULTI_TENANT: '1' }, async () => {
    const req = {
      method: 'POST',
      path: '/api/blocos',
      query: { unidadeId: '507f1f77bcf86cd799439010' },
      params: {},
      body: { unidade_id: '507f1f77bcf86cd799439010', nome: 'Bloco Contextual', ordem: 2 },
      session: {},
      user: null,
      app: { locals: { skipDb: false } },
      unitScope: null,
    };
    const res = createResCapture();

    await new Promise((resolve) => {
      requireUnitScope(req, res, resolve);
    });

    const result = await criarBlocoService({
      unitScope: req.unitScope,
      body: req.body,
      mongoose: {
        connection: { readyState: 1 },
        isValidObjectId(value) {
          return /^[0-9a-fA-F]{24}$/.test(String(value || ''));
        },
      },
      skipDb: false,
      CondBloco: {},
    });

    assert.deepEqual(req.unitScope, {
      type: 'unit',
      unidadeId: '507f1f77bcf86cd799439010',
    });
    assert.deepEqual(result, {
      status: 201,
      payload: {
        _id: '507f1f77bcf86cd799439123',
        unidade_id: '507f1f77bcf86cd799439010',
        nome: 'Bloco Contextual',
        ordem: 2,
      },
      created: true,
    });
    assert.deepEqual(repoState.constructorCalls, [
      {
        unitScope: {
          type: 'unit',
          unidadeId: '507f1f77bcf86cd799439010',
        },
      },
    ]);
    assert.deepEqual(repoState.findOneCalls, [
      {
        filter: {
          unidade_id: '507f1f77bcf86cd799439010',
          nome: 'Bloco Contextual',
        },
      },
    ]);
    assert.deepEqual(repoState.createCalls, [
      {
        unidade_id: '507f1f77bcf86cd799439010',
        nome: 'Bloco Contextual',
        ordem: 2,
      },
    ]);
  });
});

test('PUT /condominios/api/blocos/:id com V2 ligado e unidadeId válido segue pelo caminho V2 e não falha por escopo', async () => {
  const { app, close } = await createServer({ skipDb: true });
  const teardownGuard = installTeardownSuppression();

  try {
    const res = await requestWithFlags(app, {
      method: 'put',
      path: '/condominios/api/blocos/000000000000000000000099',
      query: { unidadeId: '000000000000000000000010' },
      body: { nome: 'Novo Nome', ordem: 2, ativo: true },
    });

    assert.equal(res.status, 500);
    assert.equal(res.body?.success, false);
    assert.equal(res.body?.error, 'DB indisponível');
  } finally {
    try {
      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
    }
  }
});

test('DELETE /condominios/api/blocos/:id com V2 ligado e unidadeId válido segue pelo caminho V2 e não falha por escopo', async () => {
  const { app, close } = await createServer({ skipDb: true });
  const teardownGuard = installTeardownSuppression();

  try {
    const res = await requestWithFlags(app, {
      method: 'delete',
      path: '/condominios/api/blocos/000000000000000000000098',
      query: { unidadeId: '000000000000000000000010' },
    });

    assert.equal(res.status, 500);
    assert.equal(res.body?.success, false);
    assert.equal(res.body?.error, 'DB indisponível');
  } finally {
    try {
      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
    }
  }
});

test('PUT /condominios/api/blocos/:id com V2 desligado preserva o fluxo V1 mínimo sem regressão de escopo', async () => {
  const { app, close } = await createServer({ skipDb: true });
  const teardownGuard = installTeardownSuppression();

  try {
    const res = await requestWithFlags(app, {
      method: 'put',
      path: '/condominios/api/blocos/000000000000000000000099',
      body: { nome: 'Novo Nome', ordem: 2, ativo: true },
      v2: '0',
      multiTenant: '1',
    });

    assert.equal(res.status, 400);
    assert.equal(res.body?.success, false);
    assert.equal(res.body?.error, 'UNIDADE_ID_REQUIRED');
  } finally {
    try {
      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
    }
  }
});

test('DELETE /condominios/api/blocos/:id com V2 desligado preserva o fluxo V1 mínimo sem regressão de escopo', async () => {
  const { app, close } = await createServer({ skipDb: true });
  const teardownGuard = installTeardownSuppression();

  try {
    const res = await requestWithFlags(app, {
      method: 'delete',
      path: '/condominios/api/blocos/000000000000000000000098',
      v2: '0',
      multiTenant: '1',
    });

    assert.equal(res.status, 400);
    assert.equal(res.body?.success, false);
    assert.equal(res.body?.error, 'UNIDADE_ID_REQUIRED');
  } finally {
    try {
      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
    }
  }
});