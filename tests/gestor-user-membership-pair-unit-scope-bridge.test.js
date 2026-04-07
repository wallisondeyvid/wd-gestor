import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test, { after } from 'node:test';

const USER_MEMBERSHIP_REPOSITORY_MOCK_MODULE_URL = 'mock:gestor-user-membership-pair-unit-scope-repository';

const harnessState = {
  findCalls: [],
  createCalls: [],
};

globalThis.__GESTOR_USER_MEMBERSHIP_PAIR_UNIT_SCOPE_STATE__ = harnessState;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '#modules/gestor/app/repositories/UserMembershipRepository.js') {
      return { url: USER_MEMBERSHIP_REPOSITORY_MOCK_MODULE_URL, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === USER_MEMBERSHIP_REPOSITORY_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'const state = globalThis.__GESTOR_USER_MEMBERSHIP_PAIR_UNIT_SCOPE_STATE__ || { findCalls: [], createCalls: [] };',
          'export async function findActiveMembershipsByUserIdLeanRepo() { return []; }',
          'export async function findUserMembershipsByUserIdsLeanRepo() { return []; }',
          'export async function setUserMembershipFuncionarioIdIfEmptyRepo() { return null; }',
          'export async function findUserMembershipByUserAndUnidadeLeanRepo(args) {',
          '  state.findCalls.push(JSON.parse(JSON.stringify(args)));',
          '  return null;',
          '}',
          'export async function createUserMembershipRepo(args) {',
          '  state.createCalls.push(JSON.parse(JSON.stringify(args)));',
          '  return { _id: "membership-test", ...(args.data || {}) };',
          '}',
        ].join('\n'),
      };
    }
    return nextLoad(url, context);
  },
});

const { findUserMembershipByUserAndUnidade, createUserMembership } = await import('#modules/gestor/app/db/api.db.js');

after(() => {
  delete globalThis.__GESTOR_USER_MEMBERSHIP_PAIR_UNIT_SCOPE_STATE__;
});

function resetState() {
  harnessState.findCalls.length = 0;
  harnessState.createCalls.length = 0;
}

test('findUserMembershipByUserAndUnidade usa unitScope unitario quando unidadeId explicito e valido', async () => {
  resetState();

  await findUserMembershipByUserAndUnidade('user-1', '507f191e810c19729de860ea');

  assert.deepEqual(harnessState.findCalls, [
    {
      unitScope: { type: 'unit', unidadeId: '507f191e810c19729de860ea' },
      userId: 'user-1',
      unidadeId: '507f191e810c19729de860ea',
    },
  ]);
});

test('createUserMembership usa unitScope unitario quando data.unidade_id explicito e valido', async () => {
  resetState();

  await createUserMembership({
    user_id: 'user-2',
    unidade_id: '507f191e810c19729de860eb',
    papel_contextual: 'gestor',
    status: 'active',
  });

  assert.deepEqual(harnessState.createCalls, [
    {
      unitScope: { type: 'unit', unidadeId: '507f191e810c19729de860eb' },
      data: {
        user_id: 'user-2',
        unidade_id: '507f191e810c19729de860eb',
        papel_contextual: 'gestor',
        status: 'active',
      },
    },
  ]);
});

test('createUserMembership preserva fallback global quando unidade_id nao e valido', async () => {
  resetState();

  await createUserMembership({
    user_id: 'user-3',
    unidade_id: 'sem-object-id',
    papel_contextual: 'gestor',
    status: 'active',
  });

  assert.deepEqual(harnessState.createCalls, [
    {
      unitScope: { type: 'global', unidadeId: null },
      data: {
        user_id: 'user-3',
        unidade_id: 'sem-object-id',
        papel_contextual: 'gestor',
        status: 'active',
      },
    },
  ]);
});