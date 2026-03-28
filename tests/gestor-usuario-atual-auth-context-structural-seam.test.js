import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import mongoose from 'mongoose';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/userController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

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

function toPlainJson(value) {
  return JSON.parse(JSON.stringify(value));
}

test('obterUsuarioAtual preserva o owner HTTP, recebe o perfil base do owner service e anexa os extras canonicos no proprio owner', async () => {
  const ownerServiceCalls = [];
  const authContextExtrasCalls = [];

  const baseUser = {
    _id: 'u-1',
    email: 'base@gestor.test',
    role: 'user',
    isMaster: false,
  };

  const basePayload = {
    id: 'u-1',
    nome: 'Usuario Base',
    email: 'base@gestor.test',
    role: 'user',
    isMaster: false,
    unidade_id: 'un-base',
    unidade_nome: 'Unidade Base',
    unidade_codigo: 'UNI-001',
    funcionario_id: 'f-base',
    foto: null,
    cpf: '12345678901',
    telefone: '11999999999',
  };

  const authContextExtras = {
    authenticated: true,
    source: 'auth-context-v1',
    globalRole: null,
    effectiveRole: 'diretor',
    needsUnitSelection: false,
    membershipCount: 1,
    activeContext: {
      unidadeId: 'un-ctx',
      unidadePrincipalId: 'un-ctx',
      papelContextual: 'gestor',
      funcionarioId: 'f-ctx',
      legacyRole: 'diretor',
    },
    membershipsSummary: [
      {
        unidadeId: 'un-ctx',
        unidadePrincipalId: 'un-ctx',
        unidadeNome: 'Unidade Contextual',
        unidadeCodigo: 'CTX-001',
        papelContextual: 'gestor',
        legacyRole: 'diretor',
      },
    ],
  };

  const obterUsuarioAtual = buildFunction(CONTROLLER_SOURCE, 'export async function obterUsuarioAtual', {
    mongoose,
    getUsuarioAtualProfileOwnerService: async (input) => {
      ownerServiceCalls.push(input);
      return {
        kind: 'ok',
        baseUser,
        payload: { ...basePayload },
      };
    },
    isAuthContextResolverEnabledForRequest: () => true,
    resolveUsuarioAtualAuthContextExtras: async (input) => {
      authContextExtrasCalls.push(input);
      return { ...authContextExtras };
    },
    ok: (res, data = {}) => res.status(200).json({ success: true, data }),
    serverError: (res, error) => res.status(500).json({ success: false, error }),
    console,
  });

  const sessionId = new mongoose.Types.ObjectId().toString();
  const req = {
    unitScope: { unidadeId: 'scope-ctx' },
    user: { email: 'req-user@gestor.test' },
    session: {
      user: { id: sessionId, email: 'session-user@gestor.test' },
      gestorAuthContext: { active_unidade_id: 'stored-unidade' },
    },
    app: {
      locals: {
        gestorAuthContextFeatureFlags: { gestor_auth_context_resolver: true },
        gestorAuthContextResolverDeps: { dep: true },
        gestorAuthContextMaxTimeMS: 25,
      },
    },
  };
  const res = createApiRes();

  await obterUsuarioAtual(req, res);

  assert.equal(ownerServiceCalls.length, 1);
  assert.equal(ownerServiceCalls[0].unitScope.unidadeId, 'scope-ctx');
  assert.equal(String(ownerServiceCalls[0].sessionUserId), sessionId);
  assert.equal(ownerServiceCalls[0].fallbackEmail, 'req-user@gestor.test');

  assert.equal(authContextExtrasCalls.length, 1);
  assert.equal(authContextExtrasCalls[0].baseUser, baseUser);
  assert.equal(authContextExtrasCalls[0].sessionUser, req.session.user);
  assert.equal(authContextExtrasCalls[0].existingAuthContext, req.session.gestorAuthContext);
  assert.equal(authContextExtrasCalls[0].featureFlags, req.app.locals.gestorAuthContextFeatureFlags);
  assert.equal(authContextExtrasCalls[0].resolverDeps, req.app.locals.gestorAuthContextResolverDeps);
  assert.equal(authContextExtrasCalls[0].maxTimeMS, 25);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(toPlainJson(res.body), {
    success: true,
    data: {
      ...basePayload,
      ...authContextExtras,
    },
  });
});