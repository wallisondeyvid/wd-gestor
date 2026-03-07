import assert from 'node:assert/strict';
import test from 'node:test';

import { findUnidadeUserBaseSetorLean } from '../src/modules/gestor/app/db/api.db.js';

test('findUnidadeUserBaseSetorLean com id invalido/vazio nao segue com sucesso silencioso', async () => {
  for (const invalidId of ['', 'id-invalido']) {
    await assert.rejects(
      () => findUnidadeUserBaseSetorLean(invalidId),
      `Contrato violado: id invalido/vazio (${JSON.stringify(invalidId)}) nao deveria resolver com sucesso silencioso`,
    );
  }
});
