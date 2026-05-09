import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const projectRoot = process.cwd();
const repositoryPath = path.join(projectRoot, 'src/modules/gestor/app/repositories/UserProfileRepository.js');
const usecasePath = path.join(projectRoot, 'src/modules/gestor/app/usecases/user/findUserForProfile.js');
const servicePath = path.join(projectRoot, 'src/modules/gestor/app/services/usuarios/getUsuarioAtualProfileOwner.service.js');

const repositorySource = fs.readFileSync(repositoryPath, 'utf8');
const usecaseSource = fs.readFileSync(usecasePath, 'utf8');
const serviceSource = fs.readFileSync(servicePath, 'utf8');

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

function normalize(value) {
  return JSON.parse(JSON.stringify(value));
}

test('UserProfileRepository permanece baseado em BaseRepository e o corredor nao depende de superficies proibidas', () => {
  assert.match(repositorySource, /export class UserProfileRepository extends BaseRepository/);
  assert.match(repositorySource, /super\(\{ unitScope \}\)/);
  assert.match(repositorySource, /unitScope:\s*this\.getUnitScope\(\)/);

  const forbiddenPatterns = [
    /unitDatabaseRegistry/i,
    /tenantRegistry/i,
    /portal-morador/i,
    /createServer\.js/i,
    /server\.js/i,
    /start\.js/i,
    /routes\//i,
    /scripts\//i,
    /bootstrap/i,
    /process\.argv/i,
    /mongoose\.connect/i,
    /createConnection/i,
    /express/i,
    /router\./i,
    /listen\(/i,
  ];

  for (const source of [repositorySource, usecaseSource, serviceSource]) {
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern);
    }
  }
});

test('findUserForProfile propaga unitScope para UserProfileRepository sem abrir runtime externo', async () => {
  const constructorCalls = [];
  const methodCalls = [];

  class FakeUserProfileRepository {
    constructor(input) {
      constructorCalls.push(input);
    }

    async findByIdForProfile(userId) {
      methodCalls.push({ op: 'findByIdForProfile', userId });
      return { kind: 'id', userId };
    }

    async findByEmailForProfile(email) {
      methodCalls.push({ op: 'findByEmailForProfile', email });
      return { kind: 'email', email };
    }
  }

  const findUserByIdForProfile = buildFunction(usecaseSource, 'export async function findUserByIdForProfile', {
    UserProfileRepository: FakeUserProfileRepository,
  });
  const findUserByEmailForProfile = buildFunction(usecaseSource, 'export async function findUserByEmailForProfile', {
    UserProfileRepository: FakeUserProfileRepository,
  });

  const scopedUnit = { type: 'unit', unidadeId: 'unit-42' };
  const globalScope = { type: 'global', unidadeId: null };

  const byId = await findUserByIdForProfile({ unitScope: scopedUnit, userId: 'user-1' });
  const byEmail = await findUserByEmailForProfile({ unitScope: globalScope, email: 'user@example.com' });

  assert.deepEqual(normalize(constructorCalls), [
    { unitScope: scopedUnit },
    { unitScope: globalScope },
  ]);
  assert.deepEqual(normalize(methodCalls), [
    { op: 'findByIdForProfile', userId: 'user-1' },
    { op: 'findByEmailForProfile', email: 'user@example.com' },
  ]);
  assert.deepEqual(normalize(byId), { kind: 'id', userId: 'user-1' });
  assert.deepEqual(normalize(byEmail), { kind: 'email', email: 'user@example.com' });
});

test('getUsuarioAtualProfileOwnerService preserva unitScope quando fornecido e mantem session user id como fonte autoritativa', async () => {
  const idCalls = [];
  const emailCalls = [];

  const getUsuarioAtualProfileOwnerService = buildFunction(serviceSource, 'export async function getUsuarioAtualProfileOwnerService', {
    findUserByIdForProfile: async (input) => {
      idCalls.push(input);
      return null;
    },
    findUserByEmailForProfile: async (input) => {
      emailCalls.push(input);
      return {
        _id: 'user-fallback',
        email: 'fallback@example.com',
        role: 'user',
        isMaster: false,
        foto: null,
        nome: 'Usuario Fallback',
        cpf: null,
        telefone: null,
        unidade_id: { _id: 'unit-7', nome: 'Unidade 7', codigo: 'U7' },
        funcionario_id: null,
      };
    },
  });

  const unitScope = { type: 'unit', unidadeId: 'unit-7' };

  const notFound = await getUsuarioAtualProfileOwnerService({
    unitScope,
    sessionUserId: 'session-user-1',
    fallbackEmail: 'fallback@example.com',
  });

  assert.equal(idCalls.length, 1);
  assert.deepEqual(normalize(idCalls[0]), { unitScope, userId: 'session-user-1' });
  assert.equal(emailCalls.length, 0);
  assert.equal(notFound.kind, 'not_found');
  assert.equal(notFound.targetId, 'session-user-1');

  const ok = await getUsuarioAtualProfileOwnerService({
    unitScope,
    sessionUserId: null,
    fallbackEmail: ' Fallback@Example.com ',
  });

  assert.equal(emailCalls.length, 1);
  assert.deepEqual(normalize(emailCalls[0]), { unitScope, email: 'fallback@example.com' });
  assert.equal(ok.kind, 'ok');
  assert.equal(ok.resolutionSource, 'compat-email-fallback');
  assert.equal(ok.payload.unidade_id, 'unit-7');
  assert.equal(ok.payload.unidade_nome, 'Unidade 7');
  assert.equal(ok.payload.unidade_codigo, 'U7');
});

test('getUsuarioAtualProfileOwnerService preserva fallback seguro quando unitScope nao e fornecido', async () => {
  const idCalls = [];
  const emailCalls = [];

  const getUsuarioAtualProfileOwnerService = buildFunction(serviceSource, 'export async function getUsuarioAtualProfileOwnerService', {
    findUserByIdForProfile: async (input) => {
      idCalls.push(input);
      return null;
    },
    findUserByEmailForProfile: async (input) => {
      emailCalls.push(input);
      return {
        _id: 'user-global',
        email: 'global@example.com',
        role: 'user',
        isMaster: false,
        foto: null,
        nome: null,
        cpf: null,
        telefone: null,
        unidade_id: null,
        funcionario_id: null,
      };
    },
  });

  const byId = await getUsuarioAtualProfileOwnerService({
    sessionUserId: 'session-user-global',
    fallbackEmail: 'global@example.com',
  });

  assert.equal(idCalls.length, 1);
  assert.equal('unitScope' in idCalls[0], true);
  assert.equal(idCalls[0].unitScope, undefined);
  assert.equal(emailCalls.length, 0);
  assert.equal(byId.kind, 'not_found');
  assert.equal(byId.targetId, 'session-user-global');

  const byEmail = await getUsuarioAtualProfileOwnerService({
    fallbackEmail: ' Global@Example.com ',
  });

  assert.equal(emailCalls.length, 1);
  assert.equal('unitScope' in emailCalls[0], true);
  assert.equal(emailCalls[0].unitScope, undefined);
  assert.equal(emailCalls[0].email, 'global@example.com');
  assert.equal(byEmail.kind, 'ok');
  assert.equal(byEmail.resolutionSource, 'compat-email-fallback');
  assert.equal(byEmail.payload.unidade_id, null);
});