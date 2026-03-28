import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { projectLegacySessionUserFromAuthContext } from '../src/modules/gestor/app/services/authContextResolver.js';

const MIDDLEWARE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/middlewares/requireRole.js');
const MIDDLEWARE_SOURCE = fs.readFileSync(MIDDLEWARE_PATH, 'utf8');

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

test('requireRole consome auth-context canonico ativo, resolve o papel efetivo, sincroniza o shape legado e preserva o next', async () => {
  const normalizeRole = buildFunction(MIDDLEWARE_SOURCE, 'function normalizeRole');
  const buildCanonicalLegacyProjection = buildFunction(
    MIDDLEWARE_SOURCE,
    'function buildCanonicalLegacyProjection',
    {
      normalizeRole,
      projectLegacySessionUserFromAuthContext,
      AUTH_CONTEXT_SOURCE_V1: 'auth-context-v1',
    }
  );
  const actualResolveEffectiveRole = buildFunction(
    MIDDLEWARE_SOURCE,
    'function resolveEffectiveRole',
    { normalizeRole }
  );
  const actualSyncLegacyUserShape = buildFunction(
    MIDDLEWARE_SOURCE,
    'function syncLegacyUserShape',
    {
      normalizeRole,
      buildCanonicalLegacyProjection,
    }
  );
  const hasPendingUnitSelection = buildFunction(MIDDLEWARE_SOURCE, 'function hasPendingUnitSelection');

  const resolveCalls = [];
  const syncCalls = [];

  const requireRole = buildFunction(
    MIDDLEWARE_SOURCE,
    'export function requireRole',
    {
      normalizeRole,
      getRequestTransport: () => ({ basePath: '/gestor', isApiRequest: true }),
      isAuthContextResolverEnabledForRequest: () => true,
      getStoredAuthContext: (req) => req.session?.gestorAuthContext || null,
      hasPendingUnitSelection,
      resolveEffectiveRole(input) {
        resolveCalls.push({
          authContext: JSON.parse(JSON.stringify(input.authContext || null)),
          requestUser: JSON.parse(JSON.stringify(input.requestUser || null)),
          sessionUser: JSON.parse(JSON.stringify(input.sessionUser || null)),
        });
        return actualResolveEffectiveRole(input);
      },
      syncLegacyUserShape(req, input) {
        syncCalls.push({
          authContext: JSON.parse(JSON.stringify(input.authContext || null)),
          effectiveRole: input.effectiveRole,
          globalRole: input.globalRole,
        });
        return actualSyncLegacyUserShape(req, input);
      },
      respondPendingSelection(res) {
        return res.status(409).json({ success: false, code: 'GESTOR_SELECTION_REQUIRED' });
      },
      respondUnauthorized(req, res) {
        return res.status(401).json({ success: false, code: 'UNAUTHORIZED' });
      },
      respondForbidden(res) {
        return res.status(403).json({ success: false, code: 'FORBIDDEN' });
      },
    }
  );

  const middleware = requireRole(['diretor']);
  const req = {
    path: '/api/admin',
    originalUrl: '/gestor/api/admin',
    baseUrl: '/gestor',
    headers: { accept: 'application/json' },
    app: {
      locals: {
        gestorAuthContextFeatureFlags: { gestor_auth_context_resolver: true },
      },
    },
    session: {
      user: {
        id: 'u-1',
        email: 'gestor@example.com',
        nome: 'Usuario Canonico',
        role: 'user',
        unidade_id: 'legacy-unit',
        unidade_principal_id: 'legacy-principal',
        funcionario_id: 'legacy-funcionario',
      },
      gestorAuthContext: {
        needs_selection: false,
        active_membership_id: 'mem-1',
        active_unidade_id: 'unit-canonical',
        active_unidade_principal_id: 'principal-canonical',
        active_funcionario_id: 'funcionario-canonico',
        legacy_role: 'diretor',
        effectiveRole: 'diretor',
        activeContext: {
          membershipId: 'mem-1',
          unidadeId: 'unit-canonical',
          unidadePrincipalId: 'principal-canonical',
          funcionarioId: 'funcionario-canonico',
          legacyRole: 'diretor',
        },
      },
    },
  };
  const res = {
    statusCode: 200,
    payload: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
    redirect(url) {
      this.redirectUrl = url;
      return this;
    },
    send(payload) {
      this.payload = payload;
      return this;
    },
  };

  let nextCalled = false;
  await middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(resolveCalls.length, 1);
  assert.equal(resolveCalls[0].authContext.active_unidade_id, 'unit-canonical');
  assert.equal(resolveCalls[0].sessionUser.role, 'user');
  assert.equal(syncCalls.length, 1);
  assert.equal(syncCalls[0].effectiveRole, 'diretor');
  assert.equal(syncCalls[0].globalRole, null);

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload, undefined);

  assert.equal(req.user.role, 'diretor');
  assert.equal(req.user.global_role, null);
  assert.equal(req.user.unidade_id, 'unit-canonical');
  assert.equal(req.user.unidade_principal_id, 'principal-canonical');
  assert.equal(req.user.funcionario_id, 'funcionario-canonico');
  assert.equal(req.user.isMaster, false);

  assert.equal(req.session.user.role, 'diretor');
  assert.equal(req.session.user.global_role, null);
  assert.equal(req.session.user.unidade_id, 'unit-canonical');
  assert.equal(req.session.user.unidade_principal_id, 'principal-canonical');
  assert.equal(req.session.user.funcionario_id, 'funcionario-canonico');
  assert.equal(req.session.user.auth_version, 'phase3');
});