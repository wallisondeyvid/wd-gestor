import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

import { createServer } from '../src/server/createServer.js';

function getContentType(res) {
  return String(res.headers['content-type'] || '');
}

async function requestWithFlag(app, { path, query }, flagValue) {
  const prev = process.env.WDG_FLAG_CONDOMINIOS_APP_V2;
  process.env.WDG_FLAG_CONDOMINIOS_APP_V2 = String(flagValue);
  try {
    return await request(app).get(path).query(query || {});
  } finally {
    if (prev === undefined) delete process.env.WDG_FLAG_CONDOMINIOS_APP_V2;
    else process.env.WDG_FLAG_CONDOMINIOS_APP_V2 = prev;
  }
}

function assertByteParity({ offRes, onRes, label }) {
  assert.equal(onRes.status, offRes.status, `[${label}] status divergiu`);
  assert.equal(getContentType(onRes), getContentType(offRes), `[${label}] content-type divergiu`);
  assert.equal(onRes.text, offRes.text, `[${label}] body divergiu (byte-a-byte)`);
}

test('Paridade OFF/ON da WDG_FLAG_CONDOMINIOS_APP_V2 em /api/unidades, /api/blocos e /api/andares', async () => {
  const { app } = await createServer();

  const cases = [
    {
      label: 'GET /condominios/api/unidades',
      path: '/condominios/api/unidades',
      query: { search: 'a', unidadeId: 'u-test' }
    },
    {
      label: 'GET /condominios/api/blocos',
      path: '/condominios/api/blocos',
      query: { unidade_id: 'u-test' }
    },
    {
      label: 'GET /condominios/api/andares',
      path: '/condominios/api/andares',
      query: { unidade_id: 'u-test' }
    }
  ];

  for (const c of cases) {
    const offRes = await requestWithFlag(app, c, 0);
    const onRes = await requestWithFlag(app, c, 1);
    assertByteParity({ offRes, onRes, label: c.label });
  }
});
