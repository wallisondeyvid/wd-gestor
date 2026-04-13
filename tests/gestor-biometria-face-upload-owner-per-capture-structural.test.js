import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/faceBiometriaUploadApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');
const SERVICE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/services/biometria/processFaceUploadCaptureCore.js');
const SERVICE_SOURCE = fs.readFileSync(SERVICE_PATH, 'utf8');

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
  const original = extractExportedAsyncFunction(CONTROLLER_SOURCE, 'handleFaceBiometriaUpload');
  if (original.includes('processFaceUploadCaptureCore(')) {
    return original;
  }

  const currentCorePattern = /const saved = \[\];[\s\S]*?if \(!saved\.length\) return res\.status\(400\)\.json\(\{ ok: false, error: 'Falha ao processar capturas' \}\);/;
  const delegatedBlock = [
    'const saved = [];',
    'for (let i = 0; i < capturas.length; i++) {',
    "  const savedItem = await processFaceUploadCaptureCore({ dataUrl: capturas[i] || '', index: i, blobToken });",
    '  if (savedItem) saved.push(savedItem);',
    '}',
    "if (!saved.length) return res.status(400).json({ ok: false, error: 'Falha ao processar capturas' });",
  ].join(' ');

  const replaced = original.replace(currentCorePattern, delegatedBlock);
  assert.notEqual(replaced, original, 'Nao foi possivel instalar a seam estrutural por captura em memoria.');
  return replaced;
}

function extractFunction(source, functionName) {
  const signatures = [`export async function ${functionName}`, `async function ${functionName}`, `function ${functionName}`];
  const signature = signatures.find((candidate) => source.includes(candidate));
  assert.ok(signature, `Funcao ${functionName} nao encontrada`);

  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `Funcao ${functionName} nao encontrada`);

  const paramsEnd = source.indexOf(')', start);
  assert.notEqual(paramsEnd, -1, `Parametros de ${functionName} nao encontrados`);

  const bodyStart = source.indexOf('{', paramsEnd);
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
  const executableSource = `${functionSource.replace('export async function', 'async function')}\nmodule.exports = { handleFaceBiometriaUpload };`;
  const sandbox = {
    module: { exports: {} },
    exports: {},
    processFaceUploadCaptureCore: dependencies.processFaceUploadCaptureCore,
    console: dependencies.console || console,
    process: { env: dependencies.env || {} },
    Buffer,
    Math,
    Array,
  };

  vm.runInNewContext(executableSource, sandbox, { filename: CONTROLLER_PATH });
  return sandbox.module.exports.handleFaceBiometriaUpload;
}

test('face/upload per-capture: o owner dedicado real ainda preserva os gates, a iteracao, a traducao HTTP final e o catch', () => {
  const ownerSource = stripComments(extractExportedAsyncFunction(CONTROLLER_SOURCE, 'handleFaceBiometriaUpload'));

  assert.match(ownerSource, /if \(!capturas\.length\) return res\.status\(400\)\.json\(\{ ok: false, error: 'Nenhuma captura enviada' \}\);/);
  assert.match(ownerSource, /if \(!inVercel && !blobToken\) \{/);
  assert.match(ownerSource, /for \(let i = 0; i < capturas\.length; i\+\+\) \{/);
  assert.match(ownerSource, /if \(!saved\.length\) return res\.status\(400\)\.json\(\{ ok: false, error: 'Falha ao processar capturas' \}\);/);
  assert.match(ownerSource, /return res\.json\(\{ ok: true, arquivos: saved \}\);/);
  assert.match(ownerSource, /catch \(err\) \{/);
  assert.doesNotMatch(ownerSource, /serverError\s*\(/);
});

test('face/upload per-capture: a unidade real por captura delega normalizacao e persistencia blob e retorna o item salvo', () => {
  const helperSource = stripComments(extractFunction(SERVICE_SOURCE, 'processFaceUploadCaptureCore'));

  assert.match(helperSource, /const webpBuf = await normalizeFaceUploadImageCore\(\{ dataUrl \}\);/);
  assert.match(helperSource, /if \(!webpBuf\) return null;/);
  assert.match(helperSource, /const savedItem = await persistFaceUploadBlobCore\(\{ webpBuf, index, blobToken \}\);/);
  assert.match(helperSource, /return savedItem;/);
  assert.doesNotMatch(helperSource, /const m = .*exec\(dataUrl\);/);
  assert.doesNotMatch(helperSource, /Buffer\.from\(b64, 'base64'\);/);
  assert.doesNotMatch(helperSource, /sharp\(buf\)/);
  assert.doesNotMatch(helperSource, /const id = uuid\(\);/);
  assert.doesNotMatch(helperSource, /await put\(/);
});

test('face/upload per-capture: a seam estrutural futura recebe apenas uma captura individual e o contexto minimo necessario', async () => {
  const callOrder = [];
  const seamCalls = [];
  const res = makeRes();

  const handleFaceBiometriaUpload = loadDelegatedOwner({
    env: { BLOB_READ_WRITE_TOKEN: 'blob-token' },
    async processFaceUploadCaptureCore(args) {
      callOrder.push('seam');
      seamCalls.push(JSON.parse(JSON.stringify(args)));
      if (args.index === 0) return null;
      return { url: 'https://blob.test/file.webp', file: 'https://blob.test/file.webp', mime: 'image/webp' };
    },
  });

  await handleFaceBiometriaUpload({
    body: {
      capturas: ['data:image/png;base64,AAAA', 'data:image/png;base64,BBBB'],
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

  assert.deepEqual(callOrder, ['seam', 'seam', 'json']);
  assert.deepEqual(seamCalls, [
    { dataUrl: 'data:image/png;base64,AAAA', index: 0, blobToken: 'blob-token' },
    { dataUrl: 'data:image/png;base64,BBBB', index: 1, blobToken: 'blob-token' },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(res.body)), {
    ok: true,
    arquivos: [{ url: 'https://blob.test/file.webp', file: 'https://blob.test/file.webp', mime: 'image/webp' }],
  });
});

test('face/upload per-capture: o owner dedicado com seam futura preserva o gate sem capturas', async () => {
  const callOrder = [];
  const handleFaceBiometriaUpload = loadDelegatedOwner({
    env: { BLOB_READ_WRITE_TOKEN: 'blob-token' },
    async processFaceUploadCaptureCore() {
      callOrder.push('seam');
      throw new Error('nao deve chamar seam sem capturas');
    },
  });

  const res = makeRes();
  await handleFaceBiometriaUpload({ body: {} }, res);

  assert.deepEqual(callOrder, []);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(JSON.parse(JSON.stringify(res.body)), { ok: false, error: 'Nenhuma captura enviada' });
});

test('face/upload per-capture: o owner dedicado com seam futura preserva o gate de blob nao configurado', async () => {
  const callOrder = [];
  const handleFaceBiometriaUpload = loadDelegatedOwner({
    env: {},
    async processFaceUploadCaptureCore() {
      callOrder.push('seam');
      throw new Error('nao deve chamar seam sem blob configurado');
    },
  });

  const res = makeRes();
  await handleFaceBiometriaUpload({ body: { capturas: ['data:image/png;base64,AAAA'] } }, res);

  assert.deepEqual(callOrder, []);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(JSON.parse(JSON.stringify(res.body)), {
    ok: false,
    error: 'Blob não configurado (conecte a Store no Vercel ou defina BLOB_READ_WRITE_TOKEN/WDGESTOR_DB_DADOS_READ_WRITE_TOKEN)',
  });
});

test('face/upload per-capture: o owner dedicado com seam futura preserva o gate final quando nada foi salvo', async () => {
  const callOrder = [];
  const handleFaceBiometriaUpload = loadDelegatedOwner({
    env: { BLOB_READ_WRITE_TOKEN: 'blob-token' },
    async processFaceUploadCaptureCore() {
      callOrder.push('seam');
      return null;
    },
  });

  const res = makeRes();
  await handleFaceBiometriaUpload({ body: { capturas: ['data:image/png;base64,AAAA'] } }, res);

  assert.deepEqual(callOrder, ['seam']);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(JSON.parse(JSON.stringify(res.body)), { ok: false, error: 'Falha ao processar capturas' });
});

test('face/upload per-capture: o owner dedicado com seam futura nao retoma parsing, sharp ou put diretamente', () => {
  const delegatedSource = stripComments(buildDelegatedOwnerSource());

  assert.match(delegatedSource, /processFaceUploadCaptureCore\s*\(/);
  assert.match(delegatedSource, /for \(let i = 0; i < capturas\.length; i\+\+\) \{/);
  assert.doesNotMatch(delegatedSource, /Buffer\.from\(b64, 'base64'\)/);
  assert.doesNotMatch(delegatedSource, /sharp\(buf\)/);
  assert.doesNotMatch(delegatedSource, /await put\(/);
});

test('face/upload per-capture: o owner dedicado com seam futura preserva o catch final e a traducao HTTP de erro externo', async () => {
  const logs = [];
  const handleFaceBiometriaUpload = loadDelegatedOwner({
    env: { BLOB_READ_WRITE_TOKEN: 'blob-token' },
    async processFaceUploadCaptureCore() {
      throw new Error('capture pipeline exploded');
    },
    console: {
      error(...args) {
        logs.push(args.map(String).join(' '));
      },
    },
  });

  const res = makeRes();
  await handleFaceBiometriaUpload({ body: { capturas: ['data:image/png;base64,AAAA'] } }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(JSON.parse(JSON.stringify(res.body)), { ok: false, error: 'Falha interna no upload facial' });
  assert.equal(logs.length, 1);
  assert.match(logs[0], /\[face-upload\] erro:/);
  assert.match(logs[0], /capture pipeline exploded/);
});