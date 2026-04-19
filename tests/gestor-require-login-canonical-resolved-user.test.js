import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveRequireLoginCanonicalResolvedUser } from '../src/modules/gestor/app/services/auth/resolveRequireLoginCanonicalResolvedUser.service.js';

const IDS = Object.freeze({
  user: '65f100000000000000000001',
  unitA: '65f100000000000000000002',
  unitB: '65f100000000000000000003',
  membershipA: '65f100000000000000000004',
  membershipB: '65f100000000000000000005',
});

test('resolveRequireLoginCanonicalResolvedUser preserva projecao canonica neutra quando auth-context-v1 exige selecao', async () => {
  const result = await resolveRequireLoginCanonicalResolvedUser({
    user: {
      _id: IDS.user,
      nome: 'Usuario Pendente',
      email: 'pendente@example.com',
      role: 'user',
      foto: 'foto-db.png',
      unidade_id: 'legacy-unit-should-not-win',
      funcionario_id: 'legacy-funcionario-should-not-win',
    },
    sessionUser: {
      id: IDS.user,
      nome: 'Sessao Legada',
      email: 'pendente@example.com',
      role: 'user',
      unidade_id: 'legacy-session-unit',
      unidade_principal_id: 'legacy-session-principal',
      funcionario_id: 'legacy-session-funcionario',
      funcao: 'Analista',
    },
    existingAuthContext: null,
    featureFlags: { gestor_auth_context_resolver: true },
    deps: {
      async loadActiveMembershipsByUserId() {
        return [
          {
            _id: IDS.membershipA,
            user_id: IDS.user,
            unidade_id: IDS.unitA,
            papel_contextual: 'gestor',
            status: 'active',
          },
          {
            _id: IDS.membershipB,
            user_id: IDS.user,
            unidade_id: IDS.unitB,
            papel_contextual: 'user',
            status: 'active',
          },
        ];
      },
      async loadUnidadeById({ unidadeId }) {
        if (unidadeId === IDS.unitA) {
          return { _id: IDS.unitA, is_principal: true, unidade_principal_id: null, nome: 'Unidade A', codigo: 'UA' };
        }
        if (unidadeId === IDS.unitB) {
          return { _id: IDS.unitB, is_principal: false, unidade_principal_id: IDS.unitA, nome: 'Unidade B', codigo: 'UB' };
        }
        return null;
      },
    },
  });

  assert.deepEqual(result, {
    kind: 'authenticated',
    sessionUser: {
      id: IDS.user,
      nome: 'Usuario Pendente',
      email: 'pendente@example.com',
      role: null,
      unidade_id: null,
      unidade_principal_id: null,
      funcionario_id: null,
      funcao: 'Analista',
      foto: 'foto-db.png',
      global_role: null,
      auth_version: 'phase3',
    },
    reqUser: {
      _id: IDS.user,
      id: IDS.user,
      nome: 'Usuario Pendente',
      email: 'pendente@example.com',
      role: 'user',
      global_role: null,
      isMaster: false,
      foto: 'foto-db.png',
      funcionario_id: null,
      unidade_id: null,
      unidade_principal_id: null,
      funcao: 'Analista',
    },
  });
});