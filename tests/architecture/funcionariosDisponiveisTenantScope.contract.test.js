import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const REPOSITORY_PATH = path.join(process.cwd(), 'src/modules/gestor/app/repositories/FuncionarioRepository.js');
const API_DB_PATH = path.join(process.cwd(), 'src/modules/gestor/app/db/api.db.js');
const BUNDLE_SERVICE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/services/funcionarios/loadPaginaFuncionariosBundle.service.js');
const BUNDLE_DATA_PATH = path.join(process.cwd(), 'src/modules/gestor/app/data/funcionarios/funcionariosPageBundleDataFacade.js');
const BASE_REPOSITORY_PATH = path.join(process.cwd(), 'src/shared/repositories/BaseRepository.js');
const UNIT_SCOPE_PATH = path.join(process.cwd(), 'src/shared/unitScope.js');

const REPOSITORY_SOURCE = fs.readFileSync(REPOSITORY_PATH, 'utf8');
const API_DB_SOURCE = fs.readFileSync(API_DB_PATH, 'utf8');
const BUNDLE_SERVICE_SOURCE = fs.readFileSync(BUNDLE_SERVICE_PATH, 'utf8');
const BUNDLE_DATA_SOURCE = fs.readFileSync(BUNDLE_DATA_PATH, 'utf8');
const BASE_REPOSITORY_SOURCE = fs.readFileSync(BASE_REPOSITORY_PATH, 'utf8');
const UNIT_SCOPE_SOURCE = fs.readFileSync(UNIT_SCOPE_PATH, 'utf8');

function extractFunction(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `Nao encontrou assinatura: ${signature}`);

  const paramsEnd = source.indexOf(')', start);
  assert.ok(paramsEnd >= 0, `Nao encontrou fechamento de parametros para: ${signature}`);

  const braceStart = source.indexOf('{', paramsEnd);
  assert.ok(braceStart >= 0, `Nao encontrou bloco para: ${signature}`);

  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1).replace(/^export\s+/, '');
      }
    }
  }

  throw new Error(`Nao conseguiu extrair funcao: ${signature}`);
}

function buildFunction(source, signature, context = {}) {
  const functionSource = extractFunction(source, signature);
  const script = new vm.Script(`(${functionSource})`);
  return script.runInNewContext(context);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getFunctionBlock(source, signature) {
  return extractFunction(source, signature);
}

function assertSourceDoesNotContain(source, terms, contextLabel) {
  for (const term of terms) {
    const pattern = new RegExp(escapeRegExp(term), 'i');
    assert.equal(
      pattern.test(source),
      false,
      `${contextLabel} nao deve conter referencia a ${term}`,
    );
  }
}

test('slice de funcionarios disponiveis permanece restrito ao helper de leitura com resolveModel e unitScope explicito', () => {
  const repoBlock = getFunctionBlock(
    REPOSITORY_SOURCE,
    'export async function findFuncionariosDisponiveisByUnidadeLeanRepo',
  );

  assert.match(REPOSITORY_SOURCE, /import\s+\{\s*resolveModel\s*\}\s+from\s+'#shared\/db\/resolveModel\.js';/);
  assert.match(repoBlock, /resolveModel\s*\(/);
  assert.match(repoBlock, /unitScope\s*,/);
  assert.match(repoBlock, /unidade_id:\s*unidadeId/);
  assert.match(repoBlock, /usuario_id/);
  assert.match(repoBlock, /select\('_id nome cpf email'\)/);
  assert.match(repoBlock, /sort\(\{\s*nome:\s*1\s*\}\)/);
  assert.match(repoBlock, /lean\(\)/);

  assert.doesNotMatch(REPOSITORY_SOURCE, /extends\s+BaseRepository/);
  assert.doesNotMatch(REPOSITORY_SOURCE, /from\s+'#shared\/repositories\/BaseRepository\.js'/);

  const baseRepositoryRelevant = BASE_REPOSITORY_SOURCE.includes('applyTenantFilter');
  assert.equal(baseRepositoryRelevant, true);
});

test('api.db.findFuncionariosDisponiveisByUnidadeLean permanece bridge fino com createUnitScope explicito por unidade', async () => {
  const bridgeBlock = getFunctionBlock(
    API_DB_SOURCE,
    'export async function findFuncionariosDisponiveisByUnidadeLean',
  );

  assert.match(API_DB_SOURCE, /import\s+\{\s*createUnitScope\s*\}\s+from\s+'#shared\/unitScope\.js';/);
  assert.match(bridgeBlock, /findFuncionariosDisponiveisByUnidadeLeanRepo\s*\(/);
  assert.match(bridgeBlock, /createUnitScope\s*\(\s*\{\s*unidadeId\s*\}\s*\)/);
  assert.doesNotMatch(bridgeBlock, /GLOBAL_SCOPE/);
  assert.doesNotMatch(bridgeBlock, /scopeFromUnidadeId/);

  const calls = [];
  const findFuncionariosDisponiveisByUnidadeLean = buildFunction(
    API_DB_SOURCE,
    'export async function findFuncionariosDisponiveisByUnidadeLean',
    {
      createUnitScope: ({ unidadeId }) => ({ type: 'unit', unidadeId: String(unidadeId) }),
      findFuncionariosDisponiveisByUnidadeLeanRepo: async (args) => {
        calls.push(JSON.parse(JSON.stringify(args)));
        return [{ _id: 'func-1' }];
      },
    },
  );

  const result = await findFuncionariosDisponiveisByUnidadeLean('507f191e810c19729de860ea');

  assert.deepEqual(result, [{ _id: 'func-1' }]);
  assert.deepEqual(calls, [
    {
      unitScope: { type: 'unit', unidadeId: '507f191e810c19729de860ea' },
      unidadeId: '507f191e810c19729de860ea',
    },
  ]);
});

test('corredor congelado nao depende de tenant registry, harness sintetico, Portal, rotas, server, scripts ou conexao real', () => {
  const repoBlock = getFunctionBlock(
    REPOSITORY_SOURCE,
    'export async function findFuncionariosDisponiveisByUnidadeLeanRepo',
  );
  const bridgeBlock = getFunctionBlock(
    API_DB_SOURCE,
    'export async function findFuncionariosDisponiveisByUnidadeLean',
  );

  const forbiddenTerms = [
    'tenant registry',
    'harness',
    'Portal',
    '#routes/',
    'createServer',
    'server.js',
    'start.js',
    'process.argv',
    'mongoose.connect',
    'createConnection',
    'MONGO_URI',
    'MONGODB_URI',
    'PostgreSQL',
    'pg',
    'bootstrap',
    'job',
    'CLI',
  ];

  assertSourceDoesNotContain(repoBlock, forbiddenTerms, 'helper do repository');
  assertSourceDoesNotContain(bridgeBlock, forbiddenTerms, 'bridge api.db');
  assertSourceDoesNotContain(API_DB_SOURCE, ['#routes/', '#server/', '#mail/', 'createServer'], 'api.db');
  assertSourceDoesNotContain(REPOSITORY_SOURCE, ['#routes/', '#server/', 'mongoose.connect', 'createConnection'], 'FuncionarioRepository');
});

test('microcorte nao expande para page bundle, CRUD, anexos, biometria, auto-user flow, controller ou request path', () => {
  const bridgeBlock = getFunctionBlock(
    API_DB_SOURCE,
    'export async function findFuncionariosDisponiveisByUnidadeLean',
  );

  assert.doesNotMatch(bridgeBlock, /loadPaginaFuncionariosBundle/i);
  assert.doesNotMatch(bridgeBlock, /loadPrivilegedPaginaFuncionariosBundleData/i);
  assert.doesNotMatch(bridgeBlock, /loadScopedPaginaFuncionariosBundleData/i);
  assert.doesNotMatch(bridgeBlock, /createFuncionarioDocRepo/i);
  assert.doesNotMatch(bridgeBlock, /updateFuncionarioByIdWithOpsRepo/i);
  assert.doesNotMatch(bridgeBlock, /deleteFuncionarioByIdRepo/i);
  assert.doesNotMatch(bridgeBlock, /controller/i);
  assert.doesNotMatch(bridgeBlock, /request path/i);

  assert.doesNotMatch(repoBlockForSearch(), /anexo|biometria|auto-user/i);
  assert.doesNotMatch(bridgeBlock, /anexo|biometria|auto-user/i);

  assert.equal(BUNDLE_SERVICE_SOURCE.includes('loadScopedPaginaFuncionariosBundleData'), true);
  assert.equal(BUNDLE_DATA_SOURCE.includes('findFuncionariosParaListagemComRefsSelectLeanRepo'), true);

  function repoBlockForSearch() {
    return getFunctionBlock(
      REPOSITORY_SOURCE,
      'export async function findFuncionariosDisponiveisByUnidadeLeanRepo',
    );
  }
});

test('contrato documenta que este slice exige unidade explicita via createUnitScope sem fallback base/global neste helper', () => {
  const bridgeBlock = getFunctionBlock(
    API_DB_SOURCE,
    'export async function findFuncionariosDisponiveisByUnidadeLean',
  );

  assert.match(UNIT_SCOPE_SOURCE, /export function createUnitScope/);
  assert.match(UNIT_SCOPE_SOURCE, /type:\s*'unit'/);
  assert.match(UNIT_SCOPE_SOURCE, /type:\s*'global'/);

  assert.match(bridgeBlock, /createUnitScope\s*\(\s*\{\s*unidadeId\s*\}\s*\)/);
  assert.doesNotMatch(bridgeBlock, /GLOBAL_SCOPE/);
  assert.doesNotMatch(bridgeBlock, /scopeFromUnidadeId/);
  assert.doesNotMatch(bridgeBlock, /\?\?/);

  const repoBlock = getFunctionBlock(
    REPOSITORY_SOURCE,
    'export async function findFuncionariosDisponiveisByUnidadeLeanRepo',
  );
  assert.doesNotMatch(repoBlock, /findById\(/);
  assert.match(repoBlock, /unidade_id:\s*unidadeId/);
});