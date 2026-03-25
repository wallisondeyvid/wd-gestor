import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { registerHooks } from 'node:module';

const projectRoot = process.cwd();
const controllerModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/controllers/moduloApiController.js')).href;
const actualDbBridgeModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/services/apiDbBridgeService.js')).href;
const dbBridgeMockModuleUrl = 'mock:gestor-modulos-update-api-db-bridge';

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
        'const getMocks = () => globalThis.__GESTOR_MODULOS_UPDATE_DB_MOCKS__ || {};',
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
  globalThis.__GESTOR_MODULOS_UPDATE_DB_MOCKS__ = { ...overrides };
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
    user: overrides.user || null,
    unitScope: overrides.unitScope || null,
    params: overrides.params || {},
    body: overrides.body || {},
    query: overrides.query || {},
    session: overrides.session,
  };
}

async function importAtualizarModulo(tag) {
  return import(`${controllerModuleUrl}?case=${encodeURIComponent(tag)}-${Date.now()}`);
}

test('atualizarModulo responde 400 para usuário sem permissão explícita', async () => {
  setDbMocks({});

  const { atualizarModulo } = await importAtualizarModulo('insufficient-permission');
  const req = createReq({
    user: { role: 'user' },
    params: { id: 'm-1' },
    body: { nome: 'Novo modulo' },
  });
  const res = createResCapture();

  await atualizarModulo(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    code: 'BAD_REQUEST',
    message: 'Permissão insuficiente',
  });
});

test('atualizarModulo responde 404 quando o alvo por id não existe', async () => {
  let receivedId = null;
  setDbMocks({
    findModuloById: async (id) => {
      receivedId = id;
      return null;
    },
  });

  const { atualizarModulo } = await importAtualizarModulo('missing-target');
  const req = createReq({
    user: { role: 'admin' },
    params: { id: 'm-ausente' },
    body: {},
  });
  const res = createResCapture();

  await atualizarModulo(req, res);

  assert.equal(receivedId, 'm-ausente');
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, {
    success: false,
    code: 'NOT_FOUND',
    message: 'Módulo não encontrado',
  });
});

test('atualizarModulo trata nome duplicado com 400 quando o nome muda', async () => {
  let receivedDupName = null;
  setDbMocks({
    findModuloById: async () => ({
      _id: 'm-dup',
      nome: 'Modulo Atual',
      descricao: 'Descricao atual',
      status: 'ativo',
      url_base: '/atual',
    }),
    findModuloByNome: async (nome) => {
      receivedDupName = nome;
      return { _id: 'm-existente' };
    },
  });

  const { atualizarModulo } = await importAtualizarModulo('duplicate-name');
  const req = createReq({
    user: { role: 'admin' },
    params: { id: 'm-dup' },
    body: { nome: 'Modulo Novo' },
  });
  const res = createResCapture();

  await atualizarModulo(req, res);

  assert.equal(receivedDupName, 'Modulo Novo');
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    code: 'BAD_REQUEST',
    message: 'Nome de módulo já em uso',
  });
});

test('atualizarModulo retorna sucesso com updated true no caminho feliz', async () => {
  let savedSnapshot = null;
  setDbMocks({
    findModuloById: async () => ({
      _id: 'm-ok',
      nome: 'Modulo Atual',
      descricao: 'Descricao atual',
      status: 'ativo',
      url_base: '/atual',
    }),
    findModuloByNome: async () => null,
    saveModulo: async (modulo) => {
      savedSnapshot = {
        _id: modulo._id,
        nome: modulo.nome,
        descricao: modulo.descricao,
        status: modulo.status,
        url_base: modulo.url_base,
      };
      return modulo;
    },
  });

  const { atualizarModulo } = await importAtualizarModulo('success');
  const req = createReq({
    user: { role: 'admin' },
    params: { id: 'm-ok' },
    body: {
      nome: 'Modulo Renovado',
      descricao: 'Descricao nova',
      status: 'inativo',
      url_base: '/novo-modulo',
    },
  });
  const res = createResCapture();

  await atualizarModulo(req, res);

  assert.deepEqual(savedSnapshot, {
    _id: 'm-ok',
    nome: 'Modulo Renovado',
    descricao: 'Descricao nova',
    status: 'inativo',
    url_base: '/novo-modulo',
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: {
      updated: true,
    },
  });
});