import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';

const projectRoot = process.cwd();
const controllerModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/controllers/moduloApiController.js')).href;
const serviceModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/services/modulos/deleteModuloById.service.js')).href;
const actualBridgeModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/services/apiDbBridgeService.js')).href;

const serviceMockModuleUrl = 'mock:gestor-modulos-delete-service';
const bridgeMockModuleUrl = 'mock:gestor-modulos-delete-api-bridge';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '#modules/gestor/app/services/modulos/deleteModuloById.service.js') {
      return { url: serviceMockModuleUrl, shortCircuit: true };
    }

    if (specifier === '#modules/gestor/app/services/apiDbBridgeService.js') {
      return { url: bridgeMockModuleUrl, shortCircuit: true };
    }

    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === serviceMockModuleUrl) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          "const getMocks = () => globalThis.__GESTOR_MODULOS_DELETE_SERVICE_MOCKS__ || {};",
          "export async function deleteModuloByIdService(...args) {",
          "  const fn = getMocks().deleteModuloByIdService;",
          "  if (typeof fn !== 'function') throw new Error('deleteModuloByIdService mock ausente');",
          "  return await fn(...args);",
          "}",
        ].join('\n'),
      };
    }

    if (url === bridgeMockModuleUrl) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          `export * from '${actualBridgeModuleUrl}';`,
          `import * as actual from '${actualBridgeModuleUrl}';`,
          "const getMocks = () => globalThis.__GESTOR_MODULOS_DELETE_BRIDGE_MOCKS__ || {};",
          "const resolveImpl = (name) => {",
          "  const fn = getMocks()[name];",
          "  if (typeof fn === 'function') return fn;",
          "  return actual[name];",
          "};",
          "export async function findModuloById(...args) {",
          "  return await resolveImpl('findModuloById')(...args);",
          "}",
          "export async function deleteModuloById(...args) {",
          "  return await resolveImpl('deleteModuloById')(...args);",
          "}",
        ].join('\n'),
      };
    }

    return nextLoad(url, context);
  },
});

function setServiceMocks(overrides = {}) {
  globalThis.__GESTOR_MODULOS_DELETE_SERVICE_MOCKS__ = { ...overrides };
}

function setBridgeMocks(overrides = {}) {
  globalThis.__GESTOR_MODULOS_DELETE_BRIDGE_MOCKS__ = { ...overrides };
}

function createReq(overrides = {}) {
  return {
    app: { locals: {}, ...(overrides.app || {}) },
    user: overrides.user || null,
    unitScope: overrides.unitScope || null,
    params: overrides.params || {},
    body: overrides.body || {},
    query: overrides.query || {},
    session: overrides.session,
  };
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
    send(payload) {
      this.body = JSON.parse(JSON.stringify(payload));
      return this;
    },
  };
}

async function importExcluirModulo(tag) {
  return import(`${controllerModuleUrl}?case=${encodeURIComponent(tag)}-${Date.now()}`);
}

async function importDeleteModuloService(tag) {
  return import(`${serviceModuleUrl}?case=${encodeURIComponent(tag)}-${Date.now()}`);
}

test('excluirModulo responde 400 sem permissao suficiente e nao chama o service fino', async () => {
  let serviceCalled = false;
  setServiceMocks({
    deleteModuloByIdService: async () => {
      serviceCalled = true;
      return { _id: 'm-x' };
    },
  });

  const { excluirModulo } = await importExcluirModulo('forbidden');
  const req = createReq({
    user: { role: 'diretor' },
    params: { id: 'm-bloqueado' },
  });
  const res = createResCapture();

  await excluirModulo(req, res);

  assert.equal(serviceCalled, false);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    code: 'BAD_REQUEST',
    message: 'Permissão insuficiente',
  });
});

test('excluirModulo usa o service fino como caminho principal e preserva 404 quando o alvo nao existe', async () => {
  let receivedArgs = null;
  setServiceMocks({
    deleteModuloByIdService: async (args) => {
      receivedArgs = args;
      return null;
    },
  });

  const { excluirModulo } = await importExcluirModulo('not-found');
  const req = createReq({
    user: { role: 'admin' },
    params: { id: 'm-ausente' },
  });
  const res = createResCapture();

  await excluirModulo(req, res);

  assert.deepEqual(receivedArgs, { moduloId: 'm-ausente' });
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, {
    success: false,
    code: 'NOT_FOUND',
    message: 'Módulo não encontrado',
  });
});

test('excluirModulo responde 200 com envelope minimo de sucesso quando o service exclui o alvo', async () => {
  let receivedArgs = null;
  setServiceMocks({
    deleteModuloByIdService: async (args) => {
      receivedArgs = args;
      return { _id: 'm-ok' };
    },
  });

  const { excluirModulo } = await importExcluirModulo('success');
  const req = createReq({
    user: { role: 'master' },
    params: { id: 'm-ok' },
  });
  const res = createResCapture();

  await excluirModulo(req, res);

  assert.deepEqual(receivedArgs, { moduloId: 'm-ok' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: {
      deleted: true,
      id: 'm-ok',
    },
  });
});

test('deleteModuloByIdService consulta e exclui pelo mesmo id via apiDbBridgeService', async () => {
  const calls = [];
  setBridgeMocks({
    findModuloById: async (id) => {
      calls.push({ op: 'findModuloById', id });
      return { _id: id, nome: 'Financeiro' };
    },
    deleteModuloById: async (id) => {
      calls.push({ op: 'deleteModuloById', id });
      return { acknowledged: true, deletedCount: 1 };
    },
  });

  const { deleteModuloByIdService } = await importDeleteModuloService('service-success');
  const result = await deleteModuloByIdService({ moduloId: 'm-ok' });

  assert.deepEqual(result, { _id: 'm-ok', nome: 'Financeiro' });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].op, 'findModuloById');
  assert.equal(calls[1].op, 'deleteModuloById');
  assert.equal(calls[0].id, 'm-ok');
  assert.equal(calls[1].id, 'm-ok');
});

test('deleteModuloByIdService nao tenta excluir quando o lookup nao encontra alvo', async () => {
  const calls = [];
  setBridgeMocks({
    findModuloById: async (id) => {
      calls.push({ op: 'findModuloById', id });
      return null;
    },
    deleteModuloById: async (id) => {
      calls.push({ op: 'deleteModuloById', id });
      return { acknowledged: true, deletedCount: 1 };
    },
  });

  const { deleteModuloByIdService } = await importDeleteModuloService('service-miss');
  const result = await deleteModuloByIdService({ moduloId: 'm-ausente' });

  assert.equal(result, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].op, 'findModuloById');
  assert.equal(calls[0].id, 'm-ausente');
});