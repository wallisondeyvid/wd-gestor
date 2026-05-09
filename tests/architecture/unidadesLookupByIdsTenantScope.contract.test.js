import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const PROJECT_ROOT = process.cwd();
const REPOSITORY_PATH = path.join(
  PROJECT_ROOT,
  'src/modules/gestor/app/repositories/UnidadeReadRepository.js',
);
const API_DB_PATH = path.join(
  PROJECT_ROOT,
  'src/modules/gestor/app/db/api.db.js',
);
const UNIT_SCOPE_PATH = path.join(PROJECT_ROOT, 'src/shared/unitScope.js');
const BASE_REPOSITORY_PATH = path.join(
  PROJECT_ROOT,
  'src/shared/repositories/BaseRepository.js',
);

const REPOSITORY_SOURCE = fs.readFileSync(REPOSITORY_PATH, 'utf8');
const API_DB_SOURCE = fs.readFileSync(API_DB_PATH, 'utf8');
const UNIT_SCOPE_SOURCE = fs.readFileSync(UNIT_SCOPE_PATH, 'utf8');
const BASE_REPOSITORY_SOURCE = fs.readFileSync(BASE_REPOSITORY_PATH, 'utf8');

function extractFunctionBlock(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `Nao encontrou assinatura: ${signature}`);

  const paramsEnd = source.indexOf(')', start);
  assert.ok(paramsEnd >= 0, `Nao encontrou fechamento de parametros para: ${signature}`);

  const braceStart = source.indexOf('{', paramsEnd);
  assert.ok(braceStart >= 0, `Nao encontrou bloco da assinatura: ${signature}`);

  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`Nao conseguiu extrair funcao: ${signature}`);
}

function buildFunction(source, signature, context = {}) {
  const functionSource = extractFunctionBlock(source, signature).replace(/^export\s+/, '');
  const script = new vm.Script(`(${functionSource})`);
  return script.runInNewContext(context);
}

function createGlobalScope() {
  return {
    type: 'global',
    unidadeId: null,
  };
}

function createScopedUnitIdExtractor() {
  return (input) => {
    if (input && typeof input === 'object' && !Array.isArray(input)) {
      const inValues = Array.isArray(input.$in)
        ? input.$in.map((value) => String(value || '').trim()).filter(Boolean)
        : [];
      return inValues.length === 1 ? inValues[0] : '';
    }

    if (Array.isArray(input)) {
      const values = input.map((value) => String(value || '').trim()).filter(Boolean);
      return values.length === 1 ? values[0] : '';
    }

    return String(input || '').trim();
  };
}

function assertSourceDoesNotContain(source, patterns, label) {
  for (const pattern of patterns) {
    assert.doesNotMatch(source, pattern, `${label} nao deve conter ${pattern}`);
  }
}

function toPlainJson(value) {
  return JSON.parse(JSON.stringify(value));
}

test('UnidadeReadRepository congela apenas o helper de lookup por ids com resolveModel e unitScope explicito sem forcar BaseRepository', () => {
  const helperBlock = extractFunctionBlock(
    REPOSITORY_SOURCE,
    'export async function findUnidadesByIdsNomeCodigoLeanRepo({ unitScope, unidadeIds })',
  );

  assert.match(helperBlock, /resolveModel\s*\(/);
  assert.match(helperBlock, /name:\s*Unidade\.modelName\s*\|\|\s*'Unidade'/);
  assert.match(helperBlock, /schema:\s*Unidade\.schema/);
  assert.match(helperBlock, /unitScope/);
  assert.match(helperBlock, /UnidadeModel\.find\(\{\s*_id:\s*\{\s*\$in:\s*unidadeIds\s*}\s*}\)\.select\('nome codigo'\)\.lean\(\)/);

  assert.match(REPOSITORY_SOURCE, /export async function findAllUnidadesLeanRepo/);
  assert.match(REPOSITORY_SOURCE, /export async function findClusterUnidadesByAnchorLeanRepo/);
  assert.match(REPOSITORY_SOURCE, /export async function findUnidadesForSetorPageByIdsSelectLeanRepo/);

  assertSourceDoesNotContain(
    helperBlock,
    [
      /findAllUnidadesLeanRepo/,
      /findAllUnidadesSelectIdCodigoNomeLeanRepo/,
      /findUnidadesForSetorPage/,
      /findClusterUnidadesByAnchorLeanRepo/,
      /findUnidadesByCondSelectCodigoNomeOrdenadasLeanRepo/,
      /findUnidadeByIdWithModulosAcessiveis/,
      /Feedback/i,
      /Setor/i,
      /Funcionario/i,
      /diretor/i,
      /bundle/i,
      /pagina/i,
    ],
    'findUnidadesByIdsNomeCodigoLeanRepo',
  );

  assert.match(BASE_REPOSITORY_SOURCE, /assertTenantScope\s*\(/);
  assert.doesNotMatch(REPOSITORY_SOURCE, /class\s+UnidadeReadRepository\s+extends\s+BaseRepository/);

  assertSourceDoesNotContain(
    REPOSITORY_SOURCE,
    [
      /createServer/i,
      /start\.js/i,
      /server\.js/i,
      /#routes\//i,
      /scripts\//i,
      /bootstrap/i,
      /unitDatabaseRegistry/i,
      /resolveConnection/i,
      /useDb/i,
      /getConnectionForUnit/i,
    ],
    'UnidadeReadRepository',
  );
});

test('api.db.findUnidadesByIdsNomeCodigoLean permanece bridge pequena para o helper e congela o fallback real scoped/global', async () => {
  const bridgeBlock = extractFunctionBlock(
    API_DB_SOURCE,
    'export async function findUnidadesByIdsNomeCodigoLean(unidadeIds, options = {})',
  );

  assert.match(bridgeBlock, /scopedUnitId/);
  assert.match(bridgeBlock, /extractSingleScopedUnitId\s*\(\{\s*\$in:\s*unidadeIds\s*}\)/);
  assert.match(bridgeBlock, /findUnidadesByIdsNomeCodigoLeanRepo/);
  assert.match(bridgeBlock, /scopeFromUnidadeId\(singleUnitId\)/);
  assert.match(bridgeBlock, /GLOBAL_SCOPE/);

  assertSourceDoesNotContain(
    bridgeBlock,
    [
      /findAllUnidadesLean/,
      /findAllUnidadesSelectIdCodigoNomeLean/,
      /findUnidadesForSetorPage/,
      /findClusterUnidadesByAnchorLean/,
      /findUnidadesByCondSelectCodigoNomeOrdenadasLean/,
      /findUsuariosDiretorAtivos/i,
      /Feedback/i,
      /Setor/i,
      /Funcionario/i,
      /bundle/i,
      /pagina/i,
    ],
    'api.db.findUnidadesByIdsNomeCodigoLean',
  );

  const calls = [];
  const findUnidadesByIdsNomeCodigoLean = buildFunction(
    API_DB_SOURCE,
    'export async function findUnidadesByIdsNomeCodigoLean(unidadeIds, options = {})',
    {
      String,
      GLOBAL_SCOPE: createGlobalScope(),
      extractSingleScopedUnitId: createScopedUnitIdExtractor(),
      scopeFromUnidadeId: (unidadeId) => ({ type: 'unit', unidadeId: String(unidadeId) }),
      findUnidadesByIdsNomeCodigoLeanRepo: async (args) => {
        calls.push(args);
        return [{ _id: 'un-1', nome: 'Unidade A', codigo: '001' }];
      },
    },
  );

  await findUnidadesByIdsNomeCodigoLean(['507f191e810c19729de860ea']);
  await findUnidadesByIdsNomeCodigoLean(
    ['507f191e810c19729de860ea', '507f191e810c19729de860eb'],
    { scopedUnitId: '507f191e810c19729de860ea' },
  );
  await findUnidadesByIdsNomeCodigoLean([
    '507f191e810c19729de860ea',
    '507f191e810c19729de860eb',
  ]);

  assert.equal(calls.length, 3);
  assert.deepEqual(toPlainJson(calls[0]), {
    unitScope: { type: 'unit', unidadeId: '507f191e810c19729de860ea' },
    unidadeIds: ['507f191e810c19729de860ea'],
  });
  assert.deepEqual(toPlainJson(calls[1]), {
    unitScope: { type: 'unit', unidadeId: '507f191e810c19729de860ea' },
    unidadeIds: ['507f191e810c19729de860ea', '507f191e810c19729de860eb'],
  });
  assert.deepEqual(toPlainJson(calls[2]), {
    unitScope: { type: 'global', unidadeId: null },
    unidadeIds: ['507f191e810c19729de860ea', '507f191e810c19729de860eb'],
  });
});

test('o corredor protegido nao depende de tenant registry, harness sintetico, server app, rotas, scripts, jobs ou bootstrap', () => {
  const repositoryBlock = extractFunctionBlock(
    REPOSITORY_SOURCE,
    'export async function findUnidadesByIdsNomeCodigoLeanRepo({ unitScope, unidadeIds })',
  );
  const bridgeBlock = extractFunctionBlock(
    API_DB_SOURCE,
    'export async function findUnidadesByIdsNomeCodigoLean(unidadeIds, options = {})',
  );
  const protectedSlice = `${repositoryBlock}\n${bridgeBlock}`;

  assertSourceDoesNotContain(
    protectedSlice,
    [
      /unitDatabaseRegistry/i,
      /registry/i,
      /resolveConnection/i,
      /useDb/i,
      /getConnectionForUnit/i,
      /withHarness/i,
      /seedTenant/i,
      /supertest/i,
      /createServer/i,
      /start\.js/i,
      /server\.js/i,
      /createServer\.js/i,
      /#routes\//i,
      /scripts\//i,
      /cli/i,
      /job/i,
      /bootstrap/i,
      /portal/i,
    ],
    'slice protegido de unidades por ids',
  );
});

test('o slice protegido nao expande para listagem completa, diretores, paginas, bundles, cluster ja fechado, Setores, Feedback ou Funcionarios', () => {
  const repositoryBlock = extractFunctionBlock(
    REPOSITORY_SOURCE,
    'export async function findUnidadesByIdsNomeCodigoLeanRepo({ unitScope, unidadeIds })',
  );
  const bridgeBlock = extractFunctionBlock(
    API_DB_SOURCE,
    'export async function findUnidadesByIdsNomeCodigoLean(unidadeIds, options = {})',
  );
  const protectedSlice = `${repositoryBlock}\n${bridgeBlock}`;

  assertSourceDoesNotContain(
    protectedSlice,
    [
      /findAllUnidadesLeanRepo/,
      /findAllUnidadesSelectIdCodigoNomeLeanRepo/,
      /findUnidadesForSetorPage/,
      /findClusterUnidadesByAnchorLeanRepo/,
      /findUsuariosDiretorAtivos/i,
      /diretor/i,
      /pagina/i,
      /bundle/i,
      /Setor/i,
      /Feedback/i,
      /Funcionario/i,
    ],
    'slice protegido de unidades por ids',
  );
});

test('unitScope canonico permanece compativel com o fallback congelado pela bridge sem exigir tenant DB real', () => {
  assert.match(UNIT_SCOPE_SOURCE, /export function createUnitScope\(\{ unidadeId }\)/);
  assert.match(UNIT_SCOPE_SOURCE, /type:\s*'unit'/);
  assert.match(UNIT_SCOPE_SOURCE, /type:\s*'global'/);
  assert.match(UNIT_SCOPE_SOURCE, /unidadeId:\s*null/);

  const bridgeBlock = extractFunctionBlock(
    API_DB_SOURCE,
    'export async function findUnidadesByIdsNomeCodigoLean(unidadeIds, options = {})',
  );
  assert.match(bridgeBlock, /scopeFromUnidadeId\(singleUnitId\)/);
  assert.match(bridgeBlock, /GLOBAL_SCOPE/);
  assert.doesNotMatch(bridgeBlock, /createUnitScope\(/);
  assert.doesNotMatch(bridgeBlock, /tenant db real|mongodb-memory-server|mongoose\.connect/i);
});