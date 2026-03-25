import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import request from 'supertest';
import app from '../src/modules/gestor/app/gestor-app.js';

const ROOT = process.cwd();
const CONTROLLER_PATH = path.join(ROOT, 'src/modules/gestor/app/controllers/unidadeApiController.js');

function createApiRes() {
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

function loadUnidadePublicHarness(overrides = {}) {
  const source = fs.readFileSync(CONTROLLER_PATH, 'utf8');
  const snippet = extractBetween(
    source,
    'export async function getUnidadePublic(req, res) {',
    'export async function deleteUnidade(req, res) {',
  ).replace('export async function getUnidadePublic(req, res) {', 'async function getUnidadePublic(req, res) {');

  const deps = {
    findUnidadeByIdLean: async () => null,
    ok: (res, data = {}, extra = {}) => res.status(200).json({ success: true, ...extra, data }),
    badRequest: (res, message = 'Bad request', extra = {}) => res.status(400).json({ success: false, code: 'BAD_REQUEST', message, ...extra }),
    notFound: (res, message = 'Not found', extra = {}) => res.status(404).json({ success: false, code: 'NOT_FOUND', message, ...extra }),
    serverError: (res, error, extra = {}) => res.status(500).json({ success: false, code: 'SERVER_ERROR', message: error?.message || 'Erro interno', ...extra }),
    console,
    ...overrides,
  };

  const factory = new Function(
    'findUnidadeByIdLean',
    'ok',
    'badRequest',
    'notFound',
    'serverError',
    'console',
    `${snippet}\nreturn { getUnidadePublic };`,
  );

  return {
    ...factory(
      deps.findUnidadeByIdLean,
      deps.ok,
      deps.badRequest,
      deps.notFound,
      deps.serverError,
      deps.console,
    ),
    deps,
  };
}

test('GET /gestor/api/public/unidades/:id com id inválido no app real responde 401 JSON sem sessão', async () => {
  const response = await request(app)
    .get('/gestor/api/public/unidades/id-invalido');

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, {
    success: false,
    error: 'Não autenticado',
    code: 'UNAUTHORIZED',
  });
});

test('getUnidadePublic responde 400 quando o id está ausente no owner atual', async () => {
  const { getUnidadePublic } = loadUnidadePublicHarness();
  const res = createApiRes();

  await getUnidadePublic({ params: { id: '' } }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    code: 'BAD_REQUEST',
    message: 'ID da unidade é obrigatório.',
  });
});

test('getUnidadePublic responde 404 quando a unidade não existe', async () => {
  const { getUnidadePublic } = loadUnidadePublicHarness({
    findUnidadeByIdLean: async (id) => {
      assert.equal(id, 'u-ausente');
      return null;
    },
  });
  const res = createApiRes();

  await getUnidadePublic({ params: { id: 'u-ausente' } }, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, {
    success: false,
    code: 'NOT_FOUND',
    message: 'Unidade não encontrada.',
  });
});

test('getUnidadePublic expõe somente o payload público esperado no caminho feliz com logo relativo', async () => {
  const unidade = {
    _id: 'u-publica',
    nome: 'Clinica Alpha',
    razaoSocial: 'Clinica Alpha LTDA',
    endereco: 'Rua 1',
    telefoneFixo: '1133334444',
    telefoneCelular: '1199998888',
    emailPrincipal: 'contato@alpha.test',
    banco: '001',
    agencia: '1234',
    contaCorrente: '99999-0',
    pixChave: 'pix@alpha.test',
    tipoPix: 'email',
    is_principal: 'sim',
    subunidade: 0,
    logo: 'uploads/unidades/logo.png',
    apiBancaria: { segredo: 'não deve vazar' },
    cnpj: '00.000.000/0001-00',
  };
  const { getUnidadePublic } = loadUnidadePublicHarness({
    findUnidadeByIdLean: async () => unidade,
  });
  const res = createApiRes();

  await getUnidadePublic({ params: { id: 'u-publica' } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: {
      _id: 'u-publica',
      nome: 'Clinica Alpha',
      razaoSocial: 'Clinica Alpha LTDA',
      endereco: 'Rua 1',
      telefone: '1199998888',
      emailPrincipal: 'contato@alpha.test',
      banco: '001',
      agencia: '1234',
      contaCorrente: '99999-0',
      pixChave: 'pix@alpha.test',
      tipoPix: 'email',
      is_principal: true,
      subunidade: false,
      logoUrl: '/api/unidades/u-publica/logo',
    },
  });
  assert.equal('apiBancaria' in res.body.data, false);
  assert.equal('cnpj' in res.body.data, false);
  assert.equal('logoDataUrl' in res.body.data, false);
});

test('getUnidadePublic preserva logoUrl público quando unidade.logo já é URL HTTP', async () => {
  const { getUnidadePublic } = loadUnidadePublicHarness({
    findUnidadeByIdLean: async () => ({
      _id: 'u-http',
      nome: 'Clinica HTTP',
      is_active: true,
      logo: 'https://cdn.example.test/logo.webp',
    }),
  });
  const res = createApiRes();

  await getUnidadePublic({ params: { id: 'u-http' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.logoUrl, 'https://cdn.example.test/logo.webp');
  assert.equal('logoDataUrl' in res.body.data, false);
});

test('getUnidadePublic devolve logoUrl nulo quando não há logo persistida', async () => {
  const { getUnidadePublic } = loadUnidadePublicHarness({
    findUnidadeByIdLean: async () => ({
      _id: 'u-sem-logo',
      nome: 'Clinica Sem Logo',
      is_active: true,
    }),
  });
  const res = createApiRes();

  await getUnidadePublic({ params: { id: 'u-sem-logo' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.logoUrl, null);
  assert.equal('logoDataUrl' in res.body.data, false);
});

test('getUnidadePublic transforma logo em data URL no campo logoDataUrl quando esse é o formato persistido', async () => {
  const dataUrl = 'data:image/webp;base64,AAAA';
  const { getUnidadePublic } = loadUnidadePublicHarness({
    findUnidadeByIdLean: async () => ({
      _id: 'u-data',
      nome: 'Clinica Data URL',
      is_active: true,
      logo: dataUrl,
    }),
  });
  const res = createApiRes();

  await getUnidadePublic({ params: { id: 'u-data' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.logoDataUrl, dataUrl);
  assert.equal('logoUrl' in res.body.data, false);
});

test('getUnidadePublic devolve 500 com a mensagem original quando ocorre erro interno induzido', async () => {
  const { getUnidadePublic } = loadUnidadePublicHarness({
    findUnidadeByIdLean: async () => {
      throw new Error('forced-get-public-failure');
    },
  });
  const res = createApiRes();

  await getUnidadePublic({ params: { id: 'u-erro' } }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, {
    success: false,
    code: 'SERVER_ERROR',
    message: 'forced-get-public-failure',
  });
});