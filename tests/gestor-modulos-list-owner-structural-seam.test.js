import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/moduloApiController.js');
const PAGES_CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/views/pagesController.js');
const REQUIRE_UNIT_SCOPE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/middlewares/requireUnitScope.js');
const SERVICE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/services/modulos/listModulosOwner.service.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');
const PAGES_CONTROLLER_SOURCE = fs.readFileSync(PAGES_CONTROLLER_PATH, 'utf8');
const REQUIRE_UNIT_SCOPE_SOURCE = fs.readFileSync(REQUIRE_UNIT_SCOPE_PATH, 'utf8');
const SERVICE_SOURCE = fs.readFileSync(SERVICE_PATH, 'utf8');

function extractFunction(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `Nao encontrou assinatura: ${signature}`);

  const paramsEnd = source.indexOf(')', start);
  assert.ok(paramsEnd >= 0, `Nao encontrou fechamento de parametros para: ${signature}`);

  const braceStart = source.indexOf('{', paramsEnd);
  assert.ok(braceStart >= 0, `Nao encontrou bloco para: ${signature}`);

  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1).replace(/^export\s+/, '');
      }
    }
  }

  throw new Error(`Nao conseguiu extrair funcao: ${signature}`);
}

function buildFunction(source, signature, context = {}) {
  const functionSource = extractFunction(source, signature);
  const script = new vm.Script(`(${functionSource})`);
  return script.runInNewContext(context);
}

function createApiRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function createPageRes() {
  return {
    statusCode: 200,
    view: undefined,
    locals: undefined,
    sent: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    render(view, locals) {
      this.view = view;
      this.locals = locals;
      return this;
    },
    send(payload) {
      this.sent = payload;
      return this;
    },
  };
}

test('listarModulos delega ao service owner e preserva o caminho feliz com ok(res, result.modulos)', async () => {
  const calls = [];
  const listModulosOwnerService = async (input) => {
    calls.push(input);
    return {
      kind: 'ok',
      modulos: [{ _id: 'm-1', nome: 'Gestor' }],
    };
  };

  const resolveActiveUnitId = buildFunction(CONTROLLER_SOURCE, 'function resolveActiveUnitId', {});
  const listarModulos = buildFunction(CONTROLLER_SOURCE, 'export async function listarModulos', {
    listModulosOwnerService,
    resolveActiveUnitId,
    ok: (res, data = {}, extra = {}) => res.status(200).json({ success: true, ...extra, data }),
    serverError: (res, error, extra = {}) => res.status(500).json({ success: false, code: 'SERVER_ERROR', message: error?.message || 'Erro interno', ...extra }),
    console,
  });

  const req = {
    user: { role: 'gestor', unidade_id: 'u-user' },
    session: { gestorAuthContext: { source: 'auth-context-v1', active_unidade_id: 'u-session' } },
  };
  const res = createApiRes();

  await listarModulos(req, res);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].userRole, 'gestor');
  assert.equal(calls[0].activeUnitId, 'u-session');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(Array.isArray(res.body.data), true);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0]._id, 'm-1');
  assert.equal(res.body.data[0].nome, 'Gestor');
});

test('resolveActiveUnitId nao recai para req.user.unidade_id quando o auth-context v1 existe sem unidade ativa canonica', () => {
  const resolveActiveUnitId = buildFunction(CONTROLLER_SOURCE, 'function resolveActiveUnitId', {});

  const req = {
    user: { role: 'gestor', unidade_id: 'u-legado-stale' },
    session: { gestorAuthContext: { source: 'auth-context-v1', active_unidade_id: '' } },
  };

  assert.equal(resolveActiveUnitId(req), '');
});

test('listModulosOwnerService preserva os ramos master/global, contextual e fallback vazio', async () => {
  const globalCalls = [];
  const unidadeCalls = [];
  const normalizeModuloList = buildFunction(SERVICE_SOURCE, 'function normalizeModuloList', {});

  const listModulosOwnerService = buildFunction(SERVICE_SOURCE, 'export async function listModulosOwnerService', {
    findAllModulosBaseLean: async (...args) => {
      globalCalls.push(args);
      return [{ _id: 'm-global', nome: 'Modulo Global', descricao: 'd', status: 'ativo', url_base: '/gestor' }];
    },
    findUnidadeByIdWithModulosAcessiveisLean: async (...args) => {
      unidadeCalls.push(args);
      return {
        modulosAcessiveis: [
          { _id: 'm-unit', nome: 'Modulo Unidade', descricao: 'du', status: 'ativo', url_base: '/unidade' },
        ],
      };
    },
    normalizeModuloList,
  });

  let result = await listModulosOwnerService({ userRole: 'master', activeUnitId: 'u-ignorado' });
  assert.equal(result.kind, 'ok');
  assert.equal(result.modulos.length, 1);
  assert.equal(result.modulos[0]._id, 'm-global');
  assert.equal(globalCalls.length, 1);
  assert.equal(globalCalls[0].length, 0);
  assert.equal(unidadeCalls.length, 0);

  result = await listModulosOwnerService({ userRole: 'gestor', activeUnitId: '' });
  assert.equal(result.kind, 'ok');
  assert.equal(Array.isArray(result.modulos), true);
  assert.equal(result.modulos.length, 0);
  assert.equal(unidadeCalls.length, 0);

  result = await listModulosOwnerService({ userRole: 'gestor', activeUnitId: 'u-123' });
  assert.equal(result.kind, 'ok');
  assert.equal(result.modulos.length, 1);
  assert.equal(result.modulos[0]._id, 'm-unit');
  assert.equal(result.modulos[0].nome, 'Modulo Unidade');
  assert.equal(unidadeCalls.length, 1);
  assert.equal(unidadeCalls[0].length, 1);
  assert.equal(unidadeCalls[0][0], 'u-123');
});

test('listModulosOwnerService nao aceita unidade legada concorrente quando o auth-context v1 esta ativo', async () => {
  const unidadeCalls = [];
  const normalizeModuloList = buildFunction(SERVICE_SOURCE, 'function normalizeModuloList', {});

  const listModulosOwnerService = buildFunction(SERVICE_SOURCE, 'export async function listModulosOwnerService', {
    findAllModulosBaseLean: async () => [],
    findUnidadeByIdWithModulosAcessiveisLean: async (...args) => {
      unidadeCalls.push(args);
      return { modulosAcessiveis: [] };
    },
    normalizeModuloList,
  });

  const result = await listModulosOwnerService({
    userRole: 'gestor',
    activeUnitId: 'u-legado-stale',
    authContext: { source: 'auth-context-v1', active_unidade_id: '' },
    requestUser: { unidade_id: 'u-request-legado' },
  });

  assert.equal(result.kind, 'ok');
  assert.equal(Array.isArray(result.modulos), true);
  assert.equal(result.modulos.length, 0);
  assert.equal(unidadeCalls.length, 0);
});

test('paginaModulos delega ao owner service e preserva a borda HTML atual para usuario privilegiado', async () => {
  const calls = [];
  const normalizePageRole = buildFunction(PAGES_CONTROLLER_SOURCE, 'function normalizeRole', {});
  const isMasterLike = buildFunction(PAGES_CONTROLLER_SOURCE, 'function isMasterLike', {
    normalizeRole: normalizePageRole,
  });
  const normalizeScopeRole = buildFunction(REQUIRE_UNIT_SCOPE_SOURCE, 'function normalizeRole', {});
  const isPrivilegedRole = buildFunction(REQUIRE_UNIT_SCOPE_SOURCE, 'function isPrivilegedRole', {
    normalizeRole: normalizeScopeRole,
  });
  const isPrivilegedGestorContext = buildFunction(REQUIRE_UNIT_SCOPE_SOURCE, 'export function isPrivilegedGestorContext', {
    isPrivilegedRole,
  });
  const isPrivilegedGestorUser = buildFunction(PAGES_CONTROLLER_SOURCE, 'function isPrivilegedGestorUser', {
    isPrivilegedGestorContext,
  });
  const paginaModulos = buildFunction(PAGES_CONTROLLER_SOURCE, 'export async function paginaModulos', {
    isDbOff: () => false,
    stubCtx: () => ({ modulos: [] }),
    isMasterLike,
    isPrivilegedGestorUser,
    listModulosOwnerService: async (input) => {
      calls.push(input);
      return { kind: 'ok', modulos: [{ _id: 'm-html-1', nome: 'HTML Gestor' }] };
    },
  });

  const req = {
    user: { isMaster: false, role: 'admin', email: 'admin@example.com' },
    unitScope: { unidadeId: 'u-html-context' },
    session: { gestorAuthContext: { source: 'auth-context-v1', active_unidade_id: 'u-html-context' } },
  };
  const res = createPageRes();

  await paginaModulos(req, res);

  assert.equal(calls.length, 1);
  assert.equal(JSON.stringify(calls[0]), JSON.stringify({
    userRole: 'admin',
    activeUnitId: 'u-html-context',
    authContext: { source: 'auth-context-v1', active_unidade_id: 'u-html-context' },
    requestUser: req.user,
  }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.view, 'slots-modulos');
  assert.equal(Array.isArray(res.locals?.modulos), true);
  assert.equal(res.locals.modulos.length, 1);
  assert.equal(res.locals.modulos[0]._id, 'm-html-1');
  assert.equal(res.locals.modulos[0].nome, 'HTML Gestor');
  assert.equal(res.locals.user, req.user);
});