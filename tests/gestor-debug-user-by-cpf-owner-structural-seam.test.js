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
  const functionSource = extractExportedAsyncFunction(CONTROLLER_SOURCE, 'userByCpf');
  const executableSource = `${functionSource.replace('export async function', 'async function')}\nmodule.exports = { userByCpf };`;

  const sandbox = {
    module: { exports: {} },
    exports: {},
    readUserByCpf: dependencies.readUserByCpf,
    ok: dependencies.ok,
    badRequest: dependencies.badRequest,
    notFound: dependencies.notFound,
    serverError: dependencies.serverError,
  };

  vm.runInNewContext(executableSource, sandbox, { filename: CONTROLLER_PATH });
  return sandbox.module.exports.userByCpf;
}

test('userByCpf: owner real valida 400 quando cpf faltar', async () => {
  const callOrder = [];
  const userByCpf = await loadOwner({
    async readUserByCpf() {
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

  const result = await userByCpf({ params: {} }, {});

  assert.deepEqual(callOrder, ['badRequest:CPF obrigatório']);
  assert.deepEqual(result, { kind: 'badRequest', message: 'CPF obrigatório' });
});

test('userByCpf: owner real normaliza cpf, delega lookup e projeta payload HTTP final', async () => {
  const callOrder = [];
  let capturedLookupArg = null;

  const userByCpf = await loadOwner({
    async readUserByCpf(cpf) {
      callOrder.push('lookup');
      capturedLookupArg = cpf;
      return {
        _id: 'user-456',
        email: 'cpf@example.com',
        role: 'user',
        ativo: true,
        unidade_id: 'u-2',
        ignored: 'nao deve vazar',
      };
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

  const result = await userByCpf({ params: { cpf: '123.456.789-01' } }, {});

  assert.equal(capturedLookupArg, '12345678901');
  assert.deepEqual(callOrder, ['lookup', 'ok']);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    kind: 'ok',
    payload: {
      _id: 'user-456',
      email: 'cpf@example.com',
      role: 'user',
      ativo: true,
      unidade_id: 'u-2',
    },
  });
});

test('userByCpf: owner real traduz lookup vazio para 404', async () => {
  const callOrder = [];
  const userByCpf = await loadOwner({
    async readUserByCpf() {
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

  const result = await userByCpf({ params: { cpf: '99999999999' } }, {});

  assert.deepEqual(callOrder, ['lookup', 'notFound:Usuário não encontrado']);
  assert.deepEqual(result, { kind: 'notFound', message: 'Usuário não encontrado' });
});

test('userByCpf: owner real traduz erro externo para 500', async () => {
  const callOrder = [];
  const boom = new Error('lookup exploded');
  const userByCpf = await loadOwner({
    async readUserByCpf() {
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

  const result = await userByCpf({ params: { cpf: '11122233344' } }, {});

  assert.deepEqual(callOrder, ['lookup', 'serverError']);
  assert.equal(result?.kind, 'serverError');
  assert.equal(result?.error, boom);
});

test('userByCpf: owner deve largar o lookup direto para uma seam minima dedicada', () => {
  const ownerSource = stripComments(extractExportedAsyncFunction(CONTROLLER_SOURCE, 'userByCpf'));

  assert.match(ownerSource, /const\s*\{\s*cpf\s*\}\s*=\s*req\.params/);
  assert.match(ownerSource, /if\s*\(!cpf\)\s*return\s+badRequest\s*\(\s*res\s*,\s*'CPF obrigatório'\s*\)/);
  assert.match(ownerSource, /cpf\.replace\s*\(\s*\/\\D\/g\s*,\s*''\s*\)/);
  assert.match(ownerSource, /if\s*\(!user\)\s*return\s+notFound\s*\(\s*res\s*,\s*'Usuário não encontrado'\s*\)/);
  assert.match(ownerSource, /return\s+ok\s*\(\s*res\s*,\s*\{/);
  assert.match(ownerSource, /return\s+serverError\s*\(\s*res\s*,\s*e\s*\)/);

  assert.doesNotMatch(
    ownerSource,
    /findUserByCpfCondLean\s*\(/,
    [
      'Owner ainda faz lookup direto na bridge dentro de userByCpf.',
      'A proxima costura deve mover apenas a leitura por cpf normalizado para uma seam minima,',
      'mantendo no owner validacao, 404, projecao HTTP final e 500.',
    ].join(' '),
  );
});