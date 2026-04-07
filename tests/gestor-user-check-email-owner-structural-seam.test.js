import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/userController.js');
const SERVICE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/services/usuarios/checkUsuarioEmailOwner.service.js');
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

test('checkUsuarioEmail delega ao service owner e preserva o shape estrutural do payload publico', async () => {
  const calls = [];
  const checkUsuarioEmailOwnerService = async (input) => {
    calls.push(input);
    return {
      kind: 'ok',
      email: 'admin@example.com',
      exists: true,
      user: { id: 'u-1', nome: 'Admin' },
      membershipsCount: 1,
      membershipsSummary: [{ unidade_id: 'un-1' }],
      linkedUnidadeIds: ['un-1'],
      blockedUnidadeIds: ['un-1'],
    };
  };

  const checkUsuarioEmail = buildFunction(CONTROLLER_SOURCE, 'export async function checkUsuarioEmail', {
    checkUsuarioEmailOwnerService,
    badRequest: (res, message = 'Bad request', extra = {}) => res.status(400).json({ success: false, message, ...extra }),
    ok: (res, data = {}, extra = {}) => res.status(200).json({ success: true, ...extra, data }),
    serverError: (res, error, extra = {}) => res.status(500).json({ success: false, message: error?.message || error || 'Erro interno', ...extra }),
    console,
  });

  const req = {
    user: { role: 'admin', isMaster: false },
    query: { email: ' Admin@Example.com ' },
  };
  const res = createApiRes();

  await checkUsuarioEmail(req, res);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].email, 'admin@example.com');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.email, 'admin@example.com');
  assert.equal(res.body.data.exists, true);
  assert.equal(res.body.data.user.id, 'u-1');
  assert.equal(res.body.data.membershipsCount, 1);
  assert.deepEqual(res.body.data.linkedUnidadeIds, ['un-1']);
  assert.deepEqual(res.body.data.blockedUnidadeIds, ['un-1']);
});

test('checkUsuarioEmailOwnerService preserva os ramos semanticos exists=false e exists=true', async () => {
  const userCalls = [];
  const membershipCalls = [];
  const unidadeCalls = [];
  const normalizeEntityId = buildFunction(SERVICE_SOURCE, 'function normalizeEntityId', {});
  const buildUnidadeSummaryLabel = buildFunction(SERVICE_SOURCE, 'function buildUnidadeSummaryLabel', {});

  const checkUsuarioEmailOwnerService = buildFunction(SERVICE_SOURCE, 'export async function checkUsuarioEmailOwnerService', {
    normalizeEntityId,
    buildUnidadeSummaryLabel,
    findUserByEmail: async (email) => {
      userCalls.push(email);
      return userCalls.length === 1 ? null : {
        _id: 'u-1',
        nome: 'Admin',
        cpf: '123',
        role: 'admin',
        global_role: 'admin',
        unidade_id: 'un-1',
        funcionario_id: 'f-1',
        ativo: true,
      };
    },
    findUserMembershipsByUserIdsLean: async (userIds) => {
      membershipCalls.push(userIds);
      return [{ unidade_id: 'un-1', papel_contextual: 'gestor', status: 'active', funcionario_id: 'f-1' }];
    },
    findUnidadesByIdsNomeCodigoLean: async (unidadeIds) => {
      unidadeCalls.push(unidadeIds);
      return [{ _id: 'un-1', codigo: '001', nome: 'Unidade A' }];
    },
  });

  let result = await checkUsuarioEmailOwnerService({ email: 'none@example.com' });
  assert.equal(result.kind, 'ok');
  assert.equal(result.email, 'none@example.com');
  assert.equal(result.exists, false);
  assert.equal(result.user, null);
  assert.equal(result.membershipsCount, 0);
  assert.equal(Array.isArray(result.membershipsSummary), true);
  assert.equal(result.membershipsSummary.length, 0);
  assert.equal(Array.isArray(result.linkedUnidadeIds), true);
  assert.equal(result.linkedUnidadeIds.length, 0);
  assert.equal(Array.isArray(result.blockedUnidadeIds), true);
  assert.equal(result.blockedUnidadeIds.length, 0);
  assert.equal(membershipCalls.length, 0);
  assert.equal(unidadeCalls.length, 0);

  result = await checkUsuarioEmailOwnerService({ email: 'admin@example.com' });
  assert.equal(result.kind, 'ok');
  assert.equal(result.email, 'admin@example.com');
  assert.equal(result.exists, true);
  assert.equal(result.user.id, 'u-1');
  assert.equal(result.membershipsCount, 1);
  assert.equal(result.membershipsSummary.length, 1);
  assert.equal(result.membershipsSummary[0].unidade_id, 'un-1');
  assert.equal(result.linkedUnidadeIds.length, 1);
  assert.equal(result.linkedUnidadeIds[0], 'un-1');
  assert.equal(result.blockedUnidadeIds.length, 1);
  assert.equal(result.blockedUnidadeIds[0], 'un-1');
  assert.equal(userCalls.length, 2);
  assert.equal(userCalls[0], 'none@example.com');
  assert.equal(userCalls[1], 'admin@example.com');
  assert.equal(membershipCalls.length, 1);
  assert.equal(membershipCalls[0][0], 'u-1');
  assert.equal(unidadeCalls.length, 1);
  assert.equal(unidadeCalls[0][0], 'un-1');
});