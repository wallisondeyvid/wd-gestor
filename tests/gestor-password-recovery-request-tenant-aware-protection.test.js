import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const PROJECT_ROOT = process.cwd();
const FACADE_PATH = path.join(PROJECT_ROOT, 'src/modules/gestor/app/data/auth/passwordRecoveryRequestDataFacade.js');
const SERVICE_PATH = path.join(PROJECT_ROOT, 'src/modules/gestor/app/services/auth/passwordRecovery.service.js');

const FACADE_SOURCE = fs.readFileSync(FACADE_PATH, 'utf8');
const SERVICE_SOURCE = fs.readFileSync(SERVICE_PATH, 'utf8');

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

function toPlainJson(value) {
  return JSON.parse(JSON.stringify(value));
}

test('recovery request tenant-aware: a facade congela busca direta por CPF antes do fallback por funcionario e token local ao seam', () => {
  const loadRecoveryUsersByCpfDataBlock = extractFunction(
    FACADE_SOURCE,
    'export async function loadRecoveryUsersByCpfData({ cpfDigits })',
  );
  const createPasswordRecoveryTokenDataBlock = extractFunction(
    FACADE_SOURCE,
    'export async function createPasswordRecoveryTokenData({ userId, token, expiresAt })',
  );

  assert.match(loadRecoveryUsersByCpfDataBlock, /findUsersByCpfRepo\s*\(\{\s*unitScope:\s*GLOBAL_SCOPE,\s*cpf:\s*cpfDigits\s*\}\)/);
  assert.match(loadRecoveryUsersByCpfDataBlock, /findFuncionariosByCpfSelectRepo\s*\(\{/);
  assert.match(loadRecoveryUsersByCpfDataBlock, /select:\s*'_id'/);
  assert.match(loadRecoveryUsersByCpfDataBlock, /const ids = funcionarios\.map\(\(funcionario\) => funcionario\._id\)/);
  assert.match(loadRecoveryUsersByCpfDataBlock, /findUsersByFuncionarioIdsRepo\s*\(\{\s*unitScope:\s*GLOBAL_SCOPE,\s*ids\s*\}\)/);

  const directLookupIndex = loadRecoveryUsersByCpfDataBlock.indexOf('findUsersByCpfRepo');
  const funcionarioLookupIndex = loadRecoveryUsersByCpfDataBlock.indexOf('findFuncionariosByCpfSelectRepo');
  const linkedUsersLookupIndex = loadRecoveryUsersByCpfDataBlock.indexOf('findUsersByFuncionarioIdsRepo');

  assert.ok(directLookupIndex >= 0, 'A busca direta por CPF deve existir.');
  assert.ok(funcionarioLookupIndex > directLookupIndex, 'O fallback por funcionario deve ocorrer depois da busca direta.');
  assert.ok(linkedUsersLookupIndex > funcionarioLookupIndex, 'A busca por usuario via funcionario_id deve ocorrer depois da busca por funcionarios.');

  assert.match(createPasswordRecoveryTokenDataBlock, /createPasswordResetRepo\s*\(\{\s*unitScope:\s*GLOBAL_SCOPE,/);
  assert.match(createPasswordRecoveryTokenDataBlock, /user_id:\s*userId/);
  assert.match(createPasswordRecoveryTokenDataBlock, /token,/);
  assert.match(createPasswordRecoveryTokenDataBlock, /expiresAt,/);

  assert.doesNotMatch(loadRecoveryUsersByCpfDataBlock, /mongoose\.connect|createConnection|supertest|#server\//i);
  assert.doesNotMatch(createPasswordRecoveryTokenDataBlock, /mongoose\.connect|createConnection|supertest|#server\//i);
});

test('recovery request tenant-aware: CPF com usuario direto encontrado nao recorre ao fallback por funcionario', async () => {
  const callLog = [];
  const loadRecoveryUsersByCpfData = buildFunction(
    FACADE_SOURCE,
    'export async function loadRecoveryUsersByCpfData({ cpfDigits })',
    {
      GLOBAL_SCOPE: { type: 'global', unidadeId: null },
      findUsersByCpfRepo: async (args) => {
        callLog.push(['findUsersByCpfRepo', toPlainJson(args)]);
        return [{ _id: 'user-1', email: 'direto@exemplo.com' }];
      },
      findFuncionariosByCpfSelectRepo: async (args) => {
        callLog.push(['findFuncionariosByCpfSelectRepo', toPlainJson(args)]);
        return [{ _id: 'func-1' }];
      },
      findUsersByFuncionarioIdsRepo: async (args) => {
        callLog.push(['findUsersByFuncionarioIdsRepo', toPlainJson(args)]);
        return [{ _id: 'user-fallback' }];
      },
    },
  );

  const result = await loadRecoveryUsersByCpfData({ cpfDigits: '12345678900' });

  assert.deepEqual(toPlainJson(result), [{ _id: 'user-1', email: 'direto@exemplo.com' }]);
  assert.deepEqual(callLog, [
    ['findUsersByCpfRepo', { unitScope: { type: 'global', unidadeId: null }, cpf: '12345678900' }],
  ]);
});

test('recovery request tenant-aware: CPF sem usuario direto, mas com funcionario vinculado, usa fallback explicito e local', async () => {
  const callLog = [];
  const loadRecoveryUsersByCpfData = buildFunction(
    FACADE_SOURCE,
    'export async function loadRecoveryUsersByCpfData({ cpfDigits })',
    {
      GLOBAL_SCOPE: { type: 'global', unidadeId: null },
      findUsersByCpfRepo: async (args) => {
        callLog.push(['findUsersByCpfRepo', toPlainJson(args)]);
        return [];
      },
      findFuncionariosByCpfSelectRepo: async (args) => {
        callLog.push(['findFuncionariosByCpfSelectRepo', toPlainJson(args)]);
        return [{ _id: 'func-1' }, { _id: 'func-2' }];
      },
      findUsersByFuncionarioIdsRepo: async (args) => {
        callLog.push(['findUsersByFuncionarioIdsRepo', toPlainJson(args)]);
        return [{ _id: 'user-2', funcionario_id: 'func-1', email: 'fallback@exemplo.com' }];
      },
    },
  );

  const result = await loadRecoveryUsersByCpfData({ cpfDigits: '12345678900' });

  assert.deepEqual(toPlainJson(result), [{ _id: 'user-2', funcionario_id: 'func-1', email: 'fallback@exemplo.com' }]);
  assert.deepEqual(callLog, [
    ['findUsersByCpfRepo', { unitScope: { type: 'global', unidadeId: null }, cpf: '12345678900' }],
    ['findFuncionariosByCpfSelectRepo', { unitScope: { type: 'global', unidadeId: null }, cpf: '12345678900', select: '_id' }],
    ['findUsersByFuncionarioIdsRepo', { unitScope: { type: 'global', unidadeId: null }, ids: ['func-1', 'func-2'] }],
  ]);
});

test('recovery request tenant-aware: CPF sem usuario direto e sem funcionario retorna lista vazia', async () => {
  const callLog = [];
  const loadRecoveryUsersByCpfData = buildFunction(
    FACADE_SOURCE,
    'export async function loadRecoveryUsersByCpfData({ cpfDigits })',
    {
      GLOBAL_SCOPE: { type: 'global', unidadeId: null },
      findUsersByCpfRepo: async (args) => {
        callLog.push(['findUsersByCpfRepo', toPlainJson(args)]);
        return [];
      },
      findFuncionariosByCpfSelectRepo: async (args) => {
        callLog.push(['findFuncionariosByCpfSelectRepo', toPlainJson(args)]);
        return [];
      },
      findUsersByFuncionarioIdsRepo: async (args) => {
        callLog.push(['findUsersByFuncionarioIdsRepo', toPlainJson(args)]);
        return [{ _id: 'nao-deveria' }];
      },
    },
  );

  const result = await loadRecoveryUsersByCpfData({ cpfDigits: '12345678900' });

  assert.deepEqual(toPlainJson(result), []);
  assert.deepEqual(callLog, [
    ['findUsersByCpfRepo', { unitScope: { type: 'global', unidadeId: null }, cpf: '12345678900' }],
    ['findFuncionariosByCpfSelectRepo', { unitScope: { type: 'global', unidadeId: null }, cpf: '12345678900', select: '_id' }],
  ]);
});

test('recovery request tenant-aware: createPasswordRecoveryTokenData delega criacao de token ao repositorio esperado', async () => {
  const callLog = [];
  const createPasswordRecoveryTokenData = buildFunction(
    FACADE_SOURCE,
    'export async function createPasswordRecoveryTokenData({ userId, token, expiresAt })',
    {
      GLOBAL_SCOPE: { type: 'global', unidadeId: null },
      createPasswordResetRepo: async (args) => {
        callLog.push(toPlainJson(args));
        return { acknowledged: true, insertedId: 'reset-1' };
      },
    },
  );

  const expiresAt = '2026-05-15T12:34:56.000Z';
  const result = await createPasswordRecoveryTokenData({ userId: 'user-9', token: 'token-x', expiresAt });

  assert.deepEqual(toPlainJson(result), { acknowledged: true, insertedId: 'reset-1' });
  assert.deepEqual(callLog, [
    {
      unitScope: { type: 'global', unidadeId: null },
      payload: {
        user_id: 'user-9',
        token: 'token-x',
        expiresAt,
      },
    },
  ]);
});

test('recovery request tenant-aware: listagem auxiliar de e-mails por CPF preserva shape publico com harness leve', async () => {
  const maskEmail = buildFunction(SERVICE_SOURCE, 'function maskEmail(email)');
  const listRecoveryEmailsByCpfService = buildFunction(
    SERVICE_SOURCE,
    'export async function listRecoveryEmailsByCpfService({ cpf } = {})',
    {
      maskEmail,
      loadRecoveryUsersByCpf: async (cpfDigits) => {
        assert.equal(cpfDigits, '12345678900');
        return [
          { email: 'alpha@example.com' },
          { email: 'bravo@example.com' },
        ];
      },
    },
  );

  const result = await listRecoveryEmailsByCpfService({ cpf: '123.456.789-00' });

  assert.deepEqual(toPlainJson(result), {
    status: 200,
    body: {
      success: true,
      quantidade: 2,
      emails: [
        { email: 'a***a@example.com', original: 'alpha@example.com' },
        { email: 'b***o@example.com', original: 'bravo@example.com' },
      ],
    },
  });
});