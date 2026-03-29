import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/unidadeApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

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

function buildFunction(functionSource, context = {}) {
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

function buildDeleteUnidade(context = {}) {
  const functionSource = extractExportedAsyncFunction(CONTROLLER_SOURCE, 'deleteUnidade');
  return buildFunction(functionSource, context);
}

test('deleteUnidade: owner real preserva gate, lookup, autorizacao, politica inline e delega a execucao final apenas depois disso', async () => {
  const callOrder = [];
  let lookupArgs = null;
  let accessArgs = null;
  let executionArgs = null;

  const deleteUnidade = buildDeleteUnidade({
    findUnidadeDeleteCandidateService: async (input) => {
      callOrder.push('lookup');
      lookupArgs = input;
      return { _id: 'u-ok', is_principal: false };
    },
    ensureCanAccessUnidade: async (req, unidadeId) => {
      callOrder.push('authorize');
      accessArgs = { req, unidadeId };
      return true;
    },
    deleteUnidadeExecutionService: async (input) => {
      callOrder.push('execute');
      executionArgs = input;
    },
    ok: (res, data) => {
      callOrder.push('ok');
      return res.status(200).json({ success: true, data });
    },
    badRequest: (res, message) => res.status(400).json({ success: false, code: 'BAD_REQUEST', message }),
    notFound: (res, message) => res.status(404).json({ success: false, code: 'NOT_FOUND', message }),
    serverError: (res, error) => res.status(500).json({ success: false, code: 'SERVER_ERROR', message: error?.message }),
    console,
  });

  const req = {
    params: { id: 'u-ok' },
    user: { role: 'admin', isMaster: false },
  };
  const res = createApiRes();

  await deleteUnidade(req, res);

  assert.equal(JSON.stringify(lookupArgs), JSON.stringify({ unidadeId: 'u-ok' }));
  assert.equal(accessArgs.req, req);
  assert.equal(accessArgs.unidadeId, 'u-ok');
  assert.equal(JSON.stringify(executionArgs), JSON.stringify({ unidadeId: 'u-ok' }));
  assert.equal(res.statusCode, 200);
  assert.equal(
    JSON.stringify(res.body),
    JSON.stringify({
      success: true,
      data: { deleted: true, id: 'u-ok' },
    })
  );
  assert.deepEqual(callOrder, ['lookup', 'authorize', 'execute', 'ok']);
});

test('deleteUnidade: owner real preserva gate inicial de papel sem chamar lookup nem execucao final', async () => {
  let lookupCalled = false;
  let executionCalled = false;

  const deleteUnidade = buildDeleteUnidade({
    findUnidadeDeleteCandidateService: async () => {
      lookupCalled = true;
      throw new Error('nao deve fazer lookup quando o papel ja falha');
    },
    ensureCanAccessUnidade: async () => true,
    deleteUnidadeExecutionService: async () => {
      executionCalled = true;
      throw new Error('nao deve executar exclusao quando o papel ja falha');
    },
    ok: (res, data) => res.status(200).json({ success: true, data }),
    badRequest: (res, message) => res.status(400).json({ success: false, code: 'BAD_REQUEST', message }),
    notFound: (res, message) => res.status(404).json({ success: false, code: 'NOT_FOUND', message }),
    serverError: (res, error) => res.status(500).json({ success: false, code: 'SERVER_ERROR', message: error?.message }),
    console,
  });

  const res = createApiRes();
  await deleteUnidade({ params: { id: 'u-role' }, user: { role: 'user', isMaster: false } }, res);

  assert.equal(lookupCalled, false);
  assert.equal(executionCalled, false);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    code: 'BAD_REQUEST',
    message: 'Você não tem permissão para excluir unidades.',
  });
});

test('deleteUnidade: owner real preserva notFound e nao avanca para autorizacao nem execucao final', async () => {
  let authorizeCalled = false;
  let executionCalled = false;

  const deleteUnidade = buildDeleteUnidade({
    findUnidadeDeleteCandidateService: async () => null,
    ensureCanAccessUnidade: async () => {
      authorizeCalled = true;
      return true;
    },
    deleteUnidadeExecutionService: async () => {
      executionCalled = true;
    },
    ok: (res, data) => res.status(200).json({ success: true, data }),
    badRequest: (res, message) => res.status(400).json({ success: false, code: 'BAD_REQUEST', message }),
    notFound: (res, message) => res.status(404).json({ success: false, code: 'NOT_FOUND', message }),
    serverError: (res, error) => res.status(500).json({ success: false, code: 'SERVER_ERROR', message: error?.message }),
    console,
  });

  const res = createApiRes();
  await deleteUnidade({ params: { id: 'u-ausente' }, user: { role: 'admin', isMaster: false } }, res);

  assert.equal(authorizeCalled, false);
  assert.equal(executionCalled, false);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, {
    success: false,
    code: 'NOT_FOUND',
    message: 'Unidade não encontrada',
  });
});

test('deleteUnidade: owner real preserva autorizacao contextual antes da politica principal e da execucao final', async () => {
  let executionCalled = false;

  const deleteUnidade = buildDeleteUnidade({
    findUnidadeDeleteCandidateService: async () => ({ _id: 'u-bloqueada', is_principal: false }),
    ensureCanAccessUnidade: async () => false,
    deleteUnidadeExecutionService: async () => {
      executionCalled = true;
    },
    ok: (res, data) => res.status(200).json({ success: true, data }),
    badRequest: (res, message) => res.status(400).json({ success: false, code: 'BAD_REQUEST', message }),
    notFound: (res, message) => res.status(404).json({ success: false, code: 'NOT_FOUND', message }),
    serverError: (res, error) => res.status(500).json({ success: false, code: 'SERVER_ERROR', message: error?.message }),
    console,
  });

  const res = createApiRes();
  await deleteUnidade({ params: { id: 'u-bloqueada' }, user: { role: 'admin', isMaster: false } }, res);

  assert.equal(executionCalled, false);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    code: 'BAD_REQUEST',
    message: 'Acesso à unidade não autorizado.',
  });
});

test('deleteUnidade: owner real preserva politica de unidade principal para diretor antes da execucao final', async () => {
  let executionCalled = false;

  const deleteUnidade = buildDeleteUnidade({
    findUnidadeDeleteCandidateService: async () => ({ _id: 'u-principal', is_principal: true }),
    ensureCanAccessUnidade: async () => true,
    deleteUnidadeExecutionService: async () => {
      executionCalled = true;
    },
    ok: (res, data) => res.status(200).json({ success: true, data }),
    badRequest: (res, message) => res.status(400).json({ success: false, code: 'BAD_REQUEST', message }),
    notFound: (res, message) => res.status(404).json({ success: false, code: 'NOT_FOUND', message }),
    serverError: (res, error) => res.status(500).json({ success: false, code: 'SERVER_ERROR', message: error?.message }),
    console,
  });

  const res = createApiRes();
  await deleteUnidade({ params: { id: 'u-principal' }, user: { role: 'diretor', isMaster: false } }, res);

  assert.equal(executionCalled, false);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    code: 'BAD_REQUEST',
    message: 'Diretores não podem excluir unidades principais.',
  });
});

test('deleteUnidade: owner real preserva politica de master para unidade principal antes da execucao final', async () => {
  let executionCalled = false;

  const deleteUnidade = buildDeleteUnidade({
    findUnidadeDeleteCandidateService: async () => ({ _id: 'u-principal', is_principal: true }),
    ensureCanAccessUnidade: async () => true,
    deleteUnidadeExecutionService: async () => {
      executionCalled = true;
    },
    ok: (res, data) => res.status(200).json({ success: true, data }),
    badRequest: (res, message) => res.status(400).json({ success: false, code: 'BAD_REQUEST', message }),
    notFound: (res, message) => res.status(404).json({ success: false, code: 'NOT_FOUND', message }),
    serverError: (res, error) => res.status(500).json({ success: false, code: 'SERVER_ERROR', message: error?.message }),
    console,
  });

  const res = createApiRes();
  await deleteUnidade({ params: { id: 'u-principal' }, user: { role: 'admin', isMaster: false } }, res);

  assert.equal(executionCalled, false);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    code: 'BAD_REQUEST',
    message: 'Apenas Master pode excluir unidades principais',
  });
});

test('deleteUnidade: owner real preserva tratamento de erro externo quando a execucao final delegada falha', async () => {
  const deleteUnidade = buildDeleteUnidade({
    findUnidadeDeleteCandidateService: async () => ({ _id: 'u-error', is_principal: false }),
    ensureCanAccessUnidade: async () => true,
    deleteUnidadeExecutionService: async () => {
      throw new Error('forced-delete-execution-failure');
    },
    ok: (res, data) => res.status(200).json({ success: true, data }),
    badRequest: (res, message) => res.status(400).json({ success: false, code: 'BAD_REQUEST', message }),
    notFound: (res, message) => res.status(404).json({ success: false, code: 'NOT_FOUND', message }),
    serverError: (res, error) => res.status(500).json({ success: false, code: 'SERVER_ERROR', message: error?.message }),
    console,
  });

  const res = createApiRes();
  await deleteUnidade({ params: { id: 'u-error' }, user: { role: 'admin', isMaster: true } }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, {
    success: false,
    code: 'SERVER_ERROR',
    message: 'forced-delete-execution-failure',
  });
});