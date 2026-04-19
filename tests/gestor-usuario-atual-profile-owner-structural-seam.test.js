import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import mongoose from 'mongoose';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/userController.js');
const SERVICE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/services/usuarios/getUsuarioAtualProfileOwner.service.js');
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

test('obterUsuarioAtual delega ao owner service e preserva o enriquecimento final por auth-context', async () => {
  const serviceCalls = [];
  const authContextExtrasCalls = [];
  const baseUser = {
    _id: 'u-1',
    email: 'usuario@example.com',
    role: 'user',
    isMaster: false,
  };

  const getUsuarioAtualProfileOwnerService = async (input) => {
    serviceCalls.push(input);
    return {
      kind: 'ok',
      baseUser,
      payload: {
        id: 'u-1',
        nome: 'Usuario Base',
        email: 'usuario@example.com',
        role: 'user',
        isMaster: false,
        unidade_id: 'un-1',
        unidade_nome: 'Unidade A',
        unidade_codigo: '001',
        funcionario_id: 'f-1',
        foto: null,
        cpf: '123',
        telefone: '9999-9999',
      },
    };
  };

  const obterUsuarioAtual = buildFunction(CONTROLLER_SOURCE, 'export async function obterUsuarioAtual', {
    getUsuarioAtualProfileOwnerService,
    mongoose,
    isAuthContextResolverEnabledForRequest: () => true,
    resolveUsuarioAtualAuthContextExtras: async (input) => {
      authContextExtrasCalls.push(input);
      return {
      authenticated: true,
      source: 'auth-context-v1',
      needsUnitSelection: false,
      activeContext: { unidadeId: 'un-1' },
      };
    },
    ok: (res, data = {}) => res.status(200).json({ success: true, data }),
    serverError: (res, error) => res.status(500).json({ success: false, error }),
    console,
  });

  const sessionId = new mongoose.Types.ObjectId().toString();
  const req = {
    unitScope: { unidadeId: 'ctx-1' },
    user: { email: 'req-user@example.com' },
    session: {
      user: { id: sessionId, email: 'session-user@example.com' },
      gestorAuthContext: { source: 'legacy' },
    },
    app: {
      locals: {
        gestorAuthContextFeatureFlags: { gestor_auth_context_resolver: true },
        gestorAuthContextResolverDeps: { dep: true },
        gestorAuthContextMaxTimeMS: 15,
      },
    },
  };
  const res = createApiRes();

  await obterUsuarioAtual(req, res);

  assert.equal(serviceCalls.length, 1);
  assert.equal(serviceCalls[0].unitScope.unidadeId, 'ctx-1');
  assert.equal(String(serviceCalls[0].sessionUserId), sessionId);
  assert.equal(serviceCalls[0].fallbackEmail, 'req-user@example.com');
  assert.equal(authContextExtrasCalls.length, 1);
  assert.equal(authContextExtrasCalls[0].baseUser, baseUser);
  assert.equal(authContextExtrasCalls[0].sessionUser, req.session.user);
  assert.equal(authContextExtrasCalls[0].existingAuthContext, req.session.gestorAuthContext);
  assert.equal(authContextExtrasCalls[0].featureFlags, req.app.locals.gestorAuthContextFeatureFlags);
  assert.equal(authContextExtrasCalls[0].resolverDeps, req.app.locals.gestorAuthContextResolverDeps);
  assert.equal(authContextExtrasCalls[0].maxTimeMS, 15);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.id, 'u-1');
  assert.equal(res.body.data.email, 'usuario@example.com');
  assert.equal(res.body.data.unidade_id, 'un-1');
  assert.equal(res.body.data.authenticated, true);
  assert.equal(res.body.data.source, 'auth-context-v1');
  assert.equal(res.body.data.needsUnitSelection, false);
  assert.equal(res.body.data.activeContext.unidadeId, 'un-1');
});

test('getUsuarioAtualProfileOwnerService trata session user id como fonte autoritativa e deixa o fallback por e-mail apenas para chamadas sem id autoritativo', async () => {
  const idCalls = [];
  const emailCalls = [];
  const getUsuarioAtualProfileOwnerService = buildFunction(SERVICE_SOURCE, 'export async function getUsuarioAtualProfileOwnerService', {
    findUserByIdForProfile: async (input) => {
      idCalls.push(input);
      return null;
    },
    findUserByEmailForProfile: async (input) => {
      emailCalls.push(input);
      if (emailCalls.length === 1) {
        return {
          _id: 'u-2',
          email: 'fallback@example.com',
          role: 'user',
          isMaster: false,
          foto: 'foto.png',
          nome: null,
          cpf: null,
          telefone: null,
          unidade_id: { _id: 'un-user', nome: 'Unidade User', codigo: 'UU' },
          funcionario_id: {
            _id: 'f-2',
            nome: 'Funcionario Fallback',
            cpf: '222',
            telefone: '8888-8888',
            unidade_id: { _id: 'un-func', nome: 'Unidade Func', codigo: 'UF' },
          },
        };
      }
      return null;
    },
  });

  const firstSessionUserId = '507f1f77bcf86cd799439011';
  let result = await getUsuarioAtualProfileOwnerService({
    unitScope: { unidadeId: 'ctx-2' },
    sessionUserId: firstSessionUserId,
    fallbackEmail: ' Fallback@Example.com ',
  });

  assert.equal(idCalls.length, 1);
  assert.equal(idCalls[0].unitScope.unidadeId, 'ctx-2');
  assert.equal(idCalls[0].userId, firstSessionUserId);
  assert.equal(emailCalls.length, 0);
  assert.equal(result.kind, 'not_found');
  assert.equal(result.targetId, firstSessionUserId);
  assert.equal(result.email, 'Fallback@Example.com');

  result = await getUsuarioAtualProfileOwnerService({
    unitScope: { unidadeId: 'ctx-2' },
    sessionUserId: null,
    fallbackEmail: ' Fallback@Example.com ',
  });

  assert.equal(idCalls.length, 1);
  assert.equal(emailCalls.length, 1);
  assert.equal(emailCalls[0].unitScope.unidadeId, 'ctx-2');
  assert.equal(emailCalls[0].email, 'fallback@example.com');
  assert.equal(result.kind, 'ok');
  assert.equal(result.resolutionSource, 'compat-email-fallback');
  assert.equal(result.baseUser._id, 'u-2');
  assert.equal(result.payload.id, 'u-2');
  assert.equal(result.payload.nome, 'Funcionario Fallback');
  assert.equal(result.payload.email, 'fallback@example.com');
  assert.equal(result.payload.role, 'user');
  assert.equal(result.payload.isMaster, false);
  assert.equal(result.payload.unidade_id, 'un-user');
  assert.equal(result.payload.unidade_nome, 'Unidade User');
  assert.equal(result.payload.unidade_codigo, 'UU');
  assert.equal(result.payload.funcionario_id, 'f-2');
  assert.equal(result.payload.foto, 'foto.png');
  assert.equal(result.payload.cpf, '222');
  assert.equal(result.payload.telefone, '8888-8888');

  const secondSessionUserId = '507f191e810c19729de860ea';
  result = await getUsuarioAtualProfileOwnerService({
    unitScope: { unidadeId: 'ctx-3' },
    sessionUserId: secondSessionUserId,
    fallbackEmail: ' missing@example.com ',
  });

  assert.equal(idCalls.length, 2);
  assert.equal(idCalls[1].unitScope.unidadeId, 'ctx-3');
  assert.equal(idCalls[1].userId, secondSessionUserId);
  assert.equal(emailCalls.length, 1);
  assert.equal(result.kind, 'not_found');
  assert.equal(result.targetId, secondSessionUserId);
  assert.equal(result.email, 'missing@example.com');
});