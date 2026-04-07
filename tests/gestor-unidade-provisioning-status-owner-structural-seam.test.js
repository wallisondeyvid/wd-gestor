import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/unidadeApiController.js');
const SERVICE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/services/unidades/getUnidadeProvisioningStatusOwner.service.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');
const SERVICE_SOURCE = fs.readFileSync(SERVICE_PATH, 'utf8');

function extractExportedAsyncFunction(source, functionName) {
  const signature = `export async function ${functionName}`;
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `Nao encontrou ${functionName}`);

  const paramsEnd = source.indexOf(')', start);
  assert.ok(paramsEnd >= 0, `Nao encontrou fechamento de parametros de ${functionName}`);

  const braceStart = source.indexOf('{', paramsEnd);
  assert.ok(braceStart >= 0, `Nao encontrou bloco de ${functionName}`);

  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1).replace(/^export\s+/, '');
    }
  }

  throw new Error(`Nao conseguiu extrair ${functionName}`);
}

function buildFunction(source, functionName, context = {}) {
  const functionSource = extractExportedAsyncFunction(source, functionName);
  const script = new vm.Script(`(${functionSource})`);
  const runtimeContext = {
    ...context,
    createUnidadePolicyContextCore: context.createUnidadePolicyContextCore || (() => ({
      ensureCanAccessUnidade: context.ensureCanAccessUnidade,
    })),
  };
  return script.runInNewContext(runtimeContext);
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

test('getUnidadeProvisioningStatus delega ao service owner e preserva os ramos semanticos do controller', async () => {
  const calls = [];
  let nextResult = { kind: 'ok', snapshot: { ready: true } };

  const getUnidadeProvisioningStatusOwnerService = async (input) => {
    calls.push(input);
    return nextResult;
  };

  const getUnidadeProvisioningStatus = buildFunction(CONTROLLER_SOURCE, 'getUnidadeProvisioningStatus', {
    getUnidadeProvisioningStatusOwnerService,
    ensureCanAccessUnidade: async () => true,
    findUnidadeById: async () => ({ _id: 'u-1' }),
    inspectUnitProvisioning: async () => ({ ready: true }),
    normalizeProvisioningSnapshotResponse: (snapshot) => ({ normalized: snapshot }),
    ok: (res, data = {}, extra = {}) => res.status(200).json({ success: true, ...extra, data }),
    badRequest: (res, message = 'Bad request', extra = {}) => res.status(400).json({ success: false, code: 'BAD_REQUEST', message, ...extra }),
    notFound: (res, message = 'Not found', extra = {}) => res.status(404).json({ success: false, code: 'NOT_FOUND', message, ...extra }),
    serverError: (res, error, extra = {}) => res.status(500).json({ success: false, code: 'SERVER_ERROR', message: error?.message || 'Erro interno', ...extra }),
    console,
  });

  const req = { params: { id: 'u-1' } };

  nextResult = { kind: 'bad_request', message: 'ID da unidade e obrigatorio.' };
  let res = createApiRes();
  await getUnidadeProvisioningStatus(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'ID da unidade e obrigatorio.');

  nextResult = { kind: 'not_found', message: 'Unidade nao encontrada' };
  res = createApiRes();
  await getUnidadeProvisioningStatus(req, res);
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, 'Unidade nao encontrada');

  nextResult = { kind: 'forbidden', message: 'Acesso a unidade nao autorizado' };
  res = createApiRes();
  await getUnidadeProvisioningStatus(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'Acesso a unidade nao autorizado');

  nextResult = { kind: 'ok', snapshot: { ready: true, moduleStatuses: [] } };
  res = createApiRes();
  await getUnidadeProvisioningStatus(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: {
      normalized: { ready: true, moduleStatuses: [] },
    },
  });

  assert.equal(calls.length, 4, 'o controller deve continuar delegando ao service owner em todos os ramos');
  assert.equal(calls[0].unidadeId, 'u-1', 'o controller deve repassar unidadeId normalizado ao service owner');
  assert.equal(typeof calls[0].canAccessUnidade, 'function', 'o controller deve repassar apenas o contexto minimo de autorizacao ao service owner');
});

test('getUnidadeProvisioningStatusOwnerService preserva o shape semantico tipado do fluxo read-only', async () => {
  let unidadeResult = null;
  let inspectResult = null;
  const inspectCalls = [];

  const getUnidadeProvisioningStatusOwnerService = buildFunction(SERVICE_SOURCE, 'getUnidadeProvisioningStatusOwnerService', {
    findUnidadeById: async () => unidadeResult,
    inspectUnitProvisioning: async (input) => {
      inspectCalls.push(input);
      return inspectResult;
    },
  });

  let result = await getUnidadeProvisioningStatusOwnerService({ unidadeId: '' });
  assert.equal(result.kind, 'bad_request');
  assert.equal(result.message, 'ID da unidade e obrigatorio.');

  unidadeResult = null;
  result = await getUnidadeProvisioningStatusOwnerService({ unidadeId: 'u-ausente' });
  assert.equal(result.kind, 'not_found');
  assert.equal(result.message, 'Unidade nao encontrada');

  unidadeResult = { _id: 'u-1' };
  result = await getUnidadeProvisioningStatusOwnerService({
    unidadeId: 'u-1',
    canAccessUnidade: async () => false,
  });
  assert.equal(result.kind, 'forbidden');
  assert.equal(result.message, 'Acesso a unidade nao autorizado');

  inspectResult = { ready: true, moduleStatuses: [] };
  result = await getUnidadeProvisioningStatusOwnerService({
    unidadeId: 'u-1',
    canAccessUnidade: async () => true,
  });
  assert.equal(result.kind, 'ok');
  assert.equal(result.snapshot.ready, true);
  assert.deepEqual(result.snapshot.moduleStatuses, []);
  assert.equal(inspectCalls.length, 1, 'o service owner deve chamar inspectUnitProvisioning uma vez no caminho feliz');
  assert.equal(inspectCalls[0].unidadeId, 'u-1', 'o service owner deve repassar apenas unidadeId para inspectUnitProvisioning');
});