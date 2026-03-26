import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';

const projectRoot = process.cwd();
const controllerModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/controllers/moduloApiController.js')).href;
const serviceModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/services/modulos/updateModuloById.service.js')).href;
const actualRepositoryModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/repositories/ModuloReadRepository.js')).href;

const serviceMockModuleUrl = 'mock:gestor-modulos-update-service';
const repositoryMockModuleUrl = 'mock:gestor-modulos-update-repositories';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '#modules/gestor/app/services/modulos/updateModuloById.service.js') {
      return { url: serviceMockModuleUrl, shortCircuit: true };
    }

    if (specifier === '#modules/gestor/app/repositories/ModuloReadRepository.js') {
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
          "const getMocks = () => globalThis.__GESTOR_MODULOS_UPDATE_SERVICE_MOCKS__ || {};",
          "export async function updateModuloByIdService(...args) {",
          "  const fn = getMocks().updateModuloByIdService;",
          "  if (typeof fn !== 'function') throw new Error('updateModuloByIdService mock ausente');",
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
          "const getMocks = () => globalThis.__GESTOR_MODULOS_UPDATE_REPOSITORY_MOCKS__ || {};",
          "const resolveImpl = (name) => {",
          "  const fn = getMocks()[name];",
          "  if (typeof fn === 'function') return fn;",
          "  return actual[name];",
          "};",
          "export async function findModuloByIdRepo(...args) {",
          "  return await resolveImpl('findModuloByIdRepo')(...args);",
          "}",
          "export async function findModuloByNomeRepo(...args) {",
          "  return await resolveImpl('findModuloByNomeRepo')(...args);",
          "}",
        ].join('\n'),
      };
    }

    return nextLoad(url, context);
  },
});

function setServiceMocks(overrides = {}) {
  globalThis.__GESTOR_MODULOS_UPDATE_SERVICE_MOCKS__ = { ...overrides };
}

function setRepositoryMocks(overrides = {}) {
  globalThis.__GESTOR_MODULOS_UPDATE_REPOSITORY_MOCKS__ = { ...overrides };
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

async function importAtualizarModulo(tag) {
  return import(`${controllerModuleUrl}?case=${encodeURIComponent(tag)}-${Date.now()}`);
}

async function importUpdateModuloService(tag) {
  return import(`${serviceModuleUrl}?case=${encodeURIComponent(tag)}-${Date.now()}`);
}

test('atualizarModulo usa o service fino como caminho principal e preserva 404 quando o service nao encontra alvo', async () => {
  let receivedArgs = null;
  setServiceMocks({
    updateModuloByIdService: async (args) => {
      receivedArgs = args;
      return { kind: 'not_found' };
    },
  });

  const { atualizarModulo } = await importAtualizarModulo('owner-not-found');
  const req = createReq({
    user: { role: 'admin' },
    params: { id: 'm-ausente' },
    body: {},
  });
  const res = createResCapture();

  await atualizarModulo(req, res);

  assert.deepEqual(receivedArgs, { moduloId: 'm-ausente', changes: {} });
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, {
    success: false,
    code: 'NOT_FOUND',
    message: 'Módulo não encontrado',
  });
});

test('updateModuloByIdService consulta duplicidade apenas quando o nome muda e persiste o documento atualizado', async () => {
  const calls = [];
  let savedSnapshot = null;
  const moduloDoc = {
    _id: 'm-ok',
    nome: 'Modulo Atual',
    descricao: 'Descricao atual',
    status: 'ativo',
    url_base: '/atual',
    async save() {
      savedSnapshot = {
        _id: this._id,
        nome: this.nome,
        descricao: this.descricao,
        status: this.status,
        url_base: this.url_base,
      };
      return this;
    },
  };

  setRepositoryMocks({
    findModuloByIdRepo: async (args) => {
      calls.push({ op: 'findModuloByIdRepo', args });
      return moduloDoc;
    },
    findModuloByNomeRepo: async (args) => {
      calls.push({ op: 'findModuloByNomeRepo', args });
      return null;
    },
  });

  const { updateModuloByIdService } = await importUpdateModuloService('service-success');
  const result = await updateModuloByIdService({
    moduloId: 'm-ok',
    changes: {
      nome: 'Modulo Renovado',
      descricao: 'Descricao nova',
      status: 'inativo',
      url_base: '/novo-modulo',
    },
  });

  assert.deepEqual(result, { kind: 'updated' });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].op, 'findModuloByIdRepo');
  assert.equal(calls[1].op, 'findModuloByNomeRepo');
  assert.equal(calls[0].args.id, 'm-ok');
  assert.equal(calls[1].args.nome, 'Modulo Renovado');
  assert.deepEqual(calls[0].args.unitScope, { type: 'global', unidadeId: null });
  assert.deepEqual(calls[1].args.unitScope, { type: 'global', unidadeId: null });
  assert.deepEqual(savedSnapshot, {
    _id: 'm-ok',
    nome: 'Modulo Renovado',
    descricao: 'Descricao nova',
    status: 'inativo',
    url_base: '/novo-modulo',
  });
});

test('updateModuloByIdService retorna duplicate_name quando o nome novo ja existe', async () => {
  const calls = [];
  const moduloDoc = {
    _id: 'm-dup',
    nome: 'Modulo Atual',
    descricao: 'Descricao atual',
    status: 'ativo',
    url_base: '/atual',
    async save() {
      throw new Error('save nao deveria ser chamado');
    },
  };

  setRepositoryMocks({
    findModuloByIdRepo: async (args) => {
      calls.push({ op: 'findModuloByIdRepo', args });
      return moduloDoc;
    },
    findModuloByNomeRepo: async (args) => {
      calls.push({ op: 'findModuloByNomeRepo', args });
      return { _id: 'm-existente' };
    },
  });

  const { updateModuloByIdService } = await importUpdateModuloService('service-duplicate');
  const result = await updateModuloByIdService({
    moduloId: 'm-dup',
    changes: { nome: 'Modulo Novo' },
  });

  assert.deepEqual(result, { kind: 'duplicate_name' });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].op, 'findModuloByIdRepo');
  assert.equal(calls[1].op, 'findModuloByNomeRepo');
});