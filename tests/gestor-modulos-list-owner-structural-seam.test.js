import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/moduloApiController.js');
const SERVICE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/services/modulos/listModulosOwner.service.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');
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
    session: { gestorAuthContext: { active_unidade_id: 'u-session' } },
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

test('listModulosOwnerService preserva os ramos master/global, contextual e fallback vazio', async () => {
  const globalCalls = [];
  const unidadeCalls = [];
  const scopeCalls = [];
  const normalizeModuloList = buildFunction(SERVICE_SOURCE, 'function normalizeModuloList', {});

  const listModulosOwnerService = buildFunction(SERVICE_SOURCE, 'export async function listModulosOwnerService', {
    GLOBAL_SCOPE: { type: 'global', unidadeId: null },
    createUnitScope: (input) => {
      scopeCalls.push(input);
      return { type: input?.unidadeId ? 'unit' : 'global', unidadeId: input?.unidadeId || null };
    },
    findAllModulosBaseLeanRepo: async (input) => {
      globalCalls.push(input);
      return [{ _id: 'm-global', nome: 'Modulo Global', descricao: 'd', status: 'ativo', url_base: '/gestor' }];
    },
    findUnidadeByIdWithModulosAcessiveisLeanRepo: async (input) => {
      unidadeCalls.push(input);
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
  assert.equal(globalCalls[0].unitScope.type, 'global');
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
  assert.equal(unidadeCalls[0].unidadeId, 'u-123');
  assert.equal(unidadeCalls[0].unitScope.type, 'unit');
  assert.equal(unidadeCalls[0].unitScope.unidadeId, 'u-123');
  assert.equal(scopeCalls.length, 1);
  assert.equal(scopeCalls[0].unidadeId, 'u-123');
});