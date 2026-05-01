import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { registerHooks } from 'node:module';

const FEEDBACK_REPOSITORY_MOCK_MODULE_URL = 'mock:gestor-feedback-list200-unit-scope-repository';

const state = {
  calls200: [],
  calls500: [],
};

globalThis.__GESTOR_FEEDBACK_LIST200_UNIT_SCOPE_BRIDGE_STATE__ = state;

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
          'const state = globalThis.__GESTOR_FEEDBACK_LIST200_UNIT_SCOPE_BRIDGE_STATE__ || { calls200: [], calls500: [] };',
          'const capture = (args) => JSON.parse(JSON.stringify(args));',
          'export async function createFeedbackRepo() { return null; }',
          'export async function findFeedbackByFilterSortCreatedAtDescLimit200LeanRepo(args) {',
          '  state.calls200.push(capture(args));',
          '  return [];',
          '}',
          'export async function findFeedbackByFilterSortCreatedAtDescLimit500LeanRepo(args) {',
          '  state.calls500.push(capture(args));',
          '  return [];',
          '}',
          'export async function findFeedbackByIdAndDeleteLeanRepo() { return null; }',
          'export async function findFeedbackByIdAndUpdateSetNewLeanRepo() { return null; }',
          'export async function findFeedbackByIdLeanRepo() { return null; }',
          'export async function findFeedbackByIdRepo() { return null; }',
        ].join('\n'),
      };
    }

    return nextLoad(url, context);
  },
});

const {
  findFeedbackByFilterSortCreatedAtDescLimit200Lean,
  findFeedbackByFilterSortCreatedAtDescLimit500Lean,
} = await import('#modules/gestor/app/db/api.db.js');

const SCOPED_UNIT_ID = '507f191e810c19729de860ff';
const BASE_FILTER = { 'criadoPor.userId': 'user-1' };

function expectedScopedLegacyFilter() {
  return {
    $and: [
      { 'criadoPor.userId': 'user-1' },
      {
        $or: [
          { unidade_id: SCOPED_UNIT_ID },
          { unidade_id: { $exists: false } },
          { unidade_id: null },
        ],
      },
    ],
  };
}

function resetState() {
  state.calls200.length = 0;
  state.calls500.length = 0;
}

test.afterEach(() => {
  resetState();
});

after(() => {
  delete globalThis.__GESTOR_FEEDBACK_LIST200_UNIT_SCOPE_BRIDGE_STATE__;
});

test('helper 200 preserva unitScope global mesmo com intencao scoped e filtro legacy ativo', async () => {
  await findFeedbackByFilterSortCreatedAtDescLimit200Lean(BASE_FILTER, {
    scopedUnitId: SCOPED_UNIT_ID,
    allowLegacyUnscoped: true,
    preferScopedRepoRead: true,
  });

  assert.deepEqual(state.calls200, [
    {
      unitScope: { type: 'global', unidadeId: null },
      filter: expectedScopedLegacyFilter(),
    },
  ]);
  assert.deepEqual(state.calls500, []);
});

test('helper 500 usa unitScope por unidade no mesmo cenario e preserva o mesmo filtro legacy', async () => {
  await findFeedbackByFilterSortCreatedAtDescLimit500Lean(BASE_FILTER, {
    scopedUnitId: SCOPED_UNIT_ID,
    allowLegacyUnscoped: true,
    preferScopedRepoRead: true,
  });

  assert.deepEqual(state.calls500, [
    {
      unitScope: { type: 'unit', unidadeId: SCOPED_UNIT_ID },
      filter: expectedScopedLegacyFilter(),
    },
  ]);
  assert.deepEqual(state.calls200, []);
});

test('helper 500 preserva fallback global quando preferScopedRepoRead nao vem true', async () => {
  await findFeedbackByFilterSortCreatedAtDescLimit500Lean(BASE_FILTER, {
    scopedUnitId: SCOPED_UNIT_ID,
    allowLegacyUnscoped: true,
  });

  assert.deepEqual(state.calls500, [
    {
      unitScope: { type: 'global', unidadeId: null },
      filter: expectedScopedLegacyFilter(),
    },
  ]);
});