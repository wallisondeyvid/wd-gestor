import assert from 'node:assert/strict';
import test from 'node:test';

import { loadConfig } from '../src/core/config/index.js';
import { connectMongo, disconnectMongo } from '../src/core/db/connect.js';

function withEnv(vars, fn) {
  const prev = {};
  for (const key of Object.keys(vars)) {
    prev[key] = process.env[key];
    const value = vars[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const key of Object.keys(vars)) {
        if (prev[key] === undefined) delete process.env[key];
        else process.env[key] = prev[key];
      }
    });
}

test('MONGO_MEMORY=1 resolve mongo config como in-memory sem fallback localhost e sem tentativa primária', async () => {
  const logs = [];
  const warns = [];
  const origLog = console.log;
  const origWarn = console.warn;

  console.log = (...args) => { logs.push(args.map(a => String(a)).join(' ')); };
  console.warn = (...args) => { warns.push(args.map(a => String(a)).join(' ')); };

  try {
    await withEnv({
      MONGO_MEMORY: '1',
      MONGO_URI: undefined,
      MONGODB_URI: undefined,
      FALLBACK_MEM_ON_FAIL: undefined
    }, async () => {
      const cfg = loadConfig();

      assert.equal(cfg.mongoUri, undefined);
      assert.ok(logs.some(line => line.includes('[config] mongoUri efetiva = (in-memory)')));
      assert.ok(logs.some(line => line.includes('[mongo] modo memória forçado via MONGO_MEMORY=1')));
      assert.equal(logs.some(line => line.includes('mongodb://localhost:27017')), false);

      await connectMongo(cfg.mongoUri);

      assert.equal(warns.some(line => line.includes('[mongo] falha conexão primária:')), false);
    });
  } finally {
    try { await disconnectMongo({ stopMemoryServer: true }); } catch {}
    console.log = origLog;
    console.warn = origWarn;
  }
});
