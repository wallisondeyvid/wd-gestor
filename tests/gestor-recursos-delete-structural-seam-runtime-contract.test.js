import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';

const projectRoot = process.cwd();
const controllerModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/controllers/recursoApiController.js')).href;
const serviceModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/services/recursos/deleteRecursoScoped.service.js')).href;

const bridgeMockModuleUrl = 'mock:gestor-recursos-bridge';
const serviceMockModuleUrl = 'mock:gestor-recursos-delete-service';
const listarRecursosServiceMockModuleUrl = 'mock:gestor-recursos-list-service';
const repositoryMockModuleUrl = 'mock:gestor-recursos-delete-repository';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '#modules/gestor/app/services/apiDbBridgeService.js') {
      return { url: bridgeMockModuleUrl, shortCircuit: true };
    }

    if (specifier === '#modules/gestor/app/services/recursos/deleteRecursoScoped.service.js') {
      return { url: serviceMockModuleUrl, shortCircuit: true };
    }

    if (specifier === '#modules/gestor/app/services/recursos/listarRecursos.service.js') {
      return { url: listarRecursosServiceMockModuleUrl, shortCircuit: true };
    }

    if (specifier === '#modules/gestor/app/repositories/RecursoReadRepository.js') {
      return { url: repositoryMockModuleUrl, shortCircuit: true };
    }

    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === bridgeMockModuleUrl) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'export async function findUnidadeUserBaseLean() { return null; }',
          'export async function findUnidadesByCondLean() { return []; }',
          'export async function findRecursoByIdComUnidadeNome() { return null; }',
          'export async function findRecursoByPlacaUpper() { return null; }',
          'export async function findRecursoByChassiUpper() { return null; }',
          'export async function findRecursoByRenavam() { return null; }',
          'export async function createRecurso() { return null; }',
          'export async function findRecursoById() { return null; }',
          'export async function findOutroRecursoByPlacaUpper() { return null; }',
          'export async function findOutroRecursoByChassiUpper() { return null; }',
          'export async function findOutroRecursoByRenavam() { return null; }',
          'export async function updateRecursoByIdComUnidadeNome() { return null; }',
          'export async function deleteRecursoById() {',
          '  throw new Error(\'deleteRecursoById da bridge nao deveria ser chamado nesta suite\');',
          '}',
        ].join('\n'),
      };
    }

    if (url === serviceMockModuleUrl) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          "const getMocks = () => globalThis.__GESTOR_RECURSOS_DELETE_SERVICE_MOCKS__ || {};",
          "export async function deleteRecursoScopedService(...args) {",
          "  const fn = getMocks().deleteRecursoScopedService;",
          "  if (typeof fn !== 'function') throw new Error('deleteRecursoScopedService mock ausente');",
          "  return await fn(...args);",
          "}",
        ].join('\n'),
      };
    }

    if (url === listarRecursosServiceMockModuleUrl) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'export async function listarRecursosService() {',
          '  throw new Error(\'listarRecursosService nao deveria ser chamado nesta suite\');',
          '}',
        ].join('\n'),
      };
    }

    if (url === repositoryMockModuleUrl) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          "const getMocks = () => globalThis.__GESTOR_RECURSOS_DELETE_REPOSITORY_MOCKS__ || {};",
          "export async function deleteRecursoByIdRepo(...args) {",
          "  const fn = getMocks().deleteRecursoByIdRepo;",
          "  if (typeof fn !== 'function') throw new Error('deleteRecursoByIdRepo mock ausente');",
          "  return await fn(...args);",
          "}",
        ].join('\n'),
      };
    }

    return nextLoad(url, context);
  },
});

function setServiceMocks(overrides = {}) {
  globalThis.__GESTOR_RECURSOS_DELETE_SERVICE_MOCKS__ = { ...overrides };
}

function setRepositoryMocks(overrides = {}) {
  globalThis.__GESTOR_RECURSOS_DELETE_REPOSITORY_MOCKS__ = { ...overrides };
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

async function importDeleteRecursoController(tag) {
  return import(`${controllerModuleUrl}?case=${encodeURIComponent(tag)}-${Date.now()}`);
}

async function importDeleteRecursoService(tag) {
  return import(`${serviceModuleUrl}?case=${encodeURIComponent(tag)}-${Date.now()}`);
}

after(() => {
  delete globalThis.__GESTOR_RECURSOS_DELETE_SERVICE_MOCKS__;
  delete globalThis.__GESTOR_RECURSOS_DELETE_REPOSITORY_MOCKS__;
});

test('deleteRecurso usa o service fino como caminho principal e preserva 404 no escopo efetivo', async () => {
  let receivedArgs = null;
  setServiceMocks({
    deleteRecursoScopedService: async (args) => {
      receivedArgs = JSON.parse(JSON.stringify(args));
      return null;
    },
  });

  const { deleteRecurso } = await importDeleteRecursoController('owner-not-found');
  const req = {
    user: { role: 'diretor' },
    unitScope: { unidadeId: '507f191e810c19729de860ea' },
    params: { id: '507f191e810c19729de860eb' },
    session: {},
  };
  const res = createResCapture();

  await deleteRecurso(req, res);

  assert.deepEqual(receivedArgs, {
    recursoId: '507f191e810c19729de860eb',
    unidadeEfetiva: '507f191e810c19729de860ea',
  });
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, {
    success: false,
    code: 'NOT_FOUND',
    message: 'Recurso não encontrado',
  });
});

test('deleteRecursoScopedService delega a exclusao escopada direto ao repository em escopo unitario e global', async () => {
  const calls = [];
  setRepositoryMocks({
    deleteRecursoByIdRepo: async (args) => {
      calls.push(JSON.parse(JSON.stringify(args)));
      return { _id: args.id };
    },
  });

  const { deleteRecursoScopedService } = await importDeleteRecursoService('service-scope');

  await deleteRecursoScopedService({
    recursoId: '507f191e810c19729de860eb',
    unidadeEfetiva: '507f191e810c19729de860ea',
  });

  await deleteRecursoScopedService({
    recursoId: '507f191e810c19729de860ec',
    unidadeEfetiva: null,
  });

  assert.deepEqual(calls, [
    {
      unitScope: { type: 'unit', unidadeId: '507f191e810c19729de860ea' },
      id: '507f191e810c19729de860eb',
      unidadeId: '507f191e810c19729de860ea',
    },
    {
      unitScope: { type: 'global', unidadeId: null },
      id: '507f191e810c19729de860ec',
      unidadeId: null,
    },
  ]);
});