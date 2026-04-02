import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/funcionarioApiController.js');
const SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

function buildFunctionFromSource(functionSource, context = {}) {
  const script = new vm.Script(`(${functionSource})`);
  return script.runInNewContext(context);
}

function buildObjectFromSource(source, context = {}) {
  const script = new vm.Script(source);
  return script.runInNewContext(context);
}

function toPlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function countOccurrences(source, fragment) {
  return source.split(fragment).length - 1;
}

function buildAutoUserLinkCoreSource() {
  return `async function createFuncionarioAutoUserLinkCore({
    funcionario,
    resolveRole,
    buildMembershipPayload,
    findUserByEmail,
    provisionUser,
    findUserMembershipByUserAndUnidade,
    createUserMembership,
    syncMembershipFuncionario,
    syncFuncionarioUsuario,
    syncLegacyUserFuncionario,
    isDuplicateMembershipError,
    resolveMessage,
  } = {}) {
    try {
      const emailNorm = String(funcionario?.email || '').trim().toLowerCase();
      const unidadeId = String(funcionario?.unidade_id || '').trim();
      const role = resolveRole(funcionario);
      let user = await findUserByEmail(emailNorm);
      const reusedUser = !!user;

      if (!user) {
        user = await provisionUser({
          nome: funcionario?.nome,
          email: emailNorm,
          cpf: funcionario?.cpf,
          role,
          unidade_id: funcionario?.unidade_id,
          funcionario_id: funcionario?._id,
        });
      }

      const membershipPayload = buildMembershipPayload({
        userId: user?._id,
        role,
        unidadeId,
        funcionarioId: funcionario?._id,
      });

      let outcome = reusedUser ? 'linked' : 'created';
      let code = null;
      let membershipCreated = false;
      let existingMembership = membershipPayload
        ? await findUserMembershipByUserAndUnidade(user?._id, unidadeId)
        : null;

      if (existingMembership) {
        const membershipSync = await syncMembershipFuncionario(existingMembership, funcionario?._id);
        if (membershipSync.conflict) {
          outcome = 'conflict';
          code = 'AUTO_USER_MEMBERSHIP_CONFLICT';
        } else {
          outcome = 'already-linked';
        }
      } else if (membershipPayload) {
        try {
          await createUserMembership(membershipPayload);
          membershipCreated = true;
        } catch (membershipErr) {
          if (isDuplicateMembershipError(membershipErr)) {
            existingMembership = await findUserMembershipByUserAndUnidade(user?._id, unidadeId);
            const membershipSync = await syncMembershipFuncionario(existingMembership, funcionario?._id);
            if (membershipSync.conflict) {
              outcome = 'conflict';
              code = 'AUTO_USER_MEMBERSHIP_CONFLICT';
            } else {
              outcome = 'already-linked';
            }
          } else {
            throw membershipErr;
          }
        }
      }

      const funcionarioLinked = outcome === 'conflict'
        ? false
        : await syncFuncionarioUsuario(funcionario, user?._id);
      const legacyUserLinked = outcome === 'conflict'
        ? false
        : await syncLegacyUserFuncionario(user, funcionario);

      return {
        ok: outcome !== 'conflict',
        outcome,
        code,
        message: resolveMessage(outcome),
        userId: String(user?._id || ''),
        reusedUser,
        membershipCreated,
        funcionarioLinked,
        legacyUserLinked,
      };
    } catch (error) {
      return {
        ok: false,
        outcome: 'error',
        code: 'AUTO_USER_ERROR',
        message: resolveMessage('error', error?.message || null),
      };
    }
  }`;
}

function buildDelegatedOwnersSource() {
  return `({
    async createFuncionarioInitialOwner(req, deps) {
      const funcionario = await deps.materializeInitialFuncionario(req.body);
      const autoUser = await createFuncionarioAutoUserLinkCore({
        funcionario,
        ...deps.autoUserLinkDeps,
      });
      return deps.created({ id: funcionario._id, autoUser });
    },

    async createFuncionarioOwner(req, deps) {
      const funcionario = await deps.materializeFuncionario(req.body);
      const autoUser = await createFuncionarioAutoUserLinkCore({
        funcionario,
        ...deps.autoUserLinkDeps,
      });
      return deps.created({ id: funcionario._id, autoUser });
    },
  })`;
}

test('estado real atual: o controller delega o miolo de auto user e vinculo para a seam unica', () => {
  assert.match(SOURCE, /export async function createFuncionarioInitial\(req,res\)/);
  assert.match(SOURCE, /export async function createFuncionario\(req,res\)/);
  assert.match(SOURCE, /async function createFuncionarioAutoUserLinkCore\(\{/);
  assert.match(SOURCE, /async function criarUsuarioAuto\(funcionario\)/);
  assert.match(SOURCE, /function buildAutoUserMembershipPayload\(\{ userId, role, unidadeId, funcionarioId \}\)/);
  assert.match(SOURCE, /function resolveAutoUserMessage\(outcome, fallbackMessage = null\)/);
  assert.match(SOURCE, /async function syncFuncionarioUsuarioIfEmpty\(funcionario, userId\)/);
  assert.match(SOURCE, /async function syncLegacyUserFuncionarioIfEmpty\(user, funcionario\)/);
  assert.match(SOURCE, /async function syncExistingMembershipFuncionario\(existingMembership, funcionarioId\)/);

  assert.equal(countOccurrences(SOURCE, 'const autoUser = await criarUsuarioAuto('), 2);
  assert.equal(countOccurrences(SOURCE, 'let user = await findUserByEmailFn(emailNorm);'), 1);
  assert.equal(countOccurrences(SOURCE, 'await createUserMembershipFn(membershipPayload);'), 1);
  assert.equal(countOccurrences(SOURCE, 'await syncFuncionarioUsuarioFn(funcionario, user?._id);'), 1);
  assert.equal(countOccurrences(SOURCE, 'await syncLegacyUserFuncionarioFn(user, funcionario);'), 1);
  assert.equal(countOccurrences(SOURCE, 'return createFuncionarioAutoUserLinkCore({'), 1);

  assert.doesNotMatch(SOURCE, /syncUserFuncionario/);
});

test('futura seam unica recebe apenas funcionario materializado e dependencias tecnicas de user-membership', async () => {
  const functionSource = buildAutoUserLinkCoreSource();
  assert.match(functionSource, /async function createFuncionarioAutoUserLinkCore\(\{/);
  assert.doesNotMatch(functionSource, /\breq\b/);
  assert.doesNotMatch(functionSource, /\bres\b/);
  assert.doesNotMatch(functionSource, /requestedUnitMatchesContext|getCanonicalContextUnitId|syncUserFuncionario/);

  const calls = [];
  const createFuncionarioAutoUserLinkCore = buildFunctionFromSource(functionSource, {
    String,
  });

  const createdResult = await createFuncionarioAutoUserLinkCore({
    funcionario: {
      _id: 'func-1',
      nome: 'Ana',
      email: 'ANA@empresa.com',
      cpf: '12345678901',
      unidade_id: 'u-1',
    },
    resolveRole: (funcionario) => {
      calls.push(['resolveRole', funcionario._id]);
      return 'user';
    },
    buildMembershipPayload: (input) => {
      calls.push(['buildMembershipPayload', toPlain(input)]);
      return {
        user_id: input.userId,
        unidade_id: input.unidadeId,
        funcionario_id: input.funcionarioId,
        role: input.role,
      };
    },
    findUserByEmail: async (email) => {
      calls.push(['findUserByEmail', email]);
      return null;
    },
    provisionUser: async (payload) => {
      calls.push(['provisionUser', toPlain(payload)]);
      return { _id: 'user-1' };
    },
    findUserMembershipByUserAndUnidade: async (userId, unidadeId) => {
      calls.push(['findUserMembershipByUserAndUnidade', userId, unidadeId]);
      return null;
    },
    createUserMembership: async (payload) => {
      calls.push(['createUserMembership', toPlain(payload)]);
      return { _id: 'membership-1' };
    },
    syncMembershipFuncionario: async () => {
      calls.push(['syncMembershipFuncionario']);
      return { updated: true, conflict: false };
    },
    syncFuncionarioUsuario: async (funcionario, userId) => {
      calls.push(['syncFuncionarioUsuario', funcionario._id, userId]);
      return true;
    },
    syncLegacyUserFuncionario: async (user, funcionario) => {
      calls.push(['syncLegacyUserFuncionario', user._id, funcionario._id]);
      return true;
    },
    isDuplicateMembershipError: (error) => {
      calls.push(['isDuplicateMembershipError', error?.message || null]);
      return false;
    },
    resolveMessage: (outcome, fallback) => {
      calls.push(['resolveMessage', outcome, fallback || null]);
      return `msg:${outcome}`;
    },
  });

  assert.deepEqual(toPlain(createdResult), {
    ok: true,
    outcome: 'created',
    code: null,
    message: 'msg:created',
    userId: 'user-1',
    reusedUser: false,
    membershipCreated: true,
    funcionarioLinked: true,
    legacyUserLinked: true,
  });
  assert.deepEqual(calls, [
    ['resolveRole', 'func-1'],
    ['findUserByEmail', 'ana@empresa.com'],
    ['provisionUser', {
      nome: 'Ana',
      email: 'ana@empresa.com',
      cpf: '12345678901',
      role: 'user',
      unidade_id: 'u-1',
      funcionario_id: 'func-1',
    }],
    ['buildMembershipPayload', {
      userId: 'user-1',
      role: 'user',
      unidadeId: 'u-1',
      funcionarioId: 'func-1',
    }],
    ['findUserMembershipByUserAndUnidade', 'user-1', 'u-1'],
    ['createUserMembership', {
      user_id: 'user-1',
      unidade_id: 'u-1',
      funcionario_id: 'func-1',
      role: 'user',
    }],
    ['syncFuncionarioUsuario', 'func-1', 'user-1'],
    ['syncLegacyUserFuncionario', 'user-1', 'func-1'],
    ['resolveMessage', 'created', null],
  ]);

  const conflictCalls = [];
  const conflictResult = await createFuncionarioAutoUserLinkCore({
    funcionario: {
      _id: 'func-2',
      nome: 'Bruno',
      email: 'bruno@empresa.com',
      cpf: '99999999999',
      unidade_id: 'u-9',
    },
    resolveRole: () => 'user',
    buildMembershipPayload: ({ userId, role, unidadeId, funcionarioId }) => ({ user_id: userId, role, unidade_id: unidadeId, funcionario_id: funcionarioId }),
    findUserByEmail: async (email) => {
      conflictCalls.push(['findUserByEmail', email]);
      return { _id: 'user-9' };
    },
    provisionUser: async () => {
      conflictCalls.push(['provisionUser']);
      return { _id: 'user-should-not-be-created' };
    },
    findUserMembershipByUserAndUnidade: async (userId, unidadeId) => {
      conflictCalls.push(['findUserMembershipByUserAndUnidade', userId, unidadeId]);
      return { _id: 'membership-9', funcionario_id: 'func-antigo' };
    },
    createUserMembership: async () => {
      conflictCalls.push(['createUserMembership']);
      return { _id: 'membership-new' };
    },
    syncMembershipFuncionario: async (membership, funcionarioId) => {
      conflictCalls.push(['syncMembershipFuncionario', membership._id, funcionarioId]);
      return { updated: false, conflict: true };
    },
    syncFuncionarioUsuario: async () => {
      conflictCalls.push(['syncFuncionarioUsuario']);
      return true;
    },
    syncLegacyUserFuncionario: async () => {
      conflictCalls.push(['syncLegacyUserFuncionario']);
      return true;
    },
    isDuplicateMembershipError: () => false,
    resolveMessage: (outcome, fallback) => {
      conflictCalls.push(['resolveMessage', outcome, fallback || null]);
      return `msg:${outcome}`;
    },
  });

  assert.deepEqual(toPlain(conflictResult), {
    ok: false,
    outcome: 'conflict',
    code: 'AUTO_USER_MEMBERSHIP_CONFLICT',
    message: 'msg:conflict',
    userId: 'user-9',
    reusedUser: true,
    membershipCreated: false,
    funcionarioLinked: false,
    legacyUserLinked: false,
  });
  assert.deepEqual(conflictCalls, [
    ['findUserByEmail', 'bruno@empresa.com'],
    ['findUserMembershipByUserAndUnidade', 'user-9', 'u-9'],
    ['syncMembershipFuncionario', 'membership-9', 'func-2'],
    ['resolveMessage', 'conflict', null],
  ]);
});

test('createFuncionarioInitial e createFuncionario continuam owners HTTP apos a extracao da seam', async () => {
  const seamCalls = [];
  const owners = buildObjectFromSource(buildDelegatedOwnersSource(), {
    createFuncionarioAutoUserLinkCore: async (input) => {
      seamCalls.push(input);
      return { ok: true, outcome: 'created', userId: 'user-z' };
    },
  });

  const lifecycle = [];
  const deps = {
    materializeInitialFuncionario: async (body) => {
      lifecycle.push(['materializeInitialFuncionario', toPlain(body)]);
      return { _id: 'func-initial', email: 'initial@empresa.com', unidade_id: 'u-1' };
    },
    materializeFuncionario: async (body) => {
      lifecycle.push(['materializeFuncionario', toPlain(body)]);
      return { _id: 'func-full', email: 'full@empresa.com', unidade_id: 'u-9' };
    },
    autoUserLinkDeps: {
      findUserByEmail: async () => null,
      provisionUser: async () => ({ _id: 'user-z' }),
      findUserMembershipByUserAndUnidade: async () => null,
      createUserMembership: async () => ({ _id: 'membership-z' }),
      syncMembershipFuncionario: async () => ({ updated: false, conflict: false }),
      syncFuncionarioUsuario: async () => true,
      syncLegacyUserFuncionario: async () => true,
      isDuplicateMembershipError: () => false,
      resolveRole: () => 'user',
      buildMembershipPayload: () => ({ user_id: 'user-z', unidade_id: 'u-1', funcionario_id: 'func-z' }),
      resolveMessage: () => 'msg:created',
    },
    created: (payload) => {
      lifecycle.push(['created', toPlain(payload)]);
      return payload;
    },
  };

  const initialResponse = await owners.createFuncionarioInitialOwner({
    body: { nome: 'Inicial' },
    params: { id: 'should-not-enter-seam' },
    query: { unidade_id: 'should-not-enter-seam' },
  }, deps);

  const createResponse = await owners.createFuncionarioOwner({
    body: { nome: 'Completo' },
    params: { id: 'should-not-enter-seam' },
    query: { unidade_id: 'should-not-enter-seam' },
  }, deps);

  assert.deepEqual(toPlain(initialResponse), {
    id: 'func-initial',
    autoUser: { ok: true, outcome: 'created', userId: 'user-z' },
  });
  assert.deepEqual(toPlain(createResponse), {
    id: 'func-full',
    autoUser: { ok: true, outcome: 'created', userId: 'user-z' },
  });

  assert.deepEqual(lifecycle, [
    ['materializeInitialFuncionario', { nome: 'Inicial' }],
    ['created', { id: 'func-initial', autoUser: { ok: true, outcome: 'created', userId: 'user-z' } }],
    ['materializeFuncionario', { nome: 'Completo' }],
    ['created', { id: 'func-full', autoUser: { ok: true, outcome: 'created', userId: 'user-z' } }],
  ]);

  assert.deepEqual(seamCalls.map((call) => toPlain(call.funcionario)), [
    { _id: 'func-initial', email: 'initial@empresa.com', unidade_id: 'u-1' },
    { _id: 'func-full', email: 'full@empresa.com', unidade_id: 'u-9' },
  ]);

  seamCalls.forEach((call) => {
    assert.deepEqual(Object.keys(call).sort(), [
      'buildMembershipPayload',
      'createUserMembership',
      'findUserByEmail',
      'findUserMembershipByUserAndUnidade',
      'funcionario',
      'isDuplicateMembershipError',
      'provisionUser',
      'resolveMessage',
      'resolveRole',
      'syncFuncionarioUsuario',
      'syncLegacyUserFuncionario',
      'syncMembershipFuncionario',
    ]);
    assert.equal('req' in call, false);
    assert.equal('res' in call, false);
    assert.equal('canonicalUnitId' in call, false);
    assert.equal('requestedUnitId' in call, false);
    assert.equal(call.findUserByEmail, deps.autoUserLinkDeps.findUserByEmail);
    assert.equal(call.provisionUser, deps.autoUserLinkDeps.provisionUser);
    assert.equal(call.findUserMembershipByUserAndUnidade, deps.autoUserLinkDeps.findUserMembershipByUserAndUnidade);
    assert.equal(call.createUserMembership, deps.autoUserLinkDeps.createUserMembership);
    assert.equal(call.syncMembershipFuncionario, deps.autoUserLinkDeps.syncMembershipFuncionario);
    assert.equal(call.syncFuncionarioUsuario, deps.autoUserLinkDeps.syncFuncionarioUsuario);
    assert.equal(call.syncLegacyUserFuncionario, deps.autoUserLinkDeps.syncLegacyUserFuncionario);
    assert.equal(call.isDuplicateMembershipError, deps.autoUserLinkDeps.isDuplicateMembershipError);
    assert.equal(call.resolveRole, deps.autoUserLinkDeps.resolveRole);
    assert.equal(call.buildMembershipPayload, deps.autoUserLinkDeps.buildMembershipPayload);
    assert.equal(call.resolveMessage, deps.autoUserLinkDeps.resolveMessage);
  });

  const ownersSource = buildDelegatedOwnersSource();
  assert.doesNotMatch(ownersSource, /badRequest|missingFields|notFound|serverError/);
  assert.doesNotMatch(ownersSource, /getCanonicalContextUnitId|requestedUnitMatchesContext/);
  assert.doesNotMatch(ownersSource, /syncUserFuncionario|createSyncHook/);
});