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

function setUserDbHandshakeFlag(value) {
  if (value === undefined) {
    delete process.env.WD_USERDB_HANDSHAKE;
    return;
  }
  process.env.WD_USERDB_HANDSHAKE = value;
}

async function flushAsyncWork() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test('resolveConnection: WD_MULTI_DB OFF retorna baseConnection e não chama useDb', async () => {
  const previousFlag = process.env.WD_MULTI_DB;
  const previousHandshakeFlag = process.env.WD_USERDB_HANDSHAKE;
  const baseConnection = mongoose.connection;
  const originalUseDb = baseConnection.useDb;
  const tenantConn = { name: 'tenantConn' };
  const useDbCalls = [];

  baseConnection.useDb = (...args) => {
    useDbCalls.push(args);
    return tenantConn;
  };

  try {
    setUserDbHandshakeFlag('0');
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
    setUserDbHandshakeFlag(previousHandshakeFlag);
  }
});

test('resolveConnection: WD_MULTI_DB ON usa useDb e retorna tenantConn', async () => {
  const previousFlag = process.env.WD_MULTI_DB;
  const previousHandshakeFlag = process.env.WD_USERDB_HANDSHAKE;
  const baseConnection = mongoose.connection;
  const originalUseDb = baseConnection.useDb;
  const tenantConn = { name: 'tenantConn' };
  const useDbCalls = [];

  baseConnection.useDb = (...args) => {
    useDbCalls.push(args);
    return tenantConn;
  };

  try {
    setUserDbHandshakeFlag('0');
    setMultiDbFlag('1');
    const resolveConnection = await loadResolveConnectionFresh();

    const result = resolveConnection({ unidadeId: 'U1' });

    assert.strictEqual(result, tenantConn);
    assert.equal(useDbCalls.length, 1);
    assert.deepEqual(useDbCalls[0], ['wdgestor_unit_U1', { useCache: true }]);
  } finally {
    baseConnection.useDb = originalUseDb;
    setMultiDbFlag(previousFlag);
    setUserDbHandshakeFlag(previousHandshakeFlag);
  }
});

test('resolveConnection: cache evita chamar useDb duas vezes para mesma unidade', async () => {
  const previousFlag = process.env.WD_MULTI_DB;
  const previousHandshakeFlag = process.env.WD_USERDB_HANDSHAKE;
  const baseConnection = mongoose.connection;
  const originalUseDb = baseConnection.useDb;
  const tenantConn = { name: 'tenantConn' };
  const useDbCalls = [];

  baseConnection.useDb = (...args) => {
    useDbCalls.push(args);
    return tenantConn;
  };

  try {
    setUserDbHandshakeFlag('0');
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
    setUserDbHandshakeFlag(previousHandshakeFlag);
  }
});

test('resolveConnection: WD_MULTI_DB OFF não dispara userdb handshake', async () => {
  const previousFlag = process.env.WD_MULTI_DB;
  const previousHandshakeFlag = process.env.WD_USERDB_HANDSHAKE;
  const baseConnection = mongoose.connection;
  const originalUseDb = baseConnection.useDb;
  let pingCalls = 0;

  const tenantConn = {
    db: {
      admin() {
        return {
          async ping() {
            pingCalls += 1;
            return { ok: 1 };
          }
        };
      }
    }
  };

  baseConnection.useDb = () => tenantConn;

  try {
    setMultiDbFlag('0');
    setUserDbHandshakeFlag('1');
    const resolveConnection = await loadResolveConnectionFresh();

    resolveConnection({ unidadeId: '000000000000000000000010' });
    await flushAsyncWork();

    assert.equal(pingCalls, 0);
  } finally {
    baseConnection.useDb = originalUseDb;
    setMultiDbFlag(previousFlag);
    setUserDbHandshakeFlag(previousHandshakeFlag);
  }
});

test('resolveConnection: WD_MULTI_DB ON com WD_USERDB_HANDSHAKE=0 não dispara handshake', async () => {
  const previousFlag = process.env.WD_MULTI_DB;
  const previousHandshakeFlag = process.env.WD_USERDB_HANDSHAKE;
  const baseConnection = mongoose.connection;
  const originalUseDb = baseConnection.useDb;
  let pingCalls = 0;

  const tenantConn = {
    db: {
      admin() {
        return {
          async ping() {
            pingCalls += 1;
            return { ok: 1 };
          }
        };
      }
    }
  };

  baseConnection.useDb = () => tenantConn;

  try {
    setMultiDbFlag('1');
    setUserDbHandshakeFlag('0');
    const resolveConnection = await loadResolveConnectionFresh();

    resolveConnection({ unidadeId: '000000000000000000000010' });
    await flushAsyncWork();

    assert.equal(pingCalls, 0);
  } finally {
    baseConnection.useDb = originalUseDb;
    setMultiDbFlag(previousFlag);
    setUserDbHandshakeFlag(previousHandshakeFlag);
  }
});

test('resolveConnection: WD_MULTI_DB ON com WD_USERDB_HANDSHAKE=1 dispara handshake uma única vez por unidade', async () => {
  const previousFlag = process.env.WD_MULTI_DB;
  const previousHandshakeFlag = process.env.WD_USERDB_HANDSHAKE;
  const baseConnection = mongoose.connection;
  const originalUseDb = baseConnection.useDb;
  let pingCalls = 0;

  const tenantConn = {
    db: {
      admin() {
        return {
          async ping() {
            pingCalls += 1;
            return { ok: 1 };
          }
        };
      }
    }
  };

  baseConnection.useDb = () => tenantConn;

  try {
    setMultiDbFlag('1');
    setUserDbHandshakeFlag('1');
    const resolveConnection = await loadResolveConnectionFresh();

    resolveConnection({ unidadeId: '000000000000000000000010' });
    resolveConnection({ unidadeId: '000000000000000000000010' });
    await flushAsyncWork();

    assert.equal(pingCalls, 1);
  } finally {
    baseConnection.useDb = originalUseDb;
    setMultiDbFlag(previousFlag);
    setUserDbHandshakeFlag(previousHandshakeFlag);
  }
});
