import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const projectRoot = process.cwd();
const repositoryPath = path.join(projectRoot, 'src/modules/gestor/app/repositories/RecursoReadRepository.js');
const dataFacadePath = path.join(projectRoot, 'src/modules/gestor/app/data/recursos/recursosReadDataFacade.js');
const scopePath = path.join(projectRoot, 'src/modules/gestor/app/data/recursos/recursosScope.js');
const servicePath = path.join(projectRoot, 'src/modules/gestor/app/services/recursos/listarRecursos.service.js');
const policyPath = path.join(projectRoot, 'src/modules/gestor/app/services/recursos/createRecursoContextPolicyCore.js');
const contextDataFacadePath = path.join(projectRoot, 'src/modules/gestor/app/data/recursos/recursosContextDataFacade.js');
const apiDbPath = path.join(projectRoot, 'src/modules/gestor/app/db/api.db.js');

const repositorySource = fs.readFileSync(repositoryPath, 'utf8');
const dataFacadeSource = fs.readFileSync(dataFacadePath, 'utf8');
const scopeSource = fs.readFileSync(scopePath, 'utf8');
const serviceSource = fs.readFileSync(servicePath, 'utf8');
const policySource = fs.readFileSync(policyPath, 'utf8');
const contextDataFacadeSource = fs.readFileSync(contextDataFacadePath, 'utf8');
const apiDbSource = fs.readFileSync(apiDbPath, 'utf8');

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

function assertNoForbiddenImports(source, fileLabel) {
  const forbiddenPatterns = [
    /#routes\//,
    /from\s+['"][^'"]*portal[^'"]*['"]/i,
    /from\s+['"][^'"]*tenantRegistry[^'"]*['"]/i,
    /from\s+['"][^'"]*harness[^'"]*['"]/i,
    /from\s+['"][^'"]*createServer[^'"]*['"]/i,
    /from\s+['"][^'"]*server\.js['"]/i,
    /from\s+['"][^'"]*start\.js['"]/i,
    /from\s+['"][^'"]*bootstrap[^'"]*['"]/i,
    /from\s+['"][^'"]*scripts\/[^'"]*['"]/i,
    /from\s+['"][^'"]*jobs?\/[^'"]*['"]/i,
    /from\s+['"]express['"]/, 
  ];

  for (const pattern of forbiddenPatterns) {
    assert.equal(pattern.test(source), false, `${fileLabel} nao deve importar superficie proibida: ${pattern}`);
  }
}

test('RecursoReadRepository preserva o slice de leitura com resolveModel e unitScope explicito sem forcar BaseRepository', () => {
  assert.match(repositorySource, /import\s+Recurso\s+from\s+'#models\/recurso\.js';/);
  assert.match(repositorySource, /import\s+\{\s*resolveModel\s*\}\s+from\s+'#shared\/db\/resolveModel\.js';/);
  assert.doesNotMatch(repositorySource, /BaseRepository/);
  assert.doesNotMatch(repositorySource, /extends\s+BaseRepository/);

  const readSlice = extractFunction(repositorySource, 'export async function findRecursosByFiltroComUnidadeLeanRepo');
  assert.match(readSlice, /resolveModel\(\{[\s\S]*unitScope,[\s\S]*\}\)/);
  assert.match(readSlice, /RecursoModel\.find\(filtro\)/);
  assert.match(readSlice, /populate\(\{ path: 'unidade_id', select: 'codigo nome' \}\)/);
  assert.match(readSlice, /sort\(\{ placa: 1 \}\)/);
  assert.match(readSlice, /limit\(100\)/);
  assert.match(readSlice, /lean\(\)/);
  assert.doesNotMatch(readSlice, /create\(|findOneAndDelete\(|findOneAndUpdate\(|delete/i);
});

test('recursosReadDataFacade permanece ponte pequena e usa scopeFromRecursoListFiltro como derivacao canonica de escopo', async () => {
  assert.match(dataFacadeSource, /import\s+\{\s*findRecursosByFiltroComUnidadeLeanRepo\s*\}\s+from\s+'#modules\/gestor\/app\/repositories\/RecursoReadRepository\.js';/);
  assert.match(dataFacadeSource, /import\s+\{\s*scopeFromRecursoListFiltro\s*\}\s+from\s+'#modules\/gestor\/app\/data\/recursos\/recursosScope\.js';/);

  const calls = [];
  const findRecursosByFiltroComUnidadeLeanData = buildFunction(
    dataFacadeSource,
    'export async function findRecursosByFiltroComUnidadeLeanData',
    {
      findRecursosByFiltroComUnidadeLeanRepo: async (input) => {
        calls.push(JSON.parse(JSON.stringify(input)));
        return [{ _id: 'r-1' }];
      },
      scopeFromRecursoListFiltro: (filtro) => ({ type: 'derived-scope', filtro: JSON.parse(JSON.stringify(filtro)) }),
    },
  );

  const result = await findRecursosByFiltroComUnidadeLeanData({ unidade_id: 'u-1', ativo: true });

  assert.deepEqual(calls, [{
    unitScope: { type: 'derived-scope', filtro: { unidade_id: 'u-1', ativo: true } },
    filtro: { unidade_id: 'u-1', ativo: true },
  }]);
  assert.deepEqual(result, [{ _id: 'r-1' }]);

  const scopeFunction = buildFunction(scopeSource, 'export function scopeFromRecursoListFiltro', {
    GLOBAL_SCOPE: { type: 'global', unidadeId: null },
    extractSingleScopedUnitId: (value) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) return '';
      return String(value || '').trim();
    },
    scopeFromUnidadeId: (unidadeId) => ({ type: 'unit', unidadeId: String(unidadeId) }),
  });

  assert.deepEqual(scopeFunction({ unidade_id: 'u-10' }), { type: 'unit', unidadeId: 'u-10' });
  assert.deepEqual(scopeFunction({}), { type: 'global', unidadeId: null });
  assert.deepEqual(scopeFunction(null), { type: 'global', unidadeId: null });
});

test('findRecursosByFiltroComUnidadeService permanece funcao fina do slice escolhido e nao puxa a politica ampla para dentro do contrato', async () => {
  const fineSlice = extractFunction(serviceSource, 'export async function findRecursosByFiltroComUnidadeService');
  assert.match(fineSlice, /return\s+findRecursosByFiltroComUnidadeLeanData\(filtro\);/);
  assert.doesNotMatch(fineSlice, /recursoContextPolicy|buildListScope|findUnidadeUserBaseLeanData|findUnidadesByCondLeanData|mapRecurso|placaTermNorm/);

  const findRecursosByFiltroComUnidadeService = buildFunction(
    serviceSource,
    'export async function findRecursosByFiltroComUnidadeService',
    {
      findRecursosByFiltroComUnidadeLeanData: async (filtro) => [{ filtro }],
    },
  );

  const result = await findRecursosByFiltroComUnidadeService({ unidade_id: 'u-22' });
  assert.deepEqual(result, [{ filtro: { unidade_id: 'u-22' } }]);

  assert.match(serviceSource, /const recursoContextPolicy = createRecursoContextPolicyCore\(\{/);
  assert.match(policySource, /export function createRecursoContextPolicyCore/);
  assert.match(contextDataFacadeSource, /export async function findUnidadeUserBaseLeanData/);
  assert.match(contextDataFacadeSource, /export async function findUnidadesByCondLeanData/);
});

test('api.db preserva fallback explicito por scopeFromRecursoListFiltro no slice de Recursos e nao exige tenant DB real', () => {
  const handoffFunction = extractFunction(apiDbSource, 'export async function findRecursosByFiltroComUnidadeLean');
  assert.match(handoffFunction, /return\s+findRecursosByFiltroComUnidadeService\(filtro\);/);

  const fallbackFunction = extractFunction(apiDbSource, 'export async function findRecursosByFiltroComUnidadeLeanFromDb');
  assert.match(fallbackFunction, /findRecursosByFiltroComUnidadeLeanRepo\(\{\s*unitScope:\s*scopeFromRecursoListFiltro\(filtro\),\s*filtro\s*\}\)/);
  assert.doesNotMatch(fallbackFunction, /createUnitScope\(|getConnectionForUnit\(|baseConnection\.|mongoose\.connect\(|createConnection\(|req\.|router|express/i);

  const combinedSource = [repositorySource, dataFacadeSource, scopeSource, serviceSource, apiDbSource].join('\n');
  const forbiddenDbPatterns = [
    /mongoose\.connect\(/,
    /createConnection\(/,
    /openUri\(/,
    /getConnectionForUnit\(/,
    /baseConnection\./,
    /tenantDb/i,
  ];

  for (const pattern of forbiddenDbPatterns) {
    assert.equal(pattern.test(combinedSource), false, `Slice de recursos nao deve abrir tenant DB real: ${pattern}`);
  }
});

test('slice contratual de Recursos nao depende de tenant registry, harness, Portal, rotas ou bootstrap operacional', () => {
  assertNoForbiddenImports(repositorySource, 'RecursoReadRepository.js');
  assertNoForbiddenImports(dataFacadeSource, 'recursosReadDataFacade.js');
  assertNoForbiddenImports(scopeSource, 'recursosScope.js');
  assertNoForbiddenImports(serviceSource, 'listarRecursos.service.js');
  assertNoForbiddenImports(apiDbSource, 'api.db.js');

  const combinedSource = [repositorySource, dataFacadeSource, scopeSource, serviceSource, apiDbSource].join('\n');
  const forbiddenReferences = [
    /tenantRegistry/i,
    /syntheticHarness/i,
    /Portal/i,
    /createServer/i,
    /server\.js/i,
    /start\.js/i,
    /bootstrap/i,
    /req\.path/,
    /app\.(get|post|put|delete)\(/,
  ];

  for (const pattern of forbiddenReferences) {
    assert.equal(pattern.test(combinedSource), false, `Slice de recursos nao deve referenciar superficie proibida: ${pattern}`);
  }
});