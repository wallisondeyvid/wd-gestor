import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const handshakeModuleUrl = pathToFileURL(
  path.join(process.cwd(), 'src/shared/db/userdbHandshake.js')
).href;

let importNonce = 0;

async function loadHandshakeModuleFresh() {
  importNonce += 1;
  return import(`${handshakeModuleUrl}?test=${importNonce}`);
}

function setMultiDbFlag(value) {
  if (value === undefined) {
    delete process.env.WD_MULTI_DB;
    return;
  }

  process.env.WD_MULTI_DB = value;
}

test('userDbHandshake: flag OFF retorna global sem chamar useDb', async () => {
  const previousFlag = process.env.WD_MULTI_DB;
  const useDbCalls = [];

  const baseConnection = {
    name: 'wdgestor',
    db: { databaseName: 'wdgestor' },
    useDb(...args) {
      useDbCalls.push(args);
      return { name: 'tenant' };
    },
  };

  try {
    setMultiDbFlag('0');
    const { userDbHandshake } = await loadHandshakeModuleFresh();

    const result = await userDbHandshake(baseConnection, '000000000000000000000010');

    assert.equal(result.ok, true);
    assert.equal(result.mode, 'global');
    assert.equal(result.dbName, 'wdgestor');
    assert.equal(useDbCalls.length, 0);
  } finally {
    setMultiDbFlag(previousFlag);
  }
});

test('userDbHandshake: flag ON com unidade valida chama useDb uma vez e usa cache', async () => {
  const previousFlag = process.env.WD_MULTI_DB;
  const useDbCalls = [];
  let pingCalls = 0;
  const unidadeId = '000000000000000000000010';

  const tenantConnection = {
    name: `wdgestor_unit_${unidadeId}`,
    db: {
      admin() {
        return {
          async ping() {
            pingCalls += 1;
            return { ok: 1 };
          },
        };
      },
    },
  };

  const baseConnection = {
    name: 'wdgestor',
    db: { databaseName: 'wdgestor' },
    useDb(...args) {
      useDbCalls.push(args);
      return tenantConnection;
    },
  };

  try {
    setMultiDbFlag('1');
    const { userDbHandshake } = await loadHandshakeModuleFresh();

    const resultA = await userDbHandshake(baseConnection, unidadeId);
    const resultB = await userDbHandshake(baseConnection, unidadeId);

    assert.equal(resultA.ok, true);
    assert.equal(resultA.mode, 'tenant');
    assert.equal(resultA.dbName, `wdgestor_unit_${unidadeId}`);

    assert.equal(resultB.ok, true);
    assert.equal(resultB.mode, 'tenant');
    assert.equal(resultB.dbName, `wdgestor_unit_${unidadeId}`);

    assert.equal(useDbCalls.length, 1);
    assert.deepEqual(useDbCalls[0], [`wdgestor_unit_${unidadeId}`, { useCache: true }]);
    assert.equal(pingCalls, 2);
  } finally {
    setMultiDbFlag(previousFlag);
  }
});

test('userDbHandshake: flag ON com unidade ausente ou invalida permanece global', async () => {
  const previousFlag = process.env.WD_MULTI_DB;
  const useDbCalls = [];

  const baseConnection = {
    name: 'wdgestor',
    db: { databaseName: 'wdgestor' },
    useDb(...args) {
      useDbCalls.push(args);
      return { name: 'tenant' };
    },
  };

  try {
    setMultiDbFlag('true');
    const { userDbHandshake } = await loadHandshakeModuleFresh();

    const missingResult = await userDbHandshake(baseConnection, undefined);
    const invalidResult = await userDbHandshake(baseConnection, 'abc');

    assert.equal(missingResult.ok, true);
    assert.equal(missingResult.mode, 'global');

    assert.equal(invalidResult.ok, true);
    assert.equal(invalidResult.mode, 'global');

    assert.equal(useDbCalls.length, 0);
  } finally {
    setMultiDbFlag(previousFlag);
  }
});
