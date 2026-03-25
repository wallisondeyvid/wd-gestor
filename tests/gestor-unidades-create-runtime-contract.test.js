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
const dbBridgeMockModuleUrl = 'mock:gestor-unidades-create-api-db-bridge';
const provisioningMockModuleUrl = 'mock:gestor-unidades-create-provisioning';

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
    if (specifier === '#modules/gestor/app/services/UnitProvisioningService.js') {
      return { url: provisioningMockModuleUrl, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === dbBridgeMockModuleUrl) {
      const lines = [
        `export * from '${actualDbBridgeModuleUrl}';`,
        `import * as actual from '${actualDbBridgeModuleUrl}';`,
        'const getMocks = () => globalThis.__GESTOR_UNIDADES_CREATE_DB_MOCKS__ || {};',
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

    if (url === provisioningMockModuleUrl) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'const getMocks = () => globalThis.__GESTOR_UNIDADES_CREATE_PROVISIONING_MOCKS__ || {};',
          "export async function ensureUnitProvisioned(...args) { return await (getMocks().ensureUnitProvisioned || (async () => ({ ok: true })))(...args); }",
          "export async function inspectUnitProvisioning(...args) { return await (getMocks().inspectUnitProvisioning || (async () => null))(...args); }",
          "export async function listUnitProvisioningAuditEvents(...args) { return await (getMocks().listUnitProvisioningAuditEvents || (async () => []))(...args); }",
          "export function isUnitProvisioningValidationError(...args) { return (getMocks().isUnitProvisioningValidationError || (() => false))(...args); }",
          "export async function retryUnitProvisioning(...args) { return await (getMocks().retryUnitProvisioning || (async () => ({ accepted: true })))(...args); }",
        ].join('\n'),
      };
    }

    return nextLoad(url, context);
  },
});

function setDbMocks(overrides = {}) {
  globalThis.__GESTOR_UNIDADES_CREATE_DB_MOCKS__ = { ...overrides };
}

function setProvisioningMocks(overrides = {}) {
  globalThis.__GESTOR_UNIDADES_CREATE_PROVISIONING_MOCKS__ = { ...overrides };
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

async function importCreateUnidade(tag) {
  return import(`${controllerModuleUrl}?case=${encodeURIComponent(tag)}-${Date.now()}`);
}

async function requestGestorApp(pathname) {
  const { default: gestorApp } = await import(`${gestorAppModuleUrl}?case=app-${Date.now()}`);
  const rootApp = express();
  rootApp.use('/gestor', gestorApp);

  const server = await new Promise((resolve) => {
    const instance = rootApp.listen(0, '127.0.0.1', () => resolve(instance));
  });

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
      method: 'POST',
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

function calcularDigitoVerificador(cnpjParcial, pesos) {
  const soma = cnpjParcial
    .split('')
    .reduce((acc, digit, index) => acc + Number(digit) * pesos[index], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

function buildExpectedSubunidadeCnpj(baseEightDigits, suffixNumber) {
  const suffix = String(suffixNumber).padStart(4, '0');
  const parcial = `${baseEightDigits}${suffix}`;
  const dv1 = calcularDigitoVerificador(parcial, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const dv2 = calcularDigitoVerificador(`${parcial}${dv1}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${parcial}${dv1}${dv2}`;
}

test('POST /gestor/api/unidades sem sessao no app real responde 401 JSON', async () => {
  const response = await requestGestorApp('/gestor/api/unidades');

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, {
    success: false,
    error: 'Não autenticado',
    code: 'UNAUTHORIZED',
  });
});

test('createUnidade com payload minimo invalido responde 400', async () => {
  setDbMocks({});
  setProvisioningMocks({});

  const { createUnidade } = await importCreateUnidade('invalid-minimal');
  const req = createReq({
    user: { role: 'admin', isMaster: false },
    body: {},
  });
  const res = createResCapture();

  await createUnidade(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    code: 'BAD_REQUEST',
    message: 'Nome Fantasia e e-mail principal são obrigatórios e válidos.',
  });
});

test('createUnidade com subunidade sem principal responde 400', async () => {
  setDbMocks({});
  setProvisioningMocks({});

  const { createUnidade } = await importCreateUnidade('missing-principal');
  const req = createReq({
    user: { role: 'admin', isMaster: false },
    body: {
      nomeFantasia: 'Filial sem matriz',
      emailPrincipal: 'filial@test.com',
      pessoaTipo: 'pj',
      subunidade: 'true',
      unidadePrincipal: '',
      cnpj: '',
    },
  });
  const res = createResCapture();

  await createUnidade(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    code: 'BAD_REQUEST',
    message: 'Uma subunidade deve ter uma unidade principal associada.',
  });
});

test('createUnidade responde 400 para duplicidade relevante de CNPJ', async () => {
  setDbMocks({
    findUltimaUnidadePorCodigo: async () => null,
    findUnidadeByCnpj: async () => ({ _id: 'u-existente' }),
  });
  setProvisioningMocks({});

  const { createUnidade } = await importCreateUnidade('duplicate-cnpj');
  const req = createReq({
    user: { role: 'admin', isMaster: false },
    body: {
      nomeFantasia: 'Clinica Duplicada',
      emailPrincipal: 'dup@test.com',
      pessoaTipo: 'pj',
      principal: 'true',
      subunidade: 'false',
      cnpj: '12.345.678/0001-95',
    },
  });
  const res = createResCapture();

  await createUnidade(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    code: 'BAD_REQUEST',
    message: 'CNPJ já cadastrado no banco de dados.',
  });
});

test('createUnidade responde 400 quando principal solicitada esta fora do escopo contextual', async () => {
  setDbMocks({
    findUnidadeByIdLean: async (id) => ({ _id: id }),
    findUnidadeUserBaseLean: async () => ({ _id: 'u-principal-scope', is_principal: true }),
  });
  setProvisioningMocks({});

  const { createUnidade } = await importCreateUnidade('out-of-scope');
  const req = createReq({
    user: { role: 'diretor', isMaster: false },
    unitScope: { unidadeId: 'u-principal-scope' },
    body: {
      nomeFantasia: 'Filial fora do escopo',
      emailPrincipal: 'filial@test.com',
      pessoaTipo: 'pj',
      subunidade: 'true',
      unidadePrincipal: 'u-principal-externa',
    },
  });
  const res = createResCapture();

  await createUnidade(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    code: 'BAD_REQUEST',
    message: 'Acesso à unidade não autorizado.',
  });
});

test('createUnidade cria unidade principal com apiBancaria, modulosAcessiveis, vinculo de diretor e provisioning observavel', async () => {
  let createdPayload = null;
  let linkedDiretor = null;
  let provisioningCall = null;
  setDbMocks({
    findUltimaUnidadePorCodigo: async () => ({ codigo: 'M0007' }),
    findUnidadeByCodigo: async () => null,
    findUnidadeByCpf: async () => null,
    createUnidadeDoc: async (payload) => {
      createdPayload = payload;
      return payload;
    },
    saveUnidadeDoc: async (payload) => ({
      _id: 'u-principal-nova',
      ...payload,
      toObject() {
        return {
          _id: 'u-principal-nova',
          ...payload,
        };
      },
    }),
    updateUserUnidadeById: async (userId, unidadeId) => {
      linkedDiretor = { userId, unidadeId };
    },
  });
  setProvisioningMocks({
    ensureUnitProvisioned: async (payload) => {
      provisioningCall = payload;
      return { ok: true };
    },
  });

  const { createUnidade } = await importCreateUnidade('success-principal');
  const req = createReq({
    user: { role: 'admin', isMaster: false },
    body: {
      nomeFantasia: 'Clinica Principal PF',
      razaoSocial: 'Clinica Principal PF LTDA',
      cpf: '123.456.789-09',
      pessoaTipo: 'pf',
      principal: 'true',
      subunidade: 'false',
      dataAbertura: '2024-01-02',
      emailPrincipal: 'principal@test.com',
      emailFiscal: 'fiscal@test.com',
      modulosAcessiveis: 'financeiro',
      diretor_usuario_id: 'dir-1',
      apiBancaria: {
        apiBaseUrl: ' https://bank.example.test ',
        apiMtlsCertFileName: ' certificado.p12 ',
        tipoAutenticacaoAPI: 'desconhecido',
      },
    },
  });
  const res = createResCapture();

  await createUnidade(req, res);

  assert.equal(createdPayload.codigo, 'M0008');
  assert.equal(createdPayload.nome, 'Clinica Principal PF');
  assert.equal(createdPayload.razaoSocial, 'Clinica Principal PF LTDA');
  assert.equal(createdPayload.cnpj, null);
  assert.equal(createdPayload.cpf, '12345678909');
  assert.equal(createdPayload.pessoaTipo, 'pf');
  assert.equal(createdPayload.is_principal, true);
  assert.equal(createdPayload.subunidade, false);
  assert.equal(createdPayload.unidade_principal_id, null);
  assert.ok(createdPayload.dataAbertura instanceof Date);
  assert.equal(createdPayload.dataAbertura.toISOString(), '2024-01-02T00:00:00.000Z');
  assert.equal(createdPayload.emailPrincipal, 'principal@test.com');
  assert.equal(createdPayload.emailFiscal, 'fiscal@test.com');
  assert.deepEqual(createdPayload.modulosAcessiveis, ['financeiro']);
  assert.equal(createdPayload.diretor_usuario_id, 'dir-1');
  assert.equal(createdPayload.is_active, true);
  assert.equal(createdPayload.logo, null);
  assert.deepEqual(createdPayload.apiBancaria, {
    apiBaseUrl: 'https://bank.example.test',
    apiMtlsCertFileName: 'certificado.p12',
    tipoAutenticacaoAPI: '',
  });
  assert.deepEqual(linkedDiretor, { userId: 'dir-1', unidadeId: 'u-principal-nova' });
  assert.deepEqual(provisioningCall, {
    unidadeId: 'u-principal-nova',
    tipo: 'principal',
    modulosHabilitados: ['financeiro'],
  });
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body, {
    success: true,
    created: true,
    id: 'u-principal-nova',
    data: {
      _id: 'u-principal-nova',
      codigo: 'M0008',
      nome: 'Clinica Principal PF',
      razaoSocial: 'Clinica Principal PF LTDA',
      cnpj: null,
      cpf: '12345678909',
      pessoaTipo: 'pf',
      inscricaoEstadual: null,
      inscricaoMunicipal: null,
      cnaePrincipal: null,
      cnaeSecundarios: null,
      regimeTributario: null,
      naturezaJuridica: null,
      is_principal: true,
      subunidade: false,
      unidade_principal_id: null,
      dataAbertura: '2024-01-02T00:00:00.000Z',
      endereco: null,
      telefoneFixo: null,
      telefoneCelular: null,
      emailPrincipal: 'principal@test.com',
      emailFiscal: 'fiscal@test.com',
      site: null,
      banco: null,
      agencia: null,
      contaCorrente: null,
      pixChave: null,
      tipoPix: null,
      modulosAcessiveis: ['financeiro'],
      diretor_usuario_id: 'dir-1',
      is_active: true,
      logo: null,
      apiBancaria: {
        apiBaseUrl: 'https://bank.example.test',
        apiMtlsCertFileName: 'certificado.p12',
        tipoAutenticacaoAPI: '',
      },
    },
  });
});

test('createUnidade cria subunidade com CNPJ derivado e provisioning tipo subunidade', async () => {
  let createdPayload = null;
  let provisioningCall = null;
  const expectedCnpj = buildExpectedSubunidadeCnpj('12345678', 2);
  setDbMocks({
    findUnidadeByIdLean: async (id) => ({ _id: id }),
    findUnidadeUserBaseLean: async () => ({ _id: 'u-principal', is_principal: true }),
    findUnidadesByCondLeanFull: async () => ([{ _id: 'u-principal' }]),
    findUltimaUnidadePorCodigo: async () => null,
    findUnidadeByCodigo: async () => null,
    findUnidadeByCnpj: async () => null,
    findUnidadeById: async (id) => ({ _id: id, is_principal: true, cnpj: '12345678000195' }),
    findSubunidadesByUnidadePrincipal: async () => ([{ cnpj: '12345678000195' }]),
    createUnidadeDoc: async (payload) => {
      createdPayload = payload;
      return payload;
    },
    saveUnidadeDoc: async (payload) => ({
      _id: 'u-sub-1',
      ...payload,
      toObject() {
        return {
          _id: 'u-sub-1',
          ...payload,
        };
      },
    }),
  });
  setProvisioningMocks({
    ensureUnitProvisioned: async (payload) => {
      provisioningCall = payload;
      return { ok: true };
    },
  });

  const { createUnidade } = await importCreateUnidade('success-subunit');
  const req = createReq({
    user: { role: 'diretor', isMaster: false },
    unitScope: { unidadeId: 'u-principal' },
    body: {
      nomeFantasia: 'Filial Nova',
      emailPrincipal: 'filial@test.com',
      pessoaTipo: 'pj',
      subunidade: 'true',
      unidadePrincipal: 'u-principal',
      cnpj: '',
      modulosAcessiveis: ['ponto', 'escalas'],
    },
  });
  const res = createResCapture();

  await createUnidade(req, res);

  assert.equal(createdPayload.codigo, 'M0001');
  assert.equal(createdPayload.cnpj, expectedCnpj);
  assert.equal(createdPayload.is_principal, false);
  assert.equal(createdPayload.subunidade, true);
  assert.equal(createdPayload.unidade_principal_id, 'u-principal');
  assert.deepEqual(createdPayload.modulosAcessiveis, ['ponto', 'escalas']);
  assert.equal(createdPayload.diretor_usuario_id, null);
  assert.deepEqual(provisioningCall, {
    unidadeId: 'u-sub-1',
    tipo: 'subunidade',
    modulosHabilitados: ['ponto', 'escalas'],
  });
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.created, true);
  assert.equal(res.body.id, 'u-sub-1');
  assert.equal(res.body.data.cnpj, expectedCnpj);
});

test('createUnidade retorna 500 com erro interno induzido e mensagem original', async () => {
  setDbMocks({
    findUltimaUnidadePorCodigo: async () => {
      throw new Error('forced-create-failure');
    },
  });
  setProvisioningMocks({});

  const { createUnidade } = await importCreateUnidade('forced-error');
  const req = createReq({
    user: { role: 'admin', isMaster: true },
    body: {
      nomeFantasia: 'Clinica Erro',
      emailPrincipal: 'erro@test.com',
      pessoaTipo: 'pf',
      cpf: '12345678909',
      principal: 'true',
    },
  });
  const res = createResCapture();

  await createUnidade(req, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, {
    success: false,
    code: 'SERVER_ERROR',
    message: 'forced-create-failure',
  });
});