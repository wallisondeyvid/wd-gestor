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
const dbBridgeMockModuleUrl = 'mock:gestor-unidades-list-api-db-bridge';

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
        'const getMocks = () => globalThis.__GESTOR_UNIDADES_LIST_DB_MOCKS__ || {};',
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
  globalThis.__GESTOR_UNIDADES_LIST_DB_MOCKS__ = { ...overrides };
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

async function importListUnidades(tag) {
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

test('GET /gestor/api/unidades sem sessao no app real responde 401 JSON', async () => {
  const response = await requestGestorApp('/gestor/api/unidades');

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, {
    success: false,
    error: 'Não autenticado',
    code: 'UNAUTHORIZED',
  });
});

test('listUnidades retorna sucesso com lista vazia em modo skipDb', async () => {
  const { listUnidades } = await importListUnidades('skip-db-empty');
  const req = createReq({
    app: { locals: { skipDb: true } },
    user: { role: 'admin' },
  });
  const res = createResCapture();

  await listUnidades(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: {
      unidades: [],
      principalUnits: [],
    },
  });
});

test('listUnidades retorna unidades acessiveis com shape exato de data.unidades e data.principalUnits', async () => {
  setDbMocks({
    findUnidadeByIdLean: async (id) => ({ _id: id, nome: 'Clinica Matriz' }),
    findUnidadeUserBaseLean: async (id) => ({ _id: id, is_principal: true }),
    findUnidadesByCondLeanFull: async () => ([
    {
      _id: 'u-principal',
      nome: 'Clinica Matriz',
      is_principal: true,
      subunidade: false,
      naturezaJuridica: undefined,
      modulosAcessiveis: ['financeiro'],
      apiBancaria: {
        apiBaseUrl: 'https://bank.example.test',
        apiMtlsCertFileData: 'segredo-binario',
        apiOauthScope: 'scope-a',
      },
    },
    {
      _id: 'u-filial',
      nome: 'Clinica Filial',
      is_principal: false,
      subunidade: true,
      modulosAcessiveis: ['ponto', 'escalas'],
      apiBancaria: null,
    },
    ]),
  });

  const { listUnidades } = await importListUnidades('shape-success');
  const req = createReq({
    user: { role: 'diretor' },
    unitScope: { unidadeId: 'u-principal' },
  });
  const res = createResCapture();

  await listUnidades(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: {
      unidades: [
        {
          _id: 'u-principal',
          nome: 'Clinica Matriz',
          is_principal: true,
          subunidade: false,
          naturezaJuridica: '',
          modulosAcessiveis: ['financeiro'],
          apiBancaria: {
            apiBaseUrl: 'https://bank.example.test',
            apiOauthScope: 'scope-a',
          },
        },
        {
          _id: 'u-filial',
          nome: 'Clinica Filial',
          is_principal: false,
          subunidade: true,
          naturezaJuridica: '',
          modulosAcessiveis: ['ponto', 'escalas'],
          apiBancaria: {},
        },
      ],
      principalUnits: [
        {
          _id: 'u-principal',
          nome: 'Clinica Matriz',
          is_principal: true,
          subunidade: false,
          naturezaJuridica: '',
          modulosAcessiveis: ['financeiro'],
          apiBancaria: {
            apiBaseUrl: 'https://bank.example.test',
            apiOauthScope: 'scope-a',
          },
        },
      ],
    },
  });
});

test('listUnidades normaliza modulosAcessiveis para array vazio quando o valor nao e array', async () => {
  setDbMocks({
    findUnidadeByIdLean: async (id) => ({ _id: id, nome: 'Clinica Scope' }),
    findUnidadeUserBaseLean: async (id) => ({ _id: id, is_principal: true }),
    findUnidadesByCondLeanFull: async () => ([
    {
      _id: 'u-1',
      nome: 'Clinica 1',
      is_principal: true,
      subunidade: false,
      modulosAcessiveis: 'financeiro',
      apiBancaria: {},
    },
    ]),
  });

  const { listUnidades } = await importListUnidades('normalize-modulos');
  const req = createReq({
    user: { role: 'diretor' },
    unitScope: { unidadeId: 'u-1' },
  });
  const res = createResCapture();

  await listUnidades(req, res);

  assert.deepEqual(res.body.data.unidades[0].modulosAcessiveis, []);
});

test('listUnidades sanitiza apiBancaria removendo apiMtlsCertFileData da resposta', async () => {
  setDbMocks({
    findUnidadeByIdLean: async (id) => ({ _id: id, nome: 'Clinica Scope' }),
    findUnidadeUserBaseLean: async (id) => ({ _id: id, is_principal: true }),
    findUnidadesByCondLeanFull: async () => ([
    {
      _id: 'u-safe-api',
      nome: 'Clinica API',
      is_principal: true,
      subunidade: false,
      modulosAcessiveis: [],
      apiBancaria: {
        apiBaseUrl: 'https://bank.example.test',
        apiMtlsCertFileName: 'certificado.p12',
        apiMtlsCertFileData: 'segredo',
      },
    },
    ]),
  });

  const { listUnidades } = await importListUnidades('sanitize-api-bancaria');
  const req = createReq({
    user: { role: 'diretor' },
    unitScope: { unidadeId: 'u-safe-api' },
  });
  const res = createResCapture();

  await listUnidades(req, res);

  assert.deepEqual(res.body.data.unidades[0].apiBancaria, {
    apiBaseUrl: 'https://bank.example.test',
    apiMtlsCertFileName: 'certificado.p12',
  });
  assert.equal('apiMtlsCertFileData' in res.body.data.unidades[0].apiBancaria, false);
});

test('listUnidades faz fallback de principalUnits por principalUnitId quando nao ha is_principal', async () => {
  setDbMocks({
    findUnidadeByIdLean: async (id) => ({ _id: id, nome: 'Clinica Scope' }),
    findUnidadeUserBaseLean: async () => ({
      _id: 'u-principal-fallback',
      is_principal: false,
      unidade_principal_id: 'u-principal-fallback',
    }),
    findUnidadesByCondLeanFull: async () => ([
    {
      _id: 'u-principal-fallback',
      nome: 'Matriz sem flag',
      is_principal: false,
      subunidade: true,
      modulosAcessiveis: [],
      apiBancaria: {},
    },
    {
      _id: 'u-outra',
      nome: 'Outra unidade',
      is_principal: false,
      subunidade: true,
      modulosAcessiveis: [],
      apiBancaria: {},
    },
    ]),
  });

  const { listUnidades } = await importListUnidades('principal-id-fallback');
  const req = createReq({
    user: { role: 'diretor' },
    unitScope: { unidadeId: 'u-scope' },
  });
  const res = createResCapture();

  await listUnidades(req, res);

  assert.deepEqual(
    res.body.data.principalUnits.map((unit) => unit._id),
    ['u-principal-fallback'],
  );
});

test('listUnidades faz fallback de principalUnits por scopedUnitId quando principalUnitId nao estiver disponivel', async () => {
  setDbMocks({
    findUnidadeByIdLean: async (id) => ({ _id: id, nome: 'Clinica Scope' }),
    findUnidadeUserBaseLean: async () => null,
    findUnidadesByCondLeanFull: async () => ([
    {
      _id: 'u-scope',
      nome: 'Unidade do escopo',
      is_principal: false,
      subunidade: true,
      modulosAcessiveis: [],
      apiBancaria: {},
    },
    {
      _id: 'u-outra',
      nome: 'Outra',
      is_principal: false,
      subunidade: true,
      modulosAcessiveis: [],
      apiBancaria: {},
    },
    ]),
  });

  const { listUnidades } = await importListUnidades('scoped-id-fallback');
  const req = createReq({
    user: { role: 'diretor' },
    unitScope: { unidadeId: 'u-scope' },
  });
  const res = createResCapture();

  await listUnidades(req, res);

  assert.deepEqual(
    res.body.data.principalUnits.map((unit) => unit._id),
    ['u-scope'],
  );
});

test('listUnidades faz fallback final de principalUnits por subunidade false quando nao ha ids de referencia', async () => {
  setDbMocks({
    findUnidadeByIdLean: async () => null,
    findUnidadeUserBaseLean: async () => null,
    findAllUnidadesLean: async () => ([
    {
      _id: 'u-legacy-principal',
      nome: 'Principal legado',
      is_principal: false,
      subunidade: 'false',
      modulosAcessiveis: [],
      apiBancaria: {},
    },
    {
      _id: 'u-filial',
      nome: 'Filial',
      is_principal: false,
      subunidade: true,
      modulosAcessiveis: [],
      apiBancaria: {},
    },
    ]),
  });

  const { listUnidades } = await importListUnidades('subunidade-fallback');
  const req = createReq({
    user: { role: 'admin' },
  });
  const res = createResCapture();

  await listUnidades(req, res);

  assert.deepEqual(
    res.body.data.principalUnits.map((unit) => unit._id),
    ['u-legacy-principal'],
  );
});

test('listUnidades trata erro interno induzido com sucesso vazio observavel', async () => {
  setDbMocks({
    findUnidadeByIdLean: async () => {
      throw new Error('forced-list-failure');
    },
  });

  const { listUnidades } = await importListUnidades('forced-error');
  const req = createReq({
    user: { role: 'diretor' },
    unitScope: { unidadeId: 'u-failure' },
  });
  const res = createResCapture();

  await listUnidades(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: {
      unidades: [],
      principalUnits: [],
    },
  });
});