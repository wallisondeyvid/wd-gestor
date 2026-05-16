import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const PROJECT_ROOT = process.cwd();
const SERVICE_PATH = path.join(PROJECT_ROOT, 'src/modules/gestor/app/services/auth/primeiroAcessoExecution.service.js');
const DATA_ACCESS_PATH = path.join(PROJECT_ROOT, 'src/modules/gestor/app/data-access/auth/primeiroAcessoExecutionDataAccess.js');
const CONTROLLER_PATH = path.join(PROJECT_ROOT, 'src/modules/gestor/app/controllers/authController.js');

const SERVICE_SOURCE = fs.readFileSync(SERVICE_PATH, 'utf8');
const DATA_ACCESS_SOURCE = fs.readFileSync(DATA_ACCESS_PATH, 'utf8');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

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

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

function toPlainJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createRes() {
  return {
    statusCode: 200,
    location: null,
    redirect(statusOrLocation, maybeLocation) {
      if (typeof maybeLocation === 'undefined') {
        this.statusCode = 302;
        this.location = statusOrLocation;
        return this;
      }
      this.statusCode = statusOrLocation;
      this.location = maybeLocation;
      return this;
    },
  };
}

test('primeiro acesso tenant-aware: service e data access mantem lookup local, gates e GLOBAL_SCOPE explicito sem abrir big-bang', () => {
  const serviceBlock = extractFunction(
    SERVICE_SOURCE,
    'export async function primeiroAcessoExecutionService({ userId, senhaHash, maxTimeMS })',
  );
  const dataAccessLoadBlock = extractFunction(
    DATA_ACCESS_SOURCE,
    'export async function loadPrimeiroAcessoUserData({ userId, maxTimeMS })',
  );
  const dataAccessCompleteBlock = extractFunction(
    DATA_ACCESS_SOURCE,
    'export async function completePrimeiroAcessoData({ userId, senhaHash })',
  );
  const ownerBlock = stripComments(
    extractFunction(CONTROLLER_SOURCE, 'export async function primeiroAcessoPost(req, res)'),
  );

  assert.match(serviceBlock, /const user = await loadPrimeiroAcessoUserData\(\{ userId, maxTimeMS \}\)/);
  assert.match(serviceBlock, /if \(!user\) return \{ kind: 'not_found' \ };/);
  assert.match(serviceBlock, /if \(!user\.primeiro_acesso\) return \{ kind: 'already_completed' \ };/);
  assert.match(serviceBlock, /await completePrimeiroAcessoData\(\{ userId, senhaHash \}\)/);

  const loadIndex = serviceBlock.indexOf('loadPrimeiroAcessoUserData');
  const missingUserIndex = serviceBlock.indexOf("if (!user)");
  const pendingGateIndex = serviceBlock.indexOf('if (!user.primeiro_acesso)');
  const completeIndex = serviceBlock.indexOf('completePrimeiroAcessoData');

  assert.ok(loadIndex >= 0, 'O lookup por userId deve existir.');
  assert.ok(missingUserIndex > loadIndex, 'O gate de usuario ausente deve ocorrer apos o lookup.');
  assert.ok(pendingGateIndex > missingUserIndex, 'O gate de primeiro acesso pendente deve ocorrer apos o gate de usuario.');
  assert.ok(completeIndex > pendingGateIndex, 'O write deve ocorrer somente apos os gates locais.');

  assert.match(DATA_ACCESS_SOURCE, /const GLOBAL_SCOPE = \{ type: 'global', unidadeId: null \};/);
  assert.match(dataAccessLoadBlock, /findUserByIdRepo\(\{ unitScope: GLOBAL_SCOPE, id: userId \}\)/);
  assert.match(dataAccessCompleteBlock, /new UserRepository\(\{ unitScope: GLOBAL_SCOPE \}\)/);
  assert.doesNotMatch(DATA_ACCESS_SOURCE, /auth\.db\.js/i);

  assert.match(ownerBlock, /senhaHash:\s*await bcrypt\.hash\(senha, 10\)/);
  assert.match(ownerBlock, /userId:\s*req\.session\.user\.id/);
  assert.match(ownerBlock, /const result = await primeiroAcessoExecutionService\(/);
});

test('primeiro acesso tenant-aware: userId ausente nao deve chamar completePrimeiroAcessoData', async () => {
  const callLog = [];
  const primeiroAcessoExecutionService = buildFunction(
    SERVICE_SOURCE,
    'export async function primeiroAcessoExecutionService({ userId, senhaHash, maxTimeMS })',
    {
      loadPrimeiroAcessoUserData: async (args) => {
        callLog.push(['loadPrimeiroAcessoUserData', toPlainJson(args)]);
        return {
          _id: 'user-carregado-sem-id-material',
          primeiro_acesso: true,
          senha_provisoria: true,
        };
      },
      completePrimeiroAcessoData: async (args) => {
        callLog.push(['completePrimeiroAcessoData', toPlainJson(args)]);
      },
    },
  );

  const result = await primeiroAcessoExecutionService({ userId: undefined, senhaHash: 'hash-gerado', maxTimeMS: 1000 });

  assert.equal(callLog.some(([name]) => name === 'completePrimeiroAcessoData'), false);
  assert.deepEqual(toPlainJson(result), { kind: 'not_found' });
});

test('primeiro acesso tenant-aware: usuario nao encontrado nao chama completePrimeiroAcessoData', async () => {
  const callLog = [];
  const primeiroAcessoExecutionService = buildFunction(
    SERVICE_SOURCE,
    'export async function primeiroAcessoExecutionService({ userId, senhaHash, maxTimeMS })',
    {
      loadPrimeiroAcessoUserData: async (args) => {
        callLog.push(['loadPrimeiroAcessoUserData', toPlainJson(args)]);
        return null;
      },
      completePrimeiroAcessoData: async (args) => {
        callLog.push(['completePrimeiroAcessoData', toPlainJson(args)]);
      },
    },
  );

  const result = await primeiroAcessoExecutionService({ userId: 'user-ausente', senhaHash: 'hash-gerado', maxTimeMS: 1000 });

  assert.deepEqual(callLog, [
    ['loadPrimeiroAcessoUserData', { userId: 'user-ausente', maxTimeMS: 1000 }],
  ]);
  assert.deepEqual(toPlainJson(result), { kind: 'not_found' });
});

test('primeiro acesso tenant-aware: usuario sem primeiro_acesso pendente nao chama completePrimeiroAcessoData', async () => {
  const callLog = [];
  const primeiroAcessoExecutionService = buildFunction(
    SERVICE_SOURCE,
    'export async function primeiroAcessoExecutionService({ userId, senhaHash, maxTimeMS })',
    {
      loadPrimeiroAcessoUserData: async (args) => {
        callLog.push(['loadPrimeiroAcessoUserData', toPlainJson(args)]);
        return {
          _id: 'user-ja-concluido',
          primeiro_acesso: false,
          senha_provisoria: false,
        };
      },
      completePrimeiroAcessoData: async (args) => {
        callLog.push(['completePrimeiroAcessoData', toPlainJson(args)]);
      },
    },
  );

  const result = await primeiroAcessoExecutionService({ userId: 'user-ja-concluido', senhaHash: 'hash-gerado', maxTimeMS: 0 });

  assert.deepEqual(callLog, [
    ['loadPrimeiroAcessoUserData', { userId: 'user-ja-concluido', maxTimeMS: 0 }],
  ]);
  assert.deepEqual(toPlainJson(result), { kind: 'already_completed' });
});

test('primeiro acesso tenant-aware: caminho valido chama completePrimeiroAcessoData com userId e senhaHash corretos', async () => {
  const callLog = [];
  const primeiroAcessoExecutionService = buildFunction(
    SERVICE_SOURCE,
    'export async function primeiroAcessoExecutionService({ userId, senhaHash, maxTimeMS })',
    {
      loadPrimeiroAcessoUserData: async (args) => {
        callLog.push(['loadPrimeiroAcessoUserData', toPlainJson(args)]);
        return {
          _id: 'user-valido',
          primeiro_acesso: true,
          senha_provisoria: true,
        };
      },
      completePrimeiroAcessoData: async (args) => {
        callLog.push(['completePrimeiroAcessoData', toPlainJson(args)]);
      },
    },
  );

  const result = await primeiroAcessoExecutionService({ userId: 'user-valido', senhaHash: 'hash-gerado', maxTimeMS: 4321 });

  assert.deepEqual(callLog, [
    ['loadPrimeiroAcessoUserData', { userId: 'user-valido', maxTimeMS: 4321 }],
    ['completePrimeiroAcessoData', { userId: 'user-valido', senhaHash: 'hash-gerado' }],
  ]);
  assert.deepEqual(toPlainJson(result), { kind: 'updated' });
});

test('primeiro acesso tenant-aware: erro de complete preserva contrato atual do service', async () => {
  const primeiroAcessoExecutionService = buildFunction(
    SERVICE_SOURCE,
    'export async function primeiroAcessoExecutionService({ userId, senhaHash, maxTimeMS })',
    {
      loadPrimeiroAcessoUserData: async () => ({
        _id: 'user-save-failed',
        primeiro_acesso: true,
        senha_provisoria: true,
      }),
      completePrimeiroAcessoData: async () => {
        throw new Error('falha-save');
      },
    },
  );

  const result = await primeiroAcessoExecutionService({ userId: 'user-save-failed', senhaHash: 'hash-gerado', maxTimeMS: 0 });

  assert.equal(result.kind, 'save_failed');
  assert.equal(result.error?.message, 'falha-save');
});

test('primeiro acesso tenant-aware: owner hasheia antes de delegar ao service fino e preserva o payload derivado local', async () => {
  const callLog = [];
  const primeiroAcessoPost = buildFunction(
    CONTROLLER_SOURCE,
    'export async function primeiroAcessoPost(req, res)',
    {
      bcrypt: {
        hash: async (...args) => {
          callLog.push(['bcrypt.hash', toPlainJson(args)]);
          return 'hash-gerado';
        },
      },
      primeiroAcessoExecutionService: async (args) => {
        callLog.push(['primeiroAcessoExecutionService', toPlainJson(args)]);
        return { kind: 'updated' };
      },
      console: {
        warn() {},
        error() {},
      },
      Number,
      process,
    },
  );

  const req = {
    baseUrl: '/gestor',
    session: { user: { id: '507f1f77bcf86cd799439011' } },
    body: { senha: 'NovaSenha@123', confirmar_senha: 'NovaSenha@123' },
    get: () => '',
  };
  const res = createRes();

  await primeiroAcessoPost(req, res);

  assert.deepEqual(callLog, [
    ['bcrypt.hash', ['NovaSenha@123', 10]],
    ['primeiroAcessoExecutionService', {
      userId: '507f1f77bcf86cd799439011',
      senhaHash: 'hash-gerado',
      maxTimeMS: Number(process.env.MONGO_QUERY_TIMEOUT_MS || 5000),
    }],
  ]);
  assert.equal(res.statusCode, 302);
  assert.equal(res.location, '/gestor/dashboard');
});