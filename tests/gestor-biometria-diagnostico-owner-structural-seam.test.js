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
  const original = extractExportedFunction(CONTROLLER_SOURCE, 'diagnosticoBiometria');
  if (original.includes('runDiagnosticoBiometriaCore(')) {
    return original;
  }

  const currentCorePattern = /const devices = listarDispositivos\(\);[\s\S]*?return ok\(res, \{ sistema:process\.platform, qtd:devices\.length, resultados \}\);/;
  const delegatedBlock = [
    'const result = runDiagnosticoBiometriaCore();',
    'return ok(res, result);',
  ].join(' ');

  const replaced = original.replace(currentCorePattern, delegatedBlock);
  assert.notEqual(replaced, original, 'Nao foi possivel instalar a seam estrutural de diagnosticoBiometria em memoria.');
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
  const functionSource = extractExportedFunction(CONTROLLER_SOURCE, 'diagnosticoBiometria');
  const executableSource = `${functionSource.replace('export function', 'function')}\nmodule.exports = { diagnosticoBiometria };`;
  const sandbox = {
    module: { exports: {} },
    exports: {},
    biometriaEnabled: dependencies.biometriaEnabled,
    HID: dependencies.HID,
    process: dependencies.process,
    listarDispositivos: dependencies.listarDispositivos,
    runDiagnosticoBiometriaCore: dependencies.runDiagnosticoBiometriaCore,
    ok: dependencies.ok,
    badRequest: dependencies.badRequest,
  };

  vm.runInNewContext(executableSource, sandbox, { filename: CONTROLLER_PATH });
  return sandbox.module.exports.diagnosticoBiometria;
}

function loadDelegatedOwner(dependencies = {}) {
  const functionSource = buildDelegatedOwnerSource();
  const executableSource = `${functionSource.replace('export function', 'function')}\nmodule.exports = { diagnosticoBiometria };`;
  const sandbox = {
    module: { exports: {} },
    exports: {},
    biometriaEnabled: dependencies.biometriaEnabled,
    HID: dependencies.HID,
    process: dependencies.process,
    runDiagnosticoBiometriaCore: dependencies.runDiagnosticoBiometriaCore,
    ok: dependencies.ok,
    badRequest: dependencies.badRequest,
  };

  vm.runInNewContext(executableSource, sandbox, { filename: CONTROLLER_PATH });
  return sandbox.module.exports.diagnosticoBiometria;
}

test('diagnosticoBiometria: owner real ainda preserva ramo disabled, traducao HTTP final e guard de HID ausente', () => {
  const ownerSource = stripComments(extractExportedFunction(CONTROLLER_SOURCE, 'diagnosticoBiometria'));

  assert.match(ownerSource, /if\s*\(!biometriaEnabled\)\s*\{\s*return ok\(res, \{[\s\S]*disabled:\s*true[\s\S]*\}\);\s*\}/);
  assert.match(ownerSource, /if\s*\(!HID\)\s*\{\s*return badRequest\(res,'node-hid ausente'\);\s*\}/);
  assert.match(ownerSource, /return ok\(res, runDiagnosticoBiometriaCore\(\)\)/);
  assert.doesNotMatch(ownerSource, /serverError\s*\(/);
  assert.doesNotMatch(ownerSource, /try\s*\{\s*if\s*\(!biometriaEnabled\)/);
});

test('diagnosticoBiometria: seam estrutural futura recebe apenas o nucleo minimo de diagnostico e preserva ordem owner -> seam -> HTTP', () => {
  const callOrder = [];
  const seamCalls = [];

  const diagnosticoBiometria = loadDelegatedOwner({
    biometriaEnabled: true,
    HID: { HID: class {} },
    process: { platform: 'win32' },
    runDiagnosticoBiometriaCore() {
      callOrder.push('seam');
      seamCalls.push({ argsLength: arguments.length });
      return {
        sistema: 'win32',
        qtd: 1,
        resultados: [{ vendorId: 1, opened: true }],
      };
    },
    ok(_res, payload) {
      callOrder.push('ok');
      return { kind: 'ok', payload };
    },
    badRequest() {
      callOrder.push('badRequest');
    },
  });

  const result = diagnosticoBiometria({}, makeRes());

  assert.deepEqual(callOrder, ['seam', 'ok']);
  assert.deepEqual(seamCalls, [{ argsLength: 0 }]);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    kind: 'ok',
    payload: {
      sistema: 'win32',
      qtd: 1,
      resultados: [{ vendorId: 1, opened: true }],
    },
  });
});

test('diagnosticoBiometria: owner com seam estrutural futura preserva no owner o ramo disabled atual', () => {
  const callOrder = [];

  const diagnosticoBiometria = loadDelegatedOwner({
    biometriaEnabled: false,
    HID: null,
    process: { platform: 'linux' },
    runDiagnosticoBiometriaCore() {
      callOrder.push('seam');
      throw new Error('nao deve chamar seam no ramo disabled');
    },
    ok(_res, payload) {
      callOrder.push('ok');
      return { kind: 'ok', payload };
    },
    badRequest() {
      callOrder.push('badRequest');
    },
  });

  const result = diagnosticoBiometria({}, makeRes());

  assert.deepEqual(callOrder, ['ok']);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    kind: 'ok',
    payload: {
      sistema: 'linux',
      qtd: 0,
      resultados: [],
      disabled: true,
    },
  });
});

test('diagnosticoBiometria: owner com seam estrutural futura preserva traducao de HID ausente para badRequest', () => {
  const callOrder = [];

  const diagnosticoBiometria = loadDelegatedOwner({
    biometriaEnabled: true,
    HID: null,
    process: { platform: 'win32' },
    runDiagnosticoBiometriaCore() {
      callOrder.push('seam');
      throw new Error('nao deve chamar seam sem HID');
    },
    ok() {
      callOrder.push('ok');
    },
    badRequest(_res, message) {
      callOrder.push(`badRequest:${message}`);
      return { kind: 'badRequest', message };
    },
  });

  const result = diagnosticoBiometria({}, makeRes());

  assert.deepEqual(callOrder, ['badRequest:node-hid ausente']);
  assert.deepEqual(result, { kind: 'badRequest', message: 'node-hid ausente' });
});

test('diagnosticoBiometria: owner com seam estrutural futura nao retoma provider, abertura ou classificacao interna direta', () => {
  const delegatedSource = stripComments(buildDelegatedOwnerSource());

  assert.match(delegatedSource, /runDiagnosticoBiometriaCore\s*\(\s*\)/);
  assert.match(delegatedSource, /return ok\(res, runDiagnosticoBiometriaCore\(\)\)/);

  assert.doesNotMatch(delegatedSource, /listarDispositivos\s*\(/);
  assert.doesNotMatch(delegatedSource, /new HID\.HID\s*\(/);
  assert.doesNotMatch(delegatedSource, /possivelIntegrado/);
  assert.doesNotMatch(delegatedSource, /dev\.close\s*\(/);
});

test('diagnosticoBiometria: owner com seam estrutural futura preserva a propagacao bruta de erro externo atual', () => {
  const boom = new Error('diagnostico exploded');

  const diagnosticoBiometria = loadDelegatedOwner({
    biometriaEnabled: true,
    HID: { HID: class {} },
    process: { platform: 'win32' },
    runDiagnosticoBiometriaCore() {
      throw boom;
    },
    ok() {
      throw new Error('nao deve responder ok quando a seam falha');
    },
    badRequest() {
      throw new Error('nao deve responder badRequest quando a seam falha');
    },
  });

  assert.throws(() => diagnosticoBiometria({}, makeRes()), /diagnostico exploded/);
});