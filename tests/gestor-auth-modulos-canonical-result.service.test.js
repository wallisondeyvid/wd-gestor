import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveUserApiModulosCanonicalResult } from '../src/modules/gestor/app/services/auth/resolveUserApiModulosCanonicalResult.service.js';

function createModulo(id, nome) {
  return {
    _id: id,
    nome,
    descricao: null,
    status: 'ativo',
    url_base: `/${nome}`,
  };
}

test('resolveUserApiModulosCanonicalResult fecha o fallback quando existe apenas role legado admin sem global_role', async () => {
  let loadAllModulosCalls = 0;

  const result = await resolveUserApiModulosCanonicalResult({
    authenticatedUser: {
      id: 'u-1',
      role: 'admin',
      isMaster: false,
    },
    sessionUser: {
      id: 'u-1',
      role: 'admin',
    },
    deps: {
      resolveAuthContext: async () => ({
        authenticated: true,
        source: 'legacy',
      }),
      tryLoadUnidadeComModulos: async () => null,
      loadAllModulos: async () => {
        loadAllModulosCalls += 1;
        return [createModulo('m-1', 'financeiro')];
      },
    },
  });

  assert.equal(loadAllModulosCalls, 0);
  assert.equal(result.kind, 'resolved');
  assert.deepEqual(result.payload, { data: [] });
});

test('resolveUserApiModulosCanonicalResult preserva o fallback global fechado para global_role admin explicito', async () => {
  let loadAllModulosCalls = 0;

  const result = await resolveUserApiModulosCanonicalResult({
    authenticatedUser: {
      id: 'u-1',
      role: 'user',
      global_role: 'admin',
      isMaster: false,
    },
    sessionUser: {
      id: 'u-1',
      role: 'user',
      global_role: 'admin',
    },
    deps: {
      resolveAuthContext: async () => ({
        authenticated: true,
        source: 'legacy',
      }),
      tryLoadUnidadeComModulos: async () => null,
      loadAllModulos: async () => {
        loadAllModulosCalls += 1;
        return [createModulo('m-1', 'financeiro')];
      },
    },
  });

  assert.equal(loadAllModulosCalls, 1);
  assert.equal(result.kind, 'resolved');
  assert.deepEqual(result.payload, {
    data: [createModulo('m-1', 'financeiro')],
  });
});