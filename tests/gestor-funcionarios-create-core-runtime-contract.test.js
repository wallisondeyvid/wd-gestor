import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';

import gestorApp from '../src/modules/gestor/app/gestor-app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const controllerPath = path.resolve(__dirname, '../src/modules/gestor/app/controllers/funcionarioApiController.js');

function makeResponseHelpers() {
  function send(res, status, payload) {
    res.status(status);
    res.json(payload);
    return res;
  }

  return {
    ok(res, payload = {}) {
      return send(res, 200, { success: true, ...payload });
    },
    notFound(res, message = 'Não encontrado') {
      return send(res, 404, { success: false, message, error: message, code: 'NOT_FOUND' });
    },
    serverError(res) {
      return send(res, 500, { success: false, message: 'Erro interno', error: 'Erro interno', code: 'SERVER_ERROR' });
    },
    badRequest(res, message = 'Requisição inválida', extra = {}) {
      return send(res, 400, { success: false, message, error: message, code: 'BAD_REQUEST', ...extra });
    },
    created(res, id, extra = {}) {
      return send(res, 201, { success: true, created: true, id, ...extra });
    },
    missingFields(res, campos = []) {
      return send(res, 400, { success: false, message: 'Campos obrigatórios ausentes', error: 'Campos obrigatórios ausentes', code: 'BAD_REQUEST', campos });
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
      this.body = payload;
      return this;
    },
  };
}

function computePisCheckDigit(firstTenDigits) {
  const pesos = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const soma = firstTenDigits
    .split('')
    .reduce((acc, digit, index) => acc + (Number(digit) * pesos[index]), 0);
  const resto = soma % 11;
  return String(resto < 2 ? 0 : 11 - resto);
}

function buildValidPis(seed = '1234567890') {
  const firstTenDigits = String(seed).replace(/\D/g, '').padEnd(10, '0').slice(0, 10);
  return `${firstTenDigits}${computePisCheckDigit(firstTenDigits)}`;
}

function buildBody(overrides = {}) {
  return {
    unidade_id: 'unit-core-001',
    nome: '  Maria Core  ',
    nome_social: '  Maria Social  ',
    rg: 'RG-123',
    rg_orgao: 'SSP',
    cpf: '12345678901',
    pis: buildValidPis('1234567890'),
    data_nascimento: '1991-04-02',
    sexo: 'F',
    endereco: {
      cep: '01001000',
      logradouro: 'Rua Alfa',
      numero: '42',
      bairro: 'Centro',
      estado: 'SP',
      cidade: 'Sao Paulo',
    },
    telefone: '11999990000',
    telefone2: '1133334444',
    email: '  maria.core@example.com  ',
    observacoes: '  observacao focal  ',
    cargo: 'Analista',
    departamento: 'Operacoes',
    regime_contratacao: 'CLT',
    regime_jornada: '44H',
    carga_semanal: '44',
    salario_base: '1.234,56',
    forma_pagamento: 'pix',
    ...overrides,
  };
}

function buildReq(bodyOverrides = {}, reqOverrides = {}) {
  const body = buildBody(bodyOverrides);
  return {
    body,
    query: {},
    params: {},
    file: undefined,
    files: {},
    user: { unidade_id: body.unidade_id },
    session: { user: { unidade_id: body.unidade_id } },
    unitScope: undefined,
    ...reqOverrides,
  };
}

function loadCreateFuncionarioWithDeps(runtimeOverrides = {}) {
  const source = fs.readFileSync(controllerPath, 'utf8');
  const marker = "const __filename = fileURLToPath(import.meta.url);";
  const markerIndex = source.indexOf(marker);

  if (markerIndex < 0) {
    throw new Error('Não foi possível localizar o bootstrap do controller para montar o harness focal.');
  }

  const controllerBody = source
    .slice(markerIndex)
    .replace(marker, 'const __filename = __deps.__filename;')
    .replace(/await import\('#modules\/gestor\/app\/services\/userService\.js'\)/g, 'await __deps.importUserService()')
    .replace(/export\s+async\s+function\s+/g, 'async function ')
    .replace(/export\s+function\s+/g, 'function ')
    .replace(/export\s+const\s+/g, 'const ');

  const responseHelpers = makeResponseHelpers();
  const callLog = {
    createFuncionarioDocCalls: [],
    saveFuncionarioCalls: [],
    saveUserDocCalls: [],
    createUserMembershipCalls: [],
    setUserMembershipFuncionarioIdIfEmptyCalls: [],
  };

  let seq = 0;

  const bridge = {
    findFuncionarioByCpfAndUnidade: async () => null,
    createFuncionarioDoc: async (doc) => {
      callLog.createFuncionarioDocCalls.push(doc);
      seq += 1;
      return { _id: `func-${seq}`, ...doc };
    },
    saveFuncionario: async (funcionario) => {
      callLog.saveFuncionarioCalls.push({ ...funcionario });
      return funcionario;
    },
    saveUserDoc: async (user) => {
      callLog.saveUserDocCalls.push({ ...user });
      return user;
    },
    findUnidadeUserBaseLean: async () => null,
    findFuncionarioById: async () => null,
    updateFuncionarioByIdWithOps: async () => null,
    findFuncionarioByIdPopulateRefs: async () => null,
    findFuncionarioByIdLean: async () => null,
    deleteFuncionarioById: async () => null,
    findFuncionariosDisponiveisByUnidadeLean: async () => [],
    findFuncionarioByIdSelectBasicLean: async () => null,
    findFuncionarioByCpfAndUnidadeSelectLean: async () => null,
    findUserByEmail: async () => null,
    findUserByFuncionarioId: async () => null,
    findUserMembershipByUserAndUnidade: async () => null,
    createUserMembership: async (payload) => {
      callLog.createUserMembershipCalls.push({ ...payload });
      return { _id: `membership-${callLog.createUserMembershipCalls.length}`, ...payload };
    },
    setUserMembershipFuncionarioIdIfEmpty: async (membershipId, funcionarioId) => {
      callLog.setUserMembershipFuncionarioIdIfEmptyCalls.push({ membershipId, funcionarioId });
      return true;
    },
    ...runtimeOverrides.bridge,
  };

  const deps = {
    __filename: controllerPath,
    path,
    fs,
    mongoose: runtimeOverrides.mongoose ?? { Types: { ObjectId: { isValid: () => true } } },
    sharp: runtimeOverrides.sharp ?? (() => ({ resize: () => ({ webp: () => ({ toBuffer: async () => Buffer.alloc(0) }) }) })),
    put: runtimeOverrides.put ?? (async () => ({ url: 'https://blob.invalid/fake.webp' })),
    del: runtimeOverrides.del ?? (async () => undefined),
    uuid: runtimeOverrides.uuid ?? (() => 'uuid-fixed'),
    fileURLToPath,
    ...responseHelpers,
    ...bridge,
    normalizeFuncionarioPayload: runtimeOverrides.normalizeFuncionarioPayload ?? ((payload) => payload),
    importUserService: runtimeOverrides.importUserService ?? (async () => ({
      createUserAndSendPassword: async ({ nome, email, cpf, role, unidade_id, funcionario_id }) => ({
        _id: `user-${email}`,
        nome,
        email,
        cpf,
        role,
        unidade_id,
        funcionario_id,
      }),
    })),
  };

  const factory = new Function(
    '__deps',
    `
const path = __deps.path;
const fs = __deps.fs;
const mongoose = __deps.mongoose;
const sharp = __deps.sharp;
const put = __deps.put;
const del = __deps.del;
const uuid = __deps.uuid;
const fileURLToPath = __deps.fileURLToPath;
const ok = __deps.ok;
const notFound = __deps.notFound;
const serverError = __deps.serverError;
const badRequest = __deps.badRequest;
const created = __deps.created;
const missingFields = __deps.missingFields;
const findFuncionarioByCpfAndUnidade = __deps.findFuncionarioByCpfAndUnidade;
const createFuncionarioDoc = __deps.createFuncionarioDoc;
const saveFuncionario = __deps.saveFuncionario;
const saveUserDoc = __deps.saveUserDoc;
const findUnidadeUserBaseLean = __deps.findUnidadeUserBaseLean;
const findFuncionarioById = __deps.findFuncionarioById;
const updateFuncionarioByIdWithOps = __deps.updateFuncionarioByIdWithOps;
const findFuncionarioByIdPopulateRefs = __deps.findFuncionarioByIdPopulateRefs;
const findFuncionarioByIdLean = __deps.findFuncionarioByIdLean;
const deleteFuncionarioById = __deps.deleteFuncionarioById;
const findFuncionariosDisponiveisByUnidadeLean = __deps.findFuncionariosDisponiveisByUnidadeLean;
const findFuncionarioByIdSelectBasicLean = __deps.findFuncionarioByIdSelectBasicLean;
const findFuncionarioByCpfAndUnidadeSelectLean = __deps.findFuncionarioByCpfAndUnidadeSelectLean;
const findUserByEmail = __deps.findUserByEmail;
const findUserByFuncionarioId = __deps.findUserByFuncionarioId;
const findUserMembershipByUserAndUnidade = __deps.findUserMembershipByUserAndUnidade;
const createUserMembership = __deps.createUserMembership;
const setUserMembershipFuncionarioIdIfEmpty = __deps.setUserMembershipFuncionarioIdIfEmpty;
const normalizeFuncionarioPayload = __deps.normalizeFuncionarioPayload;
${controllerBody}
return { createFuncionario };
`
  );

  return {
    ...factory(deps),
    callLog,
  };
}

test('POST /api/funcionarios core create: sem sessão retorna 401', async () => {
  const response = await request(gestorApp)
    .post('/api/funcionarios')
    .field('unidade_id', 'unit-core-401');

  assert.equal(response.status, 401);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'UNAUTHORIZED');
});

test('createFuncionario: fora do escopo contextual retorna 404', async () => {
  const { createFuncionario, callLog } = loadCreateFuncionarioWithDeps();
  const req = buildReq(
    { unidade_id: 'unit-body-outside-001' },
    { session: { user: { unidade_id: 'unit-context-001' } }, user: { unidade_id: 'unit-context-001' } }
  );
  const res = makeRes();

  await createFuncionario(req, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.code, 'NOT_FOUND');
  assert.equal(res.body.message, 'Unidade não encontrada');
  assert.equal(callLog.createFuncionarioDocCalls.length, 0);
});

test('createFuncionario: PIS inválido retorna 400', async () => {
  const { createFuncionario, callLog } = loadCreateFuncionarioWithDeps();
  const req = buildReq({ pis: '11111111111' });
  const res = makeRes();

  await createFuncionario(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'BAD_REQUEST');
  assert.equal(res.body.message, 'PIS inválido');
  assert.equal(res.body.campo, 'pis');
  assert.equal(callLog.createFuncionarioDocCalls.length, 0);
});

test('createFuncionario: duplicidade por e-mail retorna 400', async () => {
  const duplicateError = { code: 11000, keyPattern: { email: 1 } };
  const { createFuncionario } = loadCreateFuncionarioWithDeps({
    bridge: {
      createFuncionarioDoc: async () => {
        throw duplicateError;
      },
    },
  });
  const req = buildReq();
  const res = makeRes();

  await createFuncionario(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'BAD_REQUEST');
  assert.equal(res.body.message, 'Já existe um funcionário cadastrado com este e-mail.');
  assert.equal(res.body.campo, 'email');
});

test('createFuncionario: sucesso mínimo expandido observável retorna 201 e normaliza payload core', async () => {
  const { createFuncionario, callLog } = loadCreateFuncionarioWithDeps();
  const req = buildReq();
  const res = makeRes();

  await createFuncionario(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.created, true);
  assert.equal(res.body.id, 'func-1');
  assert.equal(res.body.data.id, 'func-1');
  assert.equal(res.body.data.autoUser.ok, true);
  assert.equal(res.body.data.autoUser.outcome, 'created');
  assert.equal(res.body.data.autoUser.reusedUser, false);
  assert.equal(res.body.data.autoUser.membershipCreated, true);
  assert.equal(res.body.data.autoUser.funcionarioLinked, true);
  assert.equal(res.body.data.autoUser.legacyUserLinked, false);

  assert.equal(callLog.createFuncionarioDocCalls.length, 1);
  const persistedDoc = callLog.createFuncionarioDocCalls[0];
  assert.equal(persistedDoc.unidade_id, 'unit-core-001');
  assert.equal(persistedDoc.nome, 'Maria Core');
  assert.equal(persistedDoc.nome_social, '  Maria Social  ');
  assert.equal(persistedDoc.rg, 'RG-123');
  assert.equal(persistedDoc.rg_orgao, 'SSP');
  assert.equal(persistedDoc.cpf, '12345678901');
  assert.equal(persistedDoc.pis, buildValidPis('1234567890'));
  assert.equal(persistedDoc.data_nascimento, '1991-04-02');
  assert.equal(persistedDoc.sexo, 'F');
  assert.equal(persistedDoc.telefone, '11999990000');
  assert.equal(persistedDoc.telefone2, '1133334444');
  assert.equal(persistedDoc.email, '  maria.core@example.com  ');
  assert.equal(persistedDoc.observacoes, 'observacao focal');
  assert.equal(persistedDoc.cargo, 'Analista');
  assert.equal(persistedDoc.departamento, 'Operacoes');
  assert.equal(persistedDoc.regime_contratacao, 'CLT');
  assert.equal(persistedDoc.regime_jornada, '44H');
  assert.equal(persistedDoc.carga_semanal, 44);
  assert.equal(persistedDoc.salario_base, 1234.56);
  assert.equal(persistedDoc.forma_pagamento, 'pix');
  assert.deepEqual(persistedDoc.anexos, []);
  assert.deepEqual(persistedDoc.dependentes, []);
  assert.deepEqual(persistedDoc.beneficios, []);
  assert.equal(persistedDoc.face_imagem, undefined);
  assert.equal(persistedDoc.fp_imagem, undefined);
  assert.equal(callLog.createUserMembershipCalls.length, 1);
});

test('createFuncionario: autoUser outcome created', async () => {
  const { createFuncionario } = loadCreateFuncionarioWithDeps();
  const req = buildReq({ email: 'created.outcome@example.com' });
  const res = makeRes();

  await createFuncionario(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.autoUser.ok, true);
  assert.equal(res.body.data.autoUser.outcome, 'created');
  assert.equal(res.body.data.autoUser.code, null);
  assert.equal(res.body.data.autoUser.reusedUser, false);
  assert.equal(res.body.data.autoUser.membershipCreated, true);
});

test('createFuncionario: autoUser outcome linked', async () => {
  const existingUser = { _id: 'user-linked', email: 'linked.outcome@example.com' };
  const { createFuncionario, callLog } = loadCreateFuncionarioWithDeps({
    bridge: {
      findUserByEmail: async () => existingUser,
    },
  });
  const req = buildReq({ email: 'linked.outcome@example.com' });
  const res = makeRes();

  await createFuncionario(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.autoUser.ok, true);
  assert.equal(res.body.data.autoUser.outcome, 'linked');
  assert.equal(res.body.data.autoUser.reusedUser, true);
  assert.equal(res.body.data.autoUser.membershipCreated, true);
  assert.equal(callLog.createUserMembershipCalls.length, 1);
});

test('createFuncionario: autoUser outcome already-linked', async () => {
  const existingUser = { _id: 'user-already-linked', email: 'already.linked@example.com' };
  const existingMembership = { _id: 'membership-existing', user_id: existingUser._id, unidade_id: 'unit-core-001', funcionario_id: null };
  const { createFuncionario, callLog } = loadCreateFuncionarioWithDeps({
    bridge: {
      findUserByEmail: async () => existingUser,
      findUserMembershipByUserAndUnidade: async () => existingMembership,
      setUserMembershipFuncionarioIdIfEmpty: async (membershipId, funcionarioId) => {
        callLog.setUserMembershipFuncionarioIdIfEmptyCalls.push({ membershipId, funcionarioId });
        return true;
      },
    },
  });
  const req = buildReq({ email: 'already.linked@example.com' });
  const res = makeRes();

  await createFuncionario(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.autoUser.ok, true);
  assert.equal(res.body.data.autoUser.outcome, 'already-linked');
  assert.equal(res.body.data.autoUser.code, null);
  assert.equal(res.body.data.autoUser.membershipCreated, false);
  assert.equal(callLog.createUserMembershipCalls.length, 0);
  assert.equal(callLog.setUserMembershipFuncionarioIdIfEmptyCalls.length, 1);
});

test('createFuncionario: autoUser outcome conflict', async () => {
  const existingUser = { _id: 'user-conflict', email: 'conflict.outcome@example.com' };
  const existingMembership = { _id: 'membership-conflict', user_id: existingUser._id, unidade_id: 'unit-core-001', funcionario_id: 'func-outro' };
  const { createFuncionario, callLog } = loadCreateFuncionarioWithDeps({
    bridge: {
      findUserByEmail: async () => existingUser,
      findUserMembershipByUserAndUnidade: async () => existingMembership,
    },
  });
  const req = buildReq({ email: 'conflict.outcome@example.com' });
  const res = makeRes();

  await createFuncionario(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.autoUser.ok, false);
  assert.equal(res.body.data.autoUser.outcome, 'conflict');
  assert.equal(res.body.data.autoUser.code, 'AUTO_USER_MEMBERSHIP_CONFLICT');
  assert.equal(res.body.data.autoUser.membershipCreated, false);
  assert.equal(res.body.data.autoUser.funcionarioLinked, false);
  assert.equal(res.body.data.autoUser.legacyUserLinked, false);
  assert.equal(callLog.saveFuncionarioCalls.length, 0);
});

test('createFuncionario: erro interno induzido no create retorna 500', async () => {
  const { createFuncionario } = loadCreateFuncionarioWithDeps({
    bridge: {
      createFuncionarioDoc: async () => {
        throw new Error('falha-interna-induzida');
      },
    },
  });
  const req = buildReq({ email: 'erro.interno@example.com' });
  const res = makeRes();

  await createFuncionario(req, res);

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.success, false);
  assert.equal(res.body.code, 'SERVER_ERROR');
  assert.equal(res.body.message, 'Erro interno');
});