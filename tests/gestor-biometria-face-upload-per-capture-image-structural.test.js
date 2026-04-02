import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/faceBiometriaUploadApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

function extractFunction(source, functionName) {
  const signatures = [`async function ${functionName}`, `function ${functionName}`];
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
  const original = extractFunction(CONTROLLER_SOURCE, 'processFaceUploadCaptureCore');
  if (original.includes('normalizeFaceUploadImageCore(')) {
    return original;
  }

  const imageStart = original.indexOf("const m = /^data:(image\\/(png|jpeg|webp));base64,(.+)$/i.exec(dataUrl);");
  const blobStart = original.indexOf('const savedItem = await persistFaceUploadBlobCore({ webpBuf, index, blobToken });');

  assert.notEqual(imageStart, -1, 'Bloco atual de imagem nao encontrado.');
  assert.notEqual(blobStart, -1, 'Delegacao atual para blob nao encontrada.');

  const delegatedBlock = [
    'const webpBuf = await normalizeFaceUploadImageCore({ dataUrl });',
    '  if (!webpBuf) return null;',
    '',
    '  ',
  ].join('\n');

  return `${original.slice(0, imageStart)}${delegatedBlock}${original.slice(blobStart)}`;
}

function buildImageUnitSource() {
  return [
    'async function normalizeFaceUploadImageCore({ dataUrl }) {',
    '  const m = /^data:(image\\/(png|jpeg|webp));base64,(.+)$/i.exec(dataUrl);',
    '  if (!m) return null;',
    '',
    '  const b64 = m[3];',
    "  const buf = Buffer.from(b64, 'base64');",
    '',
    '  try {',
    '    const image = sharp(buf);',
    '    const metadata = await image.metadata();',
    '    const width = Math.min(metadata.width || 640, 1024);',
    '    const height = Math.min(metadata.height || 640, 1024);',
    '    const webpBuf = await image',
    "      .resize(width, height, { fit: 'inside', withoutEnlargement: true })",
    "      .toFormat('webp', { quality: 92 })",
    '      .toBuffer();',
    '    return webpBuf;',
    '  } catch {',
    '    return null;',
    '  }',
    '}',
  ].join('\n');
}

function loadDelegatedPerCaptureCore(dependencies = {}) {
  const functionSource = buildDelegatedPerCaptureSource();
  const executableSource = `${functionSource}\nmodule.exports = { processFaceUploadCaptureCore };`;
  const sandbox = {
    module: { exports: {} },
    exports: {},
    normalizeFaceUploadImageCore: dependencies.normalizeFaceUploadImageCore,
    persistFaceUploadBlobCore: dependencies.persistFaceUploadBlobCore,
  };

  vm.runInNewContext(executableSource, sandbox, { filename: CONTROLLER_PATH });
  return sandbox.module.exports.processFaceUploadCaptureCore;
}

function loadImageUnit(dependencies = {}) {
  const functionSource = buildImageUnitSource();
  const executableSource = `${functionSource}\nmodule.exports = { normalizeFaceUploadImageCore };`;
  const sandbox = {
    module: { exports: {} },
    exports: {},
    sharp: dependencies.sharp,
    Buffer,
    Math,
  };

  vm.runInNewContext(executableSource, sandbox, { filename: CONTROLLER_PATH });
  return sandbox.module.exports.normalizeFaceUploadImageCore;
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

test('face/upload per-capture/image: o helper real atual delega imagem e blob, sem reter regex, Buffer.from ou sharp inline', () => {
  const helperSource = stripComments(extractFunction(CONTROLLER_SOURCE, 'processFaceUploadCaptureCore'));

  assert.match(helperSource, /const webpBuf = await normalizeFaceUploadImageCore\(\{ dataUrl \}\);/);
  assert.match(helperSource, /if \(!webpBuf\) return null;/);
  assert.match(helperSource, /persistFaceUploadBlobCore\(\{ webpBuf, index, blobToken \}\)/);
  assert.doesNotMatch(helperSource, /const m = .*exec\(dataUrl\);/);
  assert.doesNotMatch(helperSource, /Buffer\.from\(b64, 'base64'\);/);
  assert.doesNotMatch(helperSource, /sharp\(buf\)/);
});

test('face/upload per-capture/image: a seam futura de imagem recebe apenas dataUrl', async () => {
  const imageCalls = [];
  const blobCalls = [];
  const processFaceUploadCaptureCore = loadDelegatedPerCaptureCore({
    async normalizeFaceUploadImageCore(args) {
      imageCalls.push(JSON.parse(JSON.stringify(args)));
      return 'WEBP_READY';
    },
    async persistFaceUploadBlobCore(args) {
      blobCalls.push(JSON.parse(JSON.stringify(args)));
      return { url: 'https://blob.test/file.webp', file: 'https://blob.test/file.webp', mime: 'image/webp' };
    },
  });

  const result = await processFaceUploadCaptureCore({
    dataUrl: 'data:image/png;base64,AAAA',
    index: 2,
    blobToken: 'blob-token',
  });

  assert.deepEqual(imageCalls, [
    { dataUrl: 'data:image/png;base64,AAAA' },
  ]);
  assert.deepEqual(blobCalls, [
    { webpBuf: 'WEBP_READY', index: 2, blobToken: 'blob-token' },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    url: 'https://blob.test/file.webp',
    file: 'https://blob.test/file.webp',
    mime: 'image/webp',
  });
});

test('face/upload per-capture/image: o helper com seam futura preserva null quando a unidade de imagem devolver null', async () => {
  const blobCalls = [];
  const processFaceUploadCaptureCore = loadDelegatedPerCaptureCore({
    async normalizeFaceUploadImageCore() {
      return null;
    },
    async persistFaceUploadBlobCore(args) {
      blobCalls.push(args);
      throw new Error('nao deve chamar blob sem webpBuf');
    },
  });

  const result = await processFaceUploadCaptureCore({
    dataUrl: 'data:image/png;base64,AAAA',
    index: 0,
    blobToken: 'blob-token',
  });

  assert.equal(result, null);
  assert.deepEqual(blobCalls, []);
});

test('face/upload per-capture/image: o helper com seam futura continua propagando erro do blob', async () => {
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

test('face/upload per-capture/image: o helper delegado deixa de falar diretamente com regex, Buffer.from e sharp', () => {
  const delegatedSource = stripComments(buildDelegatedPerCaptureSource());

  assert.match(delegatedSource, /normalizeFaceUploadImageCore\(\{ dataUrl \}\)/);
  assert.match(delegatedSource, /persistFaceUploadBlobCore\(\{ webpBuf, index, blobToken \}\)/);
  assert.doesNotMatch(delegatedSource, /const m = .*exec\(dataUrl\);/);
  assert.doesNotMatch(delegatedSource, /Buffer\.from\(b64, 'base64'\)/);
  assert.doesNotMatch(delegatedSource, /sharp\(buf\)/);
});

test('face/upload per-capture/image: a futura unidade de imagem concentra regex, base64, Buffer.from, sharp e devolve webpBuf ou null', () => {
  const imageUnitSource = stripComments(buildImageUnitSource());

  assert.match(imageUnitSource, /async function normalizeFaceUploadImageCore\(\{ dataUrl \}\) \{/);
  assert.match(imageUnitSource, /const m = .*exec\(dataUrl\);/);
  assert.match(imageUnitSource, /const b64 = m\[3\];/);
  assert.match(imageUnitSource, /const buf = Buffer\.from\(b64, 'base64'\);/);
  assert.match(imageUnitSource, /const image = sharp\(buf\);/);
  assert.match(imageUnitSource, /return webpBuf;/);
  assert.match(imageUnitSource, /return null;/);
  assert.doesNotMatch(imageUnitSource, /persistFaceUploadBlobCore\(/);
  assert.doesNotMatch(imageUnitSource, /await put\(/);
});

test('face/upload per-capture/image: a futura unidade de imagem devolve webpBuf para dataUrl valida', async () => {
  const normalizeFaceUploadImageCore = loadImageUnit({
    sharp: createSharpSuccessStub({ output: 'WEBP_READY' }),
  });

  const result = await normalizeFaceUploadImageCore({ dataUrl: 'data:image/png;base64,AAAA' });

  assert.equal(result, 'WEBP_READY');
});

test('face/upload per-capture/image: a futura unidade de imagem devolve null para dataUrl invalida ou falha de sharp', async () => {
  const normalizeWithSharpFailure = loadImageUnit({
    sharp: createSharpFailureStub(),
  });
  const normalizeWithSharpSuccess = loadImageUnit({
    sharp: createSharpSuccessStub(),
  });

  const invalidResult = await normalizeWithSharpSuccess({ dataUrl: 'invalido' });
  const sharpFailureResult = await normalizeWithSharpFailure({ dataUrl: 'data:image/png;base64,AAAA' });

  assert.equal(invalidResult, null);
  assert.equal(sharpFailureResult, null);
});