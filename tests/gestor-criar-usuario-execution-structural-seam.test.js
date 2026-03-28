import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/userController.js');
const SERVICE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/services/usuarios/createUsuarioExecution.service.js');
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

test('criarUsuario delega ao owner service e preserva o mapeamento estrutural final para created e serverError', async () => {
  const serviceCalls = [];
  const createUsuarioExecutionService = async (input) => {
    serviceCalls.push(input);
    if (serviceCalls.length === 1) {
      return {
        kind: 'created',
        userId: 'u-1',
        payload: {
          id: 'u-1',
          funcionario_id: 'f-1',
          outcome: 'created',
          tempPassword: 'TEMP1234',
        },
      };
    }

    return {
      kind: 'membership_error',
      message: 'Falha ao criar vínculo do usuário com a unidade',
    };
  };

  const criarUsuario = buildFunction(CONTROLLER_SOURCE, 'export async function criarUsuario', {
    findUserByEmail: async () => null,
    resolveRequestedUserRole: (role) => role || 'user',
    normalizeRoleValue: (role) => String(role || '').trim().toLowerCase(),
    buildUserMembershipPayload: ({ userId, role, unidadeId }) => {
      if (!userId || !unidadeId || role !== 'user') return null;
      return { ok: true };
    },
    resolveCriarUsuarioProvidedFuncionario: async ({ unidadeId }) => ({ funcionarioDoc: null, unidadeId }),
    findUserMembershipByUserAndUnidade: async () => null,
    createUsuarioExecutionService,
    badRequest: (res, message, extra = {}) => res.status(400).json({ success: false, error: message, ...extra }),
    created: (res, id, extra = {}) => res.status(201).json({ success: true, id, ...extra }),
    serverError: (res, error) => res.status(500).json({ success: false, error }),
    console,
    JSON,
  });

  const req = {
    user: { isMaster: false, role: 'admin' },
    body: {
      nome: 'Novo Usuario',
      email: ' Novo@Example.com ',
      role: 'user',
      unidade_id: 'un-1',
      cpf: '123.456.789-00',
      criarNovoFuncionario: false,
    },
    headers: {},
    originalUrl: '/gestor/api/usuarios',
    url: '/gestor/api/usuarios',
  };

  let res = createApiRes();
  await criarUsuario(req, res);

  assert.equal(serviceCalls.length, 1);
  assert.equal(serviceCalls[0].existingUser, null);
  assert.equal(serviceCalls[0].nome, 'Novo Usuario');
  assert.equal(serviceCalls[0].email, 'novo@example.com');
  assert.equal(serviceCalls[0].cleanCpf, '12345678900');
  assert.equal(serviceCalls[0].requestedUserRole, 'user');
  assert.equal(serviceCalls[0].unidadeId, 'un-1');
  assert.equal(serviceCalls[0].funcionarioId, undefined);
  assert.equal(serviceCalls[0].funcionarioDoc, null);
  assert.equal(serviceCalls[0].wantsNewFuncionario, false);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.id, 'u-1');
  assert.equal(res.body.data.id, 'u-1');
  assert.equal(res.body.data.funcionario_id, 'f-1');
  assert.equal(res.body.data.outcome, 'created');
  assert.equal(res.body.data.tempPassword, 'TEMP1234');

  res = createApiRes();
  await criarUsuario(req, res);

  assert.equal(serviceCalls.length, 2);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error, 'Falha ao criar vínculo do usuário com a unidade');
});

test('createUsuarioExecutionService preserva os ramos semanticos relevantes da execucao', async () => {
  const createCalls = [];
  const saveCalls = [];
  const membershipCalls = [];
  const findFuncionarioCalls = [];
  const setIfEmptyCalls = [];
  const setByIdCalls = [];
  const createFuncionarioCalls = [];

  const normalizeRoleValue = buildFunction(SERVICE_SOURCE, 'function normalizeRoleValue', {});
  const resolvePapelContextualFromRole = buildFunction(SERVICE_SOURCE, 'function resolvePapelContextualFromRole', {
    normalizeRoleValue,
  });
  const buildUserMembershipPayload = buildFunction(SERVICE_SOURCE, 'function buildUserMembershipPayload', {
    resolvePapelContextualFromRole,
  });
  const isDuplicateKeyError = buildFunction(SERVICE_SOURCE, 'function isDuplicateKeyError', {});
  const normalizeEntityId = buildFunction(SERVICE_SOURCE, 'function normalizeEntityId', {});
  const findCriarUsuarioFuncionarioByCpfUnidade = buildFunction(SERVICE_SOURCE, 'async function findCriarUsuarioFuncionarioByCpfUnidade', {
    normalizeEntityId,
    findFuncionarioByCpfUnidadeSelectIdUnidadeEmailLean: async (cleanCpf, unidadeId) => {
      findFuncionarioCalls.push({ cleanCpf, unidadeId });
      if (findFuncionarioCalls.length === 1) {
        return {
          _id: 'f-existing',
          unidade_id: 'un-2',
        };
      }
      return null;
    },
  });
  const setCriarUsuarioFuncionarioUsuarioIdIfEmpty = buildFunction(SERVICE_SOURCE, 'async function setCriarUsuarioFuncionarioUsuarioIdIfEmpty', {
    setFuncionarioUsuarioIdIfEmpty: async (funcionarioId, userId) => {
      setIfEmptyCalls.push({ funcionarioId, userId });
    },
  });
  const setCriarUsuarioFuncionarioUsuarioIdById = buildFunction(SERVICE_SOURCE, 'async function setCriarUsuarioFuncionarioUsuarioIdById', {
    setFuncionarioUsuarioIdById: async (funcionarioId, userId) => {
      setByIdCalls.push({ funcionarioId, userId });
    },
  });
  const createCriarUsuarioFuncionarioDoc = buildFunction(SERVICE_SOURCE, 'async function createCriarUsuarioFuncionarioDoc', {
    createFuncionarioDoc: async (doc) => {
      createFuncionarioCalls.push(doc);
      return {
        _id: 'f-new',
        ...doc,
      };
    },
  });

  const createUsuarioExecutionService = buildFunction(SERVICE_SOURCE, 'export async function createUsuarioExecutionService', {
    createUserAndSendPassword: async (input) => {
      createCalls.push(input);
      return {
        _id: 'u-created',
        nome: input.nome,
        unidade_id: null,
        funcionario_id: null,
        _temp_password_plain: 'TEMP9999',
      };
    },
    saveUserDoc: async (user) => {
      saveCalls.push({
        _id: user._id,
        unidade_id: user.unidade_id,
        funcionario_id: user.funcionario_id,
      });
    },
    createUserMembership: async (payload) => {
      membershipCalls.push(payload);
      if (membershipCalls.length === 3) {
        const error = new Error('duplicate key');
        error.code = 11000;
        throw error;
      }
    },
    buildUserMembershipPayload,
    isDuplicateKeyError,
    findCriarUsuarioFuncionarioByCpfUnidade,
    setCriarUsuarioFuncionarioUsuarioIdIfEmpty,
    setCriarUsuarioFuncionarioUsuarioIdById,
    createCriarUsuarioFuncionarioDoc,
    console,
    Date,
    String,
    process: { env: { NODE_ENV: 'test' } },
  });

  let result = await createUsuarioExecutionService({
    existingUser: null,
    nome: 'Criado do Zero',
    email: 'zero@example.com',
    cleanCpf: '12345678900',
    requestedUserRole: 'user',
    unidadeId: 'un-1',
    funcionarioId: 'func-provided',
    funcionarioDoc: { _id: 'func-provided', unidade_id: 'un-1' },
    wantsNewFuncionario: false,
    senha: 'Senha@123',
  });

  assert.equal(result.kind, 'created');
  assert.equal(result.userId, 'u-created');
  assert.equal(result.payload.id, 'u-created');
  assert.equal(result.payload.funcionario_id, 'func-provided');
  assert.equal(result.payload.outcome, 'created');
  assert.equal(result.payload.tempPassword, 'TEMP9999');
  assert.equal(createCalls.length, 1);
  assert.equal(createCalls[0].email, 'zero@example.com');
  assert.equal(saveCalls.length, 1);
  assert.equal(saveCalls[0].funcionario_id, 'func-provided');
  assert.equal(saveCalls[0].unidade_id, 'un-1');
  assert.equal(setIfEmptyCalls.length, 1);
  assert.equal(setIfEmptyCalls[0].funcionarioId, 'func-provided');
  assert.equal(setIfEmptyCalls[0].userId, 'u-created');
  assert.equal(membershipCalls.length, 1);
  assert.equal(membershipCalls[0].user_id, 'u-created');
  assert.equal(membershipCalls[0].unidade_id, 'un-1');
  assert.equal(membershipCalls[0].funcionario_id, 'func-provided');

  result = await createUsuarioExecutionService({
    existingUser: {
      _id: 'u-existing',
      nome: 'Existente',
      unidade_id: null,
      funcionario_id: null,
    },
    nome: 'Existente',
    email: 'existing@example.com',
    cleanCpf: '11122233344',
    requestedUserRole: 'user',
    unidadeId: 'un-2',
    funcionarioId: null,
    funcionarioDoc: null,
    wantsNewFuncionario: true,
    senha: undefined,
  });

  assert.equal(result.kind, 'created');
  assert.equal(result.userId, 'u-existing');
  assert.equal(result.payload.funcionario_id, 'f-existing');
  assert.equal(result.payload.outcome, 'linked');
  assert.equal(createCalls.length, 1);
  assert.equal(findFuncionarioCalls.length, 1);
  assert.equal(findFuncionarioCalls[0].cleanCpf, '11122233344');
  assert.equal(findFuncionarioCalls[0].unidadeId, 'un-2');
  assert.equal(setByIdCalls.length, 1);
  assert.equal(setByIdCalls[0].funcionarioId, 'f-existing');
  assert.equal(setByIdCalls[0].userId, 'u-existing');
  assert.equal(membershipCalls.length, 2);
  assert.equal(membershipCalls[1].user_id, 'u-existing');
  assert.equal(membershipCalls[1].funcionario_id, 'f-existing');

  result = await createUsuarioExecutionService({
    existingUser: {
      _id: 'u-dup',
      nome: 'Duplicado',
      unidade_id: null,
      funcionario_id: null,
    },
    nome: 'Duplicado',
    email: 'dup@example.com',
    cleanCpf: '99988877766',
    requestedUserRole: 'user',
    unidadeId: 'un-3',
    funcionarioId: null,
    funcionarioDoc: null,
    wantsNewFuncionario: false,
    senha: undefined,
  });

  assert.equal(result.kind, 'membership_duplicate');

  const createUsuarioExecutionServiceWithFuncionarioError = buildFunction(SERVICE_SOURCE, 'export async function createUsuarioExecutionService', {
    createUserAndSendPassword: async () => ({
      _id: 'u-error',
      nome: 'Erro',
      unidade_id: null,
      funcionario_id: null,
    }),
    saveUserDoc: async () => {},
    createUserMembership: async () => {},
    buildUserMembershipPayload,
    isDuplicateKeyError,
    findCriarUsuarioFuncionarioByCpfUnidade: async () => {
      throw new Error('falha inesperada');
    },
    setCriarUsuarioFuncionarioUsuarioIdIfEmpty,
    setCriarUsuarioFuncionarioUsuarioIdById,
    createCriarUsuarioFuncionarioDoc,
    console,
    Date,
    String,
    process: { env: { NODE_ENV: 'test' } },
  });

  result = await createUsuarioExecutionServiceWithFuncionarioError({
    existingUser: null,
    nome: 'Erro Funcionario',
    email: 'erro@example.com',
    cleanCpf: '55544433322',
    requestedUserRole: 'user',
    unidadeId: 'un-4',
    funcionarioId: null,
    funcionarioDoc: null,
    wantsNewFuncionario: true,
    senha: undefined,
  });

  assert.equal(result.kind, 'funcionario_create_error');
  assert.match(result.message, /Falha ao criar funcionário automático:/);
  assert.equal(createFuncionarioCalls.length, 0);
});