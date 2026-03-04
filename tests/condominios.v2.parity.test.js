import assert from 'node:assert/strict';
import process from 'node:process';
import test, { after } from 'node:test';
import request from 'supertest';

import { createServer } from '../src/server/createServer.js';

const closeFns = [];

function isDebugHangEnabled() {
  return String(process.env.DEBUG_HANG || '').trim() === '1';
}

function logActiveHandlesDebug() {
  if (!isDebugHangEnabled()) return;
  try {
    const handles = typeof process._getActiveHandles === 'function' ? process._getActiveHandles() : [];
    const requests = typeof process._getActiveRequests === 'function' ? process._getActiveRequests() : [];
    const names = handles.map((handle) => String(handle?.constructor?.name || 'unknown'));
    const requestNames = requests.map((req) => String(req?.constructor?.name || 'unknown'));
    console.error('[parity][debug] active handles:', names);
    console.error('[parity][debug] active requests:', requestNames);
  } catch {}
}

function debugHang(reason) {
  if (!isDebugHangEnabled()) return;
  try {
    const handles = typeof process._getActiveHandles === 'function' ? process._getActiveHandles() : [];
    const requests = typeof process._getActiveRequests === 'function' ? process._getActiveRequests() : [];

    const handleDetails = handles.map((handle) => {
      const name = String(handle?.constructor?.name || 'unknown');
      const details = { name };

      if (typeof handle?.hasRef === 'function') {
        details.hasRef = handle.hasRef();
      }

      if (name === 'Server') {
        try {
          details.address = typeof handle?.address === 'function' ? handle.address() : undefined;
        } catch {
          details.address = 'error';
        }
        if (typeof handle?.listening === 'boolean') {
          details.listening = handle.listening;
        }
      }

      if (name === 'Socket') {
        details.localAddress = handle?.localAddress;
        details.localPort = handle?.localPort;
        details.remoteAddress = handle?.remoteAddress;
        details.remotePort = handle?.remotePort;
        if (typeof handle?.destroyed === 'boolean') {
          details.destroyed = handle.destroyed;
        }
      }

      return details;
    });
    const requestDetails = requests.map((req) => ({
      name: String(req?.constructor?.name || 'unknown')
    }));

    console.error(`[parity][debug][${reason}] handles(${handleDetails.length}):`, handleDetails);
    console.error(`[parity][debug][${reason}] requests(${requestDetails.length}):`, requestDetails);
  } catch {}
}

if (isDebugHangEnabled()) {
  process.on('beforeExit', () => debugHang('beforeExit'));
  process.on('exit', () => debugHang('exit'));

  const t2 = setTimeout(() => debugHang('T+2s'), 2000);
  t2.unref?.();

  const t10 = setTimeout(() => debugHang('T+10s'), 10000);
  t10.unref?.();
}

after(async () => {
  while (closeFns.length) {
    const close = closeFns.pop();
    try { await close(); } catch {}
  }

  logActiveHandlesDebug();
});

function getContentType(res) {
  return String(res.headers['content-type'] || '');
}

async function requestWithFlag(app, { method = 'get', path, query, body }, flagValue) {
  const prev = process.env.WDG_FLAG_CONDOMINIOS_APP_V2;
  process.env.WDG_FLAG_CONDOMINIOS_APP_V2 = String(flagValue);
  try {
    let req = request(app)[method](path);
    if (query && Object.keys(query).length) req = req.query(query);
    if (body !== undefined) req = req.send(body);
    return await req;
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
  const { app, close } = await createServer();
  if (typeof close === 'function') closeFns.push(() => close({ stopMemoryServer: true }));

  const writePostBody = {
    unidade_id: '000000000000000000000010',
    nome: 'Bloco parity write fixed',
    ordem: 1
  };
  await requestWithFlag(app, {
    method: 'post',
    path: '/condominios/api/blocos',
    body: writePostBody
  }, 0);

  const cases = [
    {
      label: 'GET /condominios/api/unidades',
      path: '/condominios/api/unidades',
      query: { search: 'a', unidadeId: 'u-test' }
    },
    {
      label: 'GET /condominios/api/unidades/:id',
      path: '/condominios/api/unidades/000000000000000000000001',
      query: {}
    },
    {
      label: 'GET /condominios/api/unidades/relacionadas',
      path: '/condominios/api/unidades/relacionadas',
      query: { condominioId: '000000000000000000000001', blocoId: '000000000000000000000002', andarId: '000000000000000000000003' }
    },
    {
      label: 'GET /condominios/api/blocos',
      path: '/condominios/api/blocos',
      query: { unidade_id: 'u-test' }
    },
    {
      label: 'GET /condominios/api/blocos/:id',
      path: '/condominios/api/blocos/000000000000000000000001',
      query: {}
    },
    {
      label: 'GET /condominios/api/blocos/relacionados',
      path: '/condominios/api/blocos/relacionados',
      query: { condominioId: '000000000000000000000001', blocoId: '000000000000000000000002', andarId: '000000000000000000000003' }
    },
    {
      label: 'GET /condominios/api/andares',
      path: '/condominios/api/andares',
      query: { unidade_id: 'u-test' }
    },
    {
      label: 'GET /condominios/api/andares/:id',
      path: '/condominios/api/andares/000000000000000000000001',
      query: {}
    },
    {
      label: 'GET /condominios/api/andares/relacionados',
      path: '/condominios/api/andares/relacionados',
      query: { condominioId: '000000000000000000000001', blocoId: '000000000000000000000002', andarId: '000000000000000000000003' }
    },
    {
      label: 'POST /condominios/api/blocos (válido idempotente)',
      method: 'post',
      path: '/condominios/api/blocos',
      body: writePostBody
    },
    {
      label: 'POST /condominios/api/blocos (campos faltantes)',
      method: 'post',
      path: '/condominios/api/blocos',
      body: { nome: 'Sem unidade' }
    },
    {
      label: 'PUT /condominios/api/blocos/:id',
      method: 'put',
      path: '/condominios/api/blocos/000000000000000000000099',
      body: { nome: 'Novo Nome', ordem: 2, ativo: true }
    },
    {
      label: 'DELETE /condominios/api/blocos/:id',
      method: 'delete',
      path: '/condominios/api/blocos/000000000000000000000098',
      query: {}
    }
  ];

  for (const c of cases) {
    const offRes = await requestWithFlag(app, c, 0);
    const onRes = await requestWithFlag(app, c, 1);
    assertByteParity({ offRes, onRes, label: c.label });
  }
});
