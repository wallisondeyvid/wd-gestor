import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { registerHooks } from 'node:module';
import express from 'express';

const projectRoot = process.cwd();
const controllerModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/controllers/unidadeApiController.js')).href;
const gestorAppModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/gestor-app.js')).href;
const actualDbBridgeModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/services/apiDbBridgeService.js')).href;
const dbBridgeMockModuleUrl = 'mock:gestor-unidades-get-by-id-api-db-bridge';

const DB_BRIDGE_EXPORTS = [
  'findAllUnidadesLean',
  'findUnidadeUserBaseLean',
  'findUnidadesByCondLeanFull',
  'findUltimaUnidadePorCodigo',
  'findUnidadeByCodigo',
  'findUnidadeByCpf',
  'findUnidadeByCnpj',
  'findUnidadeById',
  'findSubunidadesByUnidadePrincipal',
  'createUnidadeDoc',
  'saveUnidadeDoc',
  'updateUserUnidadeById',
  'findUnidadeByCpfExcludingId',
  'findUnidadeByCnpjExcludingId',
  'updateUnidadeByIdWithValidators',
  'findUnidadesPrincipaisByIds',
  'updateManyUnidadesAccessByIds',
  'findUnidadesPermitidasByMatrizRef',
  'findDiretorAtivoByUnidadeSelectId',
  'findUnidadeByIdWithModulosAcessiveis',
  'findUnidadeByIdLean',
  'deleteUnidadeById',
];

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '#modules/gestor/app/services/apiDbBridgeService.js') {
      return { url: dbBridgeMockModuleUrl, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === dbBridgeMockModuleUrl) {
      const lines = [
        `export * from '${actualDbBridgeModuleUrl}';`,
        `import * as actual from '${actualDbBridgeModuleUrl}';`,
        'const getMocks = () => globalThis.__GESTOR_UNIDADES_GET_BY_ID_DB_MOCKS__ || {};',
        'const resolveImpl = (name) => {',
        '  const fn = getMocks()[name];',
        "  if (typeof fn === 'function') return fn;",
        '  return actual[name];',
        '};',
      ];

      for (const exportName of DB_BRIDGE_EXPORTS) {
        lines.push(`export async function ${exportName}(...args) { return await resolveImpl('${exportName}')(...args); }`);
      }

      return {
        format: 'module',
        shortCircuit: true,
        source: lines.join('\n'),
      };
    }
    return nextLoad(url, context);
  },
});

function setDbMocks(overrides = {}) {
  globalThis.__GESTOR_UNIDADES_GET_BY_ID_DB_MOCKS__ = { ...overrides };
}

function createResCapture() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    set(field, value) {
      this.headers[field.toLowerCase()] = value;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
  };
}

function createReq(overrides = {}) {
  return {
    app: { locals: {}, ...(overrides.app || {}) },
    user: overrides.user || null,
    unitScope: overrides.unitScope || null,
    params: overrides.params || {},
    body: overrides.body || {},
    query: overrides.query || {},
    session: overrides.session,
  };
}

async function importGetUnidadeById(tag) {
  return import(`${controllerModuleUrl}?case=${encodeURIComponent(tag)}-${Date.now()}`);
}

async function requestGestorApp(pathname) {
  const { default: buildGestorApp } = await import(`${gestorAppModuleUrl}?case=app-${Date.now()}`);
  const gestorApp = buildGestorApp();
  const rootApp = express();
  rootApp.use('/gestor', gestorApp);

  const server = await new Promise((resolve) => {
    const instance = rootApp.listen(0, '127.0.0.1', () => resolve(instance));
  });

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { redirect: 'manual' });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    return {
      status: response.status,
      headers: response.headers,
      body,
      text,
    };
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

test('GET /gestor/api/unidades/:id sem sessao no app real responde 401 JSON', async () => {
  const response = await requestGestorApp('/gestor/api/unidades/qualquer-id');

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, {
    success: false,
    error: 'Não autenticado',
    code: 'UNAUTHORIZED',
  });
});

test('getUnidadeById com id vazio cai no lookup real e responde 404', async () => {
  let receivedId = null;
  setDbMocks({
    findUnidadeById: async (id) => {
      receivedId = id;
      return null;
    },
  });

  const { getUnidadeById } = await importGetUnidadeById('empty-id');
  const req = createReq({
    user: { role: 'admin' },
    params: { id: '' },
  });
  const res = createResCapture();

  await getUnidadeById(req, res);

  assert.equal(receivedId, '');
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, {
    success: false,
    code: 'NOT_FOUND',
    message: 'Unidade não encontrada',
  });
});

test('getUnidadeById responde 404 quando a unidade nao existe', async () => {
  setDbMocks({
    findUnidadeById: async () => null,
  });

  const { getUnidadeById } = await importGetUnidadeById('missing-unit');
  const req = createReq({
    user: { role: 'admin' },
    params: { id: 'u-inexistente' },
  });
  const res = createResCapture();

  await getUnidadeById(req, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, {
    success: false,
    code: 'NOT_FOUND',
    message: 'Unidade não encontrada',
  });
});

test('getUnidadeById responde 400 quando a unidade esta fora do escopo contextual', async () => {
  setDbMocks({
    findUnidadeById: async (id) => ({ _id: id, nome: 'Alvo fora do escopo' }),
    findUnidadeByIdLean: async (id) => ({ _id: id, nome: 'Scope atual' }),
    findUnidadeUserBaseLean: async () => ({ _id: 'u-principal', is_principal: true }),
    findUnidadesByCondLeanFull: async () => ([
      { _id: 'u-principal' },
      { _id: 'u-filial-permitida' },
    ]),
  });

  const { getUnidadeById } = await importGetUnidadeById('out-of-scope');
  const req = createReq({
    user: { role: 'diretor' },
    unitScope: { unidadeId: 'u-principal' },
    params: { id: 'u-bloqueada' },
  });
  const res = createResCapture();

  await getUnidadeById(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    code: 'BAD_REQUEST',
    message: 'Acesso à unidade não autorizado',
  });
});

test('getUnidadeById retorna sucesso com unidade encontrada e shape exato do payload', async () => {
  setDbMocks({
    findUnidadeById: async (id) => ({
      _id: id,
      codigo: 'UNI-001',
      nome: 'Clinica Centro',
      razaoSocial: 'Clinica Centro LTDA',
      cnpj: '12345678000190',
      cpf: '',
      pessoaTipo: 'J',
      inscricaoEstadual: '12345',
      inscricaoMunicipal: '67890',
      cnaePrincipal: '8630501',
      cnaeSecundarios: ['8650001'],
      regimeTributario: 'Simples',
      naturezaJuridica: '2062',
      is_principal: false,
      subunidade: true,
      unidade_principal_id: 'u-principal',
      dataAbertura: '2024-01-10',
      telefoneFixo: '1133334444',
      telefoneCelular: '1199998888',
      emailPrincipal: 'contato@centro.test',
      emailFiscal: 'fiscal@centro.test',
      site: 'https://centro.test',
      banco: '001',
      agencia: '1234',
      contaCorrente: '99999-0',
      pixChave: 'pix@centro.test',
      tipoPix: 'email',
      modulosAcessiveis: ['ponto', 'escalas'],
      diretor_usuario_id: 'dir-salvo',
      endereco: { cidade: 'São Paulo', uf: 'SP' },
      logo: undefined,
      apiBancaria: null,
    }),
  });

  const { getUnidadeById } = await importGetUnidadeById('success-shape');
  const req = createReq({
    user: { role: 'admin' },
    params: { id: 'u-centro' },
  });
  const res = createResCapture();

  await getUnidadeById(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: {
      _id: 'u-centro',
      codigo: 'UNI-001',
      nome: 'Clinica Centro',
      razaoSocial: 'Clinica Centro LTDA',
      cnpj: '12345678000190',
      cpf: '',
      pessoaTipo: 'J',
      inscricaoEstadual: '12345',
      inscricaoMunicipal: '67890',
      cnaePrincipal: '8630501',
      cnaeSecundarios: ['8650001'],
      regimeTributario: 'Simples',
      naturezaJuridica: '2062',
      is_principal: false,
      subunidade: true,
      unidade_principal_id: 'u-principal',
      dataAbertura: '2024-01-10',
      telefoneFixo: '1133334444',
      telefoneCelular: '1199998888',
      emailPrincipal: 'contato@centro.test',
      emailFiscal: 'fiscal@centro.test',
      site: 'https://centro.test',
      banco: '001',
      agencia: '1234',
      contaCorrente: '99999-0',
      pixChave: 'pix@centro.test',
      tipoPix: 'email',
      modulosAcessiveis: ['ponto', 'escalas'],
      diretor_usuario_id: 'dir-salvo',
      endereco: { cidade: 'São Paulo', uf: 'SP' },
      logo: null,
      apiBancaria: {},
    },
  });
});

test('getUnidadeById sanitiza apiBancaria removendo apiMtlsCertFileData', async () => {
  setDbMocks({
    findUnidadeById: async (id) => ({
      _id: id,
      codigo: 'UNI-API',
      nome: 'Clinica API',
      razaoSocial: 'Clinica API LTDA',
      cnpj: '00999999000111',
      cpf: '',
      pessoaTipo: 'J',
      inscricaoEstadual: '',
      inscricaoMunicipal: '',
      cnaePrincipal: '',
      cnaeSecundarios: [],
      regimeTributario: '',
      naturezaJuridica: '',
      is_principal: false,
      subunidade: false,
      unidade_principal_id: null,
      dataAbertura: null,
      telefoneFixo: '',
      telefoneCelular: '',
      emailPrincipal: '',
      emailFiscal: '',
      site: '',
      banco: '',
      agencia: '',
      contaCorrente: '',
      pixChave: '',
      tipoPix: '',
      modulosAcessiveis: [],
      diretor_usuario_id: null,
      endereco: null,
      logo: null,
      apiBancaria: {
        apiBaseUrl: 'https://bank.example.test',
        apiMtlsCertFileName: 'certificado.p12',
        apiMtlsCertFileData: 'segredo-binario',
      },
    }),
  });

  const { getUnidadeById } = await importGetUnidadeById('sanitize-api-bancaria');
  const req = createReq({
    user: { role: 'admin' },
    params: { id: 'u-api' },
  });
  const res = createResCapture();

  await getUnidadeById(req, res);

  assert.deepEqual(res.body.data.apiBancaria, {
    apiBaseUrl: 'https://bank.example.test',
    apiMtlsCertFileName: 'certificado.p12',
    hasApiHeaderValue: false,
    hasApiQueryParamValue: false,
    hasApiBasicPassword: false,
    hasApiOauthClientSecret: false,
    hasApiMtlsPassword: false,
    hasApiMtlsCertFile: true,
  });
  assert.equal('apiMtlsCertFileData' in res.body.data.apiBancaria, false);
});

test('getUnidadeById faz fallback de diretor para unidade principal sem diretor_usuario_id salvo', async () => {
  let fallbackLookupId = null;
  setDbMocks({
    findUnidadeById: async (id) => ({
      _id: id,
      codigo: 'UNI-MATRIZ',
      nome: 'Matriz',
      razaoSocial: 'Matriz LTDA',
      cnpj: '11111111000111',
      cpf: '',
      pessoaTipo: 'J',
      inscricaoEstadual: '',
      inscricaoMunicipal: '',
      cnaePrincipal: '',
      cnaeSecundarios: [],
      regimeTributario: '',
      naturezaJuridica: '',
      is_principal: true,
      subunidade: false,
      unidade_principal_id: null,
      dataAbertura: null,
      telefoneFixo: '',
      telefoneCelular: '',
      emailPrincipal: '',
      emailFiscal: '',
      site: '',
      banco: '',
      agencia: '',
      contaCorrente: '',
      pixChave: '',
      tipoPix: '',
      modulosAcessiveis: [],
      diretor_usuario_id: null,
      endereco: {},
      logo: null,
      apiBancaria: {},
    }),
    findDiretorAtivoByUnidadeSelectId: async (id) => {
      fallbackLookupId = id;
      return { _id: 'dir-fallback' };
    },
  });

  const { getUnidadeById } = await importGetUnidadeById('fallback-diretor');
  const req = createReq({
    user: { role: 'admin' },
    params: { id: 'u-matriz' },
  });
  const res = createResCapture();

  await getUnidadeById(req, res);

  assert.equal(fallbackLookupId, 'u-matriz');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.diretor_usuario_id, 'dir-fallback');
});

test('getUnidadeById trata erro interno induzido com 500 e mensagem original', async () => {
  setDbMocks({
    findUnidadeById: async () => {
      throw new Error('forced-get-by-id-failure');
    },
  });

  const { getUnidadeById } = await importGetUnidadeById('forced-error');
  const req = createReq({
    user: { role: 'admin' },
    params: { id: 'u-error' },
  });
  const res = createResCapture();

  await getUnidadeById(req, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, {
    success: false,
    code: 'SERVER_ERROR',
    message: 'forced-get-by-id-failure',
  });
});