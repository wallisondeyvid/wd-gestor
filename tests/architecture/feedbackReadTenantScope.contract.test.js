import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test, { after } from 'node:test';
import { registerHooks } from 'node:module';

const PROJECT_ROOT = process.cwd();
const FEEDBACK_REPOSITORY_PATH = path.join(PROJECT_ROOT, 'src/modules/gestor/app/repositories/FeedbackReadRepository.js');
const API_DB_PATH = path.join(PROJECT_ROOT, 'src/modules/gestor/app/db/api.db.js');
const FEEDBACK_LIST_CONTROLLER_PATH = path.join(PROJECT_ROOT, 'src/modules/gestor/app/controllers/feedbackListApiController.js');
const FEEDBACK_MY_LIST_CONTROLLER_PATH = path.join(PROJECT_ROOT, 'src/modules/gestor/app/controllers/feedbackMyListApiController.js');
const LEGACY_API_DB_BRIDGE_PATH = path.join(PROJECT_ROOT, 'src/modules/gestor/app/services/legacy/apiDbBridgeService.js');
const UNIT_SCOPE_PATH = path.join(PROJECT_ROOT, 'src/shared/unitScope.js');
const BASE_REPOSITORY_PATH = path.join(PROJECT_ROOT, 'src/shared/repositories/BaseRepository.js');

const FEEDBACK_REPOSITORY_SOURCE = fs.readFileSync(FEEDBACK_REPOSITORY_PATH, 'utf8');
const API_DB_SOURCE = fs.readFileSync(API_DB_PATH, 'utf8');
const FEEDBACK_LIST_CONTROLLER_SOURCE = fs.readFileSync(FEEDBACK_LIST_CONTROLLER_PATH, 'utf8');
const FEEDBACK_MY_LIST_CONTROLLER_SOURCE = fs.readFileSync(FEEDBACK_MY_LIST_CONTROLLER_PATH, 'utf8');
const LEGACY_API_DB_BRIDGE_SOURCE = fs.readFileSync(LEGACY_API_DB_BRIDGE_PATH, 'utf8');
const UNIT_SCOPE_SOURCE = fs.readFileSync(UNIT_SCOPE_PATH, 'utf8');
const BASE_REPOSITORY_SOURCE = fs.readFileSync(BASE_REPOSITORY_PATH, 'utf8');

const FEEDBACK_REPOSITORY_MOCK_MODULE_URL = 'mock:feedback-read-tenant-scope-repository';

const bridgeState = {
  calls200: [],
  calls500: [],
};

globalThis.__FEEDBACK_READ_TENANT_SCOPE_BRIDGE_STATE__ = bridgeState;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '#modules/gestor/app/repositories/FeedbackReadRepository.js') {
      return { url: FEEDBACK_REPOSITORY_MOCK_MODULE_URL, shortCircuit: true };
    }

    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === FEEDBACK_REPOSITORY_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'const state = globalThis.__FEEDBACK_READ_TENANT_SCOPE_BRIDGE_STATE__ || { calls200: [], calls500: [] };',
          'const capture = (value) => JSON.parse(JSON.stringify(value));',
          'export async function createFeedbackRepo() { return null; }',
          'export async function findFeedbackByIdRepo() { return null; }',
          'export async function findFeedbackByIdLeanRepo() { return null; }',
          'export async function findFeedbackByIdAndUpdateSetNewLeanRepo() { return null; }',
          'export async function findFeedbackByIdAndDeleteLeanRepo() { return null; }',
          'export async function findFeedbackByFilterSortCreatedAtDescLimit200LeanRepo(args) { state.calls200.push(capture(args)); return []; }',
          'export async function findFeedbackByFilterSortCreatedAtDescLimit500LeanRepo(args) { state.calls500.push(capture(args)); return []; }',
        ].join('\n'),
      };
    }

    return nextLoad(url, context);
  },
});

after(() => {
  delete globalThis.__FEEDBACK_READ_TENANT_SCOPE_BRIDGE_STATE__;
});

function resetBridgeState() {
  bridgeState.calls200.length = 0;
  bridgeState.calls500.length = 0;
}

test.afterEach(() => {
  resetBridgeState();
});

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractFunctionBlock(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `Nao foi possivel localizar a assinatura: ${signature}`);

  const bodyStart = source.indexOf('{', start + signature.length);
  assert.ok(bodyStart >= 0, `Nao foi possivel localizar o corpo da assinatura: ${signature}`);

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }

  assert.fail(`Nao foi possivel fechar o bloco da assinatura: ${signature}`);
}

function expectedScopedLegacyFilter(scopedUnitId) {
  return {
    $and: [
      { 'criadoPor.userId': 'user-1' },
      {
        $or: [
          { unidade_id: scopedUnitId },
          { unidade_id: { $exists: false } },
          { unidade_id: null },
        ],
      },
    ],
  };
}

test('FeedbackReadRepository congela o slice de leitura limitada 200/500 com resolveModel e unitScope explicito sem forcar BaseRepository', () => {
  const helper200Block = extractFunctionBlock(
    FEEDBACK_REPOSITORY_SOURCE,
    'export async function findFeedbackByFilterSortCreatedAtDescLimit200LeanRepo({ unitScope, filter })',
  );
  const helper500Block = extractFunctionBlock(
    FEEDBACK_REPOSITORY_SOURCE,
    'export async function findFeedbackByFilterSortCreatedAtDescLimit500LeanRepo({ unitScope, filter })',
  );
  const protectedSlice = `${helper200Block}\n${helper500Block}`;

  assert.match(helper200Block, /resolveModel\s*\(/);
  assert.match(helper200Block, /unitScope,/);
  assert.match(helper200Block, /FeedbackModel\.find\(filter\)/);
  assert.match(helper200Block, /\.limit\(200\)/);
  assert.match(helper200Block, /\.lean\(\)/);

  assert.match(helper500Block, /resolveModel\s*\(/);
  assert.match(helper500Block, /unitScope,/);
  assert.match(helper500Block, /FeedbackModel\.find\(filter\)/);
  assert.match(helper500Block, /\.limit\(500\)/);
  assert.match(helper500Block, /\.lean\(\)/);

  assert.doesNotMatch(protectedSlice, /findFeedbackByIdAndUpdateSetNewLeanRepo|findFeedbackByIdAndDeleteLeanRepo|createFeedbackRepo|findFeedbackByIdRepo|findFeedbackByIdLeanRepo/);
  assert.doesNotMatch(protectedSlice, /findWidgetSettingsFeedbackLean|updateWidgetSettingsFeedbackModuleEnabledUpsert|upload|resposta|detail|detalhe/i);
  assert.doesNotMatch(FEEDBACK_REPOSITORY_SOURCE, /class\s+FeedbackReadRepository\s+extends\s+BaseRepository/);
  assert.equal(FEEDBACK_REPOSITORY_SOURCE.includes('tenantRegistry'), false);
  assert.equal(FEEDBACK_REPOSITORY_SOURCE.includes('unitDatabaseRegistry'), false);
  assert.equal(FEEDBACK_REPOSITORY_SOURCE.includes('createServer'), false);
  assert.equal(FEEDBACK_REPOSITORY_SOURCE.includes('start.js'), false);
  assert.equal(FEEDBACK_REPOSITORY_SOURCE.includes('server.js'), false);
  assert.equal(FEEDBACK_REPOSITORY_SOURCE.includes('bootstrap'), false);
});

test('api.db congela as bridges 200/500 pequenas e o handoff tenant-aware atual do corredor de leitura limitada', async () => {
  const bridge200Block = extractFunctionBlock(
    API_DB_SOURCE,
    'export async function findFeedbackByFilterSortCreatedAtDescLimit200Lean(filter, options = {})',
  );
  const bridge500Block = extractFunctionBlock(
    API_DB_SOURCE,
    'export async function findFeedbackByFilterSortCreatedAtDescLimit500Lean(filter, options = {})',
  );
  const resolveScopeBlock = extractFunctionBlock(
    API_DB_SOURCE,
    'function resolveFeedbackReadUnitScope(options = {})',
  );
  const scopedFilterBlock = extractFunctionBlock(
    API_DB_SOURCE,
    'function buildFeedbackScopedFilter(filter, options = {})',
  );
  const protectedSlice = `${resolveScopeBlock}\n${scopedFilterBlock}\n${bridge200Block}\n${bridge500Block}`;

  assert.match(resolveScopeBlock, /preferScopedRepoRead\s*!==\s*true/);
  assert.match(resolveScopeBlock, /return GLOBAL_SCOPE/);
  assert.match(resolveScopeBlock, /return scopeFromUnidadeId\(scopedUnitId\)/);

  assert.match(scopedFilterBlock, /allowLegacyUnscoped/);
  assert.match(scopedFilterBlock, /unidade_id: scopedUnitId/);

  assert.match(bridge200Block, /findFeedbackByFilterSortCreatedAtDescLimit200LeanRepo/);
  assert.match(bridge200Block, /resolveFeedbackReadUnitScope\(options\)/);
  assert.match(bridge200Block, /buildFeedbackScopedFilter\(filter, options\)/);
  assert.doesNotMatch(bridge200Block, /findFeedbackByIdAndUpdateSetNewLean|findFeedbackByIdAndDeleteLean|findWidgetSettingsFeedbackLean|updateWidgetSettingsFeedbackModuleEnabledUpsert/);

  assert.match(bridge500Block, /findFeedbackByFilterSortCreatedAtDescLimit500LeanRepo/);
  assert.match(bridge500Block, /resolveFeedbackReadUnitScope\(options\)/);
  assert.match(bridge500Block, /buildFeedbackScopedFilter\(filter, options\)/);
  assert.doesNotMatch(bridge500Block, /findFeedbackByIdAndUpdateSetNewLean|findFeedbackByIdAndDeleteLean|findWidgetSettingsFeedbackLean|updateWidgetSettingsFeedbackModuleEnabledUpsert/);

  assert.doesNotMatch(protectedSlice, /tenantRegistry|unitDatabaseRegistry|createServer|start\.js|server\.js|bootstrap|supertest|mongoose\.connect|useDb\(/i);
  assert.doesNotMatch(protectedSlice, /#routes\//);

  const {
    findFeedbackByFilterSortCreatedAtDescLimit200Lean,
    findFeedbackByFilterSortCreatedAtDescLimit500Lean,
  } = await import('#modules/gestor/app/db/api.db.js');

  const scopedUnitId = '507f191e810c19729de860ff';
  const baseFilter = { 'criadoPor.userId': 'user-1' };

  await findFeedbackByFilterSortCreatedAtDescLimit200Lean(baseFilter, {
    scopedUnitId,
    allowLegacyUnscoped: true,
    preferScopedRepoRead: true,
  });
  await findFeedbackByFilterSortCreatedAtDescLimit500Lean(baseFilter, {
    scopedUnitId,
    allowLegacyUnscoped: true,
    preferScopedRepoRead: true,
  });

  assert.deepEqual(bridgeState.calls200, [
    {
      unitScope: { type: 'unit', unidadeId: scopedUnitId },
      filter: expectedScopedLegacyFilter(scopedUnitId),
    },
  ]);
  assert.deepEqual(bridgeState.calls500, [
    {
      unitScope: { type: 'unit', unidadeId: scopedUnitId },
      filter: expectedScopedLegacyFilter(scopedUnitId),
    },
  ]);
});

test('feedbackListApiController e feedbackMyListApiController permanecem owners separados sem expandir para status, resposta, delete, upload ou widget settings neste contrato', () => {
  const adminOwnerBlock = extractFunctionBlock(
    FEEDBACK_LIST_CONTROLLER_SOURCE,
    'export function createAdminFeedbackListHandler({',
  );
  const myListOwnerBlock = extractFunctionBlock(
    FEEDBACK_MY_LIST_CONTROLLER_SOURCE,
    'export function createMyFeedbackListHandler({',
  );
  const combinedOwners = `${adminOwnerBlock}\n${myListOwnerBlock}`;

  assert.match(adminOwnerBlock, /findFeedbackByFilterSortCreatedAtDescLimit500Lean/);
  assert.match(adminOwnerBlock, /feedbackPolicy\.ensureAdminAccess/);
  assert.match(adminOwnerBlock, /processAdminFeedbackListFilterCore/);
  assert.doesNotMatch(adminOwnerBlock, /findFeedbackByIdAndDeleteLean|findFeedbackByIdAndUpdateSetNewLean|findWidgetSettingsFeedbackLean|upload|resposta|detail|detalhe/i);

  assert.match(myListOwnerBlock, /findFeedbackByFilterSortCreatedAtDescLimit200Lean/);
  assert.match(myListOwnerBlock, /feedbackPolicy\.buildMyFeedbackFilter/);
  assert.match(myListOwnerBlock, /preferScopedRepoRead:\s*true/);
  assert.doesNotMatch(myListOwnerBlock, /findFeedbackByIdAndDeleteLean|findFeedbackByIdAndUpdateSetNewLean|findWidgetSettingsFeedbackLean|upload|resposta|detail|detalhe/i);

  assert.doesNotMatch(combinedOwners, /findWidgetSettingsFeedbackLean|updateFeedbackStatusService|updateFeedbackResposta|uploadFeedback/i);
  assert.equal(combinedOwners.includes('tenantRegistry'), false);
  assert.equal(combinedOwners.includes('unitDatabaseRegistry'), false);
  assert.equal(combinedOwners.includes('createServer'), false);
  assert.equal(combinedOwners.includes('start.js'), false);
  assert.equal(combinedOwners.includes('server.js'), false);
  assert.equal(combinedOwners.includes('bootstrap'), false);
  assert.doesNotMatch(combinedOwners, /#routes\//);
});

test('corredor protegido nao depende de harness sintetico, tenant registry, bootstrap operacional ou tenant DB real', () => {
  const protectedSlice = [
    extractFunctionBlock(
      FEEDBACK_REPOSITORY_SOURCE,
      'export async function findFeedbackByFilterSortCreatedAtDescLimit200LeanRepo({ unitScope, filter })',
    ),
    extractFunctionBlock(
      FEEDBACK_REPOSITORY_SOURCE,
      'export async function findFeedbackByFilterSortCreatedAtDescLimit500LeanRepo({ unitScope, filter })',
    ),
    extractFunctionBlock(
      API_DB_SOURCE,
      'function resolveFeedbackReadUnitScope(options = {})',
    ),
    extractFunctionBlock(
      API_DB_SOURCE,
      'function buildFeedbackScopedFilter(filter, options = {})',
    ),
    extractFunctionBlock(
      API_DB_SOURCE,
      'export async function findFeedbackByFilterSortCreatedAtDescLimit200Lean(filter, options = {})',
    ),
    extractFunctionBlock(
      API_DB_SOURCE,
      'export async function findFeedbackByFilterSortCreatedAtDescLimit500Lean(filter, options = {})',
    ),
    extractFunctionBlock(
      FEEDBACK_LIST_CONTROLLER_SOURCE,
      'export function createAdminFeedbackListHandler({',
    ),
    extractFunctionBlock(
      FEEDBACK_MY_LIST_CONTROLLER_SOURCE,
      'export function createMyFeedbackListHandler({',
    ),
    LEGACY_API_DB_BRIDGE_SOURCE,
  ].join('\n');

  assert.match(UNIT_SCOPE_SOURCE, /type:\s*'unit'/);
  assert.match(UNIT_SCOPE_SOURCE, /type:\s*'global'/);
  assert.match(BASE_REPOSITORY_SOURCE, /class BaseRepository/);
  assert.match(LEGACY_API_DB_BRIDGE_SOURCE, /export \* from '#modules\/gestor\/app\/db\/api\.db\.js';/);

  assert.doesNotMatch(protectedSlice, /tenantRegistry|unitDatabaseRegistry|primeUnitDatabaseRegistryCache|resolveConnection|useDb\(|mongoose\.connect|mongodb:\/\//i);
  assert.doesNotMatch(protectedSlice, /createServer|server\.js|start\.js|bootstrap|supertest/i);
  assert.doesNotMatch(protectedSlice, /#routes\//);
  assert.doesNotMatch(protectedSlice, /scripts\//i);
  assert.doesNotMatch(protectedSlice, /findWidgetSettingsFeedbackLean|uploadFeedback|findFeedbackByIdAndDeleteLean|findFeedbackByIdAndUpdateSetNewLean|detail runtime|detail controller/i);
});

test('slice principal permanece limitado ao corredor de leitura limitada de Feedback e nao força migracao para BaseRepository', () => {
  const protectedSlices = [
    extractFunctionBlock(
      FEEDBACK_REPOSITORY_SOURCE,
      'export async function findFeedbackByFilterSortCreatedAtDescLimit200LeanRepo({ unitScope, filter })',
    ),
    extractFunctionBlock(
      FEEDBACK_REPOSITORY_SOURCE,
      'export async function findFeedbackByFilterSortCreatedAtDescLimit500LeanRepo({ unitScope, filter })',
    ),
    extractFunctionBlock(
      API_DB_SOURCE,
      'export async function findFeedbackByFilterSortCreatedAtDescLimit200Lean(filter, options = {})',
    ),
    extractFunctionBlock(
      API_DB_SOURCE,
      'export async function findFeedbackByFilterSortCreatedAtDescLimit500Lean(filter, options = {})',
    ),
    extractFunctionBlock(
      FEEDBACK_LIST_CONTROLLER_SOURCE,
      'export function createAdminFeedbackListHandler({',
    ),
    extractFunctionBlock(
      FEEDBACK_MY_LIST_CONTROLLER_SOURCE,
      'export function createMyFeedbackListHandler({',
    ),
  ].join('\n');

  for (const forbidden of [
    'findFeedbackByIdAndUpdateSetNewLean',
    'findFeedbackByIdAndDeleteLean',
    'findWidgetSettingsFeedbackLean',
    'updateWidgetSettingsFeedbackModuleEnabledUpsert',
    'createFeedbackRepo',
    'createServer',
  ]) {
    assert.equal(protectedSlices.includes(forbidden), false, `Slice principal nao deve expandir para ${forbidden}.`);
  }

  for (const forbiddenPattern of [
    /findWidgetSettingsFeedbackLean/i,
    /updateWidgetSettingsFeedbackModuleEnabledUpsert/i,
    /uploadFeedback/i,
    /findFeedbackByIdAndDeleteLean/i,
    /detail|detalhe/i,
    /tenantRegistry|unitDatabaseRegistry/i,
  ]) {
    assert.doesNotMatch(protectedSlices, forbiddenPattern);
  }

  assert.doesNotMatch(FEEDBACK_REPOSITORY_SOURCE, new RegExp(escapeRegex('extends BaseRepository')));
  assert.doesNotMatch(API_DB_SOURCE, /new BaseRepository/);
});