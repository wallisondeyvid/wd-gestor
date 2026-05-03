import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const PAGES_ROUTE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/routes/pagesRouter.js');
const PAGES_ROUTE_SOURCE = fs.readFileSync(PAGES_ROUTE_PATH, 'utf8');

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

const PAGES_ROUTE_SOURCE_NO_COMMENTS = stripComments(PAGES_ROUTE_SOURCE);

test('pagesRouter congela os wrappers residuais com branch privilegiado/global apenas nas paginas esperadas', () => {
  const source = PAGES_ROUTE_SOURCE_NO_COMMENTS;

  assert.match(source, /router\.get\(\s*['"]\/unidades['"]\s*,\s*withLoginAndUnidadesScope\(paginaUnidades\)\s*\)/);
  assert.match(source, /router\.get\(\s*['"]\/funcoes['"]\s*,\s*withLoginAndFuncoesScope\(paginaFuncoes\)\s*\)/);
  assert.match(source, /router\.get\(\s*['"]\/funcionarios['"]\s*,\s*withLoginAndFuncionariosScope\(paginaFuncionarios\)\s*\)/);
  assert.match(source, /router\.get\(\s*['"]\/recursos['"]\s*,\s*withLoginAndRecursosScope\(paginaRecursos\)\s*\)/);

  assert.match(source, /function withLoginAndUnidadesScope\(handler\) \{[\s\S]*?isPrivilegedGestorUser\(req\.user\) && !hasCanonicalUnitContext\(req\)[\s\S]*?return handler\(req, res, next\);[\s\S]*?return requireUnitScope\(req, res, \(\) => handler\(req, res, next\)\);[\s\S]*?\}/);
  assert.match(source, /function withLoginAndFuncoesScope\(handler\) \{[\s\S]*?isPrivilegedGestorUser\(req\.user\) && !hasCanonicalUnitContext\(req\)[\s\S]*?return handler\(req, res, next\);[\s\S]*?return requireUnitScope\(req, res, \(\) => handler\(req, res, next\)\);[\s\S]*?\}/);
  assert.match(source, /function withLoginAndFuncionariosScope\(handler\) \{[\s\S]*?isPrivilegedGestorUser\(req\.user\) && !hasCanonicalUnitContext\(req\)[\s\S]*?return handler\(req, res, next\);[\s\S]*?return requireUnitScope\(req, res, \(\) => handler\(req, res, next\)\);[\s\S]*?\}/);
  assert.match(source, /function withLoginAndRecursosScope\(handler\) \{[\s\S]*?isPrivilegedGestorUser\(req\.user\) && !hasCanonicalUnitContext\(req\)[\s\S]*?return handler\(req, res, next\);[\s\S]*?return requireUnitScope\(req, res, \(\) => handler\(req, res, next\)\);[\s\S]*?\}/);
});

test('pagesRouter congela as paginas que continuam exigindo requireUnitScope sem branch global', () => {
  const source = PAGES_ROUTE_SOURCE_NO_COMMENTS;

  assert.match(source, /router\.get\(\s*['"]\/editar-unidades\/:id['"]\s*,\s*withLoginAndRequiredUnitScope\(paginaEditarUnidade\)\s*\)/);
  assert.match(source, /router\.get\(\s*['"]\/setores['"]\s*,\s*withLoginAndRequiredUnitScope\(paginaSetores\)\s*\)/);

  assert.match(source, /function withLoginAndRequiredUnitScope\(handler\) \{[\s\S]*?requireLogin\(req, res, \(\) => requireUnitScope\(req, res, \(\) => handler\(req, res, next\)\)\);[\s\S]*?\}/);
});

test('pagesRouter restringe o branch global residual a perfis privilegiados explicitos e mantem o resto fail-closed', () => {
  const source = PAGES_ROUTE_SOURCE_NO_COMMENTS;

  assert.match(source, /function isPrivilegedGestorUser\(user\) \{[\s\S]*?user\?\.isMaster === true[\s\S]*?user\?\.role === ['"]master['"][\s\S]*?user\?\.role === ['"]admin['"][\s\S]*?\}/);

  assert.doesNotMatch(source, /if \(!hasCanonicalUnitContext\(req\)\) \{[\s\S]*?return handler\(req, res, next\);/);
  assert.doesNotMatch(source, /if \(hasCanonicalUnitContext\(req\)\) \{[\s\S]*?return handler\(req, res, next\);/);
});

test('pagesRouter nao resolve tenant nem chama seams proibidas por conta propria', () => {
  const source = PAGES_ROUTE_SOURCE_NO_COMMENTS;

  assert.doesNotMatch(source, /from ['"][^'"]*resolveConnection\.js['"]/);
  assert.doesNotMatch(source, /from ['"][^'"]*unitDatabaseRegistryWriter\.js['"]/);
  assert.doesNotMatch(source, /from ['"][^'"]*unitDatabaseRegistryPreload\.js['"]/);
  assert.doesNotMatch(source, /from ['"][^'"]*modelRegistry\.js['"]/);
  assert.doesNotMatch(source, /from ['"][^'"]*resolveModel\.js['"]/);

  assert.doesNotMatch(source, /\bresolveConnection\s*\(/);
  assert.doesNotMatch(source, /\bmarkUnitDatabaseRegistryReady\s*\(/);
  assert.doesNotMatch(source, /\bregisterUnitDatabaseRegistryPending\s*\(/);
  assert.doesNotMatch(source, /\bdisableUnitDatabaseRegistry\s*\(/);
  assert.doesNotMatch(source, /\bmarkUnitDatabaseRegistryRollbackRequired\s*\(/);
  assert.doesNotMatch(source, /\bactivateUnitDatabaseRegistry\s*\(/);
  assert.doesNotMatch(source, /\bpreloadUnitDatabaseRegistryForUnits\s*\(/);
  assert.doesNotMatch(source, /\bresolveModel\s*\(/);
  assert.doesNotMatch(source, /\bmodelRegistry\b/);
  assert.doesNotMatch(source, /\.useDb\s*\(/);
  assert.doesNotMatch(source, /\bgetConnectionForUnit\s*\(/);
});