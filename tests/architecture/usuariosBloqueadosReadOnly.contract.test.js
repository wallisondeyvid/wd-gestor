import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const projectRoot = process.cwd();

const userRepositoryPath = path.join(projectRoot, 'src/modules/gestor/app/repositories/UserRepository.js');
const apiDbPath = path.join(projectRoot, 'src/modules/gestor/app/db/api.db.js');
const servicePath = path.join(projectRoot, 'src/modules/gestor/app/services/usuarios/listLockedUsers.service.js');
const controllerPath = path.join(projectRoot, 'src/modules/gestor/app/controllers/userController.js');
const unitScopePath = path.join(projectRoot, 'src/shared/unitScope.js');
const baseRepositoryPath = path.join(projectRoot, 'src/shared/repositories/BaseRepository.js');

const userRepositorySource = fs.readFileSync(userRepositoryPath, 'utf8');
const apiDbSource = fs.readFileSync(apiDbPath, 'utf8');
const serviceSource = fs.readFileSync(servicePath, 'utf8');
const controllerSource = fs.readFileSync(controllerPath, 'utf8');
const unitScopeSource = fs.readFileSync(unitScopePath, 'utf8');
const baseRepositorySource = fs.readFileSync(baseRepositoryPath, 'utf8');

function extractFunctionBlock(source, functionName) {
  const signature = `export async function ${functionName}`;
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `Nao encontrou ${functionName} no source.`);

  const paramsStart = source.indexOf('(', start);
  assert.notEqual(paramsStart, -1, `Nao encontrou abertura de parametros de ${functionName}.`);

  let paramsDepth = 0;
  let paramsEnd = -1;
  for (let index = paramsStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '(') paramsDepth += 1;
    if (char === ')') paramsDepth -= 1;
    if (paramsDepth === 0) {
      paramsEnd = index;
      break;
    }
  }

  assert.notEqual(paramsEnd, -1, `Nao encontrou fechamento dos parametros de ${functionName}.`);

  const braceStart = source.indexOf('{', paramsEnd);
  assert.notEqual(braceStart, -1, `Nao encontrou abertura do bloco de ${functionName}.`);

  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) {
      return source.slice(start, index + 1);
    }
  }

  throw new Error(`Nao conseguiu extrair o bloco de ${functionName}.`);
}

function extractControllerBlock(functionName) {
  const signature = `export async function ${functionName}`;
  const start = controllerSource.indexOf(signature);
  assert.notEqual(start, -1, `Nao encontrou ${functionName} no controller.`);

  const braceStart = controllerSource.indexOf('{', start);
  let depth = 0;
  for (let index = braceStart; index < controllerSource.length; index += 1) {
    const char = controllerSource[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) {
      return controllerSource.slice(start, index + 1);
    }
  }

  throw new Error(`Nao conseguiu extrair o bloco do owner ${functionName}.`);
}

function assertSourceDoesNotContain(source, forbiddenPatterns, label) {
  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(source, pattern, `${label} nao deve conter ${pattern}`);
  }
}

const lockedUsersRepoBlock = extractFunctionBlock(userRepositorySource, 'findUsersLockedAfterSelectLeanRepo');
const lockedUsersFromDbBlock = extractFunctionBlock(apiDbSource, 'findUsersLockedAfterSelectLeanFromDb');
const lockedUsersServiceBlock = extractFunctionBlock(serviceSource, 'listLockedUsersService');
const lockedUsersOwnerBlock = extractControllerBlock('listLockedUsers');

test('UserRepository permanece amplo, mas o slice protegido fica limitado ao helper read-only de bloqueados sem forcar BaseRepository', () => {
  assert.match(userRepositorySource, /export\s+async\s+function\s+findUsersLockedAfterSelectLeanRepo\s*\(/);
  assert.match(userRepositorySource, /export\s+class\s+UserRepository\s+extends\s+BaseRepository/);

  assert.match(lockedUsersRepoBlock, /resolveModel\s*\(/);
  assert.match(lockedUsersRepoBlock, /name:\s*User\.modelName\s*\|\|\s*'User'/);
  assert.match(lockedUsersRepoBlock, /schema:\s*User\.schema/);
  assert.match(lockedUsersRepoBlock, /unitScope/);
  assert.match(lockedUsersRepoBlock, /find\s*\(\s*\{\s*lock_until:\s*\{\s*\$gt:\s*agora\s*}\s*}\s*\)/);
  assert.match(lockedUsersRepoBlock, /select\('_id email role lock_until failed_login_attempts'\)/);
  assert.match(lockedUsersRepoBlock, /lean\s*\(\s*\)/);

  assert.doesNotMatch(lockedUsersRepoBlock, /new\s+UserRepository\s*\(/);
  assert.doesNotMatch(lockedUsersRepoBlock, /extends\s+BaseRepository/);
  assert.doesNotMatch(lockedUsersRepoBlock, /create\s*\(|update|delete|remove|findByIdAndUpdate|findByIdAndDelete|deleteOne|updateOne|updateMany/i);
});

test('api.db.findUsersLockedAfterSelectLeanFromDb permanece bridge pequena com GLOBAL_SCOPE explicito e sem tenant routing novo', () => {
  assert.match(lockedUsersFromDbBlock, /findUsersLockedAfterSelectLeanRepo\s*\(/);
  assert.match(lockedUsersFromDbBlock, /unitScope:\s*GLOBAL_SCOPE/);
  assert.match(lockedUsersFromDbBlock, /agora/);

  assertSourceDoesNotContain(lockedUsersFromDbBlock, [
    /scopeFromUnidadeId\s*\(/,
    /createUnitScope\s*\(/,
    /resolveConnection/i,
    /tenant/i,
    /registry/i,
  ], 'findUsersLockedAfterSelectLeanFromDb');
});

test('listLockedUsersService permanece service fino e delega apenas ao bridge read-only', () => {
  assert.match(lockedUsersServiceBlock, /await\s+import\('#modules\/gestor\/app\/services\/apiDbBridgeService\.js'\)/);
  assert.match(lockedUsersServiceBlock, /findUsersLockedAfterSelectLeanFromDb/);
  assert.match(lockedUsersServiceBlock, /return\s+findUsersLockedAfterSelectLeanFromDb\(agora\)/);

  assertSourceDoesNotContain(lockedUsersServiceBlock, [
    /unlock/i,
    /toggle/i,
    /create|update|delete/i,
    /reset|recovery|login|sess[aã]o|auth/i,
    /membership/i,
    /funcionario/i,
    /upload|biometria|anexo|widget/i,
    /createServer|start\.js|server\.js/i,
  ], 'listLockedUsersService');
});

test('userController.listLockedUsers permanece owner fino sem reabrir dominios proibidos', () => {
  assert.match(lockedUsersOwnerBlock, /if\s*\(!req\.user\)\s*return\s+res\.status\(401\)\.json/);
  assert.match(lockedUsersOwnerBlock, /if\s*\(!\(req\.user\.isMaster\s*\|\|\s*req\.user\.role\s*===\s*'admin'\)\)\s*return\s+res\.status\(403\)\.json/);
  assert.match(lockedUsersOwnerBlock, /const\s+agora\s*=\s*new\s+Date\s*\(\s*\)/);
  assert.match(lockedUsersOwnerBlock, /const\s+docs\s*=\s*await\s+listLockedUsersService\(agora\)/);
  assert.match(lockedUsersOwnerBlock, /return\s+res\.json\(\{\s*success:true,\s*total:\s*docs\.length,\s*data:\s*docs\s*}\)/);

  assertSourceDoesNotContain(lockedUsersOwnerBlock, [
    /unlock/i,
    /toggle/i,
    /create|update|delete/i,
    /reset|recovery/i,
    /findUserMembership|membership/i,
    /funcionario/i,
    /upload|biometria|anexo|widget/i,
    /loadPagina/i,
    /supertest/i,
  ], 'listLockedUsers owner');
});

test('o corredor protegido congela GLOBAL_SCOPE explicito e nao depende de tenant registry, harness sintetico, app server ou bootstrap', () => {
  assert.match(apiDbSource, /import\s*\{[\s\S]*\bGLOBAL_SCOPE\b[\s\S]*}\s*from\s*'#modules\/gestor\/app\/data\/funcoes\/funcoesScope\.js'/);
  assert.match(lockedUsersFromDbBlock, /unitScope:\s*GLOBAL_SCOPE/);
  assert.match(unitScopeSource, /type:\s*'global'/);
  assert.match(baseRepositorySource, /assertTenantScope\s*\(/);

  const protectedSlice = [
    lockedUsersRepoBlock,
    lockedUsersFromDbBlock,
    lockedUsersServiceBlock,
    lockedUsersOwnerBlock,
  ].join('\n');

  assertSourceDoesNotContain(protectedSlice, [
    /tenant\s*registry/i,
    /unitDatabaseRegistry/i,
    /synthetic\s*harness|harness\s*sint[eé]tico/i,
    /createServer/i,
    /start\.js/i,
    /server\.js/i,
    /#routes\//,
    /scripts\//i,
    /\bcli\b/i,
    /\bjob\b/i,
    /bootstrap/i,
    /portal/i,
    /postgres/i,
    /mongoose\.connect/i,
    /mongodb-memory-server/i,
    /tenant\s*db/i,
  ], 'corredor usuarios bloqueados');
});

test('o contrato nao expande o corredor para unlock, toggle, writes, auth amplo, membership, auto-user flow, page bundle ou superficies proibidas', () => {
  const protectedSlice = [
    lockedUsersRepoBlock,
    lockedUsersFromDbBlock,
    lockedUsersServiceBlock,
    lockedUsersOwnerBlock,
  ].join('\n');

  assertSourceDoesNotContain(protectedSlice, [
    /unlock/i,
    /toggle/i,
    /create|update|delete/i,
    /recovery|reset\s*password/i,
    /req\.session|gestor\/login|loginPreAuthGate|auth\s+context|primeiro\s*acesso/i,
    /membership/i,
    /auto-user|auto\s*user/i,
    /funcionario/i,
    /loadPagina|page\s*bundle/i,
    /upload|biometria|anexo/i,
    /widget\s*settings|widget/i,
    /request\s*path/i,
  ], 'slice protegido de usuarios bloqueados');
});