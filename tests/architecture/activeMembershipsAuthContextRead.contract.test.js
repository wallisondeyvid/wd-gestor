import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const PROJECT_ROOT = process.cwd();
const REPOSITORY_PATH = path.join(PROJECT_ROOT, 'src/modules/gestor/app/repositories/UserMembershipRepository.js');
const FACADE_PATH = path.join(PROJECT_ROOT, 'src/modules/gestor/app/data/auth/authContextReadDataFacade.js');
const AUTH_CONTEXT_DB_PATH = path.join(PROJECT_ROOT, 'src/modules/gestor/app/db/auth-context.db.js');
const BASE_REPOSITORY_PATH = path.join(PROJECT_ROOT, 'src/shared/repositories/BaseRepository.js');
const UNIT_SCOPE_PATH = path.join(PROJECT_ROOT, 'src/shared/unitScope.js');

const REPOSITORY_SOURCE = fs.readFileSync(REPOSITORY_PATH, 'utf8');
const FACADE_SOURCE = fs.readFileSync(FACADE_PATH, 'utf8');
const AUTH_CONTEXT_DB_SOURCE = fs.readFileSync(AUTH_CONTEXT_DB_PATH, 'utf8');
const BASE_REPOSITORY_SOURCE = fs.readFileSync(BASE_REPOSITORY_PATH, 'utf8');
const UNIT_SCOPE_SOURCE = fs.readFileSync(UNIT_SCOPE_PATH, 'utf8');

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

function getFunctionBlock(source, signature) {
  return extractFunction(source, signature);
}

function buildFunction(source, signature, context = {}) {
  const functionSource = extractFunction(source, signature);
  const script = new vm.Script(`(${functionSource})`);
  return script.runInNewContext(context);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertSourceDoesNotContain(source, terms, label) {
  for (const term of terms) {
    const pattern = new RegExp(escapeRegExp(term), 'i');
    assert.equal(pattern.test(source), false, `${label} nao deve conter referencia a ${term}`);
  }
}

test('UserMembershipRepository congela apenas o helper findActiveMembershipsByUserIdLeanRepo como slice read-only', () => {
  const helperBlock = getFunctionBlock(
    REPOSITORY_SOURCE,
    'export async function findActiveMembershipsByUserIdLeanRepo({ unitScope, userId })',
  );

  assert.match(REPOSITORY_SOURCE, /import\s+\{\s*resolveModel\s*\}\s+from\s+'#shared\/db\/resolveModel\.js';/);
  assert.match(helperBlock, /resolveModel\s*\(/);
  assert.match(helperBlock, /unitScope\s*,/);
  assert.match(helperBlock, /UserMembershipModel\.find\(\{\s*user_id:\s*userId,\s*status:\s*'active'\s*\}\)/);
  assert.match(helperBlock, /select\('_id user_id unidade_id papel_contextual status funcionario_id'\)/);
  assert.match(helperBlock, /sort\(\{\s*createdAt:\s*1\s*\}\)/);
  assert.match(helperBlock, /lean\(\)/);

  assert.doesNotMatch(helperBlock, /create\(/);
  assert.doesNotMatch(helperBlock, /findOneAndUpdate\(/);
  assert.doesNotMatch(helperBlock, /createUserMembershipRepo/);
  assert.doesNotMatch(helperBlock, /setUserMembershipFuncionarioIdIfEmptyRepo/);
  assert.doesNotMatch(REPOSITORY_SOURCE, /extends\s+BaseRepository/);
  assert.doesNotMatch(REPOSITORY_SOURCE, /from\s+'#shared\/repositories\/BaseRepository\.js'/);

  assert.equal(BASE_REPOSITORY_SOURCE.includes('applyTenantFilter'), true);
  assert.equal(UNIT_SCOPE_SOURCE.includes("type: 'global'"), true);
});

test('authContextReadDataFacade.loadActiveMembershipsByUserIdData permanece facade fina com GLOBAL_SCOPE explicito', async () => {
  const facadeBlock = getFunctionBlock(
    FACADE_SOURCE,
    'export async function loadActiveMembershipsByUserIdData({ userId, maxTimeMS })',
  );

  assert.match(facadeBlock, /findActiveMembershipsByUserIdLeanRepo\s*\(\{\s*unitScope:\s*GLOBAL_SCOPE,\s*userId\s*\}\)/);
  assert.match(facadeBlock, /withOptionalMaxTime\(query, maxTimeMS\)/);
  assert.doesNotMatch(facadeBlock, /loadUnidadeById/i);
  assert.doesNotMatch(facadeBlock, /createUserMembership|setUserMembershipFuncionarioIdIfEmpty|unlock|toggle/i);
  assert.doesNotMatch(facadeBlock, /login|sess[aã]o|requireLogin|requireRole|requireUnitScope|authController|widget settings|pages|bundles/i);

  const withOptionalMaxTime = buildFunction(
    FACADE_SOURCE,
    'function withOptionalMaxTime(query, maxTimeMS)',
  );

  const calls = [];
  const loadActiveMembershipsByUserIdData = buildFunction(
    FACADE_SOURCE,
    'export async function loadActiveMembershipsByUserIdData({ userId, maxTimeMS })',
    {
      GLOBAL_SCOPE: { type: 'global', unidadeId: null },
      withOptionalMaxTime,
      findActiveMembershipsByUserIdLeanRepo: (args) => {
        calls.push(JSON.parse(JSON.stringify(args)));
        return {
          maxTimeMS(value) {
            return { tagged: true, value };
          },
        };
      },
    },
  );

  const result = await loadActiveMembershipsByUserIdData({ userId: 'user-1', maxTimeMS: 4321 });

  assert.deepEqual(calls, [
    {
      unitScope: { type: 'global', unidadeId: null },
      userId: 'user-1',
    },
  ]);
  assert.deepEqual(result, { tagged: true, value: 4321 });
});

test('auth-context.db.loadActiveMembershipsByUserId preserva o mesmo handoff read-only com GLOBAL_SCOPE explicito', async () => {
  const bridgeBlock = getFunctionBlock(
    AUTH_CONTEXT_DB_SOURCE,
    'export async function loadActiveMembershipsByUserId({ userId, maxTimeMS })',
  );

  assert.match(bridgeBlock, /findActiveMembershipsByUserIdLeanRepo\s*\(\{\s*unitScope:\s*GLOBAL_SCOPE,\s*userId\s*\}\)/);
  assert.match(bridgeBlock, /withOptionalMaxTime\(query, maxTimeMS\)/);
  assert.doesNotMatch(bridgeBlock, /loadUnidadeById/i);
  assert.doesNotMatch(bridgeBlock, /createUserMembership|setUserMembershipFuncionarioIdIfEmpty|unlock|toggle/i);

  const withOptionalMaxTime = buildFunction(
    AUTH_CONTEXT_DB_SOURCE,
    'function withOptionalMaxTime(query, maxTimeMS)',
  );

  const calls = [];
  const loadActiveMembershipsByUserId = buildFunction(
    AUTH_CONTEXT_DB_SOURCE,
    'export async function loadActiveMembershipsByUserId({ userId, maxTimeMS })',
    {
      GLOBAL_SCOPE: { type: 'global', unidadeId: null },
      withOptionalMaxTime,
      findActiveMembershipsByUserIdLeanRepo: (args) => {
        calls.push(JSON.parse(JSON.stringify(args)));
        return {
          maxTimeMS(value) {
            return { dbTagged: true, value };
          },
        };
      },
    },
  );

  const result = await loadActiveMembershipsByUserId({ userId: 'user-2', maxTimeMS: 9876 });

  assert.deepEqual(calls, [
    {
      unitScope: { type: 'global', unidadeId: null },
      userId: 'user-2',
    },
  ]);
  assert.deepEqual(result, { dbTagged: true, value: 9876 });
});

test('loadUnidadeById permanece apenas helper adjacente read-only e nao alvo principal do contrato', () => {
  const helperBlock = getFunctionBlock(
    FACADE_SOURCE,
    'export async function loadUnidadeByIdData({ unidadeId, maxTimeMS })',
  );
  const bridgeBlock = getFunctionBlock(
    AUTH_CONTEXT_DB_SOURCE,
    'export async function loadUnidadeById({ unidadeId, maxTimeMS })',
  );

  assert.match(helperBlock, /findUnidadeByIdLeanRepo/);
  assert.match(helperBlock, /scopeFromUnidadeId\(unidadeId\)/);
  assert.match(helperBlock, /const unidade = await query/);
  assert.doesNotMatch(helperBlock, /createUserMembership|setUserMembershipFuncionarioIdIfEmpty|save\(|update|delete/i);

  assert.match(bridgeBlock, /findUnidadeByIdLeanRepo/);
  assert.match(bridgeBlock, /scopeFromUnidadeId\(unidadeId\)/);
  assert.doesNotMatch(bridgeBlock, /createUserMembership|setUserMembershipFuncionarioIdIfEmpty|save\(|update|delete/i);

  const activeMembershipsFacadeBlock = getFunctionBlock(
    FACADE_SOURCE,
    'export async function loadActiveMembershipsByUserIdData({ userId, maxTimeMS })',
  );
  assert.doesNotMatch(activeMembershipsFacadeBlock, /loadUnidadeByIdData/);
});

test('corredor congelado nao depende de app, server, supertest, rotas, bootstrap ou infra real', () => {
  const helperBlock = getFunctionBlock(
    REPOSITORY_SOURCE,
    'export async function findActiveMembershipsByUserIdLeanRepo({ unitScope, userId })',
  );
  const facadeBlock = getFunctionBlock(
    FACADE_SOURCE,
    'export async function loadActiveMembershipsByUserIdData({ userId, maxTimeMS })',
  );
  const bridgeBlock = getFunctionBlock(
    AUTH_CONTEXT_DB_SOURCE,
    'export async function loadActiveMembershipsByUserId({ userId, maxTimeMS })',
  );

  const forbiddenTerms = [
    'supertest',
    '#routes/',
    '#server/',
    'createServer',
    'server.js',
    'start.js',
    'bootstrap',
    'request path',
    'Portal',
    'tenant registry',
    'Mongo real',
    'tenant DB real',
    'PostgreSQL',
    'mongoose.connect',
    'createConnection',
    'process.argv',
    'job',
    'CLI',
    'script',
  ];

  assertSourceDoesNotContain(helperBlock, forbiddenTerms, 'helper do repository');
  assertSourceDoesNotContain(facadeBlock, forbiddenTerms, 'facade de memberships ativos');
  assertSourceDoesNotContain(bridgeBlock, forbiddenTerms, 'bridge auth-context.db');
  assertSourceDoesNotContain(FACADE_SOURCE, ['supertest', '#routes/', 'createServer'], 'authContextReadDataFacade');
  assertSourceDoesNotContain(AUTH_CONTEXT_DB_SOURCE, ['supertest', '#routes/', 'createServer'], 'auth-context.db');
});