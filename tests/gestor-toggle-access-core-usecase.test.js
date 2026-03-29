import test from 'node:test';
import assert from 'node:assert/strict';

import { executeToggleAccessCore } from '../src/modules/gestor/app/usecases/unidades/executeToggleAccessCore.js';

test('executeToggleAccessCore retorna bad_request quando algum id esta fora do escopo contextual', async () => {
  const accessCalls = [];
  let findPrincipaisCalled = false;
  let updateCalled = false;

  const result = await executeToggleAccessCore({
    unitIds: ['u-1', 'u-2'],
    activate: true,
    role: 'admin',
    canAccessUnitId: async (unitId) => {
      accessCalls.push(unitId);
      return unitId !== 'u-2';
    },
    findUnidadesPrincipaisByIds: async () => {
      findPrincipaisCalled = true;
      return [];
    },
    updateManyUnidadesAccessByIds: async () => {
      updateCalled = true;
      return { modifiedCount: 1 };
    },
  });

  assert.equal(result.kind, 'bad_request');
  assert.equal(result.message, 'Acesso à unidade não autorizado.');
  assert.deepEqual(accessCalls, ['u-1', 'u-2']);
  assert.equal(findPrincipaisCalled, false);
  assert.equal(updateCalled, false);
});

test('executeToggleAccessCore retorna bad_request quando diretor tenta alterar unidades principais', async () => {
  let updateCalled = false;

  const result = await executeToggleAccessCore({
    unitIds: ['u-principal'],
    activate: false,
    role: 'diretor',
    canAccessUnitId: async () => true,
    findUnidadesPrincipaisByIds: async (unitIds) => {
      assert.deepEqual(unitIds, ['u-principal']);
      return [{ _id: 'u-principal' }];
    },
    updateManyUnidadesAccessByIds: async () => {
      updateCalled = true;
      return { modifiedCount: 1 };
    },
  });

  assert.equal(result.kind, 'bad_request');
  assert.equal(result.message, 'Diretores não podem alterar o acesso de unidades principais.');
  assert.equal(updateCalled, false);
});

test('executeToggleAccessCore retorna bad_request quando nenhuma unidade e atualizada', async () => {
  const result = await executeToggleAccessCore({
    unitIds: ['u-1'],
    activate: true,
    role: 'admin',
    canAccessUnitId: async () => true,
    findUnidadesPrincipaisByIds: async () => [],
    updateManyUnidadesAccessByIds: async (unitIds, activate) => {
      assert.deepEqual(unitIds, ['u-1']);
      assert.equal(activate, true);
      return { modifiedCount: 0 };
    },
  });

  assert.equal(result.kind, 'bad_request');
  assert.equal(result.message, 'Nenhuma unidade atualizada.');
});

test('executeToggleAccessCore retorna ok no caminho feliz', async () => {
  const result = await executeToggleAccessCore({
    unitIds: ['u-1', 'u-2'],
    activate: false,
    role: 'admin',
    canAccessUnitId: async () => true,
    findUnidadesPrincipaisByIds: async () => {
      throw new Error('nao deve consultar unidades principais para admin');
    },
    updateManyUnidadesAccessByIds: async (unitIds, activate) => {
      assert.deepEqual(unitIds, ['u-1', 'u-2']);
      assert.equal(activate, false);
      return { modifiedCount: 2 };
    },
  });

  assert.equal(result.kind, 'ok');
});