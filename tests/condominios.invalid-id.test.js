import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import request from 'supertest';

import { createServer } from '../src/server/createServer.js';
import { assertOfflineContract } from './helpers/assertOfflineContract.js';

async function requestWithFlag(app, flagValue, pathName, query = {}) {
  const prev = process.env.WDG_FLAG_CONDOMINIOS_APP_V2;
  process.env.WDG_FLAG_CONDOMINIOS_APP_V2 = String(flagValue);
  try {
    return await request(app).get(pathName).query(query);
  } finally {
    if (prev === undefined) delete process.env.WDG_FLAG_CONDOMINIOS_APP_V2;
    else process.env.WDG_FLAG_CONDOMINIOS_APP_V2 = prev;
  }
}

test('GET /condominios/api/blocos com unidade_id inválido retorna [] sem CastError e sem 500', async () => {
  const { app } = await createServer();

  const logs = [];
  const originalConsoleError = console.error;
  console.error = (...args) => {
    logs.push(args.map((arg) => String(arg)).join(' '));
  };

  try {
    const res = await requestWithFlag(app, 1, '/condominios/api/blocos', { unidade_id: 'u-test' });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.deepEqual(res.body, []);

    const hasCastError = logs.some((line) => /CastError|Cast to ObjectId failed/i.test(line));
    assert.equal(hasCastError, false);
  } finally {
    console.error = originalConsoleError;
  }
});

test('GET /condominios/api/blocos com skipDb=true retorna 503 + Retry-After + payload consistente', async () => {
  await assertOfflineContract({
    createServer,
    path: '/condominios/api/blocos',
    query: {
      unidade_id: '000000000000000000000010'
    }
  });
});

test('GET /condominios/api/unidades com skipDb=true retorna contrato offline', async () => {
  await assertOfflineContract({
    createServer,
    path: '/condominios/api/unidades'
  });
});

test('GET /condominios/api/andares com skipDb=true retorna contrato offline', async () => {
  await assertOfflineContract({
    createServer,
    path: '/condominios/api/andares'
  });
});

test('GET /condominios/api/blocos/:id com skipDb=true retorna contrato offline', async () => {
  await assertOfflineContract({
    createServer,
    path: '/condominios/api/blocos/000000000000000000000010'
  });
});

test('Integridade da flag V2: wiring OFF/ON para handlers de blocos permanece explícito', async () => {
  const filePath = path.resolve(process.cwd(), 'src/modules/condominios/app/condominios-app.js');
  const source = await fs.readFile(filePath, 'utf8');

  assert.match(source, /app\.get\('\/api\/blocos',[\s\S]*if \(isV2On\) return handleGetBlocosV2\(req, res, next\);/);
  assert.match(source, /app\.post\('\/api\/blocos',[\s\S]*if \(isV2On\) return handlePostBlocosV2\(req, res, next\);/);
  assert.match(source, /app\.put\('\/api\/blocos\/:id',[\s\S]*if \(isV2On\) return handlePutBlocosV2\(req, res, next\);/);
  assert.match(source, /app\.delete\('\/api\/blocos\/:id',[\s\S]*if \(isV2On\) return handleDeleteBlocosV2\(req, res, next\);/);
});
