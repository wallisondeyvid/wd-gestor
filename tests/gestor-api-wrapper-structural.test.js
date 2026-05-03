import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const API_ROUTE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/routes/api.js');
const API_ROUTE_SOURCE = fs.readFileSync(API_ROUTE_PATH, 'utf8');

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

const API_ROUTE_SOURCE_NO_COMMENTS = stripComments(API_ROUTE_SOURCE);

test('api.js congela o unico endpoint contextual com wrapper de requireUnitScope e branch privilegiado residual', () => {
  const source = API_ROUTE_SOURCE_NO_COMMENTS;

  assert.match(source, /router\.get\(\s*['"]\/api\/unidades\/cluster['"]\s*,\s*withLoginAndClusterScope\(unidadesCluster\)\s*\)/);
  assert.match(source, /function withLoginAndRequiredUnitScope\(handler\) \{[\s\S]*?requireLogin\(req, res, \(\) => requireUnitScope\(req, res, \(\) => handler\(req, res, next\)\)\);[\s\S]*?\}/);
  assert.match(source, /function withLoginAndClusterScope\(handler\) \{[\s\S]*?requireLogin\(req, res, \(\) => \{[\s\S]*?if \(!hasCanonicalUnitContext\(req\) && isPrivilegedGestorUser\(req\.user\)\) \{[\s\S]*?return handler\(req, res, next\);[\s\S]*?\}[\s\S]*?return requireUnitScope\(req, res, \(\) => handler\(req, res, next\)\);[\s\S]*?\}\);[\s\S]*?\}/);
});

test('api.js restringe o branch privilegiado/global residual a master admin ou isMaster e mantem usuario comum fail-closed', () => {
  const source = API_ROUTE_SOURCE_NO_COMMENTS;

  assert.match(source, /function isPrivilegedGestorUser\(user\) \{[\s\S]*?user\?\.isMaster === true[\s\S]*?user\?\.role === ['"]master['"][\s\S]*?user\?\.role === ['"]admin['"][\s\S]*?\}/);
  assert.match(source, /function hasCanonicalUnitContext\(req\) \{[\s\S]*?gestorAuthContext\?\.active_unidade_id[\s\S]*?req\?\.user\?\.unidade_id[\s\S]*?return Boolean\(authContextUnitId \|\| requestUserUnitId\);[\s\S]*?\}/);

  assert.doesNotMatch(source, /if \(!hasCanonicalUnitContext\(req\)\) \{[\s\S]*?return handler\(req, res, next\);/);
  assert.doesNotMatch(source, /if \(isPrivilegedGestorUser\(req\.user\)\) \{[\s\S]*?return handler\(req, res, next\);/);
});

test('api.js congela os endpoints que apenas delegam sem requireUnitScope explicito', () => {
  const source = API_ROUTE_SOURCE_NO_COMMENTS;

  assert.match(source, /router\.get\(\s*['"]\/api\/debug\/session['"]\s*,\s*debugSession\s*\)/);
  assert.match(source, /router\.get\(\s*['"]\/api\/ibge['"]\s*,\s*ibge\s*\)/);
  assert.match(source, /router\.get\(\s*['"]\/favicon\.ico['"]\s*,\s*favicon\s*\)/);

  assert.doesNotMatch(source, /router\.get\(\s*['"]\/api\/debug\/session['"]\s*,\s*withLoginAndRequiredUnitScope\(/);
  assert.doesNotMatch(source, /router\.get\(\s*['"]\/api\/ibge['"]\s*,\s*withLoginAndRequiredUnitScope\(/);
  assert.doesNotMatch(source, /router\.get\(\s*['"]\/favicon\.ico['"]\s*,\s*withLoginAndRequiredUnitScope\(/);
});

test('api.js nao resolve tenant, nao toca registry da Fase E e nao chama seams proibidas', () => {
  const source = API_ROUTE_SOURCE_NO_COMMENTS;

  assert.doesNotMatch(source, /from ['"][^'"]*resolveConnection\.js['"]/);
  assert.doesNotMatch(source, /from ['"][^'"]*unitDatabaseRegistryWriter\.js['"]/);
  assert.doesNotMatch(source, /from ['"][^'"]*unitDatabaseRegistryPreload\.js['"]/);
  assert.doesNotMatch(source, /from ['"][^'"]*unitDatabaseRegistryReader\.js['"]/);
  assert.doesNotMatch(source, /from ['"][^'"]*unitDatabaseRegistry\.js['"]/);
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