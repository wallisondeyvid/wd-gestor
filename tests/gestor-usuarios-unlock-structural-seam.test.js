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

test('unlockUsuario delega ao owner service e preserva o shape estrutural do JSON final', async () => {
  const serviceCalls = [];
  const user = { _id: 'u-1' };

  const unlockUsuarioExecutionService = async (input) => {
    serviceCalls.push(input);
    return {
      kind: 'ok',
      userId: 'u-1',
      unlocked: true,
    };
  };

  const unlockUsuario = buildFunction(CONTROLLER_SOURCE, 'export async function unlockUsuario', {
    findUserById: async (id) => {
      assert.equal(id, 'u-1');
      return user;
    },
    unlockUsuarioExecutionService,
    console,
  });

  const req = {
    user: { isMaster: false, role: 'admin' },
    params: { id: 'u-1' },
  };
  const res = createResCapture();

  await unlockUsuario(req, res);

  assert.equal(serviceCalls.length, 1);
  assert.equal(serviceCalls[0].user, user);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.unlocked, true);
  assert.equal(res.body.id, 'u-1');
});

test('unlockUsuarioExecutionService preserva a mutacao minima de unlock e persiste o User', async () => {
  const saveCalls = [];
  const unlockUsuarioExecutionService = buildFunction(SERVICE_SOURCE, 'export async function unlockUsuarioExecutionService', {
    saveUserDoc: async (user) => {
      saveCalls.push({
        _id: user._id,
        failed_login_attempts: user.failed_login_attempts,
        lock_until: user.lock_until,
      });
    },
  });

  const user = {
    _id: 'u-2',
    failed_login_attempts: 7,
    lock_until: new Date('2030-01-01T00:00:00.000Z'),
  };

  const result = await unlockUsuarioExecutionService({ user });

  assert.equal(user.failed_login_attempts, 0);
  assert.equal(user.lock_until, null);
  assert.equal(saveCalls.length, 1);
  assert.equal(saveCalls[0]._id, 'u-2');
  assert.equal(saveCalls[0].failed_login_attempts, 0);
  assert.equal(saveCalls[0].lock_until, null);
  assert.equal(result.kind, 'ok');
  assert.equal(result.userId, 'u-2');
  assert.equal(result.unlocked, true);
});