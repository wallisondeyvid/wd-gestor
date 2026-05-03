import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';

const resolveConnectionModuleUrl = pathToFileURL(
  path.join(process.cwd(), 'src/shared/db/resolveConnection.js')
).href;

const userDbHandshakeModuleUrl = pathToFileURL(
  path.join(process.cwd(), 'src/shared/db/userdbHandshake.js')
).href;

const unitDatabaseRegistryModuleUrl = pathToFileURL(
  path.join(process.cwd(), 'src/shared/db/unitDatabaseRegistry.js')
).href;

let importNonce = 0;

async function loadResolveConnectionFresh() {
  importNonce += 1;
  const mod = await import(`${resolveConnectionModuleUrl}?test=${importNonce}`);
  return mod.resolveConnection;
}

async function clearUserDbHandshakeCacheState() {
  const mod = await import(userDbHandshakeModuleUrl);
  if (typeof mod.clearUserDbHandshakeCache === 'function') {
    mod.clearUserDbHandshakeCache();
  }
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

function setMultiDbAllowlist(value) {
  if (value === undefined) {
    delete process.env.WD_MULTI_DB_ALLOWLIST;
    return;
  }
  process.env.WD_MULTI_DB_ALLOWLIST = value;
}

function setMultiDbRegistryReadFlag(value) {
  if (value === undefined) {
    delete process.env.WD_MULTI_DB_REGISTRY_READ;
    return;
  }
  process.env.WD_MULTI_DB_REGISTRY_READ = value;
}

async function setUnitDatabaseRegistryReaderForTests(reader) {
  const mod = await import(unitDatabaseRegistryModuleUrl);
  if (typeof mod.__setUnitDatabaseRegistryReaderForTests === 'function') {
    mod.__setUnitDatabaseRegistryReaderForTests(reader);
  }
}

async function resetUnitDatabaseRegistryReaderForTests() {
  const mod = await import(unitDatabaseRegistryModuleUrl);
  if (typeof mod.__resetUnitDatabaseRegistryReaderForTests === 'function') {
    mod.__resetUnitDatabaseRegistryReaderForTests();
  }
}

async function setUnitDatabaseRegistryCacheEntryForTests({ unidadeId, entry }) {
  const mod = await import(unitDatabaseRegistryModuleUrl);
  if (typeof mod.setUnitDatabaseRegistryCacheEntry === 'function') {
    mod.setUnitDatabaseRegistryCacheEntry({ unidadeId, entry });
  }
}

async function clearUnitDatabaseRegistryCacheForTests() {
  const mod = await import(unitDatabaseRegistryModuleUrl);
  if (typeof mod.clearUnitDatabaseRegistryCache === 'function') {
    mod.clearUnitDatabaseRegistryCache();
  }
}

async function primeUnitDatabaseRegistryCacheForTests(options) {
  const mod = await import(unitDatabaseRegistryModuleUrl);
  if (typeof mod.primeUnitDatabaseRegistryCache === 'function') {
    return mod.primeUnitDatabaseRegistryCache(options);
  }

  return null;
}

async function flushAsyncWork() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test('resolveConnection: WD_MULTI_DB OFF retorna baseConnection e não chama useDb', async () => {
  const previousFlag = process.env.WD_MULTI_DB;
  const previousHandshakeFlag = process.env.WD_USERDB_HANDSHAKE;
  const previousAllowlist = process.env.WD_MULTI_DB_ALLOWLIST;
  const baseConnection = mongoose.connection;
  const originalUseDb = baseConnection.useDb;
  const tenantConn = { name: 'tenantConn' };
  const useDbCalls = [];

  baseConnection.useDb = (...args) => {
    useDbCalls.push(args);
    return tenantConn;
  };

  try {
    await clearUserDbHandshakeCacheState();
    setUserDbHandshakeFlag('0');
    setMultiDbAllowlist('U1');
    for (const flagValue of [undefined, '0', 'false', 'off', 'FALSE']) {
      setMultiDbFlag(flagValue);
      const resolveConnection = await loadResolveConnectionFresh();
      const result = resolveConnection({ unidadeId: 'U1' });
      assert.strictEqual(result, baseConnection);
    }

    assert.equal(useDbCalls.length, 0);
  } finally {
    await clearUserDbHandshakeCacheState();
    baseConnection.useDb = originalUseDb;
    setMultiDbFlag(previousFlag);
    setUserDbHandshakeFlag(previousHandshakeFlag);
    setMultiDbAllowlist(previousAllowlist);
  }
});

test('resolveConnection com WD_MULTI_DB e registry passivo ligado retorna baseConnection quando registry da unidade está ausente', async () => {
  const previousFlag = process.env.WD_MULTI_DB;
  const previousRegistryReadFlag = process.env.WD_MULTI_DB_REGISTRY_READ;
  const previousHandshakeFlag = process.env.WD_USERDB_HANDSHAKE;
  const previousAllowlist = process.env.WD_MULTI_DB_ALLOWLIST;
  const unidadeId = '000000000000000000000010';
  const baseConnection = mongoose.connection;
  const originalUseDb = baseConnection.useDb;
  const tenantConn = { name: 'tenantConn' };
  const useDbCalls = [];
  let pingCalls = 0;

  baseConnection.useDb = (...args) => {
    useDbCalls.push(args);
    return {
      ...tenantConn,
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
  };

  try {
    await clearUserDbHandshakeCacheState();
    await setUnitDatabaseRegistryReaderForTests(() => null);
    setMultiDbFlag('1');
    setMultiDbRegistryReadFlag('1');
    setUserDbHandshakeFlag('1');
    setMultiDbAllowlist(unidadeId);
    const resolveConnection = await loadResolveConnectionFresh();

    const resultA = resolveConnection({ unidadeId });
    const resultB = resolveConnection({ unidadeId });
    await flushAsyncWork();

    assert.strictEqual(resultA, baseConnection);
    assert.strictEqual(resultB, baseConnection);
    assert.equal(useDbCalls.length, 0);
    assert.equal(pingCalls, 0);
  } finally {
    await clearUserDbHandshakeCacheState();
    await resetUnitDatabaseRegistryReaderForTests();
    baseConnection.useDb = originalUseDb;
    setMultiDbFlag(previousFlag);
    setMultiDbRegistryReadFlag(previousRegistryReadFlag);
    setUserDbHandshakeFlag(previousHandshakeFlag);
    setMultiDbAllowlist(previousAllowlist);
  }
});

test('resolveConnection com WD_MULTI_DB e registry passivo ligado retorna baseConnection quando o cache do registry está vazio', async () => {
  const previousFlag = process.env.WD_MULTI_DB;
  const previousRegistryReadFlag = process.env.WD_MULTI_DB_REGISTRY_READ;
  const previousHandshakeFlag = process.env.WD_USERDB_HANDSHAKE;
  const previousAllowlist = process.env.WD_MULTI_DB_ALLOWLIST;
  const unidadeId = '000000000000000000000010';
  const baseConnection = mongoose.connection;
  const originalUseDb = baseConnection.useDb;
  const useDbCalls = [];
  let pingCalls = 0;

  baseConnection.useDb = (...args) => {
    useDbCalls.push(args);
    return {
      name: 'tenantConn',
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
  };

  try {
    await clearUserDbHandshakeCacheState();
    await clearUnitDatabaseRegistryCacheForTests();
    await resetUnitDatabaseRegistryReaderForTests();
    setMultiDbFlag('1');
    setMultiDbRegistryReadFlag('1');
    setUserDbHandshakeFlag('1');
    setMultiDbAllowlist(unidadeId);
    const resolveConnection = await loadResolveConnectionFresh();

    const resultA = resolveConnection({ unidadeId });
    const resultB = resolveConnection({ unidadeId });
    await flushAsyncWork();

    assert.strictEqual(resultA, baseConnection);
    assert.strictEqual(resultB, baseConnection);
    assert.equal(useDbCalls.length, 0);
    assert.equal(pingCalls, 0);
  } finally {
    await clearUserDbHandshakeCacheState();
    await clearUnitDatabaseRegistryCacheForTests();
    await resetUnitDatabaseRegistryReaderForTests();
    baseConnection.useDb = originalUseDb;
    setMultiDbFlag(previousFlag);
    setMultiDbRegistryReadFlag(previousRegistryReadFlag);
    setUserDbHandshakeFlag(previousHandshakeFlag);
    setMultiDbAllowlist(previousAllowlist);
  }
});

test('resolveConnection com WD_MULTI_DB e registry passivo ligado mantém baseConnection quando cache é aquecido pelo reader com routingMode=base', async () => {
  const previousFlag = process.env.WD_MULTI_DB;
  const previousRegistryReadFlag = process.env.WD_MULTI_DB_REGISTRY_READ;
  const previousHandshakeFlag = process.env.WD_USERDB_HANDSHAKE;
  const previousAllowlist = process.env.WD_MULTI_DB_ALLOWLIST;
  const unidadeId = '000000000000000000000010';
  const baseConnection = mongoose.connection;
  const originalUseDb = baseConnection.useDb;
  const useDbCalls = [];
  let pingCalls = 0;

  baseConnection.useDb = (...args) => {
    useDbCalls.push(args);
    return {
      name: 'tenantConn',
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
  };

  try {
    await clearUserDbHandshakeCacheState();
    await clearUnitDatabaseRegistryCacheForTests();
    await resetUnitDatabaseRegistryReaderForTests();
    await primeUnitDatabaseRegistryCacheForTests({
      unidadeId,
      connection: {
        db: {
          collection() {
            return {
              async findOne() {
                return {
                  unidadeId,
                  dbName: `wdgestor_unit_${unidadeId}`,
                  databaseKey: `wdgestor_unit_${unidadeId}`,
                  routingMode: 'base',
                  readiness: {
                    ready: true,
                  },
                  activation: {
                    active: true,
                  },
                };
              },
            };
          },
        },
      },
    });
    setMultiDbFlag('1');
    setMultiDbRegistryReadFlag('1');
    setUserDbHandshakeFlag('1');
    setMultiDbAllowlist(unidadeId);
    const resolveConnection = await loadResolveConnectionFresh();

    const resultA = resolveConnection({ unidadeId });
    const resultB = resolveConnection({ unidadeId });
    await flushAsyncWork();

    assert.strictEqual(resultA, baseConnection);
    assert.strictEqual(resultB, baseConnection);
    assert.equal(useDbCalls.length, 0);
    assert.equal(pingCalls, 0);
  } finally {
    await clearUserDbHandshakeCacheState();
    await clearUnitDatabaseRegistryCacheForTests();
    await resetUnitDatabaseRegistryReaderForTests();
    baseConnection.useDb = originalUseDb;
    setMultiDbFlag(previousFlag);
    setMultiDbRegistryReadFlag(previousRegistryReadFlag);
    setUserDbHandshakeFlag(previousHandshakeFlag);
    setMultiDbAllowlist(previousAllowlist);
  }
});

test('resolveConnection com WD_MULTI_DB e registry passivo ligado retorna baseConnection quando registry da unidade existe com readiness.ready=false', async () => {
  const previousFlag = process.env.WD_MULTI_DB;
  const previousRegistryReadFlag = process.env.WD_MULTI_DB_REGISTRY_READ;
  const previousHandshakeFlag = process.env.WD_USERDB_HANDSHAKE;
  const previousAllowlist = process.env.WD_MULTI_DB_ALLOWLIST;
  const unidadeId = '000000000000000000000010';
  const baseConnection = mongoose.connection;
  const originalUseDb = baseConnection.useDb;
  const useDbCalls = [];
  let pingCalls = 0;

  baseConnection.useDb = (...args) => {
    useDbCalls.push(args);
    return {
      name: 'tenantConn',
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
  };

  try {
    await clearUserDbHandshakeCacheState();
    await setUnitDatabaseRegistryReaderForTests(() => ({
      unidadeId,
      status: 'pending',
      routingMode: 'base',
      readiness: {
        ready: false,
      },
    }));
    setMultiDbFlag('1');
    setMultiDbRegistryReadFlag('1');
    setUserDbHandshakeFlag('1');
    setMultiDbAllowlist(unidadeId);
    const resolveConnection = await loadResolveConnectionFresh();

    const resultA = resolveConnection({ unidadeId });
    const resultB = resolveConnection({ unidadeId });
    await flushAsyncWork();

    assert.strictEqual(resultA, baseConnection);
    assert.strictEqual(resultB, baseConnection);
    assert.equal(useDbCalls.length, 0);
    assert.equal(pingCalls, 0);
  } finally {
    await clearUserDbHandshakeCacheState();
    await resetUnitDatabaseRegistryReaderForTests();
    baseConnection.useDb = originalUseDb;
    setMultiDbFlag(previousFlag);
    setMultiDbRegistryReadFlag(previousRegistryReadFlag);
    setUserDbHandshakeFlag(previousHandshakeFlag);
    setMultiDbAllowlist(previousAllowlist);
  }
});

test('resolveConnection com WD_MULTI_DB e registry passivo ligado retorna baseConnection quando registry da unidade existe com readiness.ready=true e activation.active ausente', async () => {
  const previousFlag = process.env.WD_MULTI_DB;
  const previousRegistryReadFlag = process.env.WD_MULTI_DB_REGISTRY_READ;
  const previousHandshakeFlag = process.env.WD_USERDB_HANDSHAKE;
  const previousAllowlist = process.env.WD_MULTI_DB_ALLOWLIST;
  const unidadeId = '000000000000000000000010';
  const baseConnection = mongoose.connection;
  const originalUseDb = baseConnection.useDb;
  const useDbCalls = [];
  let pingCalls = 0;

  baseConnection.useDb = (...args) => {
    useDbCalls.push(args);
    return {
      name: 'tenantConn',
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
  };

  try {
    await clearUserDbHandshakeCacheState();
    await setUnitDatabaseRegistryReaderForTests(() => ({
      unidadeId,
      status: 'ready',
      routingMode: 'base',
      readiness: {
        ready: true,
      },
    }));
    setMultiDbFlag('1');
    setMultiDbRegistryReadFlag('1');
    setUserDbHandshakeFlag('1');
    setMultiDbAllowlist(unidadeId);
    const resolveConnection = await loadResolveConnectionFresh();

    const resultA = resolveConnection({ unidadeId });
    const resultB = resolveConnection({ unidadeId });
    await flushAsyncWork();

    assert.strictEqual(resultA, baseConnection);
    assert.strictEqual(resultB, baseConnection);
    assert.equal(useDbCalls.length, 0);
    assert.equal(pingCalls, 0);
  } finally {
    await clearUserDbHandshakeCacheState();
    await resetUnitDatabaseRegistryReaderForTests();
    baseConnection.useDb = originalUseDb;
    setMultiDbFlag(previousFlag);
    setMultiDbRegistryReadFlag(previousRegistryReadFlag);
    setUserDbHandshakeFlag(previousHandshakeFlag);
    setMultiDbAllowlist(previousAllowlist);
  }
});

test('resolveConnection com WD_MULTI_DB e registry passivo ligado retorna baseConnection quando a leitura do registry da unidade lança erro', async () => {
  const previousFlag = process.env.WD_MULTI_DB;
  const previousRegistryReadFlag = process.env.WD_MULTI_DB_REGISTRY_READ;
  const previousHandshakeFlag = process.env.WD_USERDB_HANDSHAKE;
  const previousAllowlist = process.env.WD_MULTI_DB_ALLOWLIST;
  const unidadeId = '000000000000000000000010';
  const baseConnection = mongoose.connection;
  const originalUseDb = baseConnection.useDb;
  const useDbCalls = [];
  let pingCalls = 0;

  baseConnection.useDb = (...args) => {
    useDbCalls.push(args);
    return {
      name: 'tenantConn',
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
  };

  try {
    await clearUserDbHandshakeCacheState();
    await setUnitDatabaseRegistryReaderForTests(() => {
      throw new Error('REGISTRY_READ_FAILED');
    });
    setMultiDbFlag('1');
    setMultiDbRegistryReadFlag('1');
    setUserDbHandshakeFlag('1');
    setMultiDbAllowlist(unidadeId);
    const resolveConnection = await loadResolveConnectionFresh();

    let resultA;
    let resultB;
    assert.doesNotThrow(() => {
      resultA = resolveConnection({ unidadeId });
      resultB = resolveConnection({ unidadeId });
    });
    await flushAsyncWork();

    assert.strictEqual(resultA, baseConnection);
    assert.strictEqual(resultB, baseConnection);
    assert.equal(useDbCalls.length, 0);
    assert.equal(pingCalls, 0);
  } finally {
    await clearUserDbHandshakeCacheState();
    await resetUnitDatabaseRegistryReaderForTests();
    baseConnection.useDb = originalUseDb;
    setMultiDbFlag(previousFlag);
    setMultiDbRegistryReadFlag(previousRegistryReadFlag);
    setUserDbHandshakeFlag(previousHandshakeFlag);
    setMultiDbAllowlist(previousAllowlist);
  }
});

test('resolveConnection com WD_MULTI_DB e registry passivo ligado retorna baseConnection quando o registry da unidade está inconsistente', async () => {
  const previousFlag = process.env.WD_MULTI_DB;
  const previousRegistryReadFlag = process.env.WD_MULTI_DB_REGISTRY_READ;
  const previousHandshakeFlag = process.env.WD_USERDB_HANDSHAKE;
  const previousAllowlist = process.env.WD_MULTI_DB_ALLOWLIST;
  const unidadeId = '000000000000000000000010';
  const baseConnection = mongoose.connection;
  const originalUseDb = baseConnection.useDb;
  const useDbCalls = [];
  let pingCalls = 0;

  baseConnection.useDb = (...args) => {
    useDbCalls.push(args);
    return {
      name: 'tenantConn',
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
  };

  try {
    await clearUserDbHandshakeCacheState();
    await setUnitDatabaseRegistryReaderForTests(() => ({
      unidadeId: '000000000000000000000011',
      readiness: {
        ready: true,
      },
      activation: {
        active: true,
      },
    }));
    setMultiDbFlag('1');
    setMultiDbRegistryReadFlag('1');
    setUserDbHandshakeFlag('1');
    setMultiDbAllowlist(unidadeId);
    const resolveConnection = await loadResolveConnectionFresh();

    const resultA = resolveConnection({ unidadeId });
    const resultB = resolveConnection({ unidadeId });
    await flushAsyncWork();

    assert.strictEqual(resultA, baseConnection);
    assert.strictEqual(resultB, baseConnection);
    assert.equal(useDbCalls.length, 0);
    assert.equal(pingCalls, 0);
  } finally {
    await clearUserDbHandshakeCacheState();
    await resetUnitDatabaseRegistryReaderForTests();
    baseConnection.useDb = originalUseDb;
    setMultiDbFlag(previousFlag);
    setMultiDbRegistryReadFlag(previousRegistryReadFlag);
    setUserDbHandshakeFlag(previousHandshakeFlag);
    setMultiDbAllowlist(previousAllowlist);
  }
});

test('resolveConnection com WD_MULTI_DB e registry passivo ligado retorna baseConnection quando routingMode explícito permanece em base', async () => {
  const previousFlag = process.env.WD_MULTI_DB;
  const previousRegistryReadFlag = process.env.WD_MULTI_DB_REGISTRY_READ;
  const previousHandshakeFlag = process.env.WD_USERDB_HANDSHAKE;
  const previousAllowlist = process.env.WD_MULTI_DB_ALLOWLIST;
  const unidadeId = '000000000000000000000010';
  const baseConnection = mongoose.connection;
  const originalUseDb = baseConnection.useDb;
  const useDbCalls = [];
  let pingCalls = 0;

  baseConnection.useDb = (...args) => {
    useDbCalls.push(args);
    return {
      name: 'tenantConn',
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
  };

  try {
    await clearUserDbHandshakeCacheState();
    await setUnitDatabaseRegistryReaderForTests(() => ({
      unidadeId,
      dbName: `wdgestor_unit_${unidadeId}`,
      databaseKey: `wdgestor_unit_${unidadeId}`,
      routingMode: 'base',
      readiness: {
        ready: true,
      },
      activation: {
        active: true,
      },
    }));
    setMultiDbFlag('1');
    setMultiDbRegistryReadFlag('1');
    setUserDbHandshakeFlag('1');
    setMultiDbAllowlist(unidadeId);
    const resolveConnection = await loadResolveConnectionFresh();

    const resultA = resolveConnection({ unidadeId });
    const resultB = resolveConnection({ unidadeId });
    await flushAsyncWork();

    assert.strictEqual(resultA, baseConnection);
    assert.strictEqual(resultB, baseConnection);
    assert.equal(useDbCalls.length, 0);
    assert.equal(pingCalls, 0);
  } finally {
    await clearUserDbHandshakeCacheState();
    await resetUnitDatabaseRegistryReaderForTests();
    baseConnection.useDb = originalUseDb;
    setMultiDbFlag(previousFlag);
    setMultiDbRegistryReadFlag(previousRegistryReadFlag);
    setUserDbHandshakeFlag(previousHandshakeFlag);
    setMultiDbAllowlist(previousAllowlist);
  }
});

test('resolveConnection com WD_MULTI_DB e registry passivo ligado retorna baseConnection quando status explícito não é active', async () => {
  const previousFlag = process.env.WD_MULTI_DB;
  const previousRegistryReadFlag = process.env.WD_MULTI_DB_REGISTRY_READ;
  const previousHandshakeFlag = process.env.WD_USERDB_HANDSHAKE;
  const previousAllowlist = process.env.WD_MULTI_DB_ALLOWLIST;
  const unidadeId = '000000000000000000000010';
  const baseConnection = mongoose.connection;
  const originalUseDb = baseConnection.useDb;

  try {
    for (const status of ['failed', 'rollback_required', 'disabled', 'ready', 'pending', 'provisioning']) {
      const useDbCalls = [];
      let pingCalls = 0;

      baseConnection.useDb = (...args) => {
        useDbCalls.push(args);
        return {
          name: 'tenantConn',
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
      };

      await clearUserDbHandshakeCacheState();
      await clearUnitDatabaseRegistryCacheForTests();
      await setUnitDatabaseRegistryReaderForTests(() => ({
        unidadeId,
        status,
        dbName: `wdgestor_unit_${unidadeId}`,
        databaseKey: `wdgestor_unit_${unidadeId}`,
        readiness: {
          ready: true,
        },
        activation: {
          active: true,
        },
      }));
      setMultiDbFlag('1');
      setMultiDbRegistryReadFlag('1');
      setUserDbHandshakeFlag('1');
      setMultiDbAllowlist(unidadeId);
      const resolveConnection = await loadResolveConnectionFresh();

      const resultA = resolveConnection({ unidadeId });
      const resultB = resolveConnection({ unidadeId });
      await flushAsyncWork();

      assert.strictEqual(resultA, baseConnection, `status=${status}`);
      assert.strictEqual(resultB, baseConnection, `status=${status}`);
      assert.equal(useDbCalls.length, 0, `status=${status}`);
      assert.equal(pingCalls, 0, `status=${status}`);
    }
  } finally {
    await clearUserDbHandshakeCacheState();
    await clearUnitDatabaseRegistryCacheForTests();
    await resetUnitDatabaseRegistryReaderForTests();
    baseConnection.useDb = originalUseDb;
    setMultiDbFlag(previousFlag);
    setMultiDbRegistryReadFlag(previousRegistryReadFlag);
    setUserDbHandshakeFlag(previousHandshakeFlag);
    setMultiDbAllowlist(previousAllowlist);
  }
});

test('resolveConnection com WD_MULTI_DB e registry passivo ligado usa tenant db quando status=active e os demais gates permitem a unidade', async () => {
  const previousFlag = process.env.WD_MULTI_DB;
  const previousRegistryReadFlag = process.env.WD_MULTI_DB_REGISTRY_READ;
  const previousHandshakeFlag = process.env.WD_USERDB_HANDSHAKE;
  const previousAllowlist = process.env.WD_MULTI_DB_ALLOWLIST;
  const unidadeId = '000000000000000000000010';
  const baseConnection = mongoose.connection;
  const originalUseDb = baseConnection.useDb;
  const tenantConn = { name: 'tenantConn' };
  const useDbCalls = [];

  baseConnection.useDb = (...args) => {
    useDbCalls.push(args);
    return tenantConn;
  };

  try {
    await clearUserDbHandshakeCacheState();
    await setUnitDatabaseRegistryReaderForTests(() => ({
      unidadeId,
      status: 'active',
      dbName: `wdgestor_unit_${unidadeId}`,
      databaseKey: `wdgestor_unit_${unidadeId}`,
      readiness: {
        ready: true,
      },
      activation: {
        active: true,
      },
    }));
    setMultiDbFlag('1');
    setMultiDbRegistryReadFlag('1');
    setUserDbHandshakeFlag('0');
    setMultiDbAllowlist(unidadeId);
    const resolveConnection = await loadResolveConnectionFresh();

    const resultA = resolveConnection({ unidadeId });
    const resultB = resolveConnection({ unidadeId });

    assert.strictEqual(resultA, tenantConn);
    assert.strictEqual(resultB, tenantConn);
    assert.strictEqual(resultA, resultB);
    assert.equal(useDbCalls.length, 1);
    assert.deepEqual(useDbCalls[0], [`wdgestor_unit_${unidadeId}`, { useCache: true }]);
  } finally {
    await clearUserDbHandshakeCacheState();
    await resetUnitDatabaseRegistryReaderForTests();
    baseConnection.useDb = originalUseDb;
    setMultiDbFlag(previousFlag);
    setMultiDbRegistryReadFlag(previousRegistryReadFlag);
    setUserDbHandshakeFlag(previousHandshakeFlag);
    setMultiDbAllowlist(previousAllowlist);
  }
});

test('resolveConnection com WD_MULTI_DB e registry passivo ligado usa tenant db quando registry da unidade está ready, activation.active=true e allowlist permite a unidade', async () => {
  const previousFlag = process.env.WD_MULTI_DB;
  const previousRegistryReadFlag = process.env.WD_MULTI_DB_REGISTRY_READ;
  const previousHandshakeFlag = process.env.WD_USERDB_HANDSHAKE;
  const previousAllowlist = process.env.WD_MULTI_DB_ALLOWLIST;
  const unidadeId = '000000000000000000000010';
  const baseConnection = mongoose.connection;
  const originalUseDb = baseConnection.useDb;
  const tenantConn = { name: 'tenantConn' };
  const useDbCalls = [];

  baseConnection.useDb = (...args) => {
    useDbCalls.push(args);
    return tenantConn;
  };

  try {
    await clearUserDbHandshakeCacheState();
    await setUnitDatabaseRegistryReaderForTests(() => ({
      unidadeId,
      dbName: `wdgestor_unit_${unidadeId}`,
      databaseKey: `wdgestor_unit_${unidadeId}`,
      readiness: {
        ready: true,
      },
      activation: {
        active: true,
      },
    }));
    setMultiDbFlag('1');
    setMultiDbRegistryReadFlag('1');
    setUserDbHandshakeFlag('0');
    setMultiDbAllowlist(unidadeId);
    const resolveConnection = await loadResolveConnectionFresh();

    const resultA = resolveConnection({ unidadeId });
    const resultB = resolveConnection({ unidadeId });

    assert.strictEqual(resultA, tenantConn);
    assert.strictEqual(resultB, tenantConn);
    assert.strictEqual(resultA, resultB);
    assert.equal(useDbCalls.length, 1);
    assert.deepEqual(useDbCalls[0], [`wdgestor_unit_${unidadeId}`, { useCache: true }]);
  } finally {
    await clearUserDbHandshakeCacheState();
    await resetUnitDatabaseRegistryReaderForTests();
    baseConnection.useDb = originalUseDb;
    setMultiDbFlag(previousFlag);
    setMultiDbRegistryReadFlag(previousRegistryReadFlag);
    setUserDbHandshakeFlag(previousHandshakeFlag);
    setMultiDbAllowlist(previousAllowlist);
  }
});

test('resolveConnection com WD_MULTI_DB e registry passivo ligado preserva o handshake atual quando registry da unidade está ready, activation.active=true e allowlist permite a unidade', async () => {
  const previousFlag = process.env.WD_MULTI_DB;
  const previousRegistryReadFlag = process.env.WD_MULTI_DB_REGISTRY_READ;
  const previousHandshakeFlag = process.env.WD_USERDB_HANDSHAKE;
  const previousAllowlist = process.env.WD_MULTI_DB_ALLOWLIST;
  const unidadeId = '000000000000000000000010';
  const baseConnection = mongoose.connection;
  const originalUseDb = baseConnection.useDb;
  const useDbCalls = [];
  let pingCalls = 0;

  const tenantConn = {
    name: 'tenantConn',
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

  baseConnection.useDb = (...args) => {
    useDbCalls.push(args);
    return tenantConn;
  };

  try {
    await clearUserDbHandshakeCacheState();
    await setUnitDatabaseRegistryReaderForTests(() => ({
      unidadeId,
      dbName: `wdgestor_unit_${unidadeId}`,
      databaseKey: `wdgestor_unit_${unidadeId}`,
      readiness: {
        ready: true,
      },
      activation: {
        active: true,
      },
    }));
    setMultiDbFlag('1');
    setMultiDbRegistryReadFlag('1');
    setUserDbHandshakeFlag('1');
    setMultiDbAllowlist(unidadeId);
    const resolveConnection = await loadResolveConnectionFresh();

    const resultA = resolveConnection({ unidadeId });
    const resultB = resolveConnection({ unidadeId });
    await flushAsyncWork();

    assert.strictEqual(resultA, tenantConn);
    assert.strictEqual(resultB, tenantConn);
    assert.strictEqual(resultA, resultB);
    assert.ok(useDbCalls.length >= 1);
    assert.equal(pingCalls, 1);
  } finally {
    await clearUserDbHandshakeCacheState();
    await resetUnitDatabaseRegistryReaderForTests();
    baseConnection.useDb = originalUseDb;
    setMultiDbFlag(previousFlag);
    setMultiDbRegistryReadFlag(previousRegistryReadFlag);
    setUserDbHandshakeFlag(previousHandshakeFlag);
    setMultiDbAllowlist(previousAllowlist);
  }
});

test('resolveConnection com WD_MULTI_DB e registry passivo ligado usa entry válida do cache aquecido sem transformar o fluxo em async', async () => {
  const previousFlag = process.env.WD_MULTI_DB;
  const previousRegistryReadFlag = process.env.WD_MULTI_DB_REGISTRY_READ;
  const previousHandshakeFlag = process.env.WD_USERDB_HANDSHAKE;
  const previousAllowlist = process.env.WD_MULTI_DB_ALLOWLIST;
  const unidadeId = '000000000000000000000010';
  const baseConnection = mongoose.connection;
  const originalUseDb = baseConnection.useDb;
  const tenantConn = { name: 'tenantConn' };
  const useDbCalls = [];

  baseConnection.useDb = (...args) => {
    useDbCalls.push(args);
    return tenantConn;
  };

  try {
    await clearUserDbHandshakeCacheState();
    await clearUnitDatabaseRegistryCacheForTests();
    await resetUnitDatabaseRegistryReaderForTests();
    await setUnitDatabaseRegistryCacheEntryForTests({
      unidadeId,
      entry: {
        unidadeId,
        dbName: `wdgestor_unit_${unidadeId}`,
        databaseKey: `wdgestor_unit_${unidadeId}`,
        readiness: {
          ready: true,
        },
        activation: {
          active: true,
        },
      },
    });
    setMultiDbFlag('1');
    setMultiDbRegistryReadFlag('1');
    setUserDbHandshakeFlag('0');
    setMultiDbAllowlist(unidadeId);
    const resolveConnection = await loadResolveConnectionFresh();

    const resultA = resolveConnection({ unidadeId });
    const resultB = resolveConnection({ unidadeId });

    assert.strictEqual(resultA, tenantConn);
    assert.strictEqual(resultB, tenantConn);
    assert.strictEqual(resultA, resultB);
    assert.equal(useDbCalls.length, 1);
    assert.deepEqual(useDbCalls[0], [`wdgestor_unit_${unidadeId}`, { useCache: true }]);
  } finally {
    await clearUserDbHandshakeCacheState();
    await clearUnitDatabaseRegistryCacheForTests();
    await resetUnitDatabaseRegistryReaderForTests();
    baseConnection.useDb = originalUseDb;
    setMultiDbFlag(previousFlag);
    setMultiDbRegistryReadFlag(previousRegistryReadFlag);
    setUserDbHandshakeFlag(previousHandshakeFlag);
    setMultiDbAllowlist(previousAllowlist);
  }
});

test('resolveConnection: WD_MULTI_DB ON com allowlist contendo unidade usa useDb e retorna tenantConn', async () => {
  const previousFlag = process.env.WD_MULTI_DB;
  const previousHandshakeFlag = process.env.WD_USERDB_HANDSHAKE;
  const previousAllowlist = process.env.WD_MULTI_DB_ALLOWLIST;
  const baseConnection = mongoose.connection;
  const originalUseDb = baseConnection.useDb;
  const tenantConn = { name: 'tenantConn' };
  const useDbCalls = [];

  baseConnection.useDb = (...args) => {
    useDbCalls.push(args);
    return tenantConn;
  };

  try {
    await clearUserDbHandshakeCacheState();
    setUserDbHandshakeFlag('0');
    setMultiDbFlag('1');
    setMultiDbAllowlist('U1');
    const resolveConnection = await loadResolveConnectionFresh();

    const result = resolveConnection({ unidadeId: 'U1' });

    assert.strictEqual(result, tenantConn);
    assert.equal(useDbCalls.length, 1);
    assert.deepEqual(useDbCalls[0], ['wdgestor_unit_U1', { useCache: true }]);
  } finally {
    await clearUserDbHandshakeCacheState();
    baseConnection.useDb = originalUseDb;
    setMultiDbFlag(previousFlag);
    setUserDbHandshakeFlag(previousHandshakeFlag);
    setMultiDbAllowlist(previousAllowlist);
  }
});

test('resolveConnection: WD_MULTI_DB ON com allowlist vazio mantém global e não chama useDb', async () => {
  const previousFlag = process.env.WD_MULTI_DB;
  const previousHandshakeFlag = process.env.WD_USERDB_HANDSHAKE;
  const previousAllowlist = process.env.WD_MULTI_DB_ALLOWLIST;
  const baseConnection = mongoose.connection;
  const originalUseDb = baseConnection.useDb;
  const tenantConn = { name: 'tenantConn' };
  const useDbCalls = [];

  baseConnection.useDb = (...args) => {
    useDbCalls.push(args);
    return tenantConn;
  };

  try {
    await clearUserDbHandshakeCacheState();
    setUserDbHandshakeFlag('1');
    setMultiDbFlag('1');
    setMultiDbAllowlist('');
    const resolveConnection = await loadResolveConnectionFresh();

    const result = resolveConnection({ unidadeId: 'U1' });

    assert.strictEqual(result, baseConnection);
    assert.equal(useDbCalls.length, 0);
  } finally {
    await clearUserDbHandshakeCacheState();
    baseConnection.useDb = originalUseDb;
    setMultiDbFlag(previousFlag);
    setUserDbHandshakeFlag(previousHandshakeFlag);
    setMultiDbAllowlist(previousAllowlist);
  }
});

test('resolveConnection: cache evita chamar useDb duas vezes para mesma unidade com allowlist', async () => {
  const previousFlag = process.env.WD_MULTI_DB;
  const previousHandshakeFlag = process.env.WD_USERDB_HANDSHAKE;
  const previousAllowlist = process.env.WD_MULTI_DB_ALLOWLIST;
  const baseConnection = mongoose.connection;
  const originalUseDb = baseConnection.useDb;
  const tenantConn = { name: 'tenantConn' };
  const useDbCalls = [];

  baseConnection.useDb = (...args) => {
    useDbCalls.push(args);
    return tenantConn;
  };

  try {
    await clearUserDbHandshakeCacheState();
    setUserDbHandshakeFlag('0');
    setMultiDbFlag('on');
    setMultiDbAllowlist('U1');
    const resolveConnection = await loadResolveConnectionFresh();

    const resultA = resolveConnection({ unidadeId: 'U1' });
    const resultB = resolveConnection({ unidadeId: 'U1' });

    assert.strictEqual(resultA, tenantConn);
    assert.strictEqual(resultB, tenantConn);
    assert.equal(useDbCalls.length, 1);
    assert.deepEqual(useDbCalls[0], ['wdgestor_unit_U1', { useCache: true }]);
  } finally {
    await clearUserDbHandshakeCacheState();
    baseConnection.useDb = originalUseDb;
    setMultiDbFlag(previousFlag);
    setUserDbHandshakeFlag(previousHandshakeFlag);
    setMultiDbAllowlist(previousAllowlist);
  }
});

test('resolveConnection: WD_MULTI_DB OFF não dispara userdb handshake', async () => {
  const previousFlag = process.env.WD_MULTI_DB;
  const previousHandshakeFlag = process.env.WD_USERDB_HANDSHAKE;
  const previousAllowlist = process.env.WD_MULTI_DB_ALLOWLIST;
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
    await clearUserDbHandshakeCacheState();
    setMultiDbFlag('0');
    setUserDbHandshakeFlag('1');
    setMultiDbAllowlist('000000000000000000000010');
    const resolveConnection = await loadResolveConnectionFresh();

    resolveConnection({ unidadeId: '000000000000000000000010' });
    await flushAsyncWork();

    assert.equal(pingCalls, 0);
  } finally {
    await clearUserDbHandshakeCacheState();
    baseConnection.useDb = originalUseDb;
    setMultiDbFlag(previousFlag);
    setUserDbHandshakeFlag(previousHandshakeFlag);
    setMultiDbAllowlist(previousAllowlist);
  }
});

test('resolveConnection: WD_MULTI_DB ON com WD_USERDB_HANDSHAKE=0 não dispara handshake', async () => {
  const previousFlag = process.env.WD_MULTI_DB;
  const previousHandshakeFlag = process.env.WD_USERDB_HANDSHAKE;
  const previousAllowlist = process.env.WD_MULTI_DB_ALLOWLIST;
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
    await clearUserDbHandshakeCacheState();
    setMultiDbFlag('1');
    setUserDbHandshakeFlag('0');
    setMultiDbAllowlist('000000000000000000000010');
    const resolveConnection = await loadResolveConnectionFresh();

    resolveConnection({ unidadeId: '000000000000000000000010' });
    await flushAsyncWork();

    assert.equal(pingCalls, 0);
  } finally {
    await clearUserDbHandshakeCacheState();
    baseConnection.useDb = originalUseDb;
    setMultiDbFlag(previousFlag);
    setUserDbHandshakeFlag(previousHandshakeFlag);
    setMultiDbAllowlist(previousAllowlist);
  }
});

test('resolveConnection: WD_MULTI_DB ON com WD_USERDB_HANDSHAKE=1 dispara handshake uma única vez por unidade', async () => {
  const previousFlag = process.env.WD_MULTI_DB;
  const previousHandshakeFlag = process.env.WD_USERDB_HANDSHAKE;
  const previousAllowlist = process.env.WD_MULTI_DB_ALLOWLIST;
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
    await clearUserDbHandshakeCacheState();
    setMultiDbFlag('1');
    setUserDbHandshakeFlag('1');
    setMultiDbAllowlist('000000000000000000000010');
    const resolveConnection = await loadResolveConnectionFresh();

    resolveConnection({ unidadeId: '000000000000000000000010' });
    resolveConnection({ unidadeId: '000000000000000000000010' });
    await flushAsyncWork();

    assert.equal(pingCalls, 1);
  } finally {
    await clearUserDbHandshakeCacheState();
    baseConnection.useDb = originalUseDb;
    setMultiDbFlag(previousFlag);
    setUserDbHandshakeFlag(previousHandshakeFlag);
    setMultiDbAllowlist(previousAllowlist);
  }
});

test('resolveConnection: handshake com probe throw segue nao-bloqueante e no maximo 1x por unidade', async () => {
  const previousFlag = process.env.WD_MULTI_DB;
  const previousHandshakeFlag = process.env.WD_USERDB_HANDSHAKE;
  const previousAllowlist = process.env.WD_MULTI_DB_ALLOWLIST;
  const baseConnection = mongoose.connection;
  const originalUseDb = baseConnection.useDb;
  const originalWarn = console.warn;
  let adminCalls = 0;
  const warnMessages = [];

  const tenantConn = {
    db: {
      admin() {
        adminCalls += 1;
        throw new Error('PROBE_THROW');
      }
    }
  };

  console.warn = (...args) => {
    warnMessages.push(String(args[0] || ''));
  };

  baseConnection.useDb = () => tenantConn;

  try {
    await clearUserDbHandshakeCacheState();
    setMultiDbFlag('1');
    setUserDbHandshakeFlag('1');
    setMultiDbAllowlist('000000000000000000000010');
    const resolveConnection = await loadResolveConnectionFresh();

    assert.doesNotThrow(() => {
      const result = resolveConnection({ unidadeId: '000000000000000000000010' });
      assert.strictEqual(result, tenantConn);
    });

    assert.doesNotThrow(() => {
      const result = resolveConnection({ unidadeId: '000000000000000000000010' });
      assert.strictEqual(result, tenantConn);
    });

    await flushAsyncWork();

    assert.equal(adminCalls, 1);
    assert.ok(warnMessages.some((message) => message.includes('[resolveConnection] userdb handshake falhou')));
  } finally {
    await clearUserDbHandshakeCacheState();
    baseConnection.useDb = originalUseDb;
    console.warn = originalWarn;
    setMultiDbFlag(previousFlag);
    setUserDbHandshakeFlag(previousHandshakeFlag);
    setMultiDbAllowlist(previousAllowlist);
  }
});
