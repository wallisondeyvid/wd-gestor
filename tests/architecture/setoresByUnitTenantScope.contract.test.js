import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test, { after, beforeEach } from 'node:test';
import { registerHooks } from 'node:module';

const PROJECT_ROOT = process.cwd();
const SETOR_REPOSITORY_PATH = path.join(PROJECT_ROOT, 'src/modules/gestor/app/repositories/SetorReadRepository.js');
const API_DB_PATH = path.join(PROJECT_ROOT, 'src/modules/gestor/app/db/api.db.js');
const CORE_PATH = path.join(PROJECT_ROOT, 'src/modules/gestor/app/controllers/utils/getSetoresByUnitCore.js');
const CONTROLLER_PATH = path.join(PROJECT_ROOT, 'src/modules/gestor/app/controllers/setorApiController.js');
const UNIT_SCOPE_PATH = path.join(PROJECT_ROOT, 'src/shared/unitScope.js');
const BASE_REPOSITORY_PATH = path.join(PROJECT_ROOT, 'src/shared/repositories/BaseRepository.js');

const SETOR_REPOSITORY_SOURCE = fs.readFileSync(SETOR_REPOSITORY_PATH, 'utf8');
const API_DB_SOURCE = fs.readFileSync(API_DB_PATH, 'utf8');
const CORE_SOURCE = fs.readFileSync(CORE_PATH, 'utf8');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');
const UNIT_SCOPE_SOURCE = fs.readFileSync(UNIT_SCOPE_PATH, 'utf8');
const BASE_REPOSITORY_SOURCE = fs.readFileSync(BASE_REPOSITORY_PATH, 'utf8');

const REPOSITORY_MOCK_MODULE_URL = 'mock:setores-by-unit-tenant-scope-repository';

const repositoryState = {
  byUnitCalls: [],
};

globalThis.__SETORES_BY_UNIT_TENANT_SCOPE_STATE__ = repositoryState;

function capture(value) {
  return JSON.parse(JSON.stringify(value));
}

function extractFunctionBlock(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `Nao foi possivel localizar a assinatura: ${signature}`);

  const parenStart = source.indexOf('(', start);
  assert.ok(parenStart > start, `Nao foi possivel localizar a abertura da assinatura: ${signature}`);

  let parenDepth = 0;
  let closingParenIndex = -1;
  for (let index = parenStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '(') parenDepth += 1;
    if (char === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        closingParenIndex = index;
        break;
      }
    }
  }

  assert.ok(closingParenIndex > parenStart, `Nao foi possivel localizar o fechamento da assinatura: ${signature}`);

  const signatureEnd = source.indexOf('{', closingParenIndex);
  assert.ok(signatureEnd > closingParenIndex, `Nao foi possivel localizar a abertura do bloco: ${signature}`);

  let depth = 0;
  for (let index = signatureEnd; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) {
      return source.slice(start, index + 1);
    }
  }

  throw new Error(`Nao foi possivel extrair o bloco completo: ${signature}`);
}

function resetRepositoryState() {
  repositoryState.byUnitCalls.length = 0;
}

async function importFresh(modulePath, tag) {
  const moduleUrl = pathToFileURL(modulePath).href;
  return import(`${moduleUrl}?case=${encodeURIComponent(tag)}-${Date.now()}`);
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '#modules/gestor/app/repositories/SetorReadRepository.js') {
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
          'const state = globalThis.__SETORES_BY_UNIT_TENANT_SCOPE_STATE__ || { byUnitCalls: [] };',
          'const capture = (value) => JSON.parse(JSON.stringify(value));',
          'export async function findSetorByUnidadeAndNomeNormalizadoLeanRepo() { return null; }',
          'export async function findSetoresByUnidadeIdPopulateLeanRepo(args) { state.byUnitCalls.push(capture(args)); return []; }',
          'export async function createSetorRepo() { return null; }',
          'export async function findSetorByIdPopulateUnidadeRepo() { return null; }',
          'export async function findSetorByIdRepo() { return null; }',
          'export async function findSetorDupByNomeNormalizadoExcludingIdRepo() { return null; }',
          'export async function findSetoresByFiltroPopulateUnidadeLeanRepo() { return []; }',
          'export async function findSetoresAtivosPopulateUnidadeOrdenadosLeanRepo() { return []; }',
          'export async function findSetoresByCondDescricaoPopulateUnidadeOrdenadosLeanRepo() { return []; }',
          'export async function findSetorByIdAndDeleteRepo() { return null; }',
          'export async function findMaxSetorCodigoLeanRepo() { return []; }',
          'export async function findSetoresAtivosNomeOrdenadosSelectLeanRepo() { return []; }',
          'export async function findSetoresByCondNomeOrdenadosSelectLeanRepo() { return []; }',
          'export async function findCounterSetorCodigoLeanRepo() { return null; }',
          'export async function findOneAndUpdateCounterSetorCodigoRepo() { return null; }',
        ].join('\n'),
      };
    }

    return nextLoad(url, context, nextLoad);
  },
});

beforeEach(() => {
  resetRepositoryState();
});

after(() => {
  delete globalThis.__SETORES_BY_UNIT_TENANT_SCOPE_STATE__;
});

test('SetorReadRepository congela o helper por unidade com resolveModel e unitScope explicito sem forcar BaseRepository', () => {
  const helperBlock = extractFunctionBlock(
    SETOR_REPOSITORY_SOURCE,
    'export async function findSetoresByUnidadeIdPopulateLeanRepo({ unitScope, unidadeId })'
  );

  assert.match(helperBlock, /resolveModel\s*\(/);
  assert.match(helperBlock, /unitScope/);
  assert.match(helperBlock, /find\(\{ unidade_id: unidadeId \}\)\.populate\('unidade_id'\)\.lean\(\)/);
  assert.doesNotMatch(helperBlock, /BaseRepository/);
  assert.doesNotMatch(helperBlock, /findSetoresByFiltroPopulateUnidadeLeanRepo|createSetorRepo|findSetorByIdAndDeleteRepo|findOneAndUpdateCounterSetorCodigoRepo/);

  assert.match(UNIT_SCOPE_SOURCE, /type:\s*'unit'/);
  assert.match(UNIT_SCOPE_SOURCE, /type:\s*'global'/);
  assert.match(BASE_REPOSITORY_SOURCE, /assertTenantScope\s*\(/);
  assert.match(BASE_REPOSITORY_SOURCE, /applyTenantFilter\s*\(/);
  assert.doesNotMatch(SETOR_REPOSITORY_SOURCE, /class\s+SetorReadRepository\s+extends\s+BaseRepository/);
});

test('api.db preserva bridge pequena por unidade e delega ao repository com createUnitScope explicito', async () => {
  const bridgeBlock = extractFunctionBlock(
    API_DB_SOURCE,
    'export async function findSetoresByUnidadeIdPopulateLean(unidadeId)'
  );

  assert.match(bridgeBlock, /findSetoresByUnidadeIdPopulateLeanRepo/);
  assert.match(bridgeBlock, /createUnitScope\(\{ unidadeId \}\)/);
  assert.doesNotMatch(bridgeBlock, /findSetoresByFiltroPopulateUnidadeLean|findCounterSetorCodigoLean|findOneAndUpdateCounterSetorCodigo|loadPaginaSetoresBundle/);

  const { findSetoresByUnidadeIdPopulateLean } = await importFresh(API_DB_PATH, 'api-db-bridge');
  await findSetoresByUnidadeIdPopulateLean('u-tenant-1');

  assert.deepEqual(repositoryState.byUnitCalls, [
    {
      unitScope: { type: 'unit', unidadeId: 'u-tenant-1' },
      unidadeId: 'u-tenant-1',
    },
  ]);
});

test('getSetoresByUnitCore permanece core fino e so delega a leitura por unidade', async () => {
  const coreBlock = extractFunctionBlock(
    CORE_SOURCE,
    'export async function getSetoresByUnitCore({'
  );

  assert.match(coreBlock, /return findSetoresByUnidadeIdPopulateLean\(effectiveUnitId\)/);
  assert.doesNotMatch(coreBlock, /req\.|res\.|listSetoresCore|loadPaginaSetoresBundle|findSetoresByFiltroPopulateUnidadeLean/);

  const { getSetoresByUnitCore } = await importFresh(CORE_PATH, 'core-thin');
  const calls = [];
  const result = await getSetoresByUnitCore({
    effectiveUnitId: 'u-tenant-2',
    findSetoresByUnidadeIdPopulateLean: async (effectiveUnitId) => {
      calls.push(effectiveUnitId);
      return [{ _id: 'setor-1', unidade_id: effectiveUnitId }];
    },
  });

  assert.deepEqual(calls, ['u-tenant-2']);
  assert.deepEqual(result, [{ _id: 'setor-1', unidade_id: 'u-tenant-2' }]);
});

test('setorApiController expoe o corredor por unidade sem criar superficie operacional nova', () => {
  const controllerBlock = extractFunctionBlock(
    CONTROLLER_SOURCE,
    'export async function getSetoresPorUnidade(req,res)'
  );

  assert.match(controllerBlock, /getCanonicalContextUnitId\(req\)\s*\|\|\s*normalizeUnitId\(req\.params\.unidadeId\)/);
  assert.match(controllerBlock, /getSetoresByUnitCore\s*\(\{/);
  assert.match(controllerBlock, /findSetoresByUnidadeIdPopulateLean/);
  assert.doesNotMatch(controllerBlock, /listSetoresCore|loadPaginaSetoresBundle|findSetoresByFiltroPopulateUnidadeLean|createSetorDb|deleteSetorScopedService|updateSetorScopedService/);
  assert.doesNotMatch(controllerBlock, /router\.|express\(|app\.|createServer|start\.js|server\.js/);
});

test('o slice protegido evita tenant registry, harness sintetico, Portal, rotas novas e tenant DB real', () => {
  const helperBlock = extractFunctionBlock(
    SETOR_REPOSITORY_SOURCE,
    'export async function findSetoresByUnidadeIdPopulateLeanRepo({ unitScope, unidadeId })'
  );
  const bridgeBlock = extractFunctionBlock(
    API_DB_SOURCE,
    'export async function findSetoresByUnidadeIdPopulateLean(unidadeId)'
  );
  const controllerBlock = extractFunctionBlock(
    CONTROLLER_SOURCE,
    'export async function getSetoresPorUnidade(req,res)'
  );
  const combinedSlice = [helperBlock, bridgeBlock, CORE_SOURCE, controllerBlock].join('\n');

  assert.doesNotMatch(combinedSlice, /tenantRegistry|ModelRegistry|SyntheticHarness|syntheticHarness|getConnectionForUnit|baseConnection|createConnection|mongoose\.connect|MONGO_URI|MONGODB_URI/i);
  assert.doesNotMatch(combinedSlice, /portal|router\.get|router\.post|Start-Job|process\.argv|scripts\//i);
  assert.doesNotMatch(combinedSlice, /loadPaginaSetoresBundle|findSetoresByFiltroPopulateUnidadeLean|findCounterSetorCodigoLean|findOneAndUpdateCounterSetorCodigo|createSetorRepo|findSetorByIdAndDeleteRepo/);
  assert.doesNotMatch(combinedSlice, /Feedback|UnidadeReadRepository|FuncionarioRepository/);
});