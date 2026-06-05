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
const dbBridgeMockModuleUrl = 'mock:gestor-unidades-update-api-db-bridge';

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
        'const getMocks = () => globalThis.__GESTOR_UNIDADES_UPDATE_DB_MOCKS__ || {};',
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
  globalThis.__GESTOR_UNIDADES_UPDATE_DB_MOCKS__ = { ...overrides };
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
      this.body = JSON.parse(JSON.stringify(payload));
      return this;
    },
    send(payload) {
      this.body = JSON.parse(JSON.stringify(payload));
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

async function importUpdateUnidade(tag) {
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
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nomeFantasia: 'Teste' }),
      redirect: 'manual',
    });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    return { status: response.status, body, text };
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

test('PUT /gestor/api/unidades/:id sem sessao no app real responde 401 JSON', async () => {
  const response = await requestGestorApp('/gestor/api/unidades/qualquer-id');

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, {
    success: false,
    error: 'Não autenticado',
    code: 'UNAUTHORIZED',
  });
});

test('updateUnidade com id vazio cai no lookup real e responde 404', async () => {
  let receivedId = null;
  setDbMocks({
    findUnidadeById: async (id) => {
      receivedId = id;
      return null;
    },
  });

  const { updateUnidade } = await importUpdateUnidade('empty-id');
  const req = createReq({
    user: { role: 'admin', isMaster: false },
    params: { id: '' },
    body: {},
  });
  const res = createResCapture();

  await updateUnidade(req, res);

  assert.equal(receivedId, '');
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, {
    success: false,
    code: 'NOT_FOUND',
    message: 'Unidade não encontrada.',
  });
});

test('updateUnidade responde 404 quando a unidade nao existe', async () => {
  setDbMocks({
    findUnidadeById: async () => null,
  });

  const { updateUnidade } = await importUpdateUnidade('missing-unit');
  const req = createReq({
    user: { role: 'admin', isMaster: false },
    params: { id: 'u-inexistente' },
    body: {},
  });
  const res = createResCapture();

  await updateUnidade(req, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, {
    success: false,
    code: 'NOT_FOUND',
    message: 'Unidade não encontrada.',
  });
});

test('updateUnidade responde 400 quando a unidade esta fora do escopo contextual', async () => {
  setDbMocks({
    findUnidadeById: async (id) => ({ _id: id, unidade_principal_id: 'u-principal' }),
    findUnidadeByIdLean: async (id) => ({ _id: id, nome: 'Scope atual' }),
    findUnidadeUserBaseLean: async () => ({ _id: 'u-principal', is_principal: true }),
    findUnidadesByCondLeanFull: async () => ([
      { _id: 'u-principal' },
      { _id: 'u-filial-permitida' },
    ]),
  });

  const { updateUnidade } = await importUpdateUnidade('out-of-scope');
  const req = createReq({
    user: { role: 'diretor', isMaster: false },
    unitScope: { unidadeId: 'u-principal' },
    params: { id: 'u-bloqueada' },
    body: {},
  });
  const res = createResCapture();

  await updateUnidade(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    code: 'BAD_REQUEST',
    message: 'Acesso à unidade não autorizado.',
  });
});

test('updateUnidade retorna sucesso minimo com update escalar observavel e shape exato do payload', async () => {
  let capturedUpdate = null;
  setDbMocks({
    findUnidadeById: async (id) => {
      if (id === 'u-principal') {
        return { _id: 'u-principal', is_principal: true };
      }
      return {
        _id: id,
        diretor_usuario_id: 'dir-existente',
        unidade_principal_id: 'u-principal',
        logo: 'https://cdn.example.test/logo-antiga.webp',
        apiBancaria: {
          apiBasicPassword: 'segredo-existente',
        },
      };
    },
    updateUnidadeByIdWithValidators: async (id, updated) => {
      capturedUpdate = { id, updated };
      return {
        _id: id,
        logo: updated.logo,
        apiBancaria: updated.apiBancaria,
        toObject() {
          return {
            _id: id,
            ...updated,
          };
        },
      };
    },
    findUnidadeByCpfExcludingId: async () => null,
    findUnidadeByCnpjExcludingId: async () => null,
  });

  const { updateUnidade } = await importUpdateUnidade('success-shape');
  const req = createReq({
    user: { role: 'admin', isMaster: false },
    params: { id: 'u-edit' },
    body: {
      nomeFantasia: 'Clinica Renovada',
      razaoSocial: 'Clinica Renovada LTDA',
      cnpj: '12.345.678/0001-95',
      cpf: '',
      pessoaTipo: 'pj',
      subunidade: 'true',
      unidadePrincipal: 'u-principal',
      dataAbertura: '2024-02-03',
      telefoneFixo: '1133334444',
      telefoneCelular: '1199998888',
      emailPrincipal: 'contato@renovada.test',
      emailFiscal: 'fiscal@renovada.test',
      site: 'https://renovada.test',
      banco: '001',
      agencia: '1234',
      contaCorrente: '99999-0',
      pixChave: 'pix@renovada.test',
      tipoPix: 'email',
      modulosAcessiveis: 'financeiro',
      inscricaoEstadual: '12345',
      inscricaoMunicipal: '67890',
      cnaePrincipal: '8630501',
      cnaeSecundarios: ['8650001'],
      regimeTributario: 'Simples',
      naturezaJuridica: '2062',
      endereco: { cidade: 'Sao Paulo', uf: 'SP' },
      apiBancaria: {},
    },
  });
  const res = createResCapture();

  await updateUnidade(req, res);

  assert.deepEqual(capturedUpdate, {
    id: 'u-edit',
    updated: {
      nome: 'Clinica Renovada',
      razaoSocial: 'Clinica Renovada LTDA',
      cnpj: '12345678000195',
      cpf: null,
      pessoaTipo: 'pj',
      dataAbertura: new Date('2024-02-03T00:00:00.000Z'),
      inscricaoEstadual: '12345',
      inscricaoMunicipal: '67890',
      cnaePrincipal: '8630501',
      cnaeSecundarios: ['8650001'],
      regimeTributario: 'Simples',
      naturezaJuridica: '2062',
      tipoLogradouro: null,
      logradouro: null,
      numero: null,
      complemento: null,
      bairro: null,
      cep: null,
      cidade: null,
      estado: null,
      codigoIbgeMunicipio: null,
      telefoneFixo: '1133334444',
      telefoneCelular: '1199998888',
      emailPrincipal: 'contato@renovada.test',
      emailFiscal: 'fiscal@renovada.test',
      site: 'https://renovada.test',
      banco: '001',
      agencia: '1234',
      contaCorrente: '99999-0',
      pixChave: 'pix@renovada.test',
      tipoPix: 'email',
      modulosAcessiveis: ['financeiro'],
      diretor_usuario_id: 'dir-existente',
      is_principal: false,
      subunidade: true,
      unidade_principal_id: 'u-principal',
      endereco: { cidade: 'Sao Paulo', uf: 'SP' },
      apiBancaria: {
        apiBasicPassword: 'segredo-existente',
      },
      logo: 'https://cdn.example.test/logo-antiga.webp',
    },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: {
      updated: true,
      unidade: {
        _id: 'u-edit',
        nome: 'Clinica Renovada',
        razaoSocial: 'Clinica Renovada LTDA',
        cnpj: '12345678000195',
        cpf: null,
        pessoaTipo: 'pj',
        dataAbertura: '2024-02-03T00:00:00.000Z',
        inscricaoEstadual: '12345',
        inscricaoMunicipal: '67890',
        cnaePrincipal: '8630501',
        cnaeSecundarios: ['8650001'],
        regimeTributario: 'Simples',
        naturezaJuridica: '2062',
        tipoLogradouro: null,
        logradouro: null,
        numero: null,
        complemento: null,
        bairro: null,
        cep: null,
        cidade: null,
        estado: null,
        codigoIbgeMunicipio: null,
        telefoneFixo: '1133334444',
        telefoneCelular: '1199998888',
        emailPrincipal: 'contato@renovada.test',
        emailFiscal: 'fiscal@renovada.test',
        site: 'https://renovada.test',
        banco: '001',
        agencia: '1234',
        contaCorrente: '99999-0',
        pixChave: 'pix@renovada.test',
        tipoPix: 'email',
        modulosAcessiveis: ['financeiro'],
        diretor_usuario_id: 'dir-existente',
        is_principal: false,
        subunidade: true,
        unidade_principal_id: 'u-principal',
        endereco: { cidade: 'Sao Paulo', uf: 'SP' },
        apiBancaria: {
          hasApiHeaderValue: false,
          hasApiQueryParamValue: false,
          hasApiBasicPassword: true,
          hasApiOauthClientSecret: false,
          hasApiMtlsPassword: false,
          hasApiMtlsCertFile: false,
        },
        logo: 'https://cdn.example.test/logo-antiga.webp',
      },
    },
  });
});

test('updateUnidade normaliza apiBancaria de entrada e sanitiza apiMtlsCertFileData na resposta', async () => {
  let capturedUpdate = null;
  setDbMocks({
    findUnidadeById: async (id) => ({
      _id: id,
      diretor_usuario_id: null,
      unidade_principal_id: null,
      logo: null,
      apiBancaria: {
        apiBasicPassword: 'segredo-antigo',
      },
    }),
    updateUnidadeByIdWithValidators: async (id, updated) => {
      capturedUpdate = updated;
      return {
        _id: id,
        logo: updated.logo,
        apiBancaria: {
          ...updated.apiBancaria,
          apiMtlsCertFileData: 'segredo-binario',
        },
        toObject() {
          return {
            _id: id,
            ...updated,
            apiBancaria: {
              ...updated.apiBancaria,
              apiMtlsCertFileData: 'segredo-binario',
            },
          };
        },
      };
    },
    findUnidadeByCpfExcludingId: async () => null,
    findUnidadeByCnpjExcludingId: async () => null,
  });

  const { updateUnidade } = await importUpdateUnidade('api-bancaria');
  const req = createReq({
    user: { role: 'admin', isMaster: false },
    params: { id: 'u-api' },
    body: {
      nomeFantasia: 'Clinica API',
      razaoSocial: 'Clinica API LTDA',
      cnpj: '12.345.678/0001-95',
      pessoaTipo: 'pj',
      subunidade: 'false',
      unidadePrincipal: '',
      dataAbertura: '2024-01-01',
      emailPrincipal: 'contato@api.test',
      pixChave: '',
      tipoPix: '',
      modulosAcessiveis: [],
      apiBancaria: {
        apiBaseUrl: ' https://bank.example.test ',
        tipoAutenticacaoAPI: 'desconhecido',
        apiMtlsCertFileName: ' certificado.p12 ',
        apiMtlsPassword: ' segredo ',
      },
    },
  });
  const res = createResCapture();

  await updateUnidade(req, res);

  assert.deepEqual(capturedUpdate.apiBancaria, {
    apiBaseUrl: 'https://bank.example.test',
    apiMtlsCertFileName: 'certificado.p12',
    apiMtlsPassword: 'segredo',
    apiBasicPassword: 'segredo-antigo',
  });
  assert.deepEqual(res.body.data.unidade.apiBancaria, {
    apiBaseUrl: 'https://bank.example.test',
    apiMtlsCertFileName: 'certificado.p12',
    hasApiHeaderValue: false,
    hasApiQueryParamValue: false,
    hasApiBasicPassword: true,
    hasApiOauthClientSecret: false,
    hasApiMtlsPassword: true,
    hasApiMtlsCertFile: true,
  });
  assert.equal('apiMtlsCertFileData' in res.body.data.unidade.apiBancaria, false);
});

test('updateUnidade retorna 500 com erro interno induzido e mensagem original', async () => {
  setDbMocks({
    findUnidadeById: async () => {
      throw new Error('forced-update-failure');
    },
  });

  const { updateUnidade } = await importUpdateUnidade('forced-error');
  const req = createReq({
    user: { role: 'admin', isMaster: true },
    params: { id: 'u-error' },
    body: {},
  });
  const res = createResCapture();

  await updateUnidade(req, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, {
    success: false,
    code: 'SERVER_ERROR',
    message: 'forced-update-failure',
  });
});