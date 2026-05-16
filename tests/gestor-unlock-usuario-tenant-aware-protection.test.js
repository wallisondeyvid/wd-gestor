import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/userController.js');
const SERVICE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/services/usuarios/unlockUsuarioExecution.service.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');
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

function createResCapture() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function toPlainJson(value) {
  return JSON.parse(JSON.stringify(value));
}

test('unlock tenant-aware: cadeia owner -> lookup -> service -> saveUserDoc permanece explicita sem abrir big-bang', async () => {
  const ownerBlock = extractFunction(CONTROLLER_SOURCE, 'export async function unlockUsuario');
  const serviceBlock = extractFunction(SERVICE_SOURCE, 'export async function unlockUsuarioExecutionService');

  assert.match(ownerBlock, /const \{ id \} = req\.params;/);
  assert.match(ownerBlock, /const user = await findUserById\(id\);/);
  assert.match(ownerBlock, /if \(!user\) return res\.status\(404\)\.json\(\{ success:false, error:'Usuário não encontrado', code:'NOT_FOUND' \}\);/);
  assert.match(ownerBlock, /const result = await unlockUsuarioExecutionService\(\{ user \}\);/);
  assert.match(ownerBlock, /return res\.json\(\{ success:true, unlocked: result\.unlocked, id: result\.userId \}\);/);

  assert.match(serviceBlock, /user\.failed_login_attempts = 0;/);
  assert.match(serviceBlock, /user\.lock_until = null;/);
  assert.match(serviceBlock, /await saveUserDoc\(user\);/);

  const lookupIndex = ownerBlock.indexOf('findUserById(id)');
  const notFoundIndex = ownerBlock.indexOf('if (!user)');
  const delegateIndex = ownerBlock.indexOf('unlockUsuarioExecutionService({ user })');
  const resetAttemptsIndex = serviceBlock.indexOf('user.failed_login_attempts = 0;');
  const resetLockIndex = serviceBlock.indexOf('user.lock_until = null;');
  const saveIndex = serviceBlock.indexOf('saveUserDoc(user)');

  assert.ok(lookupIndex >= 0, 'O owner deve buscar o usuario por id antes de delegar.');
  assert.ok(notFoundIndex > lookupIndex, 'O owner deve rejeitar usuario inexistente antes da delegacao ao service.');
  assert.ok(delegateIndex > notFoundIndex, 'A delegacao ao service deve ocorrer somente apos o gate de usuario inexistente.');
  assert.ok(resetLockIndex > resetAttemptsIndex, 'O service deve limpar lock state antes do write final.');
  assert.ok(saveIndex > resetLockIndex, 'O write final nao pode ocorrer antes da limpeza do lock state.');
});

test('unlock tenant-aware: usuario inexistente nao delega ao service nem cria precedente de write por id', async () => {
  const serviceCalls = [];
  const unlockUsuario = buildFunction(CONTROLLER_SOURCE, 'export async function unlockUsuario', {
    findUserById: async (id) => {
      assert.equal(id, 'u-ausente');
      return null;
    },
    unlockUsuarioExecutionService: async (input) => {
      serviceCalls.push(input);
      return { kind: 'ok', userId: 'u-ausente', unlocked: true };
    },
    console,
  });

  const req = {
    user: { isMaster: false, role: 'admin' },
    params: { id: 'u-ausente' },
  };
  const res = createResCapture();

  await unlockUsuario(req, res);

  assert.equal(serviceCalls.length, 0);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(toPlainJson(res.body), {
    success: false,
    error: 'Usuário não encontrado',
    code: 'NOT_FOUND',
  });
});

test('unlock tenant-aware: owner delega o user carregado por id ao service fino no caminho feliz', async () => {
  const serviceCalls = [];
  const user = { _id: 'u-1', failed_login_attempts: 3, lock_until: '2030-01-01T00:00:00.000Z' };

  const unlockUsuario = buildFunction(CONTROLLER_SOURCE, 'export async function unlockUsuario', {
    findUserById: async (id) => {
      assert.equal(id, 'u-1');
      return user;
    },
    unlockUsuarioExecutionService: async (input) => {
      serviceCalls.push(input);
      return { kind: 'ok', userId: 'u-1', unlocked: true };
    },
    console,
  });

  const req = {
    user: { isMaster: true, role: 'master' },
    params: { id: 'u-1' },
  };
  const res = createResCapture();

  await unlockUsuario(req, res);

  assert.equal(serviceCalls.length, 1);
  assert.equal(serviceCalls[0].user, user);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(toPlainJson(res.body), {
    success: true,
    unlocked: true,
    id: 'u-1',
  });
});

test('unlock tenant-aware: usuario bloqueado limpa lock state antes do saveUserDoc e persiste o user mutado', async () => {
  const saveCalls = [];
  const unlockUsuarioExecutionService = buildFunction(
    SERVICE_SOURCE,
    'export async function unlockUsuarioExecutionService',
    {
      saveUserDoc: async (user) => {
        saveCalls.push({
          _id: user._id,
          failed_login_attempts: user.failed_login_attempts,
          lock_until: user.lock_until,
        });
      },
    },
  );

  const user = {
    _id: 'u-bloqueado',
    failed_login_attempts: 9,
    lock_until: new Date('2035-01-01T00:00:00.000Z'),
  };

  const result = await unlockUsuarioExecutionService({ user });

  assert.equal(user.failed_login_attempts, 0);
  assert.equal(user.lock_until, null);
  assert.deepEqual(saveCalls, [
    {
      _id: 'u-bloqueado',
      failed_login_attempts: 0,
      lock_until: null,
    },
  ]);
  assert.deepEqual(toPlainJson(result), {
    kind: 'ok',
    userId: 'u-bloqueado',
    unlocked: true,
  });
});

test('unlock tenant-aware: usuario ja desbloqueado preserva o contrato observado local sem legitimar write global generico', async () => {
  const saveCalls = [];
  const unlockUsuarioExecutionService = buildFunction(
    SERVICE_SOURCE,
    'export async function unlockUsuarioExecutionService',
    {
      saveUserDoc: async (user) => {
        saveCalls.push({
          _id: user._id,
          failed_login_attempts: user.failed_login_attempts,
          lock_until: user.lock_until,
        });
      },
    },
  );

  const user = {
    _id: 'u-ja-desbloqueado',
    failed_login_attempts: 0,
    lock_until: null,
  };

  const result = await unlockUsuarioExecutionService({ user });

  assert.equal(saveCalls.length, 1);
  assert.deepEqual(saveCalls[0], {
    _id: 'u-ja-desbloqueado',
    failed_login_attempts: 0,
    lock_until: null,
  });
  assert.deepEqual(toPlainJson(result), {
    kind: 'ok',
    userId: 'u-ja-desbloqueado',
    unlocked: true,
  });
});

test('unlock tenant-aware: erro de saveUserDoc propaga o contrato atual do service fino', async () => {
  const unlockUsuarioExecutionService = buildFunction(
    SERVICE_SOURCE,
    'export async function unlockUsuarioExecutionService',
    {
      saveUserDoc: async () => {
        throw new Error('falha-save');
      },
    },
  );

  const user = {
    _id: 'u-falha',
    failed_login_attempts: 2,
    lock_until: new Date('2031-01-01T00:00:00.000Z'),
  };

  await assert.rejects(
    () => unlockUsuarioExecutionService({ user }),
    /falha-save/,
  );

  assert.equal(user.failed_login_attempts, 0);
  assert.equal(user.lock_until, null);
});