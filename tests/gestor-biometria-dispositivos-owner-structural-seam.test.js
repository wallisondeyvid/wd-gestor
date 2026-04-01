import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/biometriaApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

function extractExportedFunction(source, functionName) {
  const signature = `export function ${functionName}`;
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

function buildDelegatedOwnerSource() {
  const original = extractExportedFunction(CONTROLLER_SOURCE, 'listarDispositivosApi');
  if (original.includes('readDispositivosCore(')) {
    return original;
  }

  const currentCorePattern = /return\s+ok\s*\(\s*res\s*,\s*listarDispositivos\s*\(\s*\)\s*\)\s*;/;
  const delegatedBlock = [
    'const devices = readDispositivosCore();',
    'return ok(res, devices);',
  ].join(' ');

  const replaced = original.replace(currentCorePattern, delegatedBlock);
  assert.notEqual(replaced, original, 'Nao foi possivel instalar a seam estrutural de listarDispositivosApi em memoria.');
  return replaced;
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
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

function loadOwner(dependencies = {}) {
  const functionSource = extractExportedFunction(CONTROLLER_SOURCE, 'listarDispositivosApi');
  const executableSource = `${functionSource.replace('export function', 'function')}\nmodule.exports = { listarDispositivosApi };`;
  const sandbox = {
    module: { exports: {} },
    exports: {},
    listarDispositivos: dependencies.listarDispositivos,
    readDispositivosCore: dependencies.readDispositivosCore,
    ok: dependencies.ok,
  };

  vm.runInNewContext(executableSource, sandbox, { filename: CONTROLLER_PATH });
  return sandbox.module.exports.listarDispositivosApi;
}

function loadDelegatedOwner(dependencies = {}) {
  const functionSource = buildDelegatedOwnerSource();
  const executableSource = `${functionSource.replace('export function', 'function')}\nmodule.exports = { listarDispositivosApi };`;
  const sandbox = {
    module: { exports: {} },
    exports: {},
    readDispositivosCore: dependencies.readDispositivosCore,
    ok: dependencies.ok,
  };

  vm.runInNewContext(executableSource, sandbox, { filename: CONTROLLER_PATH });
  return sandbox.module.exports.listarDispositivosApi;
}

test('listarDispositivosApi: owner real ainda preserva a resposta HTTP final e a traducao do contrato via ok(res, data)', () => {
  const ownerSource = stripComments(extractExportedFunction(CONTROLLER_SOURCE, 'listarDispositivosApi'));

  assert.match(ownerSource, /return\s+ok\s*\(\s*res\s*,\s*readDispositivosCore\s*\(\s*\)\s*\)/);
  assert.doesNotMatch(ownerSource, /serverError\s*\(/);
  assert.doesNotMatch(ownerSource, /catch\s*\(/);
});

test('listarDispositivosApi: seam estrutural futura recebe apenas o nucleo minimo de leitura e preserva a ordem owner -> seam -> HTTP', () => {
  const callOrder = [];
  const seamCalls = [];

  const listarDispositivosApi = loadDelegatedOwner({
    readDispositivosCore() {
      callOrder.push('seam');
      seamCalls.push({ argsLength: arguments.length });
      return [{ vendorId: 1234, productId: 5678, path: 'hid#1' }];
    },
    ok(_res, payload) {
      callOrder.push('ok');
      return { kind: 'ok', payload };
    },
  });

  const result = listarDispositivosApi({}, makeRes());

  assert.deepEqual(callOrder, ['seam', 'ok']);
  assert.deepEqual(seamCalls, [{ argsLength: 0 }]);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    kind: 'ok',
    payload: [{ vendorId: 1234, productId: 5678, path: 'hid#1' }],
  });
});

test('listarDispositivosApi: owner com seam estrutural futura nao retoma provider ou adaptacao interna direta', () => {
  const delegatedSource = stripComments(buildDelegatedOwnerSource());

  assert.match(delegatedSource, /readDispositivosCore\s*\(\s*\)/);
  assert.match(delegatedSource, /return\s+ok\s*\(\s*res\s*,\s*readDispositivosCore\s*\(\s*\)\s*\)/);

  assert.doesNotMatch(delegatedSource, /listarDispositivos\s*\(/);
  assert.doesNotMatch(delegatedSource, /HID\./);
  assert.doesNotMatch(delegatedSource, /devices\s*\(\s*\)\s*\.map/);
  assert.doesNotMatch(delegatedSource, /vendorId\s*:/);
});

test('listarDispositivosApi: owner real atual ainda executa o caminho feliz sem romper o contrato atual', () => {
  const callOrder = [];

  const listarDispositivosApi = loadOwner({
    readDispositivosCore() {
      callOrder.push('seam');
      return [{ vendorId: 111, productId: 222, path: 'hid#owner' }];
    },
    ok(_res, payload) {
      callOrder.push('ok');
      return { kind: 'ok', payload };
    },
  });

  const result = listarDispositivosApi({}, makeRes());

  assert.deepEqual(callOrder, ['seam', 'ok']);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    kind: 'ok',
    payload: [{ vendorId: 111, productId: 222, path: 'hid#owner' }],
  });
});

test('listarDispositivosApi: owner com seam estrutural futura preserva a propagacao bruta de erro externo atual', () => {
  const boom = new Error('device provider exploded');

  const listarDispositivosApi = loadDelegatedOwner({
    readDispositivosCore() {
      throw boom;
    },
    ok() {
      throw new Error('nao deve responder ok quando a seam falha');
    },
  });

  assert.throws(() => listarDispositivosApi({}, makeRes()), /device provider exploded/);
});