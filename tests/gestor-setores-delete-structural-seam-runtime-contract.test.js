import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';

const projectRoot = process.cwd();
const controllerModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/controllers/setorApiController.js')).href;
const serviceModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/services/setores/deleteSetorScoped.service.js')).href;
const actualBridgeModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/services/apiDbBridgeService.js')).href;

const serviceMockModuleUrl = 'mock:gestor-setores-delete-service';
const bridgeMockModuleUrl = 'mock:gestor-setores-delete-bridge';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '#modules/gestor/app/services/setores/deleteSetorScoped.service.js') {
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
          "const getMocks = () => globalThis.__GESTOR_SETORES_DELETE_SERVICE_MOCKS__ || {};",
          "export async function deleteSetorScopedService(...args) {",
          "  const fn = getMocks().deleteSetorScopedService;",
          "  if (typeof fn !== 'function') throw new Error('deleteSetorScopedService mock ausente');",
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
          "const getMocks = () => globalThis.__GESTOR_SETORES_DELETE_BRIDGE_MOCKS__ || {};",
          "const resolveImpl = (name) => {",
          "  const fn = getMocks()[name];",
          "  if (typeof fn === 'function') return fn;",
          "  return actual[name];",
          "};",
          "export async function findSetorById(...args) {",
          "  return await resolveImpl('findSetorById')(...args);",
          "}",
          "export async function findSetorByIdAndDelete(...args) {",
          "  return await resolveImpl('findSetorByIdAndDelete')(...args);",
          "}",
        ].join('\n'),
      };
    }

    return nextLoad(url, context);
  },
});

function setServiceMocks(overrides = {}) {
  globalThis.__GESTOR_SETORES_DELETE_SERVICE_MOCKS__ = { ...overrides };
}

function setBridgeMocks(overrides = {}) {
  globalThis.__GESTOR_SETORES_DELETE_BRIDGE_MOCKS__ = { ...overrides };
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

async function importDeleteSetor(tag) {
  return import(`${controllerModuleUrl}?case=${encodeURIComponent(tag)}-${Date.now()}`);
}

async function importDeleteSetorScopedService(tag) {
  return import(`${serviceModuleUrl}?case=${encodeURIComponent(tag)}-${Date.now()}`);
}

test('deleteSetor usa o service fino como caminho principal e preserva 404 quando o service nao encontra alvo', async () => {
  let receivedArgs = null;
  setServiceMocks({
    deleteSetorScopedService: async (args) => {
      receivedArgs = args;
      return null;
    },
  });

  const { deleteSetor } = await importDeleteSetor('owner-404');
  const req = createReq({
    user: { role: 'diretor' },
    unitScope: { unidadeId: 'u-contexto' },
    params: { id: 's-ausente' },
  });
  const res = createResCapture();

  await deleteSetor(req, res);

  assert.deepEqual(receivedArgs, { setorId: 's-ausente', unidadeId: 'u-contexto' });
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, {
    success: false,
    code: 'NOT_FOUND',
    message: 'Setor não encontrado',
  });
});

test('deleteSetorScopedService consulta e exclui no repository com o mesmo alvo escopado', async () => {
  const calls = [];
  setBridgeMocks({
    findSetorById: async (...args) => {
      calls.push({ op: 'findSetorById', args });
      return { _id: args[0], unidade_id: args[1] };
    },
    findSetorByIdAndDelete: async (...args) => {
      calls.push({ op: 'findSetorByIdAndDelete', args });
      return { _id: args[0] };
    },
  });

  const { deleteSetorScopedService } = await importDeleteSetorScopedService('service-success');
  const result = await deleteSetorScopedService({ setorId: 's-ok', unidadeId: '507f1f77bcf86cd799439011' });

  assert.deepEqual(result, { _id: 's-ok', unidade_id: '507f1f77bcf86cd799439011' });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].op, 'findSetorById');
  assert.equal(calls[1].op, 'findSetorByIdAndDelete');
  assert.deepEqual(calls[0].args, ['s-ok', '507f1f77bcf86cd799439011']);
  assert.deepEqual(calls[1].args, ['s-ok', '507f1f77bcf86cd799439011']);
});

test('deleteSetorScopedService nao tenta excluir quando o lookup escopado nao encontra alvo', async () => {
  const calls = [];
  setBridgeMocks({
    findSetorById: async (...args) => {
      calls.push({ op: 'findSetorById', args });
      return null;
    },
    findSetorByIdAndDelete: async (...args) => {
      calls.push({ op: 'findSetorByIdAndDelete', args });
      return { _id: args[0] };
    },
  });

  const { deleteSetorScopedService } = await importDeleteSetorScopedService('service-miss');
  const result = await deleteSetorScopedService({ setorId: 's-ausente', unidadeId: '507f1f77bcf86cd799439011' });

  assert.equal(result, null);
  assert.deepEqual(calls, [
    {
      op: 'findSetorById',
      args: calls[0].args,
    },
  ]);
  assert.deepEqual(calls[0].args, ['s-ausente', '507f1f77bcf86cd799439011']);
});