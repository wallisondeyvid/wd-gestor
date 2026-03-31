import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { registerHooks } from 'node:module';

const projectRoot = process.cwd();
const controllerModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/controllers/moduloApiController.js')).href;
const actualDbBridgeModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/services/apiDbBridgeService.js')).href;
const dbBridgeMockModuleUrl = 'mock:gestor-modulos-create-api-db-bridge';

const DB_BRIDGE_EXPORTS = [
  'createModulo',
  'deleteModuloById',
  'findAllModulosBaseLean',
  'findModuloById',
  'findModuloByIdLean',
  'findModuloByNome',
  'findUnidadeByIdWithModulosAcessiveisLean',
  'saveModulo',
];

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '#modules/gestor/app/services/apiDbBridgeService.js') {
      return { url: dbBridgeMockModuleUrl, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === dbBridgeMockModuleUrl) {
      const lines = [
        `export * from '${actualDbBridgeModuleUrl}';`,
        `import * as actual from '${actualDbBridgeModuleUrl}';`,
        'const getMocks = () => globalThis.__GESTOR_MODULOS_CREATE_DB_MOCKS__ || {};',
        'const resolveImpl = (name) => {',
        '  const fn = getMocks()[name];',
        "  if (typeof fn === 'function') return fn;",
        '  return actual[name];',
        '};',
      ];

      for (const exportName of DB_BRIDGE_EXPORTS) {
        lines.push(`export async function ${exportName}(...args) { return await resolveImpl('${exportName}')(...args); }`);
      }

      return {
        format: 'module',
        shortCircuit: true,
        source: lines.join('\n'),
      };
    }
    return nextLoad(url, context);
  },
});

function setDbMocks(overrides = {}) {
  globalThis.__GESTOR_MODULOS_CREATE_DB_MOCKS__ = { ...overrides };
}

function clearDbMocks() {
  globalThis.__GESTOR_MODULOS_CREATE_DB_MOCKS__ = {};
}

function createResCapture() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    set(field, value) {
      this.headers[field.toLowerCase()] = value;
      return this;
    },
    json(payload) {
      this.body = JSON.parse(JSON.stringify(payload));
      return this;
    },
    send(payload) {
      this.body = JSON.parse(JSON.stringify(payload));
      return this;
    },
  };
}

function createReq(overrides = {}) {
  return {
    app: { locals: {}, ...(overrides.app || {}) },
    user: Object.prototype.hasOwnProperty.call(overrides, 'user') ? overrides.user : null,
    unitScope: overrides.unitScope || null,
    params: overrides.params || {},
    body: overrides.body || {},
    query: overrides.query || {},
    session: overrides.session,
  };
}

async function importCriarModulo(tag) {
  return import(`${controllerModuleUrl}?case=${encodeURIComponent(tag)}-${Date.now()}`);
}

test.afterEach(() => {
  clearDbMocks();
});

test('criarModulo responde 400 sem usuario ou com papel insuficiente e nao toca no core', async () => {
  let duplicateLookupCalled = false;
  let createCalled = false;
  setDbMocks({
    findModuloByNome: async () => {
      duplicateLookupCalled = true;
      return null;
    },
    createModulo: async () => {
      createCalled = true;
      return { _id: 'm-ignorado' };
    },
  });

  const { criarModulo } = await importCriarModulo('permission-guard');

  for (const user of [null, { role: 'user' }]) {
    const req = createReq({
      user,
      body: { nome: 'Modulo X', descricao: 'Desc', status: 'ativo', url_base: '/x' },
    });
    const res = createResCapture();

    await criarModulo(req, res);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, {
      success: false,
      code: 'BAD_REQUEST',
      message: 'Permissão insuficiente',
    });
  }

  assert.equal(duplicateLookupCalled, false);
  assert.equal(createCalled, false);
});

test('criarModulo responde 400 quando nome obrigatorio nao vem no corpo', async () => {
  let duplicateLookupCalled = false;
  setDbMocks({
    findModuloByNome: async () => {
      duplicateLookupCalled = true;
      return null;
    },
  });

  const { criarModulo } = await importCriarModulo('missing-name');
  const req = createReq({
    user: { role: 'admin' },
    body: { descricao: 'Desc', status: 'ativo', url_base: '/x' },
  });
  const res = createResCapture();

  await criarModulo(req, res);

  assert.equal(duplicateLookupCalled, false);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    code: 'BAD_REQUEST',
    message: 'Nome é obrigatório',
  });
});

test('criarModulo traduz duplicidade de nome para 400 e nao persiste novo modulo', async () => {
  let receivedNome = null;
  let createCalled = false;
  setDbMocks({
    findModuloByNome: async (nome) => {
      receivedNome = nome;
      return { _id: 'm-existente' };
    },
    createModulo: async () => {
      createCalled = true;
      return { _id: 'm-nao-deveria' };
    },
  });

  const { criarModulo } = await importCriarModulo('duplicate-name');
  const req = createReq({
    user: { role: 'admin' },
    body: { nome: 'Modulo Financeiro', descricao: 'Desc', status: 'ativo', url_base: '/financeiro' },
  });
  const res = createResCapture();

  await criarModulo(req, res);

  assert.equal(receivedNome, 'Modulo Financeiro');
  assert.equal(createCalled, false);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    code: 'BAD_REQUEST',
    message: 'Módulo já cadastrado',
  });
});

test('criarModulo retorna 201 com id vindo do core no caminho feliz', async () => {
  let receivedNome = null;
  let createPayload = null;
  setDbMocks({
    findModuloByNome: async (nome) => {
      receivedNome = nome;
      return null;
    },
    createModulo: async (payload) => {
      createPayload = payload;
      return { _id: '507f191e810c19729de860ea', ...payload };
    },
  });

  const { criarModulo } = await importCriarModulo('success');
  const req = createReq({
    user: { role: 'master' },
    body: {
      nome: 'Modulo Financeiro',
      descricao: 'Controle financeiro',
      status: 'ativo',
      url_base: '/financeiro',
    },
  });
  const res = createResCapture();

  await criarModulo(req, res);

  assert.equal(receivedNome, 'Modulo Financeiro');
  assert.deepEqual(createPayload, {
    nome: 'Modulo Financeiro',
    descricao: 'Controle financeiro',
    status: 'ativo',
    url_base: '/financeiro',
  });
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body, {
    success: true,
    created: true,
    id: '507f191e810c19729de860ea',
    data: { _id: '507f191e810c19729de860ea' },
  });
});