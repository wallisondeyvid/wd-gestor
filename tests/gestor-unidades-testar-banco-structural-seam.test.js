import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/unidadeController.js');
const SERVICE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/services/unidades/resolveTestarBancoTarget.service.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');
const SERVICE_SOURCE = fs.readFileSync(SERVICE_PATH, 'utf8');

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = JSON.parse(JSON.stringify(payload));
      return this;
    },
  };
}

function extractNamedFunction(source, functionName) {
  const signatures = [
    `export async function ${functionName}`,
    `async function ${functionName}`,
    `function ${functionName}`,
  ];

  let start = -1;
  for (const signature of signatures) {
    start = source.indexOf(signature);
    if (start >= 0) break;
  }

  assert.ok(start >= 0, `Nao encontrou ${functionName}`);

  const paramsEnd = source.indexOf(')', start);
  assert.ok(paramsEnd >= 0, `Nao encontrou fechamento de parametros de ${functionName}`);

  const braceStart = source.indexOf('{', paramsEnd);
  assert.ok(braceStart >= 0, `Nao encontrou bloco de ${functionName}`);

  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1).replace(/^export\s+/, '');
    }
  }

  throw new Error(`Nao conseguiu extrair ${functionName}`);
}

function buildFunctions(functionSources, exportedNames, context = {}) {
  const script = new vm.Script(`(function () {\n${functionSources.join('\n\n')}\nreturn { ${exportedNames.join(', ')} };\n})()`);
  return script.runInNewContext(context);
}

function loadTestarBancoHarness(implementation = {}) {
  const serviceCalls = [];
  const oauthCalls = [];
  const bankCalls = [];

  const resolveTestarBancoTargetService = async (args) => {
    serviceCalls.push(args);
    if (implementation.serviceError) throw implementation.serviceError;
    return implementation.serviceResult;
  };

  const getOAuthTokenFromConfig = async (cfg) => {
    oauthCalls.push(cfg);
    if (implementation.oauthError) throw implementation.oauthError;
    return implementation.oauthResult ?? 'abcdefghij123456';
  };

  const callBankApi = async (unidadeId, payload) => {
    bankCalls.push({ unidadeId, payload });
    if (implementation.bankError) throw implementation.bankError;
    return implementation.bankResult ?? { ok: true };
  };

  const { testarBanco } = buildFunctions(
    [
      extractNamedFunction(CONTROLLER_SOURCE, 'resolveTestarBancoTarget'),
      extractNamedFunction(CONTROLLER_SOURCE, 'testarBanco'),
    ],
    ['testarBanco'],
    {
      resolveTestarBancoTargetService,
      findUnidadeById: async () => {
        throw new Error('fallback local nao deveria ser usado neste harness');
      },
      ensureCanAccessUnidade: async () => false,
      BankPort: {
        getOAuthTokenFromConfig,
        callBankApi,
      },
      console,
    },
  );

  return {
    testarBanco,
    serviceCalls,
    oauthCalls,
    bankCalls,
  };
}

function loadResolveTargetServiceHarness(implementation = {}) {
  const findUnidadeByIdCalls = [];
  const findUnidadeByIdLeanCalls = [];
  const findUnidadesByMatrizOuPrincipalCalls = [];
  const findUnidadesByIdCalls = [];

  const findUnidadeById = async (unidadeId) => {
    findUnidadeByIdCalls.push(unidadeId);
    if (implementation.findUnidadeByIdError) throw implementation.findUnidadeByIdError;
    return implementation.findUnidadeByIdResult;
  };

  const findUnidadeByIdLean = async (unidadeId) => {
    findUnidadeByIdLeanCalls.push(unidadeId);
    if (implementation.findUnidadeByIdLeanError) throw implementation.findUnidadeByIdLeanError;
    return implementation.findUnidadeByIdLeanResult;
  };

  const findUnidadesByMatrizOuPrincipal = async (unidadeId) => {
    findUnidadesByMatrizOuPrincipalCalls.push(unidadeId);
    if (implementation.findUnidadesByMatrizOuPrincipalError) throw implementation.findUnidadesByMatrizOuPrincipalError;
    return implementation.findUnidadesByMatrizOuPrincipalResult ?? [];
  };

  const findUnidadesById = async (unidadeId) => {
    findUnidadesByIdCalls.push(unidadeId);
    if (implementation.findUnidadesByIdError) throw implementation.findUnidadesByIdError;
    return implementation.findUnidadesByIdResult ?? [];
  };

  const { resolveTestarBancoTargetService } = buildFunctions(
    [
      extractNamedFunction(SERVICE_SOURCE, 'normalizeUnitId'),
      extractNamedFunction(SERVICE_SOURCE, 'isPrivilegedGestorUser'),
      extractNamedFunction(SERVICE_SOURCE, 'ensureCanAccessUnidade'),
      extractNamedFunction(SERVICE_SOURCE, 'resolveTestarBancoTargetService'),
    ],
    ['resolveTestarBancoTargetService'],
    {
      findUnidadeById,
      findUnidadeByIdLean,
      findUnidadesByMatrizOuPrincipal,
      findUnidadesById,
    },
  );

  return {
    resolveTestarBancoTargetService,
    findUnidadeByIdCalls,
    findUnidadeByIdLeanCalls,
    findUnidadesByMatrizOuPrincipalCalls,
    findUnidadesByIdCalls,
  };
}

test('testarBanco delega a resolucao target-aware ao service fino e preserva 404 quando o alvo nao existe', async () => {
  const { testarBanco, serviceCalls, oauthCalls, bankCalls } = loadTestarBancoHarness({
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

test('testarBanco barra alvo fora do cluster acessivel antes de qualquer chamada ao BankPort', async () => {
  const { testarBanco, serviceCalls, oauthCalls, bankCalls } = loadTestarBancoHarness({
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

test('testarBanco preserva o ramo oauth2 apos autorizacao do service fino', async () => {
  const unidade = {
    _id: 'u-oauth',
    apiBancaria: {
      apiBaseUrl: 'https://bank.example',
      tipoAutenticacaoAPI: 'oauth2',
    },
  };

  const { testarBanco, serviceCalls, oauthCalls, bankCalls } = loadTestarBancoHarness({
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

test('resolveTestarBancoTargetService retorna not_found sem expandir cluster quando o alvo nao existe', async () => {
  const {
    resolveTestarBancoTargetService,
    findUnidadeByIdCalls,
    findUnidadeByIdLeanCalls,
    findUnidadesByMatrizOuPrincipalCalls,
    findUnidadesByIdCalls,
  } = loadResolveTargetServiceHarness({
    findUnidadeByIdResult: null,
  });

  const result = await resolveTestarBancoTargetService({ req: { unitScope: { unidadeId: 'u-escopo' } }, unidadeId: 'u-ausente' });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), { kind: 'not_found', unidade: null });
  assert.deepEqual(findUnidadeByIdCalls, ['u-ausente']);
  assert.equal(findUnidadeByIdLeanCalls.length, 0);
  assert.equal(findUnidadesByMatrizOuPrincipalCalls.length, 0);
  assert.equal(findUnidadesByIdCalls.length, 0);
});

test('resolveTestarBancoTargetService retorna forbidden quando o alvo nao pertence ao cluster acessivel', async () => {
  const unidade = { _id: 'u-alvo', apiBancaria: { apiBaseUrl: 'https://bank.example' } };
  const {
    resolveTestarBancoTargetService,
    findUnidadeByIdCalls,
    findUnidadeByIdLeanCalls,
    findUnidadesByMatrizOuPrincipalCalls,
    findUnidadesByIdCalls,
  } = loadResolveTargetServiceHarness({
    findUnidadeByIdResult: unidade,
    findUnidadeByIdLeanResult: { _id: 'u-escopo', is_principal: true },
    findUnidadesByMatrizOuPrincipalResult: [{ _id: 'u-escopo' }, { _id: 'u-filial' }],
  });

  const result = await resolveTestarBancoTargetService({ req: { unitScope: { unidadeId: 'u-escopo' }, user: { role: 'admin' } }, unidadeId: 'u-alvo' });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), { kind: 'forbidden', unidade: null });
  assert.deepEqual(findUnidadeByIdCalls, ['u-alvo']);
  assert.deepEqual(findUnidadeByIdLeanCalls, ['u-escopo']);
  assert.deepEqual(findUnidadesByMatrizOuPrincipalCalls, ['u-escopo']);
  assert.equal(findUnidadesByIdCalls.length, 0);
});

test('resolveTestarBancoTargetService preserva o fallback para a propria scopedUnit quando o cluster volta vazio', async () => {
  const unidade = { _id: 'u-escopo', apiBancaria: { apiBaseUrl: 'https://bank.example' } };
  const {
    resolveTestarBancoTargetService,
    findUnidadeByIdCalls,
    findUnidadeByIdLeanCalls,
    findUnidadesByMatrizOuPrincipalCalls,
    findUnidadesByIdCalls,
  } = loadResolveTargetServiceHarness({
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