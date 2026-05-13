import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import test, { after } from 'node:test';
import { pathToFileURL } from 'node:url';

const FACADE_FILE = path.resolve(process.cwd(), 'src/modules/gestor/app/data/feedback/feedbackStatusDataFacade.js');
const SERVICE_FILE = path.resolve(process.cwd(), 'src/modules/gestor/app/services/feedback/updateFeedbackStatus.service.js');
const ROUTE_FILE = path.resolve(process.cwd(), 'src/modules/gestor/app/routes/feedbackApi.js');
const API_DB_FILE = path.resolve(process.cwd(), 'src/modules/gestor/app/db/api.db.js');
const RUNTIME_CONTRACT_FILE = path.resolve(process.cwd(), 'docs/checkpoints/gestor-feedback-status-patch-runtime-contract.md');
const RUNTIME_TEST_FILE = path.resolve(process.cwd(), 'tests/gestor-feedback-status-patch-runtime-contract.test.js');

const REPOSITORY_MOCK_MODULE_URL = 'mock:gestor-feedback-status-tenant-aware-protection-feedback-repository';

const HARNESS_STATE = {
  feedbackResult: null,
  writeResult: null,
  readCalls: [],
  writeCalls: [],
};

globalThis.__GESTOR_FEEDBACK_STATUS_TENANT_AWARE_PROTECTION_STATE__ = HARNESS_STATE;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '#modules/gestor/app/repositories/FeedbackReadRepository.js') {
      return { url: REPOSITORY_MOCK_MODULE_URL, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === REPOSITORY_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'const state = globalThis.__GESTOR_FEEDBACK_STATUS_TENANT_AWARE_PROTECTION_STATE__;',
          'export async function findFeedbackByIdLeanRepo(args) {',
          '  state.readCalls.push(args);',
          '  return state.feedbackResult;',
          '}',
          'export async function findFeedbackByIdAndUpdateSetNewLeanRepo(args) {',
          '  state.writeCalls.push(args);',
          '  return state.writeResult;',
          '}',
        ].join('\n'),
      };
    }

    return nextLoad(url, context);
  },
});

after(() => {
  delete globalThis.__GESTOR_FEEDBACK_STATUS_TENANT_AWARE_PROTECTION_STATE__;
});

function importFresh(filePath, token) {
  return import(`${pathToFileURL(filePath).href}?case=${token}`);
}

function resetHarness() {
  HARNESS_STATE.feedbackResult = null;
  HARNESS_STATE.writeResult = null;
  HARNESS_STATE.readCalls.length = 0;
  HARNESS_STATE.writeCalls.length = 0;
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('service e rota preservam o seam contextual esperado para feedback status', () => {
  const serviceSource = readText(SERVICE_FILE);
  const routeSource = readText(ROUTE_FILE);

  assert.match(
    serviceSource,
    /updateFeedbackStatusLeanData\(id,\s*setData,\s*options\)/,
    'o service deve continuar repassando options contextuais para a facade',
  );

  assert.match(
    routeSource,
    /req\.unitScope\?\.unidadeId\s*\|\|\s*req\.session\?\.gestorAuthContext\?\.active_unidade_id/,
    'a rota deve continuar semeando unitScope pela borda admin via auth-context',
  );

  assert.match(
    routeSource,
    /router\.patch\('\/api\/gestor\/feedback\/:feedbackId\/status',\s*requireLogin,\s*seedFeedbackAdminUnitScopeFromAuthContext,\s*updateStatusPatch\)/,
    'o PATCH canônico deve continuar passando pelo seed contextual antes do handler de status',
  );
});

test('facade honra scopedUnitId e permite write apenas para alvo dentro do escopo permitido', async () => {
  resetHarness();
  HARNESS_STATE.feedbackResult = { _id: '507f1f77bcf86cd799439011', unidade_id: 'unit-a' };
  HARNESS_STATE.writeResult = { _id: '507f1f77bcf86cd799439011', status: 'resolvido' };

  const { updateFeedbackStatusLeanData } = await importFresh(FACADE_FILE, 'facade-scoped-unit-id-valid');
  const result = await updateFeedbackStatusLeanData(
    '507f1f77bcf86cd799439011',
    { status: 'resolvido' },
    { scopedUnitId: 'unit-a' },
  );

  assert.deepEqual(HARNESS_STATE.readCalls, [{
    unitScope: { type: 'unit', unidadeId: 'unit-a' },
    id: '507f1f77bcf86cd799439011',
  }]);
  assert.deepEqual(HARNESS_STATE.writeCalls, [{
    unitScope: { type: 'unit', unidadeId: 'unit-a' },
    id: '507f1f77bcf86cd799439011',
    setData: { status: 'resolvido' },
  }]);
  assert.equal(result, HARNESS_STATE.writeResult);
});

test('facade recusa alvo fora de escopo por unitScope antes de qualquer write efetivo', async () => {
  resetHarness();
  HARNESS_STATE.feedbackResult = { _id: '507f1f77bcf86cd799439011', unidade_id: 'unit-b' };
  HARNESS_STATE.writeResult = { _id: '507f1f77bcf86cd799439011', status: 'resolvido' };

  const { updateFeedbackStatusLeanData } = await importFresh(FACADE_FILE, 'facade-unit-scope-out-of-scope');
  const result = await updateFeedbackStatusLeanData(
    '507f1f77bcf86cd799439011',
    { status: 'resolvido' },
    { unitScope: { unidadeId: 'unit-a' } },
  );

  assert.equal(result, null, 'alvo fora do escopo permitido deve ser recusado');
  assert.deepEqual(HARNESS_STATE.readCalls, [{
    unitScope: { unidadeId: 'unit-a' },
    id: '507f1f77bcf86cd799439011',
  }]);
  assert.deepEqual(HARNESS_STATE.writeCalls, [], 'nenhum write efetivo deve ocorrer fora de escopo');
});

test('facade e bridge preservam o guard before write no source contract atual', () => {
  const facadeSource = readText(FACADE_FILE);
  const apiDbSource = readText(API_DB_FILE);

  const facadeScopedReadIndex = facadeSource.indexOf('const scopedExisting = await findFeedbackByIdLeanRepo({ unitScope: scopedUnitScope, id });');
  const facadeGuardIndex = facadeSource.indexOf('if (!feedbackMatchesScopedUnit(existing, options)) return null;');
  const facadeWriteIndex = facadeSource.indexOf('findFeedbackByIdAndUpdateSetNewLeanRepo({ unitScope: writeUnitScope, id, setData })');

  assert.notEqual(facadeScopedReadIndex, -1, 'a facade deve continuar lendo o alvo atual antes da mutação');
  assert.notEqual(facadeGuardIndex, -1, 'a facade deve continuar validando escopo antes do write');
  assert.notEqual(facadeWriteIndex, -1, 'a facade deve continuar expondo o ponto de write protegido');
  assert.ok(facadeScopedReadIndex < facadeGuardIndex, 'a validação de escopo deve vir após o lookup atual');
  assert.ok(facadeGuardIndex < facadeWriteIndex, 'a validação de escopo deve anteceder o write');

  assert.match(
    facadeSource,
    /const scopedUnitScope = resolveScopedUnitScope\(options\);[\s\S]*?const scopedExisting = await findFeedbackByIdLeanRepo\(\{ unitScope: scopedUnitScope, id \}\);[\s\S]*?return \{ existing: scopedExisting, writeUnitScope: scopedUnitScope \};/,
    'a facade deve priorizar leitura e write com escopo contextual efetivo quando houver unitScope ou scopedUnitId',
  );

  assert.match(
    facadeSource,
    /if \(options\?\.allowLegacyUnscoped !== true\) \{[\s\S]*?return \{ existing: null, writeUnitScope: scopedUnitScope \ };/,
    'a facade deve recusar alvo fora do escopo contextual antes de qualquer write efetivo quando nao houver fallback legado permitido',
  );

  const bridgeGuardPattern = /const existing = await findFeedbackByIdWithinScope\(id, options\);[\s\S]*?if \(!existing\) return null;[\s\S]*?findFeedbackByIdAndUpdateSetNewLeanRepo\(\{ unitScope: GLOBAL_SCOPE, id, setData \}\)/;
  assert.match(
    apiDbSource,
    bridgeGuardPattern,
    'a bridge atual deve continuar protegendo o write com guarda prévia de escopo antes da mutação global',
  );
});

test('contrato público do PATCH canônico permanece explicitamente congelado para os casos válidos e inválidos', () => {
  const runtimeCheckpoint = readText(RUNTIME_CONTRACT_FILE);
  const runtimeTestSource = readText(RUNTIME_TEST_FILE);

  assert.match(runtimeCheckpoint, /sem sessão: 401 JSON de não autenticado/);
  assert.match(runtimeCheckpoint, /usuário não admin: 403 JSON Acesso negado antes da mutação/);
  assert.match(runtimeCheckpoint, /admin contextual com unidade ativa correspondente ao feedback: 200 JSON e persistência real do novo status/);
  assert.match(runtimeCheckpoint, /admin contextual com unidade ativa fora do escopo do feedback: 404 JSON Feedback não encontrado e nenhuma mutação persistida/);
  assert.match(runtimeCheckpoint, /status inválido: 400 JSON Status inválido antes da mutação/);

  assert.match(runtimeTestSource, /PATCH canônico com admin contextual atualiza o status e persiste a mutação na unidade ativa/);
  assert.match(runtimeTestSource, /PATCH canônico com usuário não admin preserva o gate 403 antes da mutação/);
  assert.match(runtimeTestSource, /PATCH canônico com admin contextual fora de escopo traduz o alvo para 404 e não altera o documento/);
  assert.match(runtimeTestSource, /PATCH canônico com status inválido preserva a validação 400 antes da mutação/);
});