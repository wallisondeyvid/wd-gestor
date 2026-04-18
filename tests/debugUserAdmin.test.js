import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { debugSession } from '../src/modules/gestor/app/controllers/debugApiController.js';
import { toggleUsuario } from '../src/modules/gestor/app/controllers/userAdminApiController.js';
import User from '../models/user.js'; // ajuste para ../src/models/user.js se necessário

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/debugApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

function extractExportedAsyncFunction(source, functionName) {
  const signature = `export async function ${functionName}`;
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `Funcao ${functionName} nao encontrada`);

  const bodyStart = source.indexOf('{', start);
  assert.notEqual(bodyStart, -1, `Corpo de ${functionName} nao encontrado`);

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

    if (current === '{') depth += 1;
    else if (current === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }

    index += 1;
  }

  throw new Error(`Nao foi possivel extrair ${functionName}`);
}

async function loadTestUnidadesOwner(dependencies = {}) {
  const functionSource = extractExportedAsyncFunction(CONTROLLER_SOURCE, 'testUnidades');
  const executableSource = `${functionSource.replace('export async function', 'async function')}\nmodule.exports = { testUnidades };`;

  const sandbox = {
    module: { exports: {} },
    exports: {},
    isPrivilegedGestorUser: dependencies.isPrivilegedGestorUser,
    loadScopedDebugUnidades: dependencies.loadScopedDebugUnidades,
    getDebugScopedUnitId: dependencies.getDebugScopedUnitId,
    findAllUnidadesLean: dependencies.findAllUnidadesLean,
    findUnidadePrincipalLean: dependencies.findUnidadePrincipalLean,
    ok: dependencies.ok,
    serverError: dependencies.serverError,
  };

  vm.runInNewContext(executableSource, sandbox, { filename: CONTROLLER_PATH });
  return sandbox.module.exports.testUnidades;
}

function mockRes() {
  const res = { statusCode: 200, headers: {}, jsonPayload: undefined };
  res.status = (code) => { res.statusCode = code; return res; };
  res.set = (k, v) => { res.headers[k] = v; return res; };
  res.json = (p) => { res.jsonPayload = p; return res; };
  res.send = (p) => { res.jsonPayload = p; return res; };
  res.end = () => res;
  return res;
}

async function run(controller, req, res) {
  const maybe = controller(req, res);
  if (maybe && typeof maybe.then === 'function') await maybe;
  else await new Promise(r => setImmediate(r)); // dá 1 tick para sync->json
}

test('debugSession sem usuário retorna ok com user null', async () => {
  const req = { headers: {}, sessionID: 'abc123' };
  const res = mockRes();
  await run(debugSession, req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.jsonPayload?.success, true);
  assert.equal(res.jsonPayload?.data?.user, null);
});

test('toggleUsuario sem master retorna 400/403', async () => {
  const req = { params: { id: 'fakeid' }, user: { role: 'user', isMaster: false } };
  const res = mockRes();
  await run(toggleUsuario, req, res);
  assert.equal([400, 403].includes(res.statusCode), true); // ajuste conforme seu controller
});

test('toggleUsuario usuário inexistente -> 404', async () => {
  const original = User.findById;
  try {
    User.findById = async () => null;
    const req = { params: { id: '651234567890abcdef123456' }, user: { role: 'master', isMaster: true } };
    const res = mockRes();
    await run(toggleUsuario, req, res);
    assert.equal(res.statusCode, 404);
    // opcionalmente:
    // assert.equal(res.jsonPayload?.success, false);
  } finally {
    User.findById = original;
  }
});

test('testUnidades não privilegiado usa somente o cluster contextual em vez de leitura global', async () => {
  const testUnidades = await loadTestUnidadesOwner({
    isPrivilegedGestorUser() {
      return false;
    },
    async loadScopedDebugUnidades(scopedUnitId) {
      assert.equal(scopedUnitId, 'unit-ctx-1');
      return [
        { _id: 'unit-ctx-root', nome: 'Principal Contextual', is_principal: true },
        { _id: 'unit-ctx-1', nome: 'Filial Contextual', is_principal: false },
      ];
    },
    getDebugScopedUnitId() {
      return 'unit-ctx-1';
    },
    async findAllUnidadesLean() {
      throw new Error('nao deveria consultar listagem global');
    },
    async findUnidadePrincipalLean() {
      throw new Error('nao deveria consultar principal global');
    },
    ok(_res, payload) {
      return { kind: 'ok', payload };
    },
    serverError(_res, error) {
      return { kind: 'serverError', error };
    },
  });

  const result = await testUnidades({ user: { role: 'diretor' } }, {});

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    kind: 'ok',
    payload: {
      total_unidades: 2,
      unidade_principal: {
        id: 'unit-ctx-root',
        nome: 'Principal Contextual',
        is_principal: true,
      },
      unidades: [
        { id: 'unit-ctx-root', nome: 'Principal Contextual', is_principal: true },
        { id: 'unit-ctx-1', nome: 'Filial Contextual', is_principal: false },
      ],
    },
  });
});

test('testUnidades privilegiado preserva a leitura global existente', async () => {
  const testUnidades = await loadTestUnidadesOwner({
    isPrivilegedGestorUser() {
      return true;
    },
    async loadScopedDebugUnidades() {
      throw new Error('nao deveria consultar cluster contextual');
    },
    getDebugScopedUnitId() {
      return '';
    },
    async findAllUnidadesLean() {
      return [
        { _id: 'u-1', nome: 'Global A', is_principal: true },
        { _id: 'u-2', nome: 'Global B', is_principal: false },
      ];
    },
    async findUnidadePrincipalLean() {
      return { _id: 'u-1', nome: 'Global A', is_principal: true };
    },
    ok(_res, payload) {
      return { kind: 'ok', payload };
    },
    serverError(_res, error) {
      return { kind: 'serverError', error };
    },
  });

  const result = await testUnidades({ user: { role: 'admin' } }, {});

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    kind: 'ok',
    payload: {
      total_unidades: 2,
      unidade_principal: {
        id: 'u-1',
        nome: 'Global A',
        is_principal: true,
      },
      unidades: [
        { id: 'u-1', nome: 'Global A', is_principal: true },
        { id: 'u-2', nome: 'Global B', is_principal: false },
      ],
    },
  });
});