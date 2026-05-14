import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import test, { after } from 'node:test';
import { pathToFileURL } from 'node:url';

const FACADE_FILE = path.resolve(process.cwd(), 'src/modules/gestor/app/data/recursos/recursosContextDataFacade.js');
const SERVICE_FILE = path.resolve(process.cwd(), 'src/modules/gestor/app/services/recursos/listarRecursos.service.js');

const REPOSITORY_MOCK_MODULE_URL = 'mock:gestor-recursos-context-tenant-aware-protection-unidade-repository';
const VALID_UNIT_ID = '507f1f77bcf86cd799439011';
const OTHER_VALID_UNIT_ID = '507f1f77bcf86cd799439012';

const HARNESS_STATE = {
  unidadeUserBaseResult: null,
  unidadesByCondResult: null,
  unidadeUserBaseCalls: [],
  unidadesByCondCalls: [],
};

globalThis.__GESTOR_RECURSOS_CONTEXT_TENANT_AWARE_PROTECTION_STATE__ = HARNESS_STATE;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '#modules/gestor/app/repositories/UnidadeReadRepository.js') {
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
          'const state = globalThis.__GESTOR_RECURSOS_CONTEXT_TENANT_AWARE_PROTECTION_STATE__;',
          'export async function findUnidadeUserBaseLeanRepo(args) {',
          '  state.unidadeUserBaseCalls.push(args);',
          '  return state.unidadeUserBaseResult;',
          '}',
          'export async function findUnidadesByCondLeanRepo(args) {',
          '  state.unidadesByCondCalls.push(args);',
          '  return state.unidadesByCondResult;',
          '}',
        ].join('\n'),
      };
    }

    return nextLoad(url, context);
  },
});

after(() => {
  delete globalThis.__GESTOR_RECURSOS_CONTEXT_TENANT_AWARE_PROTECTION_STATE__;
});

function importFresh(filePath, token) {
  return import(`${pathToFileURL(filePath).href}?case=${token}`);
}

function resetHarness() {
  HARNESS_STATE.unidadeUserBaseResult = null;
  HARNESS_STATE.unidadesByCondResult = null;
  HARNESS_STATE.unidadeUserBaseCalls.length = 0;
  HARNESS_STATE.unidadesByCondCalls.length = 0;
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('service preserva a cadeia contextual esperada para recursos antes do facade', () => {
  const serviceSource = readText(SERVICE_FILE);

  assert.match(
    serviceSource,
    /findUnidadeUserBaseLean:\s*findUnidadeUserBaseLeanData[\s\S]*findUnidadesByCondLean:\s*findUnidadesByCondLeanData/,
    'o service deve continuar expondo o seam contextual pelos dois helpers do facade de recursos',
  );

  assert.match(
    serviceSource,
    /scopedUnitId:\s*unitScope\?\.unidadeId\s*\|\|\s*null/,
    'o service deve continuar carregando scopedUnitId antes de delegar a resolucao contextual',
  );

  assert.match(
    serviceSource,
    /requestedUnitId:\s*query\?\.unidadeId\s*\|\|\s*null/,
    'o service deve continuar carregando requestedUnitId antes de delegar a resolucao contextual',
  );
});

test('facade resolve leitura da unidade base com escopo contextual derivado do id', async () => {
  resetHarness();
  HARNESS_STATE.unidadeUserBaseResult = { _id: VALID_UNIT_ID, nome: 'Unidade A' };

  const { findUnidadeUserBaseLeanData } = await importFresh(FACADE_FILE, 'unidade-user-base-scope');
  const result = await findUnidadeUserBaseLeanData(VALID_UNIT_ID);

  assert.deepEqual(HARNESS_STATE.unidadeUserBaseCalls, [{
    unitScope: { type: 'unit', unidadeId: VALID_UNIT_ID },
    id: VALID_UNIT_ID,
  }]);
  assert.equal(result, HARNESS_STATE.unidadeUserBaseResult);
});

test('facade nao cai em GLOBAL_SCOPE quando o cond traz anchor unico confiavel', async () => {
  resetHarness();
  HARNESS_STATE.unidadesByCondResult = [{ _id: VALID_UNIT_ID }];

  const anchoredCond = {
    $or: [
      { _id: VALID_UNIT_ID },
      { unidade_principal_id: VALID_UNIT_ID },
      { matriz_id: VALID_UNIT_ID },
    ],
  };

  const { findUnidadesByCondLeanData } = await importFresh(FACADE_FILE, 'anchored-cluster-cond');
  const result = await findUnidadesByCondLeanData(anchoredCond);

  assert.deepEqual(HARNESS_STATE.unidadesByCondCalls, [{
    unitScope: { type: 'unit', unidadeId: VALID_UNIT_ID },
    cond: anchoredCond,
  }]);
  assert.equal(result, HARNESS_STATE.unidadesByCondResult);
});

test('facade mantem fallback global explicito e condicionado apenas a ausencia de anchor confiavel', async () => {
  resetHarness();
  HARNESS_STATE.unidadesByCondResult = [];

  const nonAnchoredCond = {
    $or: [
      { _id: VALID_UNIT_ID },
      { unidade_principal_id: OTHER_VALID_UNIT_ID },
      { matriz_id: VALID_UNIT_ID },
    ],
  };

  const { findUnidadesByCondLeanData } = await importFresh(FACADE_FILE, 'non-anchored-cluster-cond');
  const result = await findUnidadesByCondLeanData(nonAnchoredCond);

  assert.deepEqual(HARNESS_STATE.unidadesByCondCalls, [{
    unitScope: { type: 'global', unidadeId: null },
    cond: nonAnchoredCond,
  }]);
  assert.equal(result, HARNESS_STATE.unidadesByCondResult);
});

test('source contract mantem extractor estrito e fallback global apenas no ramo explicitamente condicionado', () => {
  const facadeSource = readText(FACADE_FILE);

  assert.match(
    facadeSource,
    /if \(!clauses \|\| clauses\.length !== 3\) return '';/,
    'o extractor deve continuar recusando cond sem exatamente tres clausulas ancoradas',
  );

  assert.match(
    facadeSource,
    /if \(matchedKeys\.size !== 3 \|\| anchors\.size !== 1\) return '';/,
    'o extractor deve continuar exigindo exatamente um anchor unico confiavel',
  );

  assert.match(
    facadeSource,
    /unitScope:\s*anchor\s*\?\s*scopeFromUnidadeId\(anchor\)\s*:\s*GLOBAL_SCOPE/,
    'o fallback global deve continuar explicitamente condicionado ao resultado do anchor, nunca incondicional',
  );

  assert.doesNotMatch(
    facadeSource,
    /findUnidadesByCondLeanRepo\(\{[\s\S]*unitScope:\s*GLOBAL_SCOPE,[\s\S]*cond,[\s\S]*\}\)/,
    'o source nao deve regredir para uma chamada incondicional em GLOBAL_SCOPE ignorando anchor confiavel',
  );
});