import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';

const projectRoot = process.cwd();
const controllerModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/controllers/setorApiController.js')).href;
const serviceModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/services/setores/deleteSetorScoped.service.js')).href;
const actualRepositoryModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/repositories/SetorReadRepository.js')).href;

const serviceMockModuleUrl = 'mock:gestor-setores-delete-service';
const repositoryMockModuleUrl = 'mock:gestor-setores-delete-repositories';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '#modules/gestor/app/services/setores/deleteSetorScoped.service.js') {
      return { url: serviceMockModuleUrl, shortCircuit: true };
    }

    if (specifier === '#modules/gestor/app/repositories/SetorReadRepository.js') {
      return { url: repositoryMockModuleUrl, shortCircuit: true };
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

    if (url === repositoryMockModuleUrl) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          `export * from '${actualRepositoryModuleUrl}';`,
          `import * as actual from '${actualRepositoryModuleUrl}';`,
          "const getMocks = () => globalThis.__GESTOR_SETORES_DELETE_REPOSITORY_MOCKS__ || {};",
          "const resolveImpl = (name) => {",
          "  const fn = getMocks()[name];",
          "  if (typeof fn === 'function') return fn;",
          "  return actual[name];",
          "};",
          "export async function findSetorByIdRepo(...args) {",
          "  return await resolveImpl('findSetorByIdRepo')(...args);",
          "}",
          "export async function findSetorByIdAndDeleteRepo(...args) {",
          "  return await resolveImpl('findSetorByIdAndDeleteRepo')(...args);",
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

function setRepositoryMocks(overrides = {}) {
  globalThis.__GESTOR_SETORES_DELETE_REPOSITORY_MOCKS__ = { ...overrides };
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
  setRepositoryMocks({
    findSetorByIdRepo: async (args) => {
      calls.push({ op: 'findSetorByIdRepo', args });
      return { _id: args.id, unidade_id: args.unidadeId };
    },
    findSetorByIdAndDeleteRepo: async (args) => {
      calls.push({ op: 'findSetorByIdAndDeleteRepo', args });
      return { _id: args.id };
    },
  });

  const { deleteSetorScopedService } = await importDeleteSetorScopedService('service-success');
  const result = await deleteSetorScopedService({ setorId: 's-ok', unidadeId: '507f1f77bcf86cd799439011' });

  assert.deepEqual(result, { _id: 's-ok', unidade_id: '507f1f77bcf86cd799439011' });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].op, 'findSetorByIdRepo');
  assert.equal(calls[1].op, 'findSetorByIdAndDeleteRepo');
  assert.equal(calls[0].args.id, 's-ok');
  assert.equal(calls[0].args.unidadeId, '507f1f77bcf86cd799439011');
  assert.equal(calls[1].args.id, 's-ok');
  assert.equal(calls[1].args.unidadeId, '507f1f77bcf86cd799439011');
  assert.deepEqual(calls[0].args.unitScope, calls[1].args.unitScope);
});

test('deleteSetorScopedService nao tenta excluir quando o lookup escopado nao encontra alvo', async () => {
  const calls = [];
  setRepositoryMocks({
    findSetorByIdRepo: async (args) => {
      calls.push({ op: 'findSetorByIdRepo', args });
      return null;
    },
    findSetorByIdAndDeleteRepo: async (args) => {
      calls.push({ op: 'findSetorByIdAndDeleteRepo', args });
      return { _id: args.id };
    },
  });

  const { deleteSetorScopedService } = await importDeleteSetorScopedService('service-miss');
  const result = await deleteSetorScopedService({ setorId: 's-ausente', unidadeId: '507f1f77bcf86cd799439011' });

  assert.equal(result, null);
  assert.deepEqual(calls, [
    {
      op: 'findSetorByIdRepo',
      args: calls[0].args,
    },
  ]);
  assert.equal(calls[0].args.id, 's-ausente');
  assert.equal(calls[0].args.unidadeId, '507f1f77bcf86cd799439011');
});