import assert from 'node:assert/strict';
import test from 'node:test';

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
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

function nextModuleUrl(relativePath) {
  return new URL(`${relativePath}?case=${Date.now()}-${Math.random()}`, import.meta.url).href;
}

async function importControllerWithMocks(t, implementation = {}) {
  const serviceCalls = [];
  const oauthCalls = [];
  const bankCalls = [];

  const resolveTestarBancoTargetService = t.mock.fn(async (args) => {
    serviceCalls.push(args);
    if (implementation.serviceError) throw implementation.serviceError;
    return implementation.serviceResult;
  });

  const getOAuthTokenFromConfig = t.mock.fn(async (cfg) => {
    oauthCalls.push(cfg);
    if (implementation.oauthError) throw implementation.oauthError;
    return implementation.oauthResult ?? 'abcdefghij123456';
  });

  const callBankApi = t.mock.fn(async (unidadeId, payload) => {
    bankCalls.push({ unidadeId, payload });
    if (implementation.bankError) throw implementation.bankError;
    return implementation.bankResult ?? { ok: true };
  });

  t.mock.module('#modules/gestor/app/services/unidades/resolveTestarBancoTarget.service.js', {
    namedExports: {
      resolveTestarBancoTargetService,
    },
  });

  t.mock.module('#shared/ports/bank.port.js', {
    namedExports: {
      BankPort: {
        getOAuthTokenFromConfig,
        callBankApi,
      },
    },
  });

  const controllerModule = await import(nextModuleUrl('../src/modules/gestor/app/controllers/unidadeController.js'));

  return {
    testarBanco: controllerModule.testarBanco,
    serviceCalls,
    oauthCalls,
    bankCalls,
  };
}

async function importResolveTargetServiceWithMocks(t, implementation = {}) {
  const findUnidadeByIdCalls = [];
  const findUnidadeByIdLeanCalls = [];
  const findUnidadesByMatrizOuPrincipalCalls = [];
  const findUnidadesByIdCalls = [];

  const findUnidadeById = t.mock.fn(async (unidadeId) => {
    findUnidadeByIdCalls.push(unidadeId);
    if (implementation.findUnidadeByIdError) throw implementation.findUnidadeByIdError;
    return implementation.findUnidadeByIdResult;
  });

  const findUnidadeByIdLean = t.mock.fn(async (unidadeId) => {
    findUnidadeByIdLeanCalls.push(unidadeId);
    if (implementation.findUnidadeByIdLeanError) throw implementation.findUnidadeByIdLeanError;
    return implementation.findUnidadeByIdLeanResult;
  });

  const findUnidadesByMatrizOuPrincipal = t.mock.fn(async (unidadeId) => {
    findUnidadesByMatrizOuPrincipalCalls.push(unidadeId);
    if (implementation.findUnidadesByMatrizOuPrincipalError) throw implementation.findUnidadesByMatrizOuPrincipalError;
    return implementation.findUnidadesByMatrizOuPrincipalResult ?? [];
  });

  const findUnidadesById = t.mock.fn(async (unidadeId) => {
    findUnidadesByIdCalls.push(unidadeId);
    if (implementation.findUnidadesByIdError) throw implementation.findUnidadesByIdError;
    return implementation.findUnidadesByIdResult ?? [];
  });

  t.mock.module('#modules/gestor/app/services/apiDbBridgeService.js', {
    namedExports: {
      findUnidadeById,
      findUnidadeByIdLean,
      findUnidadesByMatrizOuPrincipal,
      findUnidadesById,
    },
  });

  const serviceModule = await import(nextModuleUrl('../src/modules/gestor/app/services/unidades/resolveTestarBancoTarget.service.js'));

  return {
    resolveTestarBancoTargetService: serviceModule.resolveTestarBancoTargetService,
    findUnidadeByIdCalls,
    findUnidadeByIdLeanCalls,
    findUnidadesByMatrizOuPrincipalCalls,
    findUnidadesByIdCalls,
  };
}

test('testarBanco delega a resolucao target-aware ao service fino e preserva 404 quando o alvo nao existe', async (t) => {
  const { testarBanco, serviceCalls, oauthCalls, bankCalls } = await importControllerWithMocks(t, {
    serviceResult: { kind: 'not_found', unidade: null },
  });
  const req = { params: { id: 'u-ausente' }, body: {} };
  const res = createMockRes();

  await testarBanco(req, res);

  assert.equal(serviceCalls.length, 1);
  assert.equal(serviceCalls[0].req, req);
  assert.equal(serviceCalls[0].unidadeId, 'u-ausente');
  assert.equal(oauthCalls.length, 0);
  assert.equal(bankCalls.length, 0);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { ok: false, message: 'Unidade não encontrada.' });
});

test('testarBanco barra alvo fora do cluster acessivel antes de qualquer chamada ao BankPort', async (t) => {
  const { testarBanco, serviceCalls, oauthCalls, bankCalls } = await importControllerWithMocks(t, {
    serviceResult: { kind: 'forbidden', unidade: null },
  });
  const req = { params: { id: 'u-fora' }, body: {}, unitScope: { unidadeId: 'u-escopo' } };
  const res = createMockRes();

  await testarBanco(req, res);

  assert.equal(serviceCalls.length, 1);
  assert.equal(serviceCalls[0].unidadeId, 'u-fora');
  assert.equal(oauthCalls.length, 0);
  assert.equal(bankCalls.length, 0);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { ok: false, message: 'Acesso à unidade não autorizado.' });
});

test('testarBanco preserva o ramo oauth2 apos autorizacao do service fino', async (t) => {
  const unidade = {
    _id: 'u-oauth',
    apiBancaria: {
      apiBaseUrl: 'https://bank.example',
      tipoAutenticacaoAPI: 'oauth2',
    },
  };

  const { testarBanco, serviceCalls, oauthCalls, bankCalls } = await importControllerWithMocks(t, {
    serviceResult: { kind: 'authorized', unidade },
    oauthResult: 'abcdefghij999999',
  });
  const req = { params: { id: 'u-oauth' }, body: {} };
  const res = createMockRes();

  await testarBanco(req, res);

  assert.equal(serviceCalls.length, 1);
  assert.equal(oauthCalls.length, 1);
  assert.equal(oauthCalls[0], unidade.apiBancaria);
  assert.equal(bankCalls.length, 0);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    ok: true,
    message: 'Conexão com o banco testada com sucesso.',
    detalhe: 'Token OAuth2 obtido com sucesso.',
    resultado: { tokenPreview: 'abcdefghij...' },
  });
});

test('resolveTestarBancoTargetService retorna not_found sem expandir cluster quando o alvo nao existe', async (t) => {
  const {
    resolveTestarBancoTargetService,
    findUnidadeByIdCalls,
    findUnidadeByIdLeanCalls,
    findUnidadesByMatrizOuPrincipalCalls,
    findUnidadesByIdCalls,
  } = await importResolveTargetServiceWithMocks(t, {
    findUnidadeByIdResult: null,
  });

  const result = await resolveTestarBancoTargetService({ req: { unitScope: { unidadeId: 'u-escopo' } }, unidadeId: 'u-ausente' });

  assert.deepEqual(result, { kind: 'not_found', unidade: null });
  assert.deepEqual(findUnidadeByIdCalls, ['u-ausente']);
  assert.equal(findUnidadeByIdLeanCalls.length, 0);
  assert.equal(findUnidadesByMatrizOuPrincipalCalls.length, 0);
  assert.equal(findUnidadesByIdCalls.length, 0);
});

test('resolveTestarBancoTargetService retorna forbidden quando o alvo nao pertence ao cluster acessivel', async (t) => {
  const unidade = { _id: 'u-alvo', apiBancaria: { apiBaseUrl: 'https://bank.example' } };
  const {
    resolveTestarBancoTargetService,
    findUnidadeByIdCalls,
    findUnidadeByIdLeanCalls,
    findUnidadesByMatrizOuPrincipalCalls,
    findUnidadesByIdCalls,
  } = await importResolveTargetServiceWithMocks(t, {
    findUnidadeByIdResult: unidade,
    findUnidadeByIdLeanResult: { _id: 'u-escopo', is_principal: true },
    findUnidadesByMatrizOuPrincipalResult: [{ _id: 'u-escopo' }, { _id: 'u-filial' }],
  });

  const result = await resolveTestarBancoTargetService({ req: { unitScope: { unidadeId: 'u-escopo' }, user: { role: 'admin' } }, unidadeId: 'u-alvo' });

  assert.deepEqual(result, { kind: 'forbidden', unidade: null });
  assert.deepEqual(findUnidadeByIdCalls, ['u-alvo']);
  assert.deepEqual(findUnidadeByIdLeanCalls, ['u-escopo']);
  assert.deepEqual(findUnidadesByMatrizOuPrincipalCalls, ['u-escopo']);
  assert.equal(findUnidadesByIdCalls.length, 0);
});

test('resolveTestarBancoTargetService preserva o fallback para a propria scopedUnit quando o cluster volta vazio', async (t) => {
  const unidade = { _id: 'u-escopo', apiBancaria: { apiBaseUrl: 'https://bank.example' } };
  const {
    resolveTestarBancoTargetService,
    findUnidadeByIdCalls,
    findUnidadeByIdLeanCalls,
    findUnidadesByMatrizOuPrincipalCalls,
    findUnidadesByIdCalls,
  } = await importResolveTargetServiceWithMocks(t, {
    findUnidadeByIdResult: unidade,
    findUnidadeByIdLeanResult: { _id: 'u-escopo', is_principal: false, unidade_principal_id: 'u-principal' },
    findUnidadesByMatrizOuPrincipalResult: [],
    findUnidadesByIdResult: [{ _id: 'u-escopo' }],
  });

  const result = await resolveTestarBancoTargetService({ req: { unitScope: { unidadeId: 'u-escopo' }, user: { role: 'diretor' } }, unidadeId: 'u-escopo' });

  assert.equal(result.kind, 'authorized');
  assert.equal(result.unidade, unidade);
  assert.deepEqual(findUnidadeByIdCalls, ['u-escopo']);
  assert.deepEqual(findUnidadeByIdLeanCalls, ['u-escopo']);
  assert.deepEqual(findUnidadesByMatrizOuPrincipalCalls, ['u-principal']);
  assert.deepEqual(findUnidadesByIdCalls, ['u-escopo']);
});