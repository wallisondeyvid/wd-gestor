import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const projectRoot = process.cwd();

const REPOSITORY_PATH = path.join(projectRoot, 'src/modules/gestor/app/repositories/FuncaoReadRepository.js');
const DATA_FACADE_PATH = path.join(projectRoot, 'src/modules/gestor/app/data/funcoes/funcoesReadDataFacade.js');
const SCOPE_PATH = path.join(projectRoot, 'src/modules/gestor/app/data/funcoes/funcoesScope.js');
const SERVICE_PATH = path.join(projectRoot, 'src/modules/gestor/app/services/funcoes/listarFuncoes.service.js');
const BASE_REPOSITORY_PATH = path.join(projectRoot, 'src/shared/repositories/BaseRepository.js');
const UNIT_SCOPE_PATH = path.join(projectRoot, 'src/shared/unitScope.js');

const REPOSITORY_SOURCE = fs.readFileSync(REPOSITORY_PATH, 'utf8');
const DATA_FACADE_SOURCE = fs.readFileSync(DATA_FACADE_PATH, 'utf8');
const SCOPE_SOURCE = fs.readFileSync(SCOPE_PATH, 'utf8');
const SERVICE_SOURCE = fs.readFileSync(SERVICE_PATH, 'utf8');
const BASE_REPOSITORY_SOURCE = fs.readFileSync(BASE_REPOSITORY_PATH, 'utf8');
const UNIT_SCOPE_SOURCE = fs.readFileSync(UNIT_SCOPE_PATH, 'utf8');

const VALID_UNIT_ID = '507f191e810c19729de860ea';

function normalize(value) {
  return JSON.parse(JSON.stringify(value));
}

function stripModuleSyntax(source) {
  return source
    .replace(/^import\s+[^;]+;\s*$/gm, '')
    .replace(/export\s+async\s+function\s+/g, 'async function ')
    .replace(/export\s+function\s+/g, 'function ')
    .replace(/export\s+const\s+/g, 'const ')
    .replace(/export\s+default\s+[^;]+;?/g, '');
}

function buildModule(source, dependencyNames, exportNames) {
  const transformedSource = stripModuleSyntax(source);
  const prologue = dependencyNames.map((name) => `const ${name} = __deps.${name};`).join('\n');
  const epilogue = `return { ${exportNames.join(', ')} };`;
  const script = new vm.Script(`(function(__deps) {\n${prologue}\n${transformedSource}\n${epilogue}\n})`);
  return script.runInNewContext({});
}

function createCreateUnitScope() {
  const factory = buildModule(UNIT_SCOPE_SOURCE, [], ['createUnitScope']);
  return factory({}).createUnitScope;
}

function createScopeModule(overrides = {}) {
  const factory = buildModule(SCOPE_SOURCE, ['mongoose', 'createUnitScope'], [
    'GLOBAL_SCOPE',
    'scopeFromUnidadeId',
    'extractSingleScopedUnitId',
    'scopeFromFuncaoFiltro',
  ]);

  const isValidObjectId = (value) => /^[0-9a-f]{24}$/i.test(String(value || '').trim());

  return factory({
    mongoose: overrides.mongoose ?? { isValidObjectId },
    createUnitScope: overrides.createUnitScope ?? createCreateUnitScope(),
  });
}

function createDataFacadeModule(overrides = {}) {
  const factory = buildModule(DATA_FACADE_SOURCE, [
    'findFuncoesByFiltroLeanRepo',
    'findFuncoesByFiltroSelectLeanRepo',
    'scopeFromFuncaoFiltro',
  ], [
    'findFuncoesByFiltroLeanData',
    'findFuncoesByFiltroSelectLeanData',
  ]);

  return factory({
    findFuncoesByFiltroLeanRepo: overrides.findFuncoesByFiltroLeanRepo,
    findFuncoesByFiltroSelectLeanRepo: overrides.findFuncoesByFiltroSelectLeanRepo,
    scopeFromFuncaoFiltro: overrides.scopeFromFuncaoFiltro,
  });
}

function createServiceModule(overrides = {}) {
  const factory = buildModule(SERVICE_SOURCE, [
    'findUnidadeUserBaseLean',
    'findFuncoesByFiltroLeanData',
    'findFuncoesByFiltroSelectLeanData',
    'createFuncaoContextPolicyCore',
  ], [
    'findFuncoesByFiltroService',
    'findFuncoesByFiltroSelectService',
    'listarFuncoesService',
  ]);

  return factory({
    findUnidadeUserBaseLean: overrides.findUnidadeUserBaseLean ?? (async () => null),
    findFuncoesByFiltroLeanData: overrides.findFuncoesByFiltroLeanData ?? (async () => []),
    findFuncoesByFiltroSelectLeanData: overrides.findFuncoesByFiltroSelectLeanData ?? (async () => []),
    createFuncaoContextPolicyCore: overrides.createFuncaoContextPolicyCore,
  });
}

test('FuncaoReadRepository congela o padrao atual resolveModel/unitScope e o corredor nao depende de superficies proibidas', () => {
  assert.doesNotMatch(REPOSITORY_SOURCE, /extends\s+BaseRepository/);
  assert.doesNotMatch(REPOSITORY_SOURCE, /import\s+\{\s*BaseRepository\s*\}/);
  assert.match(REPOSITORY_SOURCE, /resolveModel\s*\(\s*\{[\s\S]*unitScope/s);
  assert.match(REPOSITORY_SOURCE, /findFuncoesByFiltroLeanRepo\s*\([\s\S]*unitScope/s);
  assert.match(REPOSITORY_SOURCE, /findFuncoesByFiltroSelectLeanRepo\s*\([\s\S]*unitScope/s);
  assert.match(BASE_REPOSITORY_SOURCE, /class\s+BaseRepository/);
  assert.match(BASE_REPOSITORY_SOURCE, /assertTenantScope\s*\(/);

  const combinedSource = [REPOSITORY_SOURCE, DATA_FACADE_SOURCE, SCOPE_SOURCE, SERVICE_SOURCE].join('\n');

  assert.doesNotMatch(combinedSource, /unitDatabaseRegistry|tenantRegistry/i);
  assert.doesNotMatch(combinedSource, /harness|mongodb-memory-server|MONGO_MEMORY/i);
  assert.doesNotMatch(combinedSource, /portal-morador|#modules\/portal-morador/i);
  assert.doesNotMatch(combinedSource, /#routes\/|from\s+['"][^'"]*routes\//i);
  assert.doesNotMatch(combinedSource, /start\.js|server\.js|createServer\.js/i);
  assert.doesNotMatch(combinedSource, /scripts\/|process\.argv|bootstrap|cli|job/i);
  assert.doesNotMatch(combinedSource, /mongoose\.connect|createConnection|getConnectionForUnit/i);
  assert.doesNotMatch(combinedSource, /router\.(get|post|put|delete|patch|use)\(|app\.(get|post|put|delete|patch|use)\(/);
});

test('scopeFromFuncaoFiltro permanece como ponto canonico de derivacao de escopo com fallback global seguro', () => {
  const { GLOBAL_SCOPE, scopeFromFuncaoFiltro, scopeFromUnidadeId, extractSingleScopedUnitId } = createScopeModule();

  assert.deepEqual(normalize(GLOBAL_SCOPE), { type: 'global', unidadeId: null });
  assert.equal(extractSingleScopedUnitId(VALID_UNIT_ID), VALID_UNIT_ID);
  assert.equal(extractSingleScopedUnitId({ $in: [VALID_UNIT_ID, VALID_UNIT_ID] }), VALID_UNIT_ID);
  assert.equal(extractSingleScopedUnitId({ $in: [VALID_UNIT_ID, '507f191e810c19729de860eb'] }), '');
  assert.deepEqual(normalize(scopeFromUnidadeId(VALID_UNIT_ID)), { type: 'unit', unidadeId: VALID_UNIT_ID });
  assert.deepEqual(normalize(scopeFromFuncaoFiltro({ unidade_principal_id: VALID_UNIT_ID })), { type: 'unit', unidadeId: VALID_UNIT_ID });
  assert.deepEqual(normalize(scopeFromFuncaoFiltro({ unidade_principal_id: { $in: [VALID_UNIT_ID] } })), { type: 'unit', unidadeId: VALID_UNIT_ID });
  assert.deepEqual(normalize(scopeFromFuncaoFiltro({ unidade_principal_id: 'invalido' })), { type: 'global', unidadeId: null });
  assert.deepEqual(normalize(scopeFromFuncaoFiltro({ unidade_principal_id: { $in: [VALID_UNIT_ID, '507f191e810c19729de860eb'] } })), { type: 'global', unidadeId: null });
  assert.deepEqual(normalize(scopeFromFuncaoFiltro(null)), { type: 'global', unidadeId: null });
});

test('funcoesReadDataFacade propaga o escopo canonico para o repository sem abrir runtime externo', async () => {
  const repoCalls = [];
  const derivedScope = { type: 'unit', unidadeId: VALID_UNIT_ID };
  const module = createDataFacadeModule({
    findFuncoesByFiltroLeanRepo: async (input) => {
      repoCalls.push({ target: 'lean', input: normalize(input) });
      return [{ _id: 'f-1' }];
    },
    findFuncoesByFiltroSelectLeanRepo: async (input) => {
      repoCalls.push({ target: 'select', input: normalize(input) });
      return [{ _id: 'f-2' }];
    },
    scopeFromFuncaoFiltro: (filtro) => {
      repoCalls.push({ target: 'scope', input: normalize(filtro) });
      return derivedScope;
    },
  });

  const filtroLean = { unidade_principal_id: VALID_UNIT_ID, ativa: true };
  const filtroSelect = { unidade_principal_id: { $in: [VALID_UNIT_ID] } };

  const leanResult = await module.findFuncoesByFiltroLeanData(filtroLean);
  const selectResult = await module.findFuncoesByFiltroSelectLeanData(filtroSelect);

  assert.deepEqual(leanResult, [{ _id: 'f-1' }]);
  assert.deepEqual(selectResult, [{ _id: 'f-2' }]);
  assert.deepEqual(repoCalls, [
    { target: 'scope', input: filtroLean },
    { target: 'lean', input: { unitScope: derivedScope, filtro: filtroLean } },
    { target: 'scope', input: filtroSelect },
    { target: 'select', input: { unitScope: derivedScope, filtro: filtroSelect } },
  ]);
});

test('listarFuncoes.service preserva unitScope na resolucao de escopo e delega a leitura cluster ao corredor canonico', async () => {
  const buildListScopeCalls = [];
  const dataFacadeCalls = [];
  const module = createServiceModule({
    findFuncoesByFiltroLeanData: async (filtro) => {
      dataFacadeCalls.push(normalize(filtro));
      return [
        { _id: 'f-2', nome: 'Zelador', descricao: '', codigo: 'ZEL' },
        { _id: 'f-1', nome: 'Analista', descricao: 'Perfil analitico', codigo: 'ANA' },
      ];
    },
    createFuncaoContextPolicyCore: () => ({
      async buildListScope(input) {
        buildListScopeCalls.push(normalize(input));
        return {
          mode: 'cluster',
          empty: false,
          filter: { unidade_principal_id: VALID_UNIT_ID, ativa: true },
        };
      },
    }),
  });

  const result = await module.listarFuncoesService({
    query: { q: 'ana', unidade_cluster: VALID_UNIT_ID, unidade_id: 'filial-x' },
    unitScope: { type: 'unit', unidadeId: '507f191e810c19729de860eb' },
  });

  assert.deepEqual(buildListScopeCalls, [{
    scopedUnitId: '507f191e810c19729de860eb',
    unidadeCluster: VALID_UNIT_ID,
    unidadeIdRaw: 'filial-x',
  }]);
  assert.deepEqual(dataFacadeCalls, [{ unidade_principal_id: VALID_UNIT_ID, ativa: true }]);
  assert.deepEqual(normalize(result), [{
    _id: 'f-1',
    nome: 'Analista',
    descricao: 'Perfil analitico',
    codigo: 'ANA',
  }]);
});

test('listarFuncoes.service preserva fallback seguro quando o escopo nao produz leitura valida', async () => {
  const buildListScopeCalls = [];
  const dataFacadeCalls = [];
  let nextMode = 'unit-list';
  const module = createServiceModule({
    findFuncoesByFiltroSelectLeanData: async (filtro) => {
      dataFacadeCalls.push({ target: 'select', filtro: normalize(filtro) });
      return [{ _id: 'f-3', nome: 'Porteiro', descricao: '', codigo: 'POR' }];
    },
    findFuncoesByFiltroLeanData: async (filtro) => {
      dataFacadeCalls.push({ target: 'lean', filtro: normalize(filtro) });
      return [{ _id: 'f-4', nome: 'Nao deveria rodar', descricao: '', codigo: 'NDR' }];
    },
    createFuncaoContextPolicyCore: () => ({
      async buildListScope(input) {
        buildListScopeCalls.push(normalize(input));

        if (nextMode === 'unit-list') {
          return {
            mode: 'unit-list',
            empty: false,
            filter: { unidade_principal_id: { $in: [VALID_UNIT_ID] } },
          };
        }

        return {
          mode: 'desconhecido',
          empty: false,
          filter: null,
        };
      },
    }),
  });

  const unitListResult = await module.listarFuncoesService({ query: {}, unitScope: null });
  nextMode = 'desconhecido';
  const fallbackResult = await module.listarFuncoesService({ query: {}, unitScope: null });

  assert.deepEqual(buildListScopeCalls, [
    { scopedUnitId: null, unidadeCluster: null, unidadeIdRaw: null },
    { scopedUnitId: null, unidadeCluster: null, unidadeIdRaw: null },
  ]);
  assert.deepEqual(dataFacadeCalls, [
    { target: 'select', filtro: { unidade_principal_id: { $in: [VALID_UNIT_ID] } } },
  ]);
  assert.deepEqual(normalize(unitListResult), [{
    _id: 'f-3',
    codigo: 'POR',
    nome: 'Porteiro',
    descricao: '',
    descricao_display: 'Porteiro',
    descricao_final: 'Porteiro',
    hasDescricaoReal: false,
  }]);
  assert.deepEqual(normalize(fallbackResult), []);
});