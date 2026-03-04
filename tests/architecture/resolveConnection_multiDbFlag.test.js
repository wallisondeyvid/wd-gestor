import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';

const resolveConnectionModuleUrl = pathToFileURL(
  path.join(process.cwd(), 'src/shared/db/resolveConnection.js')
).href;

let importNonce = 0;

async function loadResolveConnectionFresh() {
  importNonce += 1;
  const mod = await import(`${resolveConnectionModuleUrl}?test=${importNonce}`);
  return mod.resolveConnection;
}

function setMultiDbFlag(value) {
  if (value === undefined) {
    delete process.env.WD_MULTI_DB;
    return;
  }
  process.env.WD_MULTI_DB = value;
}

test('resolveConnection: WD_MULTI_DB OFF retorna baseConnection e não chama useDb', async () => {
  const previousFlag = process.env.WD_MULTI_DB;
  const baseConnection = mongoose.connection;
  const originalUseDb = baseConnection.useDb;
  const tenantConn = { name: 'tenantConn' };
  const useDbCalls = [];

  baseConnection.useDb = (...args) => {
    useDbCalls.push(args);
    return tenantConn;
  };

  try {
    for (const flagValue of [undefined, '0', 'false', 'off', 'FALSE']) {
      setMultiDbFlag(flagValue);
      const resolveConnection = await loadResolveConnectionFresh();
      const result = resolveConnection({ unidadeId: 'U1' });
      assert.strictEqual(result, baseConnection);
    }

    assert.equal(useDbCalls.length, 0);
  } finally {
    baseConnection.useDb = originalUseDb;
    setMultiDbFlag(previousFlag);
  }
});

test('resolveConnection: WD_MULTI_DB ON usa useDb e retorna tenantConn', async () => {
  const previousFlag = process.env.WD_MULTI_DB;
  const baseConnection = mongoose.connection;
  const originalUseDb = baseConnection.useDb;
  const tenantConn = { name: 'tenantConn' };
  const useDbCalls = [];

  baseConnection.useDb = (...args) => {
    useDbCalls.push(args);
    return tenantConn;
  };

  try {
    setMultiDbFlag('1');
    const resolveConnection = await loadResolveConnectionFresh();

    const result = resolveConnection({ unidadeId: 'U1' });

    assert.strictEqual(result, tenantConn);
    assert.equal(useDbCalls.length, 1);
    assert.deepEqual(useDbCalls[0], ['wdgestor_unit_U1', { useCache: true }]);
  } finally {
    baseConnection.useDb = originalUseDb;
    setMultiDbFlag(previousFlag);
  }
});

test('resolveConnection: cache evita chamar useDb duas vezes para mesma unidade', async () => {
  const previousFlag = process.env.WD_MULTI_DB;
  const baseConnection = mongoose.connection;
  const originalUseDb = baseConnection.useDb;
  const tenantConn = { name: 'tenantConn' };
  const useDbCalls = [];

  baseConnection.useDb = (...args) => {
    useDbCalls.push(args);
    return tenantConn;
  };

  try {
    setMultiDbFlag('on');
    const resolveConnection = await loadResolveConnectionFresh();

    const resultA = resolveConnection({ unidadeId: 'U1' });
    const resultB = resolveConnection({ unidadeId: 'U1' });

    assert.strictEqual(resultA, tenantConn);
    assert.strictEqual(resultB, tenantConn);
    assert.equal(useDbCalls.length, 1);
    assert.deepEqual(useDbCalls[0], ['wdgestor_unit_U1', { useCache: true }]);
  } finally {
    baseConnection.useDb = originalUseDb;
    setMultiDbFlag(previousFlag);
  }
});
