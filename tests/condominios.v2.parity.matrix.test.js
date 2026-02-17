import assert from 'node:assert/strict';
import { before, after, describe, it } from 'node:test';
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
  },
  {
    name: 'POST /condominios/api/blocos',
    path: '/condominios/api/blocos',
    type: 'write-post',
    method: 'post'
  },
  {
    name: 'PUT /condominios/api/blocos/:id',
    path: '/condominios/api/blocos/__ID__',
    type: 'write-put',
    method: 'put'
  },
  {
    name: 'DELETE /condominios/api/blocos/:id',
    path: '/condominios/api/blocos/__ID__',
    type: 'write-delete',
    method: 'delete'
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

const WRITE_SCENARIOS = [
  {
    id: 'A',
    name: 'Válido',
    buildRequest: (ep) => {
      if (ep.type === 'write-post') {
        return {
          body: {
            unidade_id: '000000000000000000000010',
            nome: 'Bloco parity válido',
            ordem: 1
          }
        };
      }
      if (ep.type === 'write-put') {
        return {
          id: '000000000000000000000101',
          body: { nome: 'Bloco update válido', ordem: 2, ativo: true }
        };
      }
      return {
        id: '000000000000000000000102'
      };
    }
  },
  {
    id: 'B',
    name: 'Inválido',
    buildRequest: (ep) => {
      if (ep.type === 'write-post') {
        return {
          body: {
            unidade_id: '',
            nome: ''
          }
        };
      }
      if (ep.type === 'write-put') {
        return {
          id: 'id-invalido',
          body: { ordem: 'zzz' }
        };
      }
      return {
        id: 'id-invalido'
      };
    }
  },
  {
    id: 'C',
    name: 'Campos faltantes',
    buildRequest: (ep) => {
      if (ep.type === 'write-post') {
        return {
          body: {
            nome: 'Sem unidade'
          }
        };
      }
      if (ep.type === 'write-put') {
        return {
          id: '000000000000000000000103',
          body: {}
        };
      }
      return {
        id: '000000000000000000000104'
      };
    }
  },
  {
    id: 'D',
    name: 'Unicode',
    buildRequest: (ep) => {
      if (ep.type === 'write-post') {
        return {
          body: {
            unidade_id: '000000000000000000000010',
            nome: 'Bloco Áéíóú 😀 中文',
            ordem: 3
          }
        };
      }
      if (ep.type === 'write-put') {
        return {
          id: '000000000000000000000105',
          body: { nome: 'Atualizado Áéíóú 😀 中文' }
        };
      }
      return {
        id: '000000000000000000000106'
      };
    }
  },
  {
    id: 'E',
    name: 'Strings longas',
    buildRequest: (ep) => {
      if (ep.type === 'write-post') {
        return {
          body: {
            unidade_id: '000000000000000000000010',
            nome: LONG_TEXT,
            ordem: 4
          }
        };
      }
      if (ep.type === 'write-put') {
        return {
          id: '000000000000000000000107',
          body: { nome: LONG_TEXT }
        };
      }
      return {
        id: '000000000000000000000108'
      };
    }
  },
  {
    id: 'F',
    name: 'Parâmetros extras',
    buildRequest: (ep) => {
      if (ep.type === 'write-post') {
        return {
          body: {
            unidade_id: '000000000000000000000010',
            nome: 'Bloco com extras',
            ordem: 5,
            foo: 'bar',
            arr: ['1', '2']
          },
          query: {
            extra: '1'
          }
        };
      }
      if (ep.type === 'write-put') {
        return {
          id: '000000000000000000000109',
          body: {
            nome: 'Update extras',
            ativo: false,
            unknown: true
          },
          query: {
            extra: '1'
          }
        };
      }
      return {
        id: '000000000000000000000110',
        query: {
          extra: '1'
        }
      };
    }
  },
  {
    id: 'G',
    name: 'Sem escopo',
    buildRequest: (ep) => {
      if (ep.type === 'write-post') {
        return {
          body: {
            unidade_id: '000000000000000000000010',
            nome: 'Bloco sem escopo',
            ordem: 6
          }
        };
      }
      if (ep.type === 'write-put') {
        return {
          id: '000000000000000000000111',
          body: { nome: 'Update sem escopo' }
        };
      }
      return {
        id: '000000000000000000000112'
      };
    }
  },
  {
    id: 'H',
    name: 'DB indisponível',
    useSkipDbApp: true,
    buildRequest: (ep) => {
      if (ep.type === 'write-post') {
        return {
          body: {
            unidade_id: '000000000000000000000010',
            nome: 'Bloco db off',
            ordem: 7
          }
        };
      }
      if (ep.type === 'write-put') {
        return {
          id: '000000000000000000000113',
          body: { nome: 'Update db off' }
        };
      }
      return {
        id: '000000000000000000000114'
      };
    }
  },
  {
    id: 'I',
    name: 'Idempotência',
    repeat: 5,
    buildRequest: (ep) => {
      if (ep.type === 'write-post') {
        return {
          body: {
            unidade_id: '000000000000000000000010',
            nome: 'Bloco idempotente',
            ordem: 8
          }
        };
      }
      if (ep.type === 'write-put') {
        return {
          id: '000000000000000000000115',
          body: { nome: 'Update idempotente', ordem: 8 }
        };
      }
      return {
        id: '000000000000000000000116'
      };
    }
  }
];

let appDefault;
let appSkipDb;
const closeFns = [];

function logActiveHandlesDebug() {
  if (String(process.env.PARITY_DEBUG || '').trim() !== '1') return;
  try {
    const handles = typeof process._getActiveHandles === 'function' ? process._getActiveHandles() : [];
    const names = handles.map((handle) => String(handle?.constructor?.name || 'unknown'));
    console.error('[parity][debug] active handles (matrix):', names);
  } catch {}
}

function relevantHeaders(res) {
  return {
    'content-type': String(res.headers['content-type'] || ''),
    'retry-after': String(res.headers['retry-after'] || '')
  };
}

async function callWithFlag(app, { method = 'get', path, query, body }, flagValue) {
  const prev = process.env[FLAG_NAME];
  process.env[FLAG_NAME] = String(flagValue);
  try {
    let req = request(app)[method](path);
    if (query && Object.keys(query).length) req = req.query(query);
    if (body !== undefined) req = req.send(body);
    return await req;
  } finally {
    if (prev === undefined) delete process.env[FLAG_NAME];
    else process.env[FLAG_NAME] = prev;
  }
}

async function ensurePostBodyExists(app, body) {
  await callWithFlag(app, {
    method: 'post',
    path: '/condominios/api/blocos',
    body
  }, 0);
}

function assertParity({ endpointName, scenarioId, scenarioName, iteration, offRes, onRes }) {
  const prefix = `[${endpointName}] [${scenarioId} - ${scenarioName}] [iter=${iteration}]`;
  assert.equal(onRes.status, offRes.status, `${prefix} status divergiu`);
  assert.deepEqual(relevantHeaders(onRes), relevantHeaders(offRes), `${prefix} headers relevantes divergiram`);
  assert.equal(onRes.text, offRes.text, `${prefix} body divergiu (byte-a-byte)`);
}

before(async () => {
  {
    const created = await createServer();
    appDefault = created.app;
    if (typeof created.close === 'function') closeFns.push(() => created.close({ stopMemoryServer: true }));
  }
  {
    const created = await createServer({ skipDb: true });
    appSkipDb = created.app;
    if (typeof created.close === 'function') closeFns.push(() => created.close({ stopMemoryServer: true }));
  }
});

after(async () => {
  while (closeFns.length) {
    const close = closeFns.pop();
    try { await close(); } catch {}
  }

  logActiveHandlesDebug();
});

describe('Paridade V2 matrix - Condomínios', { concurrency: 1 }, () => {
  const readEndpoints = ENDPOINTS.filter(ep => !String(ep.type).startsWith('write-'));

  for (const endpoint of readEndpoints) {
    describe(endpoint.name, { concurrency: 1 }, () => {
      for (const scenario of SCENARIOS) {
        it(`${scenario.id} - ${scenario.name}`, async () => {
          const query = scenario.buildQuery(endpoint);
          const iterations = Number(scenario.repeat || 1);
          const app = scenario.useSkipDbApp ? appSkipDb : appDefault;

          for (let i = 1; i <= iterations; i += 1) {
            const offRes = await callWithFlag(app, { path: endpoint.path, query }, 0);
            const onRes = await callWithFlag(app, { path: endpoint.path, query }, 1);

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

describe('Paridade V2 matrix - Condomínios WRITE (blocos)', { concurrency: 1 }, () => {
  const writeEndpoints = ENDPOINTS.filter(ep => ep.type.startsWith('write-'));

  for (const endpoint of writeEndpoints) {
    describe(endpoint.name, { concurrency: 1 }, () => {
      for (const scenario of WRITE_SCENARIOS) {
        it(`${scenario.id} - ${scenario.name}`, async () => {
          const reqSpec = scenario.buildRequest(endpoint) || {};
          const iterations = Number(scenario.repeat || 1);
          const app = scenario.useSkipDbApp ? appSkipDb : appDefault;

          for (let i = 1; i <= iterations; i += 1) {
            const path = reqSpec.id ? endpoint.path.replace('__ID__', reqSpec.id) : endpoint.path;
            const offRequest = {
              method: endpoint.method,
              path,
              query: reqSpec.query || {},
              body: reqSpec.body
            };

            if (
              endpoint.type === 'write-post'
              && !scenario.useSkipDbApp
              && reqSpec.body
              && reqSpec.body.unidade_id
              && reqSpec.body.nome
            ) {
              await ensurePostBodyExists(app, reqSpec.body);
            }

            const offRes = await callWithFlag(app, offRequest, 0);
            const onRes = await callWithFlag(app, offRequest, 1);

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
