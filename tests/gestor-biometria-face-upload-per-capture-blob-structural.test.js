import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/faceBiometriaUploadApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');
const SERVICE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/services/biometria/processFaceUploadCaptureCore.js');
const SERVICE_SOURCE = fs.readFileSync(SERVICE_PATH, 'utf8');

function extractFunction(source, functionName) {
  const signatures = [`export async function ${functionName}`, `async function ${functionName}`, `function ${functionName}`];
  const signature = signatures.find((candidate) => source.includes(candidate));
  assert.ok(signature, `Funcao ${functionName} nao encontrada`);

  const start = source.indexOf(signature);
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

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

function buildDelegatedPerCaptureSource() {
  const original = extractFunction(SERVICE_SOURCE, 'processFaceUploadCaptureCore');
  if (original.includes('persistFaceUploadBlobCore(')) {
    return original;
  }

  const withoutId = original.replace(/\s*const id = uuid\(\);\s*/, '\n');
  const currentBlobBlock = /const key = `faces\/\$\{id\}-\$\{index \+ 1\}\.webp`;[\s\S]*?return \{ url, file: url, mime: 'image\/webp' \};/;
  const delegatedBlock = "const savedItem = await persistFaceUploadBlobCore({ webpBuf, index, blobToken });\n  return savedItem;";
  const replaced = withoutId.replace(currentBlobBlock, delegatedBlock);
  assert.notEqual(replaced, original, 'Nao foi possivel instalar a seam estrutural de blob em memoria.');
  return replaced;
}

function loadDelegatedPerCaptureCore(dependencies = {}) {
  const functionSource = buildDelegatedPerCaptureSource().replace('export async function', 'async function');
  const executableSource = `${functionSource}\nmodule.exports = { processFaceUploadCaptureCore };`;
  const sandbox = {
    module: { exports: {} },
    exports: {},
    normalizeFaceUploadImageCore: dependencies.normalizeFaceUploadImageCore,
    persistFaceUploadBlobCore: dependencies.persistFaceUploadBlobCore,
    sharp: dependencies.sharp,
    Buffer,
    Math,
  };

  vm.runInNewContext(executableSource, sandbox, { filename: SERVICE_PATH });
  return sandbox.module.exports.processFaceUploadCaptureCore;
}

function buildBlobAdapterSource() {
  return extractFunction(SERVICE_SOURCE, 'persistFaceUploadBlobCore').replace('export async function', 'async function');
}

function createSharpSuccessStub({ metadata = { width: 320, height: 240 }, output = 'WEBP_BUFFER' } = {}) {
  return function sharpStub() {
    return {
      async metadata() {
        return metadata;
      },
      resize() {
        return this;
      },
      toFormat() {
        return this;
      },
      async toBuffer() {
        return output;
      },
    };
  };
}

function createSharpFailureStub() {
  return function sharpStub() {
    return {
      async metadata() {
        throw new Error('sharp-fail');
      },
      resize() {
        return this;
      },
      toFormat() {
        return this;
      },
      async toBuffer() {
        return 'UNUSED';
      },
    };
  };
}

test('face/upload per-capture/blob: o helper real atual delega imagem e preserva a delegacao ao blob', () => {
  const helperSource = stripComments(extractFunction(SERVICE_SOURCE, 'processFaceUploadCaptureCore'));

  assert.match(helperSource, /const webpBuf = await normalizeFaceUploadImageCore\(\{ dataUrl \}\);/);
  assert.match(helperSource, /if \(!webpBuf\) return null;/);
  assert.match(helperSource, /const savedItem = await persistFaceUploadBlobCore\(\{ webpBuf, index, blobToken \}\);/);
  assert.match(helperSource, /return savedItem;/);
  assert.doesNotMatch(helperSource, /const m = .*exec\(dataUrl\);/);
  assert.doesNotMatch(helperSource, /Buffer\.from\(b64, 'base64'\);/);
  assert.doesNotMatch(helperSource, /sharp\(buf\)/);
  assert.doesNotMatch(helperSource, /const id = uuid\(\);/);
  assert.doesNotMatch(helperSource, /const key = /);
  assert.doesNotMatch(helperSource, /const putOptions = /);
  assert.doesNotMatch(helperSource, /await put\(/);
});

test('face/upload per-capture/blob: a seam futura de blob recebe apenas o buffer normalizado e o contexto minimo de persistencia', async () => {
  const seamCalls = [];
  const processFaceUploadCaptureCore = loadDelegatedPerCaptureCore({
    async normalizeFaceUploadImageCore() {
      return 'WEBP_READY';
    },
    async persistFaceUploadBlobCore(args) {
      seamCalls.push(JSON.parse(JSON.stringify(args)));
      return { url: 'https://blob.test/file.webp', file: 'https://blob.test/file.webp', mime: 'image/webp' };
    },
  });

  const result = await processFaceUploadCaptureCore({
    dataUrl: 'data:image/png;base64,AAAA',
    index: 1,
    blobToken: 'blob-token',
  });

  assert.deepEqual(seamCalls, [
    { webpBuf: 'WEBP_READY', index: 1, blobToken: 'blob-token' },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    url: 'https://blob.test/file.webp',
    file: 'https://blob.test/file.webp',
    mime: 'image/webp',
  });
});

test('face/upload per-capture/blob: o helper com seam futura preserva null para dataUrl invalido sem chamar blob', async () => {
  const seamCalls = [];
  const processFaceUploadCaptureCore = loadDelegatedPerCaptureCore({
    async normalizeFaceUploadImageCore() {
      return null;
    },
    async persistFaceUploadBlobCore(args) {
      seamCalls.push(args);
      throw new Error('nao deve chamar blob com dataUrl invalido');
    },
  });

  const result = await processFaceUploadCaptureCore({ dataUrl: 'invalido', index: 0, blobToken: 'blob-token' });

  assert.equal(result, null);
  assert.deepEqual(seamCalls, []);
});

test('face/upload per-capture/blob: o helper com seam futura preserva null quando sharp falha sem chamar blob', async () => {
  const seamCalls = [];
  const processFaceUploadCaptureCore = loadDelegatedPerCaptureCore({
    async normalizeFaceUploadImageCore() {
      return null;
    },
    async persistFaceUploadBlobCore(args) {
      seamCalls.push(args);
      throw new Error('nao deve chamar blob quando sharp falha');
    },
  });

  const result = await processFaceUploadCaptureCore({
    dataUrl: 'data:image/png;base64,AAAA',
    index: 0,
    blobToken: 'blob-token',
  });

  assert.equal(result, null);
  assert.deepEqual(seamCalls, []);
});

test('face/upload per-capture/blob: o helper delegado deixa de falar diretamente com uuid, key, putOptions e put', () => {
  const delegatedSource = stripComments(buildDelegatedPerCaptureSource());

  assert.match(delegatedSource, /const webpBuf = await normalizeFaceUploadImageCore\(\{ dataUrl \}\);/);
  assert.match(delegatedSource, /if \(!webpBuf\) return null;/);
  assert.match(delegatedSource, /persistFaceUploadBlobCore\(\{ webpBuf, index, blobToken \}\)/);
  assert.doesNotMatch(delegatedSource, /const m = .*exec\(dataUrl\);/);
  assert.doesNotMatch(delegatedSource, /Buffer\.from\(b64, 'base64'\);/);
  assert.doesNotMatch(delegatedSource, /sharp\(buf\)/);
  assert.doesNotMatch(delegatedSource, /const id = uuid\(\);/);
  assert.doesNotMatch(delegatedSource, /const key = /);
  assert.doesNotMatch(delegatedSource, /const putOptions = /);
  assert.doesNotMatch(delegatedSource, /await put\(/);
});

test('face/upload per-capture/blob: o futuro adaptador de blob concentra uuid, key, putOptions, put e montagem final do item salvo', () => {
  const blobAdapterSource = stripComments(buildBlobAdapterSource());

  assert.match(blobAdapterSource, /async function persistFaceUploadBlobCore\(\{ webpBuf, index, blobToken \}\) \{/);
  assert.match(blobAdapterSource, /const id = uuid\(\);/);
  assert.match(blobAdapterSource, /const key = `faces\/\$\{id\}-\$\{index \+ 1\}\.webp`;/);
  assert.match(blobAdapterSource, /const putOptions = \{/);
  assert.match(blobAdapterSource, /const \{ url \} = await put\(key, webpBuf, putOptions\);/);
  assert.match(blobAdapterSource, /return \{ url, file: url, mime: 'image\/webp' \};/);
  assert.doesNotMatch(blobAdapterSource, /sharp\(/);
  assert.doesNotMatch(blobAdapterSource, /Buffer\.from\(/);
});

test('face/upload per-capture/blob: erro de blob continua propagando como excecao e nao vira null silencioso', async () => {
  const processFaceUploadCaptureCore = loadDelegatedPerCaptureCore({
    async normalizeFaceUploadImageCore() {
      return 'WEBP_READY';
    },
    async persistFaceUploadBlobCore() {
      throw new Error('blob-fail');
    },
  });

  await assert.rejects(
    () => processFaceUploadCaptureCore({
      dataUrl: 'data:image/png;base64,AAAA',
      index: 0,
      blobToken: 'blob-token',
    }),
    /blob-fail/,
  );
});