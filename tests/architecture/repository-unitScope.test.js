import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BlocosRepository } from '#modules/condominios/app/repositories/BlocosRepository.js';
import { AndaresRepository } from '#modules/condominios/app/repositories/AndaresRepository.js';

const repos = [
  { nome: 'BlocosRepository', Ctor: BlocosRepository },
  { nome: 'AndaresRepository', Ctor: AndaresRepository },
];

test('Repository exige unitScope quando multi-tenant está ativo', () => {
  const original = process.env.WDG_MULTI_TENANT;

  try {
    process.env.WDG_MULTI_TENANT = '1';

    for (const { Ctor } of repos) {
      assert.throws(() => {
        new Ctor({});
      }, /unitScope obrigatório em modo multi-tenant/);
    }
  } finally {
    process.env.WDG_MULTI_TENANT = original;
  }
});

test('Repository permite ausência de unitScope quando multi-tenant está desativado', () => {
  const original = process.env.WDG_MULTI_TENANT;

  try {
    process.env.WDG_MULTI_TENANT = '';

    for (const { Ctor } of repos) {
      assert.doesNotThrow(() => {
        new Ctor({});
      });
    }
  } finally {
    process.env.WDG_MULTI_TENANT = original;
  }
});
