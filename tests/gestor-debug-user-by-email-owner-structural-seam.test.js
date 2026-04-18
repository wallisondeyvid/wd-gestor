import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

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

  throw new Error(`Nao foi possivel extrair ${functionName}`);
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

async function loadOwner(dependencies = {}) {
  const functionSource = extractExportedAsyncFunction(CONTROLLER_SOURCE, 'userByEmail');
  const executableSource = `${functionSource.replace('export async function', 'async function')}\nmodule.exports = { userByEmail };`;

  const sandbox = {
    module: { exports: {} },
    exports: {},
    readUserByEmail: dependencies.readUserByEmail,
    ensureDebugUserLookupAllowed: dependencies.ensureDebugUserLookupAllowed || (async () => true),
    ok: dependencies.ok,
    badRequest: dependencies.badRequest,
    notFound: dependencies.notFound,
    serverError: dependencies.serverError,
  };

  vm.runInNewContext(executableSource, sandbox, { filename: CONTROLLER_PATH });
  return sandbox.module.exports.userByEmail;
}

test('userByEmail: owner real valida 400 quando email faltar', async () => {
  const callOrder = [];
  const userByEmail = await loadOwner({
    async readUserByEmail() {
      callOrder.push('lookup');
      throw new Error('nao deveria consultar');
    },
    ok() {
      callOrder.push('ok');
    },
    badRequest(_res, message) {
      callOrder.push(`badRequest:${message}`);
      return { kind: 'badRequest', message };
    },
    notFound() {
      callOrder.push('notFound');
    },
    serverError() {
      callOrder.push('serverError');
    },
  });

  const result = await userByEmail({ params: {} }, {});

  assert.deepEqual(callOrder, ['badRequest:Email obrigatório']);
  assert.deepEqual(result, { kind: 'badRequest', message: 'Email obrigatório' });
});

test('userByEmail: owner real normaliza para lowercase, delega lookup e projeta payload HTTP final', async () => {
  const callOrder = [];
  let capturedLookupArg = null;

  const userByEmail = await loadOwner({
    async readUserByEmail(email) {
      callOrder.push('lookup');
      capturedLookupArg = email;
      return {
        _id: 'user-123',
        email: 'mixed@example.com',
        role: 'admin',
        ativo: true,
        unidade_id: 'u-1',
        ignored: 'nao deve vazar',
      };
    },
    async ensureDebugUserLookupAllowed() {
      callOrder.push('allow');
      return true;
    },
    ok(_res, payload) {
      callOrder.push('ok');
      return { kind: 'ok', payload };
    },
    badRequest() {
      callOrder.push('badRequest');
    },
    notFound() {
      callOrder.push('notFound');
    },
    serverError() {
      callOrder.push('serverError');
    },
  });

  const result = await userByEmail({ params: { email: 'Mixed@Example.COM' } }, {});

  assert.equal(capturedLookupArg, 'mixed@example.com');
  assert.deepEqual(callOrder, ['lookup', 'allow', 'ok']);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    kind: 'ok',
    payload: {
      _id: 'user-123',
      email: 'mixed@example.com',
      role: 'admin',
      ativo: true,
      unidade_id: 'u-1',
    },
  });
});

test('userByEmail: owner real traduz lookup vazio para 404', async () => {
  const callOrder = [];
  const userByEmail = await loadOwner({
    async readUserByEmail() {
      callOrder.push('lookup');
      return null;
    },
    ok() {
      callOrder.push('ok');
    },
    badRequest() {
      callOrder.push('badRequest');
    },
    notFound(_res, message) {
      callOrder.push(`notFound:${message}`);
      return { kind: 'notFound', message };
    },
    serverError() {
      callOrder.push('serverError');
    },
  });

  const result = await userByEmail({ params: { email: 'missing@example.com' } }, {});

  assert.deepEqual(callOrder, ['lookup', 'notFound:Usuário não encontrado']);
  assert.deepEqual(result, { kind: 'notFound', message: 'Usuário não encontrado' });
});

test('userByEmail: owner real converte alvo fora do contexto permitido em 404 opaco', async () => {
  const callOrder = [];
  const userByEmail = await loadOwner({
    async readUserByEmail() {
      callOrder.push('lookup');
      return {
        _id: 'user-999',
        email: 'blocked@example.com',
        role: 'user',
        ativo: true,
        unidade_id: 'u-blocked',
      };
    },
    async ensureDebugUserLookupAllowed() {
      callOrder.push('allow');
      return false;
    },
    ok() {
      callOrder.push('ok');
    },
    badRequest() {
      callOrder.push('badRequest');
    },
    notFound(_res, message) {
      callOrder.push(`notFound:${message}`);
      return { kind: 'notFound', message };
    },
    serverError() {
      callOrder.push('serverError');
    },
  });

  const result = await userByEmail({ params: { email: 'blocked@example.com' }, user: { role: 'diretor' } }, {});

  assert.deepEqual(callOrder, ['lookup', 'allow', 'notFound:Usuário não encontrado']);
  assert.deepEqual(result, { kind: 'notFound', message: 'Usuário não encontrado' });
});

test('userByEmail: owner real traduz erro externo para 500', async () => {
  const callOrder = [];
  const boom = new Error('lookup exploded');
  const userByEmail = await loadOwner({
    async readUserByEmail() {
      callOrder.push('lookup');
      throw boom;
    },
    ok() {
      callOrder.push('ok');
    },
    badRequest() {
      callOrder.push('badRequest');
    },
    notFound() {
      callOrder.push('notFound');
    },
    serverError(_res, error) {
      callOrder.push('serverError');
      return { kind: 'serverError', error };
    },
  });

  const result = await userByEmail({ params: { email: 'boom@example.com' } }, {});

  assert.deepEqual(callOrder, ['lookup', 'serverError']);
  assert.equal(result?.kind, 'serverError');
  assert.equal(result?.error, boom);
});

test('userByEmail: owner deve largar o lookup direto para uma seam minima dedicada', () => {
  const ownerSource = stripComments(extractExportedAsyncFunction(CONTROLLER_SOURCE, 'userByEmail'));

  assert.match(ownerSource, /const\s*\{\s*email\s*\}\s*=\s*req\.params/);
  assert.match(ownerSource, /if\s*\(!email\)\s*return\s+badRequest\s*\(\s*res\s*,\s*'Email obrigatório'\s*\)/);
  assert.match(ownerSource, /email\.toLowerCase\s*\(\s*\)/);
  assert.match(ownerSource, /readUserByEmail\s*\(\s*email\.toLowerCase\s*\(\s*\)\s*\)/);
  assert.match(ownerSource, /ensureDebugUserLookupAllowed\s*\(\s*\{\s*req\s*,\s*user\s*\}\s*\)/);
  assert.match(ownerSource, /if\s*\(!user\)\s*return\s+notFound\s*\(\s*res\s*,\s*'Usuário não encontrado'\s*\)/);
  assert.match(ownerSource, /return\s+ok\s*\(\s*res\s*,\s*\{/);
  assert.match(ownerSource, /return\s+serverError\s*\(\s*res\s*,\s*e\s*\)/);

  assert.doesNotMatch(
    ownerSource,
    /findUserByEmailCondLean\s*\(/,
    [
      'Owner ainda faz lookup direto na bridge dentro de userByEmail.',
      'A proxima costura deve mover apenas a leitura por email normalizado para uma seam minima,',
      'mantendo no owner validacao, 404, projecao HTTP final e 500.',
    ].join(' '),
  );
});