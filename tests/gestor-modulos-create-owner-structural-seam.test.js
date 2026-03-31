import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/moduloApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

function extractCreateOwnerSnippet(source) {
  const start = source.indexOf('export async function criarModulo(req,res){');
  const end = source.indexOf('export async function atualizarModulo(req,res){', start);

  assert.ok(start >= 0, 'Nao foi possivel localizar o owner real de criarModulo.');
  assert.ok(end >= 0 && end > start, 'Nao foi possivel isolar o corredor de criarModulo.');

  return source.slice(start, end).replace('export async function criarModulo(req,res){', 'async function criarModulo(req,res){');
}

function buildDelegatedCreateSnippet() {
  const original = extractCreateOwnerSnippet(CONTROLLER_SOURCE);
  if (original.includes('createModuloExecutionService({')) {
    return original;
  }

  const inlineBlock = "const dup = await findModuloByNome(nome); if(dup) return badRequest(res,'Módulo já cadastrado'); const modulo = await createModulo({ nome, descricao, status, url_base }); return created(res, modulo._id, { data:{ _id:modulo._id } });";
  const delegatedBlock = [
    'const result = await createModuloExecutionService({ nome, descricao, status, url_base });',
    "if(result?.kind === 'duplicate_name') return badRequest(res,'Módulo já cadastrado');",
    'return created(res, result?.moduloId, { data:{ _id:result?.moduloId } });',
  ].join(' ');

  const replaced = original.replace(inlineBlock, delegatedBlock);
  assert.notEqual(replaced, original, 'Nao foi possivel instalar a seam estrutural de criarModulo em memoria.');
  return replaced;
}

function makeResponseHelpers() {
  return {
    created(res, id, extra = {}) {
      res.status(201);
      res.json({ success: true, id, ...extra });
      return res;
    },
    badRequest(res, message) {
      res.status(400);
      res.json({ success: false, code: 'BAD_REQUEST', message });
      return res;
    },
    serverError(res, error) {
      res.status(500);
      res.json({ success: false, code: 'SERVER_ERROR', message: error?.message || 'Erro interno' });
      return res;
    },
  };
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = JSON.parse(JSON.stringify(payload));
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
  };
}

function toPlainJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildReq(overrides = {}) {
  const { body: bodyOverrides = {}, user: userOverrides, ...restOverrides } = overrides;
  return {
    body: {
      nome: 'Modulo Financeiro',
      descricao: 'Controle financeiro',
      status: 'ativo',
      url_base: '/financeiro',
      ...bodyOverrides,
    },
    user:
      userOverrides === undefined
        ? { role: 'admin' }
        : userOverrides,
    ...restOverrides,
  };
}

function loadCreateOwnerHarness(runtimeOverrides = {}) {
  const snippet = buildDelegatedCreateSnippet();
  const responseHelpers = makeResponseHelpers();
  const callLog = {
    seamCalls: [],
    createCalls: [],
    findDupCalls: [],
    createdCalls: [],
    badRequestCalls: [],
    serverErrorCalls: [],
  };

  const deps = {
    findModuloByNome:
      runtimeOverrides.findModuloByNome ??
      (async (...args) => {
        callLog.findDupCalls.push(args);
        throw new Error('findModuloByNome inline nao deve ser chamado nesta suite estrutural');
      }),
    createModulo:
      runtimeOverrides.createModulo ??
      (async (...args) => {
        callLog.createCalls.push(args);
        throw new Error('createModulo inline nao deve ser chamado nesta suite estrutural');
      }),
    createModuloExecutionService:
      runtimeOverrides.createModuloExecutionService ??
      (async (input) => {
        callLog.seamCalls.push(input);
        return { kind: 'created', moduloId: 'mod-1' };
      }),
    created:
      runtimeOverrides.created ??
      ((res, id, extra = {}) => {
        callLog.createdCalls.push([id, extra]);
        return responseHelpers.created(res, id, extra);
      }),
    badRequest:
      runtimeOverrides.badRequest ??
      ((res, message) => {
        callLog.badRequestCalls.push([message]);
        return responseHelpers.badRequest(res, message);
      }),
    serverError:
      runtimeOverrides.serverError ??
      ((res, error) => {
        callLog.serverErrorCalls.push([error]);
        return responseHelpers.serverError(res, error);
      }),
    console,
  };

  const factoryScript = new vm.Script(`(function (__deps) {
const findModuloByNome = __deps.findModuloByNome;
const createModulo = __deps.createModulo;
const createModuloExecutionService = __deps.createModuloExecutionService;
const created = __deps.created;
const badRequest = __deps.badRequest;
const serverError = __deps.serverError;
${snippet}
return { criarModulo };
})`);

  const factory = factoryScript.runInNewContext({});
  return {
    ...factory(deps),
    callLog,
  };
}

test('criarModulo: ordem estrutural mantem owner antes, seam de create no meio e created no owner depois', async () => {
  const snippet = buildDelegatedCreateSnippet();
  const authIndex = snippet.indexOf("if(!req.user || (req.user.role !== 'master' && req.user.role !== 'admin')) return badRequest(res,'Permissão insuficiente');");
  const requiredNameIndex = snippet.indexOf("if(!nome) return badRequest(res,'Nome é obrigatório');");
  const seamIndex = snippet.indexOf('createModuloExecutionService({ nome, descricao, status, url_base });');
  const duplicateHttpIndex = snippet.indexOf("if(result?.kind === 'duplicate_name') return badRequest(res,'Módulo já cadastrado');");
  const createdIndex = snippet.indexOf('return created(res, result?.moduloId, { data:{ _id:result?.moduloId } });');

  assert.ok(authIndex >= 0, 'Owner precisa preservar a autorizacao admin/master.');
  assert.ok(requiredNameIndex >= 0, 'Owner precisa preservar a validacao de nome obrigatorio.');
  assert.ok(seamIndex >= 0, 'A seam futura de create precisa existir no meio do fluxo em memoria.');
  assert.ok(duplicateHttpIndex >= 0, 'Owner precisa preservar a traducao HTTP de duplicidade.');
  assert.ok(createdIndex >= 0, 'Owner precisa preservar a resposta HTTP final de created.');
  assert.ok(authIndex < seamIndex, 'A autorizacao precisa acontecer antes da seam.');
  assert.ok(requiredNameIndex < seamIndex, 'A validacao de nome precisa acontecer antes da seam.');
  assert.ok(seamIndex < duplicateHttpIndex, 'A traducao HTTP da duplicidade precisa permanecer no owner apos a seam.');
  assert.ok(duplicateHttpIndex < createdIndex, 'A resposta created precisa ficar depois da traducao HTTP de duplicidade.');

  const callOrder = [];
  const { criarModulo, callLog } = loadCreateOwnerHarness({
    createModuloExecutionService: async (input) => {
      callOrder.push('seam');
      callLog.seamCalls.push(input);
      return { kind: 'created', moduloId: 'mod-created' };
    },
    created: (res, id, extra = {}) => {
      callOrder.push('created');
      callLog.createdCalls.push([id, extra]);
      return makeResponseHelpers().created(res, id, extra);
    },
  });

  const req = buildReq();
  const res = makeRes();

  await criarModulo(req, res);

  assert.deepEqual(callOrder, ['seam', 'created']);
  assert.equal(callLog.findDupCalls.length, 0);
  assert.equal(callLog.createCalls.length, 0);
});

test('criarModulo: sem permissao o owner responde 400 antes da seam', async () => {
  const { criarModulo, callLog } = loadCreateOwnerHarness();
  const req = buildReq({ user: { role: 'gestor' } });
  const res = makeRes();

  await criarModulo(req, res);

  assert.equal(callLog.seamCalls.length, 0);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    code: 'BAD_REQUEST',
    message: 'Permissão insuficiente',
  });
});

test('criarModulo: sem nome o owner responde 400 antes da seam', async () => {
  const { criarModulo, callLog } = loadCreateOwnerHarness();
  const req = buildReq({ body: { nome: '' } });
  const res = makeRes();

  await criarModulo(req, res);

  assert.equal(callLog.seamCalls.length, 0);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    code: 'BAD_REQUEST',
    message: 'Nome é obrigatório',
  });
});

test('criarModulo: a seam recebe apenas o nucleo canonizado de criacao', async () => {
  const { criarModulo, callLog } = loadCreateOwnerHarness({
    createModuloExecutionService: async (input) => {
      callLog.seamCalls.push(input);
      return { kind: 'created', moduloId: 'mod-core' };
    },
  });

  const req = buildReq({
    body: {
      nome: 'Modulo Estoque',
      descricao: 'Movimentacoes',
      status: 'inativo',
      url_base: '/estoque',
      ignorado: 'nao-deve-ir',
    },
  });
  const res = makeRes();

  await criarModulo(req, res);

  assert.equal(callLog.seamCalls.length, 1);
  assert.deepEqual(toPlainJson(callLog.seamCalls[0]), {
    nome: 'Modulo Estoque',
    descricao: 'Movimentacoes',
    status: 'inativo',
    url_base: '/estoque',
  });
  assert.equal(callLog.findDupCalls.length, 0);
  assert.equal(callLog.createCalls.length, 0);
});

test('criarModulo: duplicidade vinda da seam vira 400 no owner', async () => {
  const { criarModulo, callLog } = loadCreateOwnerHarness({
    createModuloExecutionService: async (input) => {
      callLog.seamCalls.push(input);
      return { kind: 'duplicate_name' };
    },
  });

  const req = buildReq();
  const res = makeRes();

  await criarModulo(req, res);

  assert.equal(callLog.seamCalls.length, 1);
  assert.equal(callLog.createdCalls.length, 0);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    code: 'BAD_REQUEST',
    message: 'Módulo já cadastrado',
  });
});

test('criarModulo: caminho feliz preserva created no owner com id retornado pela seam', async () => {
  const { criarModulo, callLog } = loadCreateOwnerHarness({
    createModuloExecutionService: async (input) => {
      callLog.seamCalls.push(input);
      return { kind: 'created', moduloId: '507f191e810c19729de860ea' };
    },
  });

  const req = buildReq();
  const res = makeRes();

  await criarModulo(req, res);

  assert.equal(callLog.seamCalls.length, 1);
  assert.equal(callLog.createdCalls.length, 1);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body, {
    success: true,
    id: '507f191e810c19729de860ea',
    data: { _id: '507f191e810c19729de860ea' },
  });
});

test('criarModulo: erro externo continua traduzido pelo owner depois da seam', async () => {
  const externalError = new Error('falha externa');
  const { criarModulo, callLog } = loadCreateOwnerHarness({
    createModuloExecutionService: async (input) => {
      callLog.seamCalls.push(input);
      throw externalError;
    },
  });

  const req = buildReq();
  const res = makeRes();

  await criarModulo(req, res);

  assert.equal(callLog.seamCalls.length, 1);
  assert.equal(callLog.serverErrorCalls.length, 1);
  assert.equal(callLog.createdCalls.length, 0);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, {
    success: false,
    code: 'SERVER_ERROR',
    message: 'falha externa',
  });
});