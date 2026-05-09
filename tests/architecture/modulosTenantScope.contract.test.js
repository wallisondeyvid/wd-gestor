import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';

const projectRoot = process.cwd();
const repositoryPath = path.join(projectRoot, 'src/modules/gestor/app/repositories/ModuloReadRepository.js');
const servicePath = path.join(projectRoot, 'src/modules/gestor/app/services/modulos/findModuloByIdLean.service.js');
const apiDbPath = path.join(projectRoot, 'src/modules/gestor/app/db/api.db.js');

const repositorySource = fs.readFileSync(repositoryPath, 'utf8');
const serviceSource = fs.readFileSync(servicePath, 'utf8');
const apiDbSource = fs.readFileSync(apiDbPath, 'utf8');

const serviceModuleUrl = pathToFileURL(servicePath).href;
const bridgeMockModuleUrl = 'mock:modulos-tenant-scope-api-db-bridge';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '#modules/gestor/app/services/apiDbBridgeService.js') {
      return { url: bridgeMockModuleUrl, shortCircuit: true };
    }

    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === bridgeMockModuleUrl) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          "const getMocks = () => globalThis.__MODULOS_TENANT_SCOPE_MOCKS__ || {};",
          "export async function findModuloByIdLeanFromDb(...args) {",
          "  const fn = getMocks().findModuloByIdLeanFromDb;",
          "  if (typeof fn !== 'function') throw new Error('Mock findModuloByIdLeanFromDb ausente');",
          "  return await fn(...args);",
          "}",
        ].join('\n'),
      };
    }

    return nextLoad(url, context);
  },
});

function uniqueSuffix() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function setBridgeMocks(overrides = {}) {
  globalThis.__MODULOS_TENANT_SCOPE_MOCKS__ = { ...overrides };
}

function clearBridgeMocks() {
  globalThis.__MODULOS_TENANT_SCOPE_MOCKS__ = {};
}

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
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`Nao conseguiu extrair funcao: ${signature}`);
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

test.afterEach(() => {
  clearBridgeMocks();
});

test('ModuloReadRepository preserva o slice de leitura com resolveModel e unitScope explicito sem forcar BaseRepository', () => {
  assert.match(repositorySource, /import\s+Modulo\s+from\s+'#models\/modulo\.js';/);
  assert.match(repositorySource, /import\s+\{\s*resolveModel\s*\}\s+from\s+'#shared\/db\/resolveModel\.js';/);
  assert.doesNotMatch(repositorySource, /BaseRepository/);
  assert.doesNotMatch(repositorySource, /extends\s+BaseRepository/);

  const readSlice = extractFunction(repositorySource, 'export async function findModuloByIdLeanRepo');
  assert.match(readSlice, /resolveModel\(\{[\s\S]*unitScope,[\s\S]*\}\)/);
  assert.match(readSlice, /findById\(id\)\.lean\(\)/);
  assert.doesNotMatch(readSlice, /create\(|deleteOne\(|save\(|update/i);
});

test('findModuloByIdLean.service permanece fino e delega ao bridge atual sem criar superficie operacional', async () => {
  assert.match(serviceSource, /import\s+\{\s*findModuloByIdLeanFromDb\s*\}\s+from\s+'#modules\/gestor\/app\/services\/apiDbBridgeService\.js';/);
  assert.doesNotMatch(serviceSource, /express|router|Portal|createServer|server\.js|start\.js|bootstrap/i);

  const calls = [];
  setBridgeMocks({
    findModuloByIdLeanFromDb: async (id) => {
      calls.push(id);
      return { _id: id, nome: 'Modulo Teste' };
    },
  });

  const { findModuloByIdLeanService } = await import(`${serviceModuleUrl}?case=${encodeURIComponent(uniqueSuffix())}`);
  const result = await findModuloByIdLeanService('507f191e810c19729de860ec');

  assert.deepEqual(calls, ['507f191e810c19729de860ec']);
  assert.deepEqual(result, { _id: '507f191e810c19729de860ec', nome: 'Modulo Teste' });
});

test('api.db preserva fallback global explicito no slice findModuloByIdLeanFromDb e mantem handoff fino para o service', () => {
  const handoffFunction = extractFunction(apiDbSource, 'export async function findModuloByIdLean');
  assert.match(handoffFunction, /return\s+findModuloByIdLeanService\(id\);/);

  const fallbackFunction = extractFunction(apiDbSource, 'export async function findModuloByIdLeanFromDb');
  assert.match(fallbackFunction, /findModuloByIdLeanRepo\(\{\s*unitScope:\s*GLOBAL_SCOPE,\s*id\s*\}\)/);
  assert.doesNotMatch(fallbackFunction, /createUnitScope\(|scopeFromUnidadeId\(|req\.|router|express/i);
});

test('corredor de Modulos nao depende de tenant registry, harness sintetico, Portal, rotas nem bootstrap operacional', () => {
  assertNoForbiddenImports(repositorySource, 'ModuloReadRepository.js');
  assertNoForbiddenImports(serviceSource, 'findModuloByIdLean.service.js');
  assertNoForbiddenImports(apiDbSource, 'api.db.js');

  const combinedSource = [repositorySource, serviceSource, apiDbSource].join('\n');
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
    assert.equal(pattern.test(combinedSource), false, `Corredor de modulos nao deve referenciar superficie proibida: ${pattern}`);
  }
});

test('corredor de Modulos nao abre tenant DB real e congela o fallback seguro/base-global explicito do estado atual', () => {
  const combinedSource = [repositorySource, serviceSource, apiDbSource].join('\n');
  const forbiddenDbPatterns = [
    /mongoose\.connect\(/,
    /createConnection\(/,
    /openUri\(/,
    /getConnectionForUnit\(/,
    /baseConnection\./,
    /tenantDb/i,
  ];

  for (const pattern of forbiddenDbPatterns) {
    assert.equal(pattern.test(combinedSource), false, `Corredor de modulos nao deve abrir tenant DB real: ${pattern}`);
  }

  assert.match(apiDbSource, /findAllModulosBaseLeanRepo\(\{\s*unitScope:\s*GLOBAL_SCOPE\s*\}\)/);
  assert.match(apiDbSource, /findAllModulosLeanRepo\(\{\s*unitScope:\s*GLOBAL_SCOPE\s*\}\)/);
  assert.match(apiDbSource, /findModulosAtivosStatusLeanRepo\(\{\s*unitScope:\s*GLOBAL_SCOPE\s*\}\)/);
});