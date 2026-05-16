import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const SERVICE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/services/usuarios/checkUsuarioEmailOwner.service.js');
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

function toPlainJson(value) {
  return JSON.parse(JSON.stringify(value));
}

test('checkUsuarioEmailOwnerService preserva o branch contextual tenant-aware no codigo fonte', () => {
  assert.match(
    SERVICE_SOURCE,
    /scope\?\.isGlobalScope\s*===\s*false\s*&&\s*scope\?\.hasAuthoritativeAuthContext\s*===\s*true/
  );
  assert.match(SERVICE_SOURCE, /visibleMemberships\s*=\s*visibleMemberships\.filter/);
  assert.match(SERVICE_SOURCE, /blockedUnidadeIds:\s*linkedUnidadeIds/);
});

test('checkUsuarioEmailOwnerService preserva exists=false sem carregar memberships', async () => {
  let membershipCalls = 0;
  let unidadeCalls = 0;
  const normalizeEntityId = buildFunction(SERVICE_SOURCE, 'function normalizeEntityId', {});
  const buildUnidadeSummaryLabel = buildFunction(SERVICE_SOURCE, 'function buildUnidadeSummaryLabel', {});

  const checkUsuarioEmailOwnerService = buildFunction(SERVICE_SOURCE, 'export async function checkUsuarioEmailOwnerService', {
    normalizeEntityId,
    buildUnidadeSummaryLabel,
    findUserByEmail: async () => null,
    findUserMembershipsByUserIdsLean: async () => {
      membershipCalls += 1;
      return [];
    },
    findUnidadesByIdsNomeCodigoLean: async () => {
      unidadeCalls += 1;
      return [];
    },
  });

  const result = toPlainJson(await checkUsuarioEmailOwnerService({ email: 'none@example.com' }));

  assert.equal(result.kind, 'ok');
  assert.equal(result.email, 'none@example.com');
  assert.equal(result.exists, false);
  assert.equal(result.user, null);
  assert.equal(result.membershipsCount, 0);
  assert.equal(result.membershipsSummary.length, 0);
  assert.equal(result.linkedUnidadeIds.length, 0);
  assert.equal(result.blockedUnidadeIds.length, 0);
  assert.equal(membershipCalls, 0);
  assert.equal(unidadeCalls, 0);
});

test('checkUsuarioEmailOwnerService restringe memberships ao cluster permitido no contexto autoritativo e preserva o ramo global', async () => {
  const membershipQueryCalls = [];
  const allowedUnitLookupCalls = [];
  const unidadesLookupCalls = [];
  const normalizeEntityId = buildFunction(SERVICE_SOURCE, 'function normalizeEntityId', {});
  const buildUnidadeSummaryLabel = buildFunction(SERVICE_SOURCE, 'function buildUnidadeSummaryLabel', {});

  const userDoc = {
    _id: 'user-1',
    nome: 'Admin',
    cpf: '12345678900',
    role: 'admin',
    global_role: 'admin',
    unidade_id: 'unit-allowed',
    funcionario_id: 'func-1',
    ativo: true,
  };

  const memberships = [
    { unidade_id: 'unit-allowed', papel_contextual: 'gestor', status: 'active', funcionario_id: 'func-1' },
    { unidade_id: 'unit-forbidden', papel_contextual: 'gestor', status: 'active', funcionario_id: 'func-2' },
  ];

  const unidadesById = {
    'unit-allowed': { _id: 'unit-allowed', codigo: '001', nome: 'Permitida' },
    'unit-forbidden': { _id: 'unit-forbidden', codigo: '002', nome: 'Fora do Escopo' },
  };

  const checkUsuarioEmailOwnerService = buildFunction(SERVICE_SOURCE, 'export async function checkUsuarioEmailOwnerService', {
    normalizeEntityId,
    buildUnidadeSummaryLabel,
    findUserByEmail: async (email) => ({ ...userDoc, email }),
    findUserMembershipsByUserIdsLean: async (userIds) => {
      membershipQueryCalls.push([...userIds]);
      return memberships.map((membership) => ({ ...membership }));
    },
    findUnidadeByIdLean: async (unidadeId) => ({
      _id: unidadeId,
      is_principal: false,
      unidade_principal_id: 'principal-1',
      matriz_id: null,
    }),
    findUnidadesByMatrizOuPrincipal: async (principalUnitId) => {
      allowedUnitLookupCalls.push(principalUnitId);
      return [{ _id: 'unit-allowed' }];
    },
    findUnidadesByIdsNomeCodigoLean: async (unidadeIds) => {
      unidadesLookupCalls.push([...unidadeIds]);
      return unidadeIds.map((unidadeId) => unidadesById[unidadeId]).filter(Boolean);
    },
  });

  const restrictedResult = toPlainJson(await checkUsuarioEmailOwnerService({
    email: 'admin@example.com',
    scope: {
      isGlobalScope: false,
      hasAuthoritativeAuthContext: true,
      scopedUnitId: 'unit-scope',
    },
  }));

  assert.equal(restrictedResult.kind, 'ok');
  assert.equal(restrictedResult.email, 'admin@example.com');
  assert.equal(restrictedResult.exists, true);
  assert.equal(restrictedResult.user.id, 'user-1');
  assert.equal(restrictedResult.membershipsCount, 1);
  assert.equal(restrictedResult.membershipsSummary.length, 1);
  assert.equal(restrictedResult.membershipsSummary[0].unidade_id, 'unit-allowed');
  assert.equal(restrictedResult.membershipsSummary[0].unidade_nome, '001 - Permitida');
  assert.equal(restrictedResult.membershipsSummary.some((membership) => membership.unidade_id === 'unit-forbidden'), false);
  assert.equal(restrictedResult.linkedUnidadeIds.length, 1);
  assert.equal(restrictedResult.linkedUnidadeIds[0], 'unit-allowed');
  assert.equal(restrictedResult.linkedUnidadeIds.includes('unit-forbidden'), false);
  assert.equal(restrictedResult.blockedUnidadeIds.length, 1);
  assert.equal(restrictedResult.blockedUnidadeIds[0], 'unit-allowed');
  assert.equal(restrictedResult.blockedUnidadeIds.includes('unit-forbidden'), false);

  const globalResult = toPlainJson(await checkUsuarioEmailOwnerService({
    email: 'admin@example.com',
    scope: {
      isGlobalScope: true,
      hasAuthoritativeAuthContext: true,
      scopedUnitId: 'unit-scope',
    },
  }));

  assert.equal(globalResult.kind, 'ok');
  assert.equal(globalResult.exists, true);
  assert.equal(globalResult.membershipsCount, 2);
  assert.equal(globalResult.membershipsSummary.length, 2);
  assert.equal(globalResult.membershipsSummary[0].unidade_id, 'unit-allowed');
  assert.equal(globalResult.membershipsSummary[1].unidade_id, 'unit-forbidden');
  assert.equal(globalResult.linkedUnidadeIds.length, 2);
  assert.equal(globalResult.linkedUnidadeIds[0], 'unit-allowed');
  assert.equal(globalResult.linkedUnidadeIds[1], 'unit-forbidden');
  assert.equal(globalResult.blockedUnidadeIds.length, 2);
  assert.equal(globalResult.blockedUnidadeIds[0], 'unit-allowed');
  assert.equal(globalResult.blockedUnidadeIds[1], 'unit-forbidden');

  assert.equal(membershipQueryCalls.length, 2);
  assert.equal(membershipQueryCalls[0][0], 'user-1');
  assert.equal(membershipQueryCalls[1][0], 'user-1');
  assert.equal(allowedUnitLookupCalls.length, 1);
  assert.equal(allowedUnitLookupCalls[0], 'principal-1');
  assert.equal(unidadesLookupCalls.length, 2);
  assert.equal(unidadesLookupCalls[0].length, 1);
  assert.equal(unidadesLookupCalls[0][0], 'unit-allowed');
  assert.equal(unidadesLookupCalls[1].length, 2);
  assert.equal(unidadesLookupCalls[1][0], 'unit-allowed');
  assert.equal(unidadesLookupCalls[1][1], 'unit-forbidden');
});