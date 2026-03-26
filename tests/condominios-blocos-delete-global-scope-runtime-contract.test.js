import assert from 'node:assert/strict';
import test, { after, mock } from 'node:test';

import { requireUnitScope } from '../src/modules/condominios/app/middlewares/requireUnitScope.js';

const repoState = {
  constructorCalls: [],
  deleteCalls: [],
};

mock.module('#modules/condominios/app/repositories/BlocosRepository.js', {
  namedExports: {
    BlocosRepository: class BlocosRepositoryMock {
      constructor({ unitScope } = {}) {
        repoState.constructorCalls.push({ unitScope });
      }

      async deleteById({ id }) {
        repoState.deleteCalls.push({ id });
        return { _id: id };
      }
    },
  },
});

mock.module('#modules/condominios/app/repositories/AndaresRepository.js', {
  namedExports: {
    AndaresRepository: class AndaresRepositoryMock {},
  },
});

const { handleDeleteBlocosV2, setHandleGetBlocosV2Context } = await import('#modules/condominios/app/v2/routes/blocos.routes.js');

after(() => {
  mock.restoreAll();
});

function withEnv(overrides, fn) {
  const previous = new Map();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = String(value);
  }

  try {
    return fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function resetRepoState() {
  repoState.constructorCalls.length = 0;
  repoState.deleteCalls.length = 0;
}

function createResCapture() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = JSON.parse(JSON.stringify(payload));
      return this;
    },
  };
}

test('requireUnitScope resolve unitScope global em DELETE de blocos quando enforce=false e sem unidade valida', async () => {
  await withEnv({ WDG_MULTI_TENANT: '0' }, async () => {
    const req = {
      method: 'DELETE',
      path: '/api/blocos/507f1f77bcf86cd799439012',
      query: {},
      params: { id: '507f1f77bcf86cd799439012' },
      body: {},
      session: {},
      user: null,
    };
    const res = createResCapture();

    await new Promise((resolve) => {
      requireUnitScope(req, res, resolve);
    });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(req.unitScope, {
      type: 'global',
      unidadeId: null,
    });
  });
});

test('DELETE /condominios/api/blocos/:id em V2 recusa unitScope global antes de criar repositorio quando enforce=false', async () => {
  resetRepoState();
  setHandleGetBlocosV2Context({
    mongoose: {
      connection: { readyState: 1 },
    },
    CondBloco: {},
  });

  await withEnv({ WDG_MULTI_TENANT: '0' }, async () => {
    const req = {
      method: 'DELETE',
      path: '/api/blocos/507f1f77bcf86cd799439098',
      query: {},
      params: { id: '507f1f77bcf86cd799439098' },
      body: {},
      session: {},
      user: null,
      app: { locals: { skipDb: false } },
      unitScope: null,
    };
    const res = createResCapture();

    await new Promise((resolve) => {
      requireUnitScope(req, res, resolve);
    });
    await handleDeleteBlocosV2(req, res);

    assert.deepEqual(req.unitScope, {
      type: 'global',
      unidadeId: null,
    });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, {
      success: false,
      error: 'UNIDADE_ID_REQUIRED',
    });
    assert.deepEqual(repoState.constructorCalls, []);
    assert.deepEqual(repoState.deleteCalls, []);
  });
});