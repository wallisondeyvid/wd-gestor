import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import request from 'supertest';
import { buildGestorApp } from '../src/modules/gestor/app/gestor-app.js';

const app = buildGestorApp();

const ROOT = process.cwd();
const CONTROLLER_PATH = path.join(ROOT, 'src/modules/gestor/app/controllers/unidadeController.js');

function createJsonRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function extractBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Não foi possível extrair trecho entre ${startMarker} e ${endMarker}`);
  }
  return source.slice(start, end);
}

function loadUnidadeTestarBancoHarness(overrides = {}) {
  const source = fs.readFileSync(CONTROLLER_PATH, 'utf8');
  assert.match(source, /export const unidadeControllerOrphan = \{ listarUnidades \};/);
  assert.match(source, /export const unidadeControllerLive = \{ testarBanco \};/);
  const snippet = extractBetween(
    source,
    'function normalizeUnitId(value) {',
    'export const unidadeControllerOrphan = { listarUnidades };',
  )
    .replace('export async function listarUnidades(req, res) {', 'async function listarUnidades(req, res) {')
    .replace('export async function testarBanco(req, res) {', 'async function testarBanco(req, res) {');

  const deps = {
    findUnidadeById: async () => null,
    findUnidadeByIdLean: async () => null,
    findUnidadesByMatrizOuPrincipal: async () => [],
    findUnidadesById: async () => [],
    BankPort: {
      getOAuthTokenFromConfig: async () => 'token-default-123',
      callBankApi: async () => ({ ok: true }),
    },
    console,
    ...overrides,
  };

  const factory = new Function(
    'findUnidadeById',
    'findUnidadeByIdLean',
    'findUnidadesByMatrizOuPrincipal',
    'findUnidadesById',
    'BankPort',
    'console',
    `${snippet}\nreturn { testarBanco, ensureCanAccessUnidade };`,
  );

  return {
    ...factory(
      deps.findUnidadeById,
      deps.findUnidadeByIdLean,
      deps.findUnidadesByMatrizOuPrincipal,
      deps.findUnidadesById,
      deps.BankPort,
      deps.console,
    ),
    deps,
  };
}

test('POST /gestor/unidades/:id/testar-banco sem sessão redireciona para /login no app real', async () => {
  const response = await request(app)
    .post('/gestor/unidades/64b000000000000000000001/testar-banco')
    .send({});

  assert.equal(response.status, 302);
  assert.equal(response.headers.location, '/login');
});

test('testarBanco trata id inválido no runtime atual como unidade não encontrada quando o lookup não resolve alvo', async () => {
  const { testarBanco } = loadUnidadeTestarBancoHarness({
    findUnidadeById: async (id) => {
      assert.equal(id, 'id-invalido');
      return null;
    },
  });
  const res = createJsonRes();

  await testarBanco({ params: { id: 'id-invalido' }, body: {}, unitScope: { unidadeId: 'u-1' }, user: { role: 'admin' } }, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { ok: false, message: 'Unidade não encontrada.' });
});

test('testarBanco responde 404 quando a unidade não existe', async () => {
  const { testarBanco } = loadUnidadeTestarBancoHarness({
    findUnidadeById: async () => null,
  });
  const res = createJsonRes();

  await testarBanco({ params: { id: 'u-ausente' }, body: {}, unitScope: { unidadeId: 'u-1' }, user: { role: 'admin' } }, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { ok: false, message: 'Unidade não encontrada.' });
});

test('testarBanco responde 400 fora do escopo contextual quando o alvo não pertence ao cluster acessível', async () => {
  const { testarBanco } = loadUnidadeTestarBancoHarness({
    findUnidadeById: async () => ({ _id: 'u-alvo', apiBancaria: { apiBaseUrl: 'https://bank.example', tipoAutenticacaoAPI: 'oauth2' } }),
    findUnidadeByIdLean: async () => ({ _id: 'u-escopo', is_principal: true }),
    findUnidadesByMatrizOuPrincipal: async () => ([{ _id: 'u-escopo' }, { _id: 'u-filial' }]),
  });
  const res = createJsonRes();

  await testarBanco({ params: { id: 'u-alvo' }, body: {}, unitScope: { unidadeId: 'u-escopo' }, user: { role: 'admin' } }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { ok: false, message: 'Acesso à unidade não autorizado.' });
});

test('testarBanco permite alvo do cluster contextual e retorna sucesso no caminho feliz observado', async () => {
  let tokenConfig = null;
  const { testarBanco } = loadUnidadeTestarBancoHarness({
    findUnidadeById: async () => ({
      _id: 'u-filial',
      apiBancaria: {
        apiBaseUrl: 'https://bank.example',
        tipoAutenticacaoAPI: 'oauth2',
        clientId: 'cliente',
      },
    }),
    findUnidadeByIdLean: async () => ({ _id: 'u-matriz', is_principal: true }),
    findUnidadesByMatrizOuPrincipal: async () => ([{ _id: 'u-matriz' }, { _id: 'u-filial' }]),
    BankPort: {
      getOAuthTokenFromConfig: async (cfg) => {
        tokenConfig = cfg;
        return 'abcdefghij123456';
      },
      callBankApi: async () => {
        throw new Error('não deveria chamar callBankApi no ramo oauth2');
      },
    },
  });
  const res = createJsonRes();

  await testarBanco({ params: { id: 'u-filial' }, body: {}, unitScope: { unidadeId: 'u-matriz' }, user: { role: 'admin' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(tokenConfig?.apiBaseUrl, 'https://bank.example');
  assert.deepEqual(res.body, {
    ok: true,
    message: 'Conexão com o banco testada com sucesso.',
    detalhe: 'Token OAuth2 obtido com sucesso.',
    resultado: { tokenPreview: 'abcdef...' },
  });
});

test('testarBanco usa fallback do scopedUnitId quando a busca por cluster retorna vazio e ainda autoriza o alvo da própria unidade', async () => {
  const { testarBanco } = loadUnidadeTestarBancoHarness({
    findUnidadeById: async () => ({ _id: 'u-escopo', apiBancaria: { apiBaseUrl: 'https://bank.example' } }),
    findUnidadeByIdLean: async () => ({ _id: 'u-escopo', is_principal: false, unidade_principal_id: 'u-principal' }),
    findUnidadesByMatrizOuPrincipal: async () => [],
    findUnidadesById: async () => ([{ _id: 'u-escopo' }]),
    BankPort: {
      getOAuthTokenFromConfig: async () => {
        throw new Error('não deveria obter token no ramo sem oauth2');
      },
      callBankApi: async (unidadeId, payload) => {
        assert.equal(unidadeId, 'u-escopo');
        assert.deepEqual(payload, { method: 'POST', path: '/ping', data: { hello: 'world' } });
        return { pong: true };
      },
    },
  });
  const res = createJsonRes();

  await testarBanco({
    params: { id: 'u-escopo' },
    body: { method: 'POST', path: '/ping', data: { hello: 'world' } },
    unitScope: { unidadeId: 'u-escopo' },
    user: { role: 'diretor' },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    ok: true,
    message: 'Conexão com o banco testada com sucesso.',
    detalhe: 'POST /ping executado com sucesso.',
    resultado: { pong: true },
  });
});

test('testarBanco devolve 400 com mensagem genérica quando ocorre falha interna induzida', async () => {
  const { testarBanco } = loadUnidadeTestarBancoHarness({
    findUnidadeById: async () => ({ _id: 'u-filial', apiBancaria: { apiBaseUrl: 'https://bank.example', tipoAutenticacaoAPI: 'oauth2' } }),
    findUnidadeByIdLean: async () => ({ _id: 'u-matriz', is_principal: true }),
    findUnidadesByMatrizOuPrincipal: async () => ([{ _id: 'u-matriz' }, { _id: 'u-filial' }]),
    BankPort: {
      getOAuthTokenFromConfig: async () => {
        throw new Error('forced testar-banco failure');
      },
      callBankApi: async () => ({ ok: true }),
    },
  });
  const res = createJsonRes();

  await testarBanco({ params: { id: 'u-filial' }, body: {}, unitScope: { unidadeId: 'u-matriz' }, user: { role: 'admin' } }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { ok: false, message: 'Falha ao testar conexão com o banco.' });
});