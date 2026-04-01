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
  const original = extractExportedAsyncFunction(CONTROLLER_SOURCE, 'sniffBiometria');
  if (original.includes('runSniffBiometriaCore(')) {
    return original;
  }

  const currentCorePattern = /let \{ vendorId, productId, path: devPath, durationMs=5000, poke=true, handshakeStrategy='basic', handshakeReports=\[\] \} = req\.body \|\| \{\};[\s\S]*?\}, durationMs\);/;
  const delegatedBlock = [
    "let { vendorId, productId, path: devPath, durationMs=5000, poke=true, handshakeStrategy='basic', handshakeReports=[] } = req.body || {};",
    'vendorId=normId(vendorId);',
    'productId=normId(productId);',
    'durationMs=parseInt(durationMs,10)||5000;',
    'const payload = await runSniffBiometriaCore({ vendorId, productId, devPath, durationMs, poke, handshakeStrategy, handshakeReports });',
    "if (!payload || !payload.error) return res.json(payload);",
    "if (payload.error === 'Dispositivo não encontrado') return notFound(res,'Dispositivo não encontrado');",
    'return res.status(500).json(payload);',
  ].join(' ');

  const replaced = original.replace(currentCorePattern, delegatedBlock);
  assert.notEqual(replaced, original, 'Nao foi possivel instalar a seam estrutural de sniffBiometria em memoria.');
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

function loadDelegatedOwner(dependencies = {}) {
  const functionSource = buildDelegatedOwnerSource();
  const executableSource = `${functionSource.replace('export async function', 'async function')}\nmodule.exports = { sniffBiometria };`;
  const sandbox = {
    module: { exports: {} },
    exports: {},
    biometriaEnabled: dependencies.biometriaEnabled,
    HID: dependencies.HID,
    isTest: dependencies.isTest,
    normId: dependencies.normId,
    parseInt,
    runSniffBiometriaCore: dependencies.runSniffBiometriaCore,
    badRequest: dependencies.badRequest,
    notFound: dependencies.notFound,
    console: dependencies.console || console,
    Date: dependencies.Date || Date,
    Buffer,
    setTimeout: dependencies.setTimeout || setTimeout,
    Array,
  };

  vm.runInNewContext(executableSource, sandbox, { filename: CONTROLLER_PATH });
  return sandbox.module.exports.sniffBiometria;
}

test('sniffBiometria: owner real ainda preserva ramo disabled, guard de HID, leitura de req.body e traducao HTTP final', () => {
  const ownerSource = stripComments(extractExportedAsyncFunction(CONTROLLER_SOURCE, 'sniffBiometria'));

  assert.match(ownerSource, /if\s*\(!biometriaEnabled\)\s*\{\s*return res\.status\(503\)\.json\(\{ error: 'Biometria desabilitada no servidor', code: 'BIOMETRIA_DISABLED' \}\);\s*\}/);
  assert.match(ownerSource, /if\s*\(!HID\)\s*\{\s*return badRequest\(res,'node-hid ausente'\);\s*\}/);
  assert.match(ownerSource, /req\.body\s*\|\|\s*\{\}/);
  assert.match(ownerSource, /vendorId=normId\(vendorId\)/);
  assert.match(ownerSource, /productId=normId\(productId\)/);
  assert.doesNotMatch(ownerSource, /serverError\s*\(/);
});

test('sniffBiometria: seam estrutural futura recebe apenas os parametros normalizados de sniff e preserva ordem owner -> seam -> HTTP', async () => {
  const callOrder = [];
  const seamCalls = [];
  const res = makeRes();

  const sniffBiometria = loadDelegatedOwner({
    biometriaEnabled: true,
    HID: { HID: class {} },
    isTest: true,
    normId(value) {
      if (value === undefined || value === null || value === '') return null;
      if (typeof value === 'string' && /^0x/i.test(value.trim())) return Number.parseInt(value, 16);
      return Number.parseInt(value, 10);
    },
    async runSniffBiometriaCore(args) {
      callOrder.push('seam');
      seamCalls.push(JSON.parse(JSON.stringify(args)));
      return { bytes: 4, packets: 1, dataHex: '01020304', durationMs: 111, vendorId: 4660, productId: 22136 };
    },
    badRequest() {
      callOrder.push('badRequest');
    },
    notFound() {
      callOrder.push('notFound');
    },
  });

  await sniffBiometria({
    body: {
      vendorId: '0x1234',
      productId: '5678',
      path: 'hid#sniff',
      durationMs: '7000',
      poke: false,
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
    devPath: 'hid#sniff',
    durationMs: 7000,
    poke: false,
    handshakeStrategy: 'basic',
    handshakeReports: ['0102'],
  }]);
  assert.deepEqual(res.body, { bytes: 4, packets: 1, dataHex: '01020304', durationMs: 111, vendorId: 4660, productId: 22136 });
});

test('sniffBiometria: owner com seam estrutural futura preserva no owner o ramo disabled atual', async () => {
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

  const sniffBiometria = loadDelegatedOwner({
    biometriaEnabled: false,
    HID: null,
    isTest: true,
    normId() {
      callOrder.push('normId');
    },
    async runSniffBiometriaCore() {
      callOrder.push('seam');
      throw new Error('nao deve chamar seam no ramo disabled');
    },
    badRequest() {
      callOrder.push('badRequest');
    },
    notFound() {
      callOrder.push('notFound');
    },
  });

  await sniffBiometria({}, routeRes);

  assert.deepEqual(callOrder, ['status:503', 'json']);
  assert.deepEqual(JSON.parse(JSON.stringify(res.body)), {
    error: 'Biometria desabilitada no servidor',
    code: 'BIOMETRIA_DISABLED',
  });
});

test('sniffBiometria: owner com seam estrutural futura preserva traducao de HID ausente para badRequest', async () => {
  const callOrder = [];

  const sniffBiometria = loadDelegatedOwner({
    biometriaEnabled: true,
    HID: null,
    isTest: true,
    normId() {
      callOrder.push('normId');
    },
    async runSniffBiometriaCore() {
      callOrder.push('seam');
      throw new Error('nao deve chamar seam sem HID');
    },
    badRequest(_res, message) {
      callOrder.push(`badRequest:${message}`);
      return { kind: 'badRequest', message };
    },
    notFound() {
      callOrder.push('notFound');
    },
  });

  const result = await sniffBiometria({}, makeRes());

  assert.deepEqual(callOrder, ['badRequest:node-hid ausente']);
  assert.deepEqual(result, { kind: 'badRequest', message: 'node-hid ausente' });
});

test('sniffBiometria: owner com seam estrutural futura nao retoma resolucao de device, leitura HID ou timeout interno direto', () => {
  const delegatedSource = stripComments(buildDelegatedOwnerSource());

  assert.match(delegatedSource, /runSniffBiometriaCore\s*\(/);
  assert.match(delegatedSource, /req\.body\s*\|\|\s*\{\}/);
  assert.match(delegatedSource, /vendorId=normId\(vendorId\)/);
  assert.doesNotMatch(delegatedSource, /listarDispositivos\s*\(/);
  assert.doesNotMatch(delegatedSource, /new HID\.HID\s*\(/);
  assert.doesNotMatch(delegatedSource, /device\.on\s*\(/);
  assert.doesNotMatch(delegatedSource, /setTimeout\s*\(/);
});

test('sniffBiometria: owner com seam estrutural futura preserva traducao HTTP final para erros internos conhecidos', async () => {
  const notFoundCalls = [];
  const openFailRes = makeRes();

  const sniffBiometria = loadDelegatedOwner({
    biometriaEnabled: true,
    HID: { HID: class {} },
    isTest: true,
    normId(value) {
      return value;
    },
    async runSniffBiometriaCore({ vendorId }) {
      if (vendorId === 'missing') return { error: 'Dispositivo não encontrado' };
      return { error: 'Falha abrir dispositivo', detail: 'boom' };
    },
    badRequest() {
      throw new Error('nao deve responder badRequest neste cenario');
    },
    notFound(_res, message) {
      notFoundCalls.push(message);
      return { kind: 'notFound', message };
    },
  });

  const notFoundResult = await sniffBiometria({ body: { vendorId: 'missing' } }, makeRes());
  await sniffBiometria({ body: { vendorId: 'open-fail' } }, openFailRes);

  assert.deepEqual(notFoundCalls, ['Dispositivo não encontrado']);
  assert.deepEqual(notFoundResult, { kind: 'notFound', message: 'Dispositivo não encontrado' });
  assert.equal(openFailRes.statusCode, 500);
  assert.deepEqual(openFailRes.body, { error: 'Falha abrir dispositivo', detail: 'boom' });
});

test('sniffBiometria: owner com seam estrutural futura preserva a propagacao bruta de erro externo atual', async () => {
  const boom = new Error('sniff exploded');

  const sniffBiometria = loadDelegatedOwner({
    biometriaEnabled: true,
    HID: { HID: class {} },
    isTest: true,
    normId(value) {
      return value;
    },
    async runSniffBiometriaCore() {
      throw boom;
    },
    badRequest() {
      throw new Error('nao deve responder badRequest quando a seam falha');
    },
    notFound() {
      throw new Error('nao deve responder notFound quando a seam falha');
    },
  });

  await assert.rejects(() => sniffBiometria({ body: {} }, makeRes()), /sniff exploded/);
});