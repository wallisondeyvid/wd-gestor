import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test, { after } from 'node:test';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();

const REPOSITORY_PATH = path.join(ROOT, 'src/modules/gestor/app/repositories/UnidadeReadRepository.js');
const DATA_FACADE_PATH = path.join(ROOT, 'src/modules/gestor/app/data/unidades/unidadesClusterDataFacade.js');
const SERVICE_PATH = path.join(ROOT, 'src/modules/gestor/app/services/unidades/findClusterUnidadesByAnchor.service.js');
const API_DB_BRIDGE_PATH = path.join(ROOT, 'src/modules/gestor/app/services/apiDbBridgeService.js');
const CONTROLLER_PATH = path.join(ROOT, 'src/modules/gestor/app/controllers/miscApiController.js');
const API_DB_PATH = path.join(ROOT, 'src/modules/gestor/app/db/api.db.js');
const BASE_REPOSITORY_PATH = path.join(ROOT, 'src/shared/repositories/BaseRepository.js');
const UNIT_SCOPE_PATH = path.join(ROOT, 'src/shared/unitScope.js');

const repositorySource = fs.readFileSync(REPOSITORY_PATH, 'utf8');
const dataFacadeSource = fs.readFileSync(DATA_FACADE_PATH, 'utf8');
const serviceSource = fs.readFileSync(SERVICE_PATH, 'utf8');
const apiDbBridgeSource = fs.readFileSync(API_DB_BRIDGE_PATH, 'utf8');
const controllerSource = fs.readFileSync(CONTROLLER_PATH, 'utf8');
const apiDbSource = fs.readFileSync(API_DB_PATH, 'utf8');
const baseRepositorySource = fs.readFileSync(BASE_REPOSITORY_PATH, 'utf8');
const unitScopeSource = fs.readFileSync(UNIT_SCOPE_PATH, 'utf8');

const MONGOOSE_MOCK_MODULE_URL = 'mock:unidades-cluster-tenant-scope-mongoose';
const REPOSITORY_MOCK_MODULE_URL = 'mock:unidades-cluster-tenant-scope-repository';
const DATA_FACADE_MOCK_MODULE_URL = 'mock:unidades-cluster-tenant-scope-data-facade';

const repoState = { calls: [] };
const facadeState = { calls: [] };

globalThis.__UNIDADES_CLUSTER_TENANT_SCOPE_REPO_STATE__ = repoState;
globalThis.__UNIDADES_CLUSTER_TENANT_SCOPE_FACADE_STATE__ = facadeState;

function capture(value) {
  return JSON.parse(JSON.stringify(value));
}

function extractFunctionBlock(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `Nao foi possivel localizar a assinatura: ${signature}`);

  const signatureEnd = source.indexOf(')', start + signature.length - 1);
  assert.ok(signatureEnd >= 0, `Nao foi possivel localizar o fechamento da assinatura: ${signature}`);

  const braceStart = source.indexOf('{', signatureEnd);
  assert.ok(braceStart >= 0, `Nao foi possivel localizar a abertura da funcao: ${signature}`);

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

  throw new Error(`Nao foi possivel extrair a funcao: ${signature}`);
}

function extractArrowFunctionBlock(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `Nao foi possivel localizar a assinatura: ${signature}`);

  const braceStart = source.indexOf('{', start);
  assert.ok(braceStart >= 0, `Nao foi possivel localizar a abertura do bloco: ${signature}`);

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

  throw new Error(`Nao foi possivel extrair o bloco: ${signature}`);
}

function importFresh(modulePath, tag) {
  return import(`${pathToFileURL(modulePath).href}?case=${encodeURIComponent(tag)}-${Date.now()}`);
}

function resetStates() {
  repoState.calls.length = 0;
  facadeState.calls.length = 0;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'mongoose') {
      return { url: MONGOOSE_MOCK_MODULE_URL, shortCircuit: true };
    }

    if (specifier === '#modules/gestor/app/repositories/UnidadeReadRepository.js') {
      return { url: REPOSITORY_MOCK_MODULE_URL, shortCircuit: true };
    }

    if (specifier === '#modules/gestor/app/data/unidades/unidadesClusterDataFacade.js') {
      return { url: DATA_FACADE_MOCK_MODULE_URL, shortCircuit: true };
    }

    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === MONGOOSE_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'class ObjectIdMock {',
          '  constructor(value) { this.value = String(value || ""); }',
          '  toJSON() { return { $oid: this.value }; }',
          '}',
          'const mongoose = {',
          '  Types: {',
          '    ObjectId: ObjectIdMock,',
          '  },',
          '};',
          'mongoose.Types.ObjectId.isValid = (value) => /^[a-fA-F0-9]{24}$/.test(String(value || "").trim());',
          'export default mongoose;',
        ].join('\n'),
      };
    }

    if (url === REPOSITORY_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'const state = globalThis.__UNIDADES_CLUSTER_TENANT_SCOPE_REPO_STATE__ || { calls: [] };',
          'const capture = (value) => JSON.parse(JSON.stringify(value));',
          'export async function findClusterUnidadesByAnchorLeanRepo(args) {',
          '  state.calls.push(capture(args));',
          '  return [{ ok: true, anchor: args?.unitScope?.unidadeId || null }];',
          '}',
        ].join('\n'),
      };
    }

    if (url === DATA_FACADE_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'const state = globalThis.__UNIDADES_CLUSTER_TENANT_SCOPE_FACADE_STATE__ || { calls: [] };',
          'export async function findClusterUnidadesByAnchorLeanData(anchorRaw) {',
          '  state.calls.push(anchorRaw);',
          '  return [{ delegated: true, anchorRaw }];',
          '}',
          'export default findClusterUnidadesByAnchorLeanData;',
        ].join('\n'),
      };
    }

    return nextLoad(url, context);
  },
});

after(() => {
  delete globalThis.__UNIDADES_CLUSTER_TENANT_SCOPE_REPO_STATE__;
  delete globalThis.__UNIDADES_CLUSTER_TENANT_SCOPE_FACADE_STATE__;
});

test('UnidadeReadRepository congela o helper de cluster com resolveModel, unitScope explicito e sem migracao forcada para BaseRepository', () => {
  const helperBlock = extractFunctionBlock(
    repositorySource,
    'export async function findClusterUnidadesByAnchorLeanRepo({ unitScope, conds })',
  );

  assert.match(helperBlock, /resolveModel\s*\(/);
  assert.match(helperBlock, /unitScope,/);
  assert.match(helperBlock, /UnidadeModel\.find\(\{\s*\$or:\s*conds\s*\}\)\.lean\(\)/);
  assert.doesNotMatch(helperBlock, /extends\s+BaseRepository|new\s+BaseRepository|applyTenantFilter\s*\(/);
  assert.doesNotMatch(repositorySource, /from '#shared\/repositories\/BaseRepository\.js'/);
  assert.match(baseRepositorySource, /export class BaseRepository/);
  assert.match(unitScopeSource, /type:\s*'unit'/);
  assert.match(unitScopeSource, /type:\s*'global'/);
});

test('unidadesClusterDataFacade deriva unitScope explicito da ancora e mantem a ponte pequena para o repository', async () => {
  resetStates();
  const module = await importFresh(DATA_FACADE_PATH, 'data-facade');
  const anchor = '507f191e810c19729de860ea';

  const result = await module.findClusterUnidadesByAnchorLeanData(anchor);

  assert.deepEqual(result, [{ ok: true, anchor }]);
  assert.deepEqual(repoState.calls, [
    {
      unitScope: { type: 'unit', unidadeId: anchor },
      conds: [
        { _id: { $oid: anchor } },
        { matriz_id: { $oid: anchor } },
        { unidade_principal_id: { $oid: anchor } },
        { _id: anchor },
        { matriz_id: anchor },
        { unidade_principal_id: anchor },
      ],
    },
  ]);

  const helperBlock = extractFunctionBlock(
    dataFacadeSource,
    'export async function findClusterUnidadesByAnchorLeanData(anchorRaw)',
  );
  assert.match(helperBlock, /if \(!anchor\) return \[\]/);
  assert.match(helperBlock, /findClusterUnidadesByAnchorLeanRepo\(\{ unitScope: scopeFromAnchor\(anchor\), conds \}\)/);
  assert.doesNotMatch(helperBlock, /tenantRegistry|harness|Portal|createServer|mongoose\.connect|createConnection|process\.argv/i);
});

test('unidadesClusterDataFacade exige ancora explicita e nao inventa fallback artificial quando a ancora nao vem', async () => {
  resetStates();
  const module = await importFresh(DATA_FACADE_PATH, 'data-facade-empty');

  const result = await module.findClusterUnidadesByAnchorLeanData('   ');

  assert.deepEqual(result, []);
  assert.deepEqual(repoState.calls, []);
});

test('findClusterUnidadesByAnchor.service permanece service fino e delega para a facade atual', async () => {
  resetStates();
  const module = await importFresh(SERVICE_PATH, 'service');

  const result = await module.findClusterUnidadesByAnchorService('anchor-service-001');

  assert.deepEqual(result, [{ delegated: true, anchorRaw: 'anchor-service-001' }]);
  assert.deepEqual(facadeState.calls, ['anchor-service-001']);

  const serviceBlock = extractFunctionBlock(
    serviceSource,
    'export async function findClusterUnidadesByAnchorService(anchorRaw)',
  );
  assert.match(serviceBlock, /return findClusterUnidadesByAnchorLeanData\(anchorRaw\);/);
  assert.doesNotMatch(serviceBlock, /tenantRegistry|harness|Portal|createServer|mongoose\.connect|createConnection|process\.argv/i);
});

test('api.db, apiDbBridgeService e miscApiController congelam a bridge compatível do corredor sem criar superficie operacional nova', () => {
  const apiDbCompatBlock = extractFunctionBlock(
    apiDbSource,
    'export async function findClusterUnidadesByAnchorLean(anchorRaw)',
  );
  const apiDbDirectBlock = extractFunctionBlock(
    apiDbSource,
    'export async function findClusterUnidadesByAnchorLeanFromDb(anchorRaw)',
  );
  const controllerBlock = extractFunctionBlock(
    controllerSource,
    'export async function obterClusterUnidades(req,res)',
  );
  const anchorHelperBlock = extractFunctionBlock(
    controllerSource,
    'async function resolveClusterAnchor(unidadeId)',
  );

  assert.match(apiDbSource, /import \{ findClusterUnidadesByAnchorService \} from '#modules\/gestor\/app\/services\/unidades\/findClusterUnidadesByAnchor\.service\.js';/);
  assert.match(apiDbCompatBlock, /return findClusterUnidadesByAnchorService\(anchorRaw\);/);
  assert.match(apiDbDirectBlock, /if \(!anchor\) return \[\];/);
  assert.match(apiDbDirectBlock, /findClusterUnidadesByAnchorLeanRepo\(\{ unitScope: scopeFromUnidadeId\(anchor\), conds \}\)/);
  assert.match(anchorHelperBlock, /return \{ base, anchor: normalizeUnitId\(base\.matriz_id \|\| base\.unidade_principal_id \|\| base\._id\) \};/);
  assert.match(controllerBlock, /const unidades = await findClusterUnidadesByAnchorLean\(clusterAnchor\);/);
  assert.match(controllerBlock, /if\s*\(!isPrivileged\)/);
  assert.doesNotMatch(controllerBlock, /Router\(|express\.|app\.(get|post|put|delete|use)\(/);
  assert.doesNotMatch(apiDbBridgeSource, /Router\(|express\.|app\.(get|post|put|delete|use)\(/);
  assert.match(apiDbBridgeSource, /export \* from '#modules\/gestor\/app\/services\/legacy\/apiDbBridgeService\.js';/);
  assert.doesNotMatch(apiDbCompatBlock, /Feedback|Setor|Funcionario|bundle|diretor|pagina/i);
  assert.doesNotMatch(controllerBlock, /tenantRegistry|harness|Portal|start\.js|server\.js|createServer|process\.argv|mongoose\.connect|createConnection|MONGO_URI|MONGODB_URI|postgres/i);
});

test('o slice principal de cluster evita dependencias operacionais proibidas e nao expande para dominios adjacentes', () => {
  const sliceSources = [
    { name: 'UnidadeReadRepository', source: extractFunctionBlock(repositorySource, 'export async function findClusterUnidadesByAnchorLeanRepo({ unitScope, conds })') },
    { name: 'unidadesClusterDataFacade', source: extractArrowFunctionBlock(dataFacadeSource, 'function scopeFromAnchor(anchor)') + '\n' + extractFunctionBlock(dataFacadeSource, 'export async function findClusterUnidadesByAnchorLeanData(anchorRaw)') },
    { name: 'findClusterUnidadesByAnchor.service', source: extractFunctionBlock(serviceSource, 'export async function findClusterUnidadesByAnchorService(anchorRaw)') },
    { name: 'api.db bridge', source: extractFunctionBlock(apiDbSource, 'export async function findClusterUnidadesByAnchorLean(anchorRaw)') + '\n' + extractFunctionBlock(apiDbSource, 'export async function findClusterUnidadesByAnchorLeanFromDb(anchorRaw)') },
    { name: 'miscApiController cluster', source: extractFunctionBlock(controllerSource, 'async function resolveClusterAnchor(unidadeId)') + '\n' + extractFunctionBlock(controllerSource, 'export async function obterClusterUnidades(req,res)') },
  ];

  for (const { name, source } of sliceSources) {
    assert.doesNotMatch(source, /tenantRegistry|ModelRegistry|syntheticHarness|harness sintetico|Portal|start\.js|server\.js|createServer|bootstrap|process\.argv|mongoose\.connect|createConnection|MONGO_URI|MONGODB_URI|postgres|pg\b/i, `${name} nao deve depender de superficie operacional proibida`);
    assert.doesNotMatch(source, /loadPaginaUnidadesBundle|findUsuariosDiretorAtivos|Feedback|Setor(ReadRepository)?|FuncionarioRepository|funcionarios|widgetSettings|pagesController/i, `${name} nao deve expandir para dominios adjacentes no slice principal`);
  }
});