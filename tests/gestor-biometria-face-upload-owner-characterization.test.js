import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROUTE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/routes/faceBiometriaUploadApi.js');
const ROUTE_SOURCE = fs.readFileSync(ROUTE_PATH, 'utf8');
const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/faceBiometriaUploadApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
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

function loadFaceUploadOwner(dependencies = {}) {
  const executableSource = CONTROLLER_SOURCE
    .replace(/^import .*;\r?\n/gm, '')
    .replace('export async function handleFaceBiometriaUpload', 'async function handleFaceBiometriaUpload')
    .concat('\nmodule.exports = { handleFaceBiometriaUpload };');

  const sandbox = {
    module: { exports: {} },
    exports: {},
    uuid: dependencies.uuid || (() => 'uuid-fixed'),
    sharp: dependencies.sharp,
    put: dependencies.put,
    Buffer,
    console: dependencies.console || console,
    process: {
      env: dependencies.env || {},
    },
    Math,
  };

  vm.runInNewContext(executableSource, sandbox, { filename: CONTROLLER_PATH });
  return sandbox.module.exports.handleFaceBiometriaUpload;
}

function loadFaceUploadRoute(dependencies = {}) {
  const routes = [];
  const router = {
    post(...args) {
      const [routePath, ...handlers] = args;
      routes.push({ routePath, handlers });
      return this;
    },
  };

  const executableSource = ROUTE_SOURCE
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/export default router;\s*$/m, 'module.exports = { router };');

  const sandbox = {
    module: { exports: {} },
    exports: {},
    express: {
      Router() {
        return router;
      },
    },
    uuid: dependencies.uuid || (() => 'uuid-fixed'),
    sharp: dependencies.sharp,
    put: dependencies.put,
    requireLogin: dependencies.requireLogin,
    requireApiAuth: dependencies.requireApiAuth,
    handleFaceBiometriaUpload: dependencies.handleFaceBiometriaUpload || loadFaceUploadOwner(dependencies),
    Buffer,
    console: dependencies.console || console,
    process: {
      env: dependencies.env || {},
    },
  };

  vm.runInNewContext(executableSource, sandbox, { filename: ROUTE_PATH });

  assert.equal(routes.length, 1, 'A rota de face upload deveria registrar exatamente um POST');
  return routes[0];
}

test('face/upload: a rota real delega para handleFaceBiometriaUpload e compoe requireLogin + requireApiAuth antes do handler', () => {
  const requireLogin = function requireLoginStub() {};
  const requireApiAuth = function requireApiAuthStub() {};
  const handleFaceBiometriaUpload = async function handleFaceBiometriaUploadStub() {};

  const route = loadFaceUploadRoute({
    requireLogin,
    requireApiAuth,
    handleFaceBiometriaUpload,
  });

  assert.equal(route.routePath, '/api/biometria/face/upload');
  assert.equal(route.handlers.length, 3);
  assert.equal(route.handlers[0], requireLogin);
  assert.equal(route.handlers[1], requireApiAuth);
  assert.equal(route.handlers[2], handleFaceBiometriaUpload);

  assert.match(
    stripComments(ROUTE_SOURCE),
    /router\.post\('\/api\/biometria\/face\/upload', requireLogin, requireApiAuth, handleFaceBiometriaUpload\);/
  );
});

test('face/upload: o owner dedicado real continua dono dos gates, da iteracao, da delegacao por captura e do catch final', () => {
  const source = stripComments(extractExportedAsyncFunction(CONTROLLER_SOURCE, 'handleFaceBiometriaUpload'));

  assert.match(source, /if \(!capturas\.length\) return res\.status\(400\)\.json\(\{ ok: false, error: 'Nenhuma captura enviada' \}\);/);
  assert.match(source, /process\.env\.BLOB_READ_WRITE_TOKEN/);
  assert.match(source, /process\.env\.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN/);
  assert.match(source, /if \(!inVercel && !blobToken\) \{/);
  assert.match(source, /return res\.status\(503\)\.json\(\{ ok: false, error: 'Blob não configurado/);
  assert.match(source, /for \(let i = 0; i < capturas\.length; i\+\+\) \{/);
  assert.match(source, /const savedItem = await processFaceUploadCaptureCore\(\{ dataUrl: capturas\[i\] \|\| '', index: i, blobToken \}\);/);
  assert.match(source, /return res\.json\(\{ ok: true, arquivos: saved \}\);/);
  assert.match(source, /catch \(err\) \{/);
  assert.match(source, /console\.error\('\[face-upload\] erro:', err\);/);
  assert.match(source, /return res\.status\(500\)\.json\(\{ ok: false, error: 'Falha interna no upload facial' \}\);/);
  assert.doesNotMatch(source, /Buffer\.from\(b64, 'base64'\);/);
  assert.doesNotMatch(source, /sharp\(buf\)/);
  assert.doesNotMatch(source, /const id = uuid\(\);/);
  assert.doesNotMatch(source, /await put\(/);
});

test('face/upload: o handler dedicado real preserva o gate sem capturas', async () => {
  const route = loadFaceUploadRoute({
    sharp() {
      throw new Error('sharp nao deve ser executado sem capturas');
    },
    async put() {
      throw new Error('put nao deve ser executado sem capturas');
    },
    requireLogin() {},
    requireApiAuth() {},
  });

  const res = makeRes();
  await route.handlers[2]({ body: {} }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(JSON.parse(JSON.stringify(res.body)), { ok: false, error: 'Nenhuma captura enviada' });
});

test('face/upload: o handler dedicado real preserva o gate de blob não configurado antes do pipeline de imagem', async () => {
  let sharpCalls = 0;
  let putCalls = 0;

  const route = loadFaceUploadRoute({
    sharp() {
      sharpCalls += 1;
      throw new Error('sharp nao deve ser executado sem blob configurado');
    },
    async put() {
      putCalls += 1;
      throw new Error('put nao deve ser executado sem blob configurado');
    },
    requireLogin() {},
    requireApiAuth() {},
    env: {},
  });

  const res = makeRes();
  await route.handlers[2]({ body: { capturas: ['data:image/png;base64,AAAA'] } }, res);

  assert.equal(res.statusCode, 503);
  assert.deepEqual(JSON.parse(JSON.stringify(res.body)), {
    ok: false,
    error: 'Blob não configurado (conecte a Store no Vercel ou defina BLOB_READ_WRITE_TOKEN/WDGESTOR_DB_DADOS_READ_WRITE_TOKEN)',
  });
  assert.equal(sharpCalls, 0);
  assert.equal(putCalls, 0);
});

test('face/upload: o handler dedicado real continua dono do parsing base64, normalizacao com sharp, put no blob e resposta final de sucesso', async () => {
  const sharpCalls = [];
  const putCalls = [];

  const route = loadFaceUploadRoute({
    sharp(buffer) {
      sharpCalls.push(buffer.toString('hex'));
      return {
        async metadata() {
          return { width: 400, height: 300 };
        },
        resize(width, height, options) {
          sharpCalls.push({ width, height, options });
          return this;
        },
        toFormat(format, options) {
          sharpCalls.push({ format, options });
          return this;
        },
        async toBuffer() {
          return Buffer.from('webp-buffer');
        },
      };
    },
    async put(key, buffer, options) {
      putCalls.push({ key, buffer: buffer.toString(), options });
      return { url: 'https://blob.test/faces/uuid-fixed-1.webp' };
    },
    requireLogin() {},
    requireApiAuth() {},
    uuid() {
      return 'uuid-fixed';
    },
    env: { BLOB_READ_WRITE_TOKEN: 'blob-token' },
  });

  const res = makeRes();
  await route.handlers[2]({ body: { capturas: ['data:image/png;base64,QUJDRA=='] } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(res.body)), {
    ok: true,
    arquivos: [{
      url: 'https://blob.test/faces/uuid-fixed-1.webp',
      file: 'https://blob.test/faces/uuid-fixed-1.webp',
      mime: 'image/webp',
    }],
  });
  assert.deepEqual(JSON.parse(JSON.stringify(putCalls)), [{
    key: 'faces/uuid-fixed-1.webp',
    buffer: 'webp-buffer',
    options: {
      access: 'public',
      contentType: 'image/webp',
      cacheControl: 'public, max-age=31536000, immutable',
      token: 'blob-token',
    },
  }]);
  assert.match(String(sharpCalls[0]), /41424344/);
});

test('face/upload: o catch final continua no owner dedicado', async () => {
  const logs = [];
  const route = loadFaceUploadRoute({
    sharp() {
      return {
        async metadata() {
          return { width: 400, height: 300 };
        },
        resize() {
          return this;
        },
        toFormat() {
          return this;
        },
        async toBuffer() {
          return Buffer.from('webp-buffer');
        },
      };
    },
    async put() {
      throw new Error('blob exploded');
    },
    requireLogin() {},
    requireApiAuth() {},
    env: { BLOB_READ_WRITE_TOKEN: 'blob-token' },
    console: {
      error(...args) {
        logs.push(args.map(String).join(' '));
      },
    },
  });

  const res = makeRes();
  await route.handlers[2]({ body: { capturas: ['data:image/png;base64,QUJDRA=='] } }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(JSON.parse(JSON.stringify(res.body)), { ok: false, error: 'Falha interna no upload facial' });
  assert.equal(logs.length, 1);
  assert.match(logs[0], /\[face-upload\] erro:/);
  assert.match(logs[0], /Error: blob exploded/);
});