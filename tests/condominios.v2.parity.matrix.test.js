import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import request from 'supertest';

import { createServer } from '../src/server/createServer.js';

const FLAG_NAME = 'WDG_FLAG_CONDOMINIOS_APP_V2';
const LONG_TEXT = 'x'.repeat(4096);

const ENDPOINTS = [
  {
    name: 'GET /condominios/api/unidades',
    path: '/condominios/api/unidades',
    type: 'list'
  },
  {
    name: 'GET /condominios/api/unidades/:id',
    path: '/condominios/api/unidades/000000000000000000000001',
    type: 'detail'
  },
  {
    name: 'GET /condominios/api/unidades/relacionadas',
    path: '/condominios/api/unidades/relacionadas',
    type: 'related'
  },
  {
    name: 'GET /condominios/api/blocos',
    path: '/condominios/api/blocos',
    type: 'list'
  },
  {
    name: 'GET /condominios/api/blocos/:id',
    path: '/condominios/api/blocos/000000000000000000000001',
    type: 'detail'
  },
  {
    name: 'GET /condominios/api/blocos/relacionados',
    path: '/condominios/api/blocos/relacionados',
    type: 'related'
  },
  {
    name: 'GET /condominios/api/andares',
    path: '/condominios/api/andares',
    type: 'list'
  },
  {
    name: 'GET /condominios/api/andares/:id',
    path: '/condominios/api/andares/000000000000000000000001',
    type: 'detail'
  },
  {
    name: 'GET /condominios/api/andares/relacionados',
    path: '/condominios/api/andares/relacionados',
    type: 'related'
  }
];

function baseQueryFor(endpoint) {
  if (endpoint.type === 'detail') return {};
  if (endpoint.type === 'related') {
    return {
      condominioId: '000000000000000000000001',
      blocoId: '000000000000000000000002',
      andarId: '000000000000000000000003'
    };
  }
  if (endpoint.path.includes('/unidades')) return { search: 'a', unidadeId: 'u-test' };
  return { unidade_id: 'u-test' };
}

const SCENARIOS = [
  { id: 'A', name: 'Query vazia', buildQuery: () => ({}) },
  { id: 'B', name: 'Query parcial', buildQuery: (ep) => ep.type === 'detail' ? {} : baseQueryFor(ep) },
  { id: 'C', name: 'Query inválida', buildQuery: (ep) => ep.type === 'detail' ? ({ foo: 'invalid' }) : (ep.path.includes('/unidades') ? ({ unidadeId: '@@@', search: '\u0000' }) : ({ unidade_id: '@@@', condominioId: '@@@' })) },
  { id: 'D', name: 'Unicode', buildQuery: (ep) => ep.type === 'detail' ? ({ note: 'áéíóú 😀 中文' }) : (ep.path.includes('/unidades') ? ({ search: 'áéíóú 😀 中文' }) : ({ unidade_id: 'á-😀-中', condominioId: 'á-😀-中' })) },
  { id: 'E', name: 'Parâmetros inesperados', buildQuery: (ep) => ({ ...baseQueryFor(ep), foo: 'bar', arr: ['1', '2'], unknown: '1' }) },
  { id: 'F', name: 'Strings longas', buildQuery: (ep) => ep.type === 'detail' ? ({ q: LONG_TEXT }) : (ep.path.includes('/unidades') ? ({ search: LONG_TEXT }) : ({ unidade_id: LONG_TEXT, condominioId: LONG_TEXT })) },
  { id: 'G', name: 'Null / undefined simulados', buildQuery: (ep) => ep.type === 'detail' ? ({ extra: undefined, marker: null }) : (ep.path.includes('/unidades') ? ({ unidadeId: null, search: undefined, extra: '' }) : ({ unidade_id: null, unidade: undefined, condominioId: null, extra: '' })) },
  { id: 'H', name: 'DB indisponível (erro interno)', useSkipDbApp: true, buildQuery: (ep) => ep.type === 'detail' ? {} : (ep.path.includes('/unidades') ? ({ search: 'db-off' }) : baseQueryFor(ep)) },
  { id: 'I', name: 'Usuário sem escopo', buildQuery: () => ({}) },
  { id: 'J', name: 'Resultado vazio', buildQuery: (ep) => ep.type === 'detail' ? {} : (ep.path.includes('/unidades') ? ({ search: '__sem_resultado__' }) : ({ unidade_id: '__sem_resultado__', condominioId: '__sem_resultado__' })) },
  { id: 'K', name: 'Resultado grande', buildQuery: (ep) => ep.type === 'detail' ? {} : baseQueryFor(ep) },
  { id: 'L', name: 'Repetição múltipla (loop 20x)', repeat: 20, buildQuery: (ep) => ep.type === 'detail' ? {} : baseQueryFor(ep) }
];

let appDefault;
let appSkipDb;

function relevantHeaders(res) {
  return {
    'content-type': String(res.headers['content-type'] || ''),
    'retry-after': String(res.headers['retry-after'] || '')
  };
}

async function callWithFlag(app, path, query, flagValue) {
  const prev = process.env[FLAG_NAME];
  process.env[FLAG_NAME] = String(flagValue);
  try {
    return await request(app).get(path).query(query || {});
  } finally {
    if (prev === undefined) delete process.env[FLAG_NAME];
    else process.env[FLAG_NAME] = prev;
  }
}

function assertParity({ endpointName, scenarioId, scenarioName, iteration, offRes, onRes }) {
  const prefix = `[${endpointName}] [${scenarioId} - ${scenarioName}] [iter=${iteration}]`;
  assert.equal(onRes.status, offRes.status, `${prefix} status divergiu`);
  assert.deepEqual(relevantHeaders(onRes), relevantHeaders(offRes), `${prefix} headers relevantes divergiram`);
  assert.equal(onRes.text, offRes.text, `${prefix} body divergiu (byte-a-byte)`);
}

before(async () => {
  ({ app: appDefault } = await createServer());
  ({ app: appSkipDb } = await createServer({ skipDb: true }));
});

describe('Paridade V2 matrix - Condomínios', { concurrency: 1 }, () => {
  for (const endpoint of ENDPOINTS) {
    describe(endpoint.name, { concurrency: 1 }, () => {
      for (const scenario of SCENARIOS) {
        it(`${scenario.id} - ${scenario.name}`, async () => {
          const query = scenario.buildQuery(endpoint);
          const iterations = Number(scenario.repeat || 1);
          const app = scenario.useSkipDbApp ? appSkipDb : appDefault;

          for (let i = 1; i <= iterations; i += 1) {
            const offRes = await callWithFlag(app, endpoint.path, query, 0);
            const onRes = await callWithFlag(app, endpoint.path, query, 1);

            assertParity({
              endpointName: endpoint.name,
              scenarioId: scenario.id,
              scenarioName: scenario.name,
              iteration: i,
              offRes,
              onRes
            });
          }
        });
      }
    });
  }
});
