import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import request from 'supertest';
import { buildGestorApp } from '../src/modules/gestor/app/gestor-app.js';

const app = buildGestorApp();

const ROOT = process.cwd();
const CONTROLLER_PATH = path.join(ROOT, 'src/modules/gestor/app/controllers/unidadeApiController.js');
const SAMPLE_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+JxQAAAAASUVORK5CYII=';

function createApiRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    sent: undefined,
    redirectedTo: undefined,
    filePath: undefined,
    ended: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    set(name, value) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    redirect(location) {
      this.statusCode = 302;
      this.redirectedTo = location;
      return this;
    },
    send(payload) {
      this.sent = payload;
      return this;
    },
    sendFile(filePath, callback) {
      this.filePath = filePath;
      if (typeof callback === 'function') callback(undefined);
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

function loadUnidadeLogoHarness(overrides = {}) {
  const source = fs.readFileSync(CONTROLLER_PATH, 'utf8');
  const startMarker = 'function normalizeUnitId(value) {';
  const start = source.indexOf(startMarker);
  if (start === -1) {
    throw new Error('Não foi possível localizar o início do trecho de unidadeApiController.js');
  }

  const snippet = source.slice(start).replace(/^export\s+/gm, '');

  const deps = {
    findUnidadeByIdLean: async () => null,
    findUnidadeUserBaseLean: async () => null,
    findUnidadesByCondLeanFull: async () => [],
    findUnidadeById: async () => null,
    saveUnidadeDoc: async () => {},
    resolveUnidadeLogoResource: async ({ unidade }) => {
      const logo = String(unidade?.logo || '').trim();
      if (/^https?:\/\//i.test(logo)) {
        return {
          kind: 'redirect',
          url: logo,
          cacheControl: 'public, max-age=60',
        };
      }
      return { kind: 'empty' };
    },
    uploadLogoUnidadeInlineWrite: async ({ unidade, buffer, processarEEnviarParaBlob, saveUnidade }) => {
      const uploaded = await processarEEnviarParaBlob(buffer, { keyPrefix: `unidades/${unidade._id}` });
      unidade.logo = uploaded.url;
      await saveUnidade(unidade);
      return { logo: unidade.logo };
    },
    ok: (res, data = {}, extra = {}) => res.status(200).json({ success: true, ...extra, data }),
    badRequest: (res, message = 'Bad request', extra = {}) => res.status(400).json({ success: false, code: 'BAD_REQUEST', message, ...extra }),
    notFound: (res, message = 'Not found', extra = {}) => res.status(404).json({ success: false, code: 'NOT_FOUND', message, ...extra }),
    serverError: (res, error, extra = {}) => res.status(500).json({ success: false, code: 'SERVER_ERROR', message: error?.message || 'Erro interno', ...extra }),
    multer: Object.assign(
      () => ({ single: () => (req, res, callback) => callback() }),
      { memoryStorage: () => ({}) },
    ),
    path,
    fs: {
      stat: async () => null,
    },
    sharp: () => {
      const chain = {
        rotate() {
          return chain;
        },
        resize() {
          return chain;
        },
        toFormat() {
          return chain;
        },
        async toBuffer() {
          return Buffer.from('processed-image');
        },
      };
      return chain;
    },
    uuid: () => 'uuid-logo-test',
    put: async () => ({ url: 'https://blob.vercel-storage.com/unidades/logo.webp' }),
    del: async () => {},
    Buffer,
    process: {
      env: {},
      cwd: () => ROOT,
    },
    console,
    ...overrides,
  };

  const factory = new Function(
    'findUnidadeByIdLean',
    'findUnidadeUserBaseLean',
    'findUnidadesByCondLeanFull',
    'findUnidadeById',
    'saveUnidadeDoc',
    'resolveUnidadeLogoResource',
    'uploadLogoUnidadeInlineWrite',
    'ok',
    'badRequest',
    'notFound',
    'serverError',
    'multer',
    'path',
    'fs',
    'sharp',
    'uuid',
    'put',
    'del',
    'Buffer',
    'process',
    'console',
    `${snippet}\nreturn { getUnidadeLogo, uploadLogoUnidade, uploadLogoUnidadeInline };`,
  );

  return {
    ...factory(
      deps.findUnidadeByIdLean,
      deps.findUnidadeUserBaseLean,
      deps.findUnidadesByCondLeanFull,
      deps.findUnidadeById,
      deps.saveUnidadeDoc,
      deps.resolveUnidadeLogoResource,
      deps.uploadLogoUnidadeInlineWrite,
      deps.ok,
      deps.badRequest,
      deps.notFound,
      deps.serverError,
      deps.multer,
      deps.path,
      deps.fs,
      deps.sharp,
      deps.uuid,
      deps.put,
      deps.del,
      deps.Buffer,
      deps.process,
      deps.console,
    ),
    deps,
  };
}

test('GET /gestor/api/unidades/:id/logo sem sessão responde 401 JSON no app real', async () => {
  const response = await request(app)
    .get('/gestor/api/unidades/64b000000000000000000001/logo');

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, {
    success: false,
    error: 'Não autenticado',
    code: 'UNAUTHORIZED',
  });
});

test('POST /gestor/api/unidades/:id/logo sem sessão responde 401 JSON no app real', async () => {
  const response = await request(app)
    .post('/gestor/api/unidades/64b000000000000000000001/logo')
    .send({ dataUrl: SAMPLE_DATA_URL });

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, {
    success: false,
    error: 'Não autenticado',
    code: 'UNAUTHORIZED',
  });
});

test('POST /gestor/api/unidades/:id/logo-inline sem sessão responde 401 JSON no app real', async () => {
  const response = await request(app)
    .post('/gestor/api/unidades/64b000000000000000000001/logo-inline')
    .send({ dataUrl: SAMPLE_DATA_URL });

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, {
    success: false,
    error: 'Não autenticado',
    code: 'UNAUTHORIZED',
  });
});

test('getUnidadeLogo responde 400 fora do escopo contextual', async () => {
  const { getUnidadeLogo } = loadUnidadeLogoHarness({
    findUnidadeByIdLean: async (id) => {
      if (id === 'u-escopo') return { _id: 'u-escopo' };
      throw new Error(`lookup inesperado: ${id}`);
    },
    findUnidadeUserBaseLean: async () => ({ _id: 'u-escopo', is_principal: true }),
    findUnidadesByCondLeanFull: async () => ([{ _id: 'u-escopo' }, { _id: 'u-filial' }]),
  });
  const res = createApiRes();

  await getUnidadeLogo({ params: { id: 'u-alvo' }, unitScope: { unidadeId: 'u-escopo' }, user: { role: 'admin' } }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    code: 'BAD_REQUEST',
    message: 'Acesso à unidade não autorizado.',
  });
});

test('getUnidadeLogo responde 404 quando a unidade alvo não existe', async () => {
  const { getUnidadeLogo } = loadUnidadeLogoHarness({
    findUnidadeByIdLean: async (id) => {
      if (id === 'u-escopo') return { _id: 'u-escopo' };
      if (id === 'u-alvo') return null;
      throw new Error(`lookup inesperado: ${id}`);
    },
    findUnidadeUserBaseLean: async () => ({ _id: 'u-escopo', is_principal: true }),
    findUnidadesByCondLeanFull: async () => ([{ _id: 'u-escopo' }, { _id: 'u-alvo' }]),
  });
  const res = createApiRes();

  await getUnidadeLogo({ params: { id: 'u-alvo' }, unitScope: { unidadeId: 'u-escopo' }, user: { role: 'admin' } }, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, {
    success: false,
    code: 'NOT_FOUND',
    message: 'Unidade não encontrada',
  });
});

test('uploadLogoUnidadeInline persiste URL pública no caminho feliz observado', async () => {
  let savedLogo = null;
  let putArgs = null;
  const unidade = { _id: 'u-filial', logo: '' };
  const { uploadLogoUnidadeInline } = loadUnidadeLogoHarness({
    findUnidadeByIdLean: async (id) => {
      if (id === 'u-escopo') return { _id: 'u-escopo' };
      throw new Error(`lookup inesperado: ${id}`);
    },
    findUnidadeUserBaseLean: async () => ({ _id: 'u-escopo', is_principal: true }),
    findUnidadesByCondLeanFull: async () => ([{ _id: 'u-escopo' }, { _id: 'u-filial' }]),
    findUnidadeById: async (id) => {
      assert.equal(id, 'u-filial');
      return unidade;
    },
    saveUnidadeDoc: async (doc) => {
      savedLogo = doc.logo;
    },
    put: async (key, buffer, options) => {
      putArgs = { key, buffer: buffer.toString(), options };
      return { url: 'https://blob.vercel-storage.com/unidades/u-filial/logo-final.webp' };
    },
    process: {
      env: { BLOB_READ_WRITE_TOKEN: 'token-test' },
      cwd: () => ROOT,
    },
  });
  const res = createApiRes();

  await uploadLogoUnidadeInline({
    params: { id: 'u-filial' },
    body: { dataUrl: SAMPLE_DATA_URL },
    unitScope: { unidadeId: 'u-escopo' },
    user: { role: 'admin' },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(savedLogo, 'https://blob.vercel-storage.com/unidades/u-filial/logo-final.webp');
  assert.equal(putArgs.key, 'unidades/u-filial/uuid-logo-test.webp');
  assert.equal(putArgs.buffer, 'processed-image');
  assert.deepEqual(res.body, {
    success: true,
    data: {
      uploaded: true,
      logo: 'https://blob.vercel-storage.com/unidades/u-filial/logo-final.webp',
    },
  });
});

test('uploadLogoUnidade via JSON responde 400 quando o ambiente não suporta Blob', async () => {
  const unidade = { _id: 'u-filial', logo: '' };
  const { uploadLogoUnidade } = loadUnidadeLogoHarness({
    findUnidadeByIdLean: async (id) => {
      if (id === 'u-escopo') return { _id: 'u-escopo' };
      throw new Error(`lookup inesperado: ${id}`);
    },
    findUnidadeUserBaseLean: async () => ({ _id: 'u-escopo', is_principal: true }),
    findUnidadesByCondLeanFull: async () => ([{ _id: 'u-escopo' }, { _id: 'u-filial' }]),
    findUnidadeById: async () => unidade,
    process: {
      env: {},
      cwd: () => ROOT,
    },
  });
  const res = createApiRes();

  await uploadLogoUnidade[1]({
    params: { id: 'u-filial' },
    body: { dataUrl: SAMPLE_DATA_URL },
    headers: { 'content-type': 'application/json' },
    unitScope: { unidadeId: 'u-escopo' },
    user: { role: 'admin' },
  }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    code: 'BAD_REQUEST',
    message: 'Blob não configurado (conecte a Store no Vercel OU defina BLOB_READ_WRITE_TOKEN/WDGESTOR_DB_DADOS_READ_WRITE_TOKEN)',
  });
});

test('getUnidadeLogo redireciona para a URL pública do logo já persistido no contrato atual', async () => {
  const { getUnidadeLogo } = loadUnidadeLogoHarness({
    findUnidadeByIdLean: async (id) => {
      if (id === 'u-escopo') return { _id: 'u-escopo' };
      if (id === 'u-filial') return { _id: 'u-filial', logo: 'https://blob.vercel-storage.com/unidades/u-filial/logo-final.webp' };
      throw new Error(`lookup inesperado: ${id}`);
    },
    findUnidadeUserBaseLean: async () => ({ _id: 'u-escopo', is_principal: true }),
    findUnidadesByCondLeanFull: async () => ([{ _id: 'u-escopo' }, { _id: 'u-filial' }]),
  });
  const res = createApiRes();

  await getUnidadeLogo({ params: { id: 'u-filial' }, unitScope: { unidadeId: 'u-escopo' }, user: { role: 'admin' } }, res);

  assert.equal(res.statusCode, 302);
  assert.equal(res.headers['cache-control'], 'public, max-age=60');
  assert.equal(res.redirectedTo, 'https://blob.vercel-storage.com/unidades/u-filial/logo-final.webp');
});

test('uploadLogoUnidadeInline devolve 500 com a mensagem do erro quando ocorre falha interna induzida', async () => {
  const unidade = { _id: 'u-filial', logo: '' };
  const { uploadLogoUnidadeInline } = loadUnidadeLogoHarness({
    findUnidadeByIdLean: async (id) => {
      if (id === 'u-escopo') return { _id: 'u-escopo' };
      throw new Error(`lookup inesperado: ${id}`);
    },
    findUnidadeUserBaseLean: async () => ({ _id: 'u-escopo', is_principal: true }),
    findUnidadesByCondLeanFull: async () => ([{ _id: 'u-escopo' }, { _id: 'u-filial' }]),
    findUnidadeById: async () => unidade,
    put: async () => {
      throw new Error('forced-logo-inline-failure');
    },
    process: {
      env: { BLOB_READ_WRITE_TOKEN: 'token-test' },
      cwd: () => ROOT,
    },
  });
  const res = createApiRes();

  await uploadLogoUnidadeInline({
    params: { id: 'u-filial' },
    body: { dataUrl: SAMPLE_DATA_URL },
    unitScope: { unidadeId: 'u-escopo' },
    user: { role: 'admin' },
  }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, {
    success: false,
    code: 'SERVER_ERROR',
    message: 'forced-logo-inline-failure',
  });
});