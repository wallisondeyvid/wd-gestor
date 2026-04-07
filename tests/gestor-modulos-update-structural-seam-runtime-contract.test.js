import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';

const projectRoot = process.cwd();
const controllerModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/controllers/moduloApiController.js')).href;
const serviceModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/services/modulos/updateModuloById.service.js')).href;
const actualBridgeModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/services/apiDbBridgeService.js')).href;

const serviceMockModuleUrl = 'mock:gestor-modulos-update-service';
const bridgeMockModuleUrl = 'mock:gestor-modulos-update-bridge';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '#modules/gestor/app/services/modulos/updateModuloById.service.js') {
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
          "const getMocks = () => globalThis.__GESTOR_MODULOS_UPDATE_SERVICE_MOCKS__ || {};",
          "export async function updateModuloByIdService(...args) {",
          "  const fn = getMocks().updateModuloByIdService;",
          "  if (typeof fn !== 'function') throw new Error('updateModuloByIdService mock ausente');",
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
          "const getMocks = () => globalThis.__GESTOR_MODULOS_UPDATE_BRIDGE_MOCKS__ || {};",
          "const resolveImpl = (name) => {",
          "  const fn = getMocks()[name];",
          "  if (typeof fn === 'function') return fn;",
          "  return actual[name];",
          "};",
          "export async function findModuloById(...args) {",
          "  return await resolveImpl('findModuloById')(...args);",
          "}",
          "export async function findModuloByNome(...args) {",
          "  return await resolveImpl('findModuloByNome')(...args);",
          "}",
          "export async function saveModulo(...args) {",
          "  return await resolveImpl('saveModulo')(...args);",
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

function setBridgeMocks(overrides = {}) {
  globalThis.__GESTOR_MODULOS_UPDATE_BRIDGE_MOCKS__ = { ...overrides };
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

  setBridgeMocks({
    findModuloById: async (args) => {
      calls.push({ op: 'findModuloByIdRepo', args });
      return moduloDoc;
    },
    findModuloByNome: async (args) => {
      calls.push({ op: 'findModuloByNomeRepo', args });
      return null;
    },
    saveModulo: async (doc) => doc.save(),
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
  assert.equal(calls[0].args, 'm-ok');
  assert.equal(calls[1].args, 'Modulo Renovado');
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

  setBridgeMocks({
    findModuloById: async (args) => {
      calls.push({ op: 'findModuloByIdRepo', args });
      return moduloDoc;
    },
    findModuloByNome: async (args) => {
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