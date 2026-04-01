import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/biometriaApiController.js');
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

function buildDelegatedOwnerSource() {
  const original = extractExportedAsyncFunction(CONTROLLER_SOURCE, 'capturarBiometria');
  if (original.includes('runCapturaBiometriaCore(')) {
    return original;
  }

  const currentCorePattern = /let \{ vendorId, productId, path: devPath, timeoutMs=5000, minBytes=32, maxBytes=2048, poke=false, handshakeStrategy='basic', handshakeReports=\[\] \} = req\.body \|\| \{\};[\s\S]*?\}, timeoutMs\);/;
  const delegatedBlock = [
    "let { vendorId, productId, path: devPath, timeoutMs=5000, minBytes=32, maxBytes=2048, poke=false, handshakeStrategy='basic', handshakeReports=[] } = req.body || {};",
    'vendorId=normId(vendorId);',
    'productId=normId(productId);',
    'timeoutMs=parseInt(timeoutMs,10)||5000;',
    'minBytes=parseInt(minBytes,10)||32;',
    'maxBytes=parseInt(maxBytes,10)||2048;',
    'const payload = await runCapturaBiometriaCore({ vendorId, productId, devPath, timeoutMs, minBytes, maxBytes, poke, handshakeStrategy, handshakeReports });',
    "if (!payload || !payload.error) return res.json(payload);",
    "const statusCode = payload.error==='Dispositivo não encontrado no servidor'?404:payload.error==='Timeout sem dados'?504:500;",
    'return res.status(statusCode).json(payload);',
  ].join(' ');

  const replaced = original.replace(currentCorePattern, delegatedBlock);
  assert.notEqual(replaced, original, 'Nao foi possivel instalar a seam estrutural de capturarBiometria em memoria.');
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
  const functionSource = extractExportedAsyncFunction(CONTROLLER_SOURCE, 'capturarBiometria');
  const executableSource = `${functionSource.replace('export async function', 'async function')}\nmodule.exports = { capturarBiometria };`;
  const sandbox = {
    module: { exports: {} },
    exports: {},
    biometriaEnabled: dependencies.biometriaEnabled,
    HID: dependencies.HID,
    isTest: dependencies.isTest,
    normId: dependencies.normId,
    parseInt,
    runCapturaBiometriaCore: dependencies.runCapturaBiometriaCore,
    listarDispositivos: dependencies.listarDispositivos,
    badRequest: dependencies.badRequest,
    console: dependencies.console || console,
    Date: dependencies.Date || Date,
    Buffer,
    setTimeout: dependencies.setTimeout || setTimeout,
    Array,
  };

  vm.runInNewContext(executableSource, sandbox, { filename: CONTROLLER_PATH });
  return sandbox.module.exports.capturarBiometria;
}

function loadDelegatedOwner(dependencies = {}) {
  const functionSource = buildDelegatedOwnerSource();
  const executableSource = `${functionSource.replace('export async function', 'async function')}\nmodule.exports = { capturarBiometria };`;
  const sandbox = {
    module: { exports: {} },
    exports: {},
    biometriaEnabled: dependencies.biometriaEnabled,
    HID: dependencies.HID,
    isTest: dependencies.isTest,
    normId: dependencies.normId,
    parseInt,
    runCapturaBiometriaCore: dependencies.runCapturaBiometriaCore,
    badRequest: dependencies.badRequest,
    console: dependencies.console || console,
    Date: dependencies.Date || Date,
    Buffer,
    setTimeout: dependencies.setTimeout || setTimeout,
    Array,
  };

  vm.runInNewContext(executableSource, sandbox, { filename: CONTROLLER_PATH });
  return sandbox.module.exports.capturarBiometria;
}

test('capturarBiometria: owner real ainda preserva ramo disabled, guard de HID, leitura de req.body e traducao HTTP final', () => {
  const ownerSource = stripComments(extractExportedAsyncFunction(CONTROLLER_SOURCE, 'capturarBiometria'));

  assert.match(ownerSource, /if\s*\(!biometriaEnabled\)\s*\{\s*return res\.status\(503\)\.json\(\{ error: 'Biometria desabilitada no servidor', code: 'BIOMETRIA_DISABLED' \}\);\s*\}/);
  assert.match(ownerSource, /if\s*\(!HID\)\s*\{\s*return badRequest\(res,'node-hid ausente no servidor'\);\s*\}/);
  assert.match(ownerSource, /req\.body\s*\|\|\s*\{\}/);
  assert.match(ownerSource, /vendorId=normId\(vendorId\)/);
  assert.match(ownerSource, /productId=normId\(productId\)/);
  assert.doesNotMatch(ownerSource, /serverError\s*\(/);
});

test('capturarBiometria: seam estrutural futura recebe apenas os parametros normalizados de captura e preserva ordem owner -> seam -> HTTP', async () => {
  const callOrder = [];
  const seamCalls = [];
  const res = makeRes();

  const capturarBiometria = loadDelegatedOwner({
    biometriaEnabled: true,
    HID: { HID: class {} },
    isTest: true,
    normId(value) {
      if (value === undefined || value === null || value === '') return null;
      if (typeof value === 'string' && /^0x/i.test(value.trim())) return Number.parseInt(value, 16);
      return Number.parseInt(value, 10);
    },
    async runCapturaBiometriaCore(args) {
      callOrder.push('seam');
      seamCalls.push(JSON.parse(JSON.stringify(args)));
      return { template: 'abcd', bytes: 2 };
    },
    badRequest() {
      callOrder.push('badRequest');
    },
  });

  await capturarBiometria({
    body: {
      vendorId: '0x1234',
      productId: '5678',
      path: 'hid#1',
      timeoutMs: '7000',
      minBytes: '64',
      maxBytes: '2049',
      poke: true,
      handshakeStrategy: 'basic',
      handshakeReports: ['0102'],
    },
  }, {
    status(code) {
      callOrder.push(`status:${code}`);
      return res.status(code);
    },
    json(payload) {
      callOrder.push('json');
      return res.json(payload);
    },
  });

  assert.deepEqual(callOrder, ['seam', 'json']);
  assert.deepEqual(seamCalls, [{
    vendorId: 4660,
    productId: 5678,
    devPath: 'hid#1',
    timeoutMs: 7000,
    minBytes: 64,
    maxBytes: 2049,
    poke: true,
    handshakeStrategy: 'basic',
    handshakeReports: ['0102'],
  }]);
  assert.deepEqual(res.body, { template: 'abcd', bytes: 2 });
});

test('capturarBiometria: owner com seam estrutural futura preserva no owner o ramo disabled atual', async () => {
  const callOrder = [];
  const res = makeRes();
  const routeRes = {
    status(code) {
      callOrder.push(`status:${code}`);
      res.status(code);
      return this;
    },
    json(payload) {
      callOrder.push('json');
      return res.json(payload);
    },
  };

  const capturarBiometria = loadDelegatedOwner({
    biometriaEnabled: false,
    HID: null,
    isTest: true,
    normId() {
      callOrder.push('normId');
    },
    async runCapturaBiometriaCore() {
      callOrder.push('seam');
      throw new Error('nao deve chamar seam no ramo disabled');
    },
    badRequest() {
      callOrder.push('badRequest');
    },
  });

  await capturarBiometria({}, routeRes);

  assert.deepEqual(callOrder, ['status:503', 'json']);
  assert.deepEqual(JSON.parse(JSON.stringify(res.body)), {
    error: 'Biometria desabilitada no servidor',
    code: 'BIOMETRIA_DISABLED',
  });
});

test('capturarBiometria: owner com seam estrutural futura preserva traducao de HID ausente para badRequest', async () => {
  const callOrder = [];

  const capturarBiometria = loadDelegatedOwner({
    biometriaEnabled: true,
    HID: null,
    isTest: true,
    normId() {
      callOrder.push('normId');
    },
    async runCapturaBiometriaCore() {
      callOrder.push('seam');
      throw new Error('nao deve chamar seam sem HID');
    },
    badRequest(_res, message) {
      callOrder.push(`badRequest:${message}`);
      return { kind: 'badRequest', message };
    },
  });

  const result = await capturarBiometria({}, makeRes());

  assert.deepEqual(callOrder, ['badRequest:node-hid ausente no servidor']);
  assert.deepEqual(result, { kind: 'badRequest', message: 'node-hid ausente no servidor' });
});

test('capturarBiometria: owner com seam estrutural futura nao retoma resolucao de device, leitura HID ou timeout interno direto', () => {
  const delegatedSource = stripComments(buildDelegatedOwnerSource());

  assert.match(delegatedSource, /runCapturaBiometriaCore\s*\(/);
  assert.match(delegatedSource, /req\.body\s*\|\|\s*\{\}/);
  assert.match(delegatedSource, /vendorId=normId\(vendorId\)/);
  assert.doesNotMatch(delegatedSource, /listarDispositivos\s*\(/);
  assert.doesNotMatch(delegatedSource, /new HID\.HID\s*\(/);
  assert.doesNotMatch(delegatedSource, /device\.on\s*\(/);
  assert.doesNotMatch(delegatedSource, /setTimeout\s*\(/);
});

test('capturarBiometria: owner com seam estrutural futura preserva traducao HTTP final para erros internos conhecidos', async () => {
  const timeoutRes = makeRes();
  const notFoundRes = makeRes();

  const capturarBiometria = loadDelegatedOwner({
    biometriaEnabled: true,
    HID: { HID: class {} },
    isTest: true,
    normId(value) {
      return value;
    },
    async runCapturaBiometriaCore({ vendorId }) {
      if (vendorId === 'timeout') return { error: 'Timeout sem dados' };
      return { error: 'Dispositivo não encontrado no servidor', vendorId: 123, productId: 456 };
    },
    badRequest() {
      throw new Error('nao deve responder badRequest neste cenario');
    },
  });

  await capturarBiometria({ body: { vendorId: 'timeout' } }, timeoutRes);
  await capturarBiometria({ body: { vendorId: 'missing' } }, notFoundRes);

  assert.equal(timeoutRes.statusCode, 504);
  assert.deepEqual(timeoutRes.body, { error: 'Timeout sem dados' });
  assert.equal(notFoundRes.statusCode, 404);
  assert.deepEqual(notFoundRes.body, { error: 'Dispositivo não encontrado no servidor', vendorId: 123, productId: 456 });
});

test('capturarBiometria: owner com seam estrutural futura preserva a propagacao bruta de erro externo atual', async () => {
  const boom = new Error('captura exploded');

  const capturarBiometria = loadDelegatedOwner({
    biometriaEnabled: true,
    HID: { HID: class {} },
    isTest: true,
    normId(value) {
      return value;
    },
    async runCapturaBiometriaCore() {
      throw boom;
    },
    badRequest() {
      throw new Error('nao deve responder badRequest quando a seam falha');
    },
  });

  await assert.rejects(() => capturarBiometria({ body: {} }, makeRes()), /captura exploded/);
});