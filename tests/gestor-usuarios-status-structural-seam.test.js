import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

import { statusUsuarioLockStateOwnerService } from '../src/modules/gestor/app/services/usuarios/statusUsuarioLockStateOwner.service.js';

const controllerFile = path.resolve('src/modules/gestor/app/controllers/userController.js');

function extractExportedAsyncFunction(source, functionName) {
  const signature = `export async function ${functionName}`;
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `Função ${functionName} não encontrada`);

  const bodyStart = source.indexOf('{', start);
  assert.notEqual(bodyStart, -1, `Corpo de ${functionName} não encontrado`);

  let index = bodyStart;
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;

  while (index < source.length) {
    const current = source[index];
    const next = source[index + 1];
    const previous = source[index - 1];

    if (inLineComment) {
      if (current === '\n') inLineComment = false;
      index += 1;
      continue;
    }

    if (inBlockComment) {
      if (previous === '*' && current === '/') inBlockComment = false;
      index += 1;
      continue;
    }

    if (!inSingle && !inDouble && !inTemplate) {
      if (current === '/' && next === '/') {
        inLineComment = true;
        index += 1;
        continue;
      }

      if (current === '/' && next === '*') {
        inBlockComment = true;
        index += 1;
        continue;
      }
    }

    if (!inDouble && !inTemplate && current === '\'' && previous !== '\\') {
      inSingle = !inSingle;
      index += 1;
      continue;
    }

    if (!inSingle && !inTemplate && current === '"' && previous !== '\\') {
      inDouble = !inDouble;
      index += 1;
      continue;
    }

    if (!inSingle && !inDouble && current === '`' && previous !== '\\') {
      inTemplate = !inTemplate;
      index += 1;
      continue;
    }

    if (inSingle || inDouble || inTemplate) {
      index += 1;
      continue;
    }

    if (current === '{') {
      depth += 1;
    } else if (current === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }

    index += 1;
  }

  throw new Error(`Não foi possível extrair ${functionName}`);
}

async function loadStatusUsuario(dependencies) {
  const source = await fs.readFile(controllerFile, 'utf8');
  const functionSource = extractExportedAsyncFunction(source, 'statusUsuario');
  const executableSource = `${functionSource.replace('export async function', 'async function')}\nmodule.exports = { statusUsuario };`;

  const sandbox = {
    module: { exports: {} },
    exports: {},
    console: dependencies.console ?? { error() {} },
    findUserByIdSelectAuthLockInfo: dependencies.findUserByIdSelectAuthLockInfo,
    statusUsuarioLockStateOwnerService: dependencies.statusUsuarioLockStateOwnerService,
  };

  vm.runInNewContext(executableSource, sandbox, { filename: controllerFile });
  return sandbox.module.exports.statusUsuario;
}

function createResponseCapture() {
  const record = { statusCode: 200, jsonBody: undefined };
  const res = {
    status(code) {
      record.statusCode = code;
      return this;
    },
    json(body) {
      record.jsonBody = body;
      return body;
    },
  };

  return { res, record };
}

test('statusUsuario delega ao owner service e preserva o envelope final', async () => {
  const loadedUser = {
    _id: 'user-123',
    email: 'status@example.com',
    role: 'user',
  };
  const returnedData = {
    id: 'user-123',
    email: 'status@example.com',
    role: 'user',
    failed_login_attempts: 2,
    lock_until: null,
    locked: false,
    seconds_remaining: 0,
    minutes_remaining: 0,
  };

  const calls = {
    repoId: null,
    serviceArgs: null,
  };

  const statusUsuario = await loadStatusUsuario({
    async findUserByIdSelectAuthLockInfo(id) {
      calls.repoId = id;
      return loadedUser;
    },
    async statusUsuarioLockStateOwnerService(args) {
      calls.serviceArgs = args;
      return { kind: 'ok', data: returnedData };
    },
  });

  const { res, record } = createResponseCapture();
  const req = {
    user: { id: 'admin-1', role: 'admin', isMaster: false },
    params: { id: 'user-123' },
  };

  await statusUsuario(req, res);

  assert.equal(calls.repoId, 'user-123');
  assert.equal(calls.serviceArgs?.user, loadedUser);
  assert.equal(Object.prototype.toString.call(calls.serviceArgs?.now), '[object Date]');
  assert.deepEqual(JSON.parse(JSON.stringify(record.jsonBody)), {
    success: true,
    data: returnedData,
  });
});

test('statusUsuarioLockStateOwnerService preserva os cálculos semânticos do lock state', async () => {
  const now = new Date('2026-03-28T10:00:00.000Z');
  const futureLockUntil = new Date('2026-03-28T10:01:01.000Z');

  const lockedResult = await statusUsuarioLockStateOwnerService({
    user: {
      _id: 'locked-user',
      email: 'locked@example.com',
      role: 'user',
      failed_login_attempts: 2,
      lock_until: futureLockUntil,
    },
    now,
  });

  assert.deepEqual(lockedResult, {
    kind: 'ok',
    data: {
      id: 'locked-user',
      email: 'locked@example.com',
      role: 'user',
      failed_login_attempts: 2,
      lock_until: futureLockUntil,
      locked: true,
      seconds_remaining: 61,
      minutes_remaining: 2,
    },
  });

  const unlockedResult = await statusUsuarioLockStateOwnerService({
    user: {
      _id: 'unlocked-user',
      email: 'unlocked@example.com',
      role: 'diretor',
      failed_login_attempts: undefined,
      lock_until: null,
    },
    now,
  });

  assert.deepEqual(unlockedResult, {
    kind: 'ok',
    data: {
      id: 'unlocked-user',
      email: 'unlocked@example.com',
      role: 'diretor',
      failed_login_attempts: 0,
      lock_until: null,
      locked: false,
      seconds_remaining: 0,
      minutes_remaining: 0,
    },
  });
});