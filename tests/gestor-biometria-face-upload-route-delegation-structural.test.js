import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROUTE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/routes/faceBiometriaUploadApi.js');
const ROUTE_SOURCE = fs.readFileSync(ROUTE_PATH, 'utf8');
const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/faceBiometriaUploadApiController.js');
const CONTROLLER_SOURCE = fs.existsSync(CONTROLLER_PATH) ? fs.readFileSync(CONTROLLER_PATH, 'utf8') : '';

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

function extractInlineHandlerSource(source) {
  const signature = "router.post('/api/biometria/face/upload', requireLogin, requireApiAuth, async (req, res) =>";
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, 'Handler inline de face/upload nao encontrado');

  const asyncStart = source.indexOf('async (req, res) =>', start);
  assert.notEqual(asyncStart, -1, 'Assinatura async do handler inline nao encontrada');

  const bodyStart = source.indexOf('{', asyncStart);
  assert.notEqual(bodyStart, -1, 'Corpo do handler inline nao encontrado');

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
        return source.slice(asyncStart, index + 1);
      }
    }

    index += 1;
  }

  throw new Error('Nao foi possivel extrair o handler inline de face/upload');
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

function extractHandlerBody(handlerSource) {
  const bodyStart = handlerSource.indexOf('{');
  const bodyEnd = handlerSource.lastIndexOf('}');
  assert.ok(bodyStart >= 0 && bodyEnd > bodyStart, 'Corpo do handler inline invalido');
  return handlerSource.slice(bodyStart + 1, bodyEnd);
}

function buildDelegatedRouteSource() {
  if (ROUTE_SOURCE.includes("router.post('/api/biometria/face/upload', requireLogin, requireApiAuth, handleFaceBiometriaUpload);")) {
    return ROUTE_SOURCE;
  }
  const handlerSource = extractInlineHandlerSource(ROUTE_SOURCE);
  const delegated = ROUTE_SOURCE.replace(
    handlerSource,
    'handleFaceBiometriaUpload'
  );
  assert.notEqual(delegated, ROUTE_SOURCE, 'Nao foi possivel instalar a delegacao estrutural da rota em memoria.');
  return delegated;
}

function buildExtractedOwnerSource() {
  if (CONTROLLER_SOURCE.includes('export async function handleFaceBiometriaUpload')) {
    return extractExportedAsyncFunction(CONTROLLER_SOURCE, 'handleFaceBiometriaUpload').replace('export async function', 'async function');
  }
  const body = extractHandlerBody(extractInlineHandlerSource(ROUTE_SOURCE));
  return `async function handleFaceBiometriaUpload(req, res) {${body}}`;
}

function loadDelegatedRoute(dependencies = {}) {
  const routes = [];
  const router = {
    post(...args) {
      const [routePath, ...handlers] = args;
      routes.push({ routePath, handlers });
      return this;
    },
  };

  const executableSource = buildDelegatedRouteSource()
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
    uuid: dependencies.uuid,
    sharp: dependencies.sharp,
    put: dependencies.put,
    requireLogin: dependencies.requireLogin,
    requireApiAuth: dependencies.requireApiAuth,
    handleFaceBiometriaUpload: dependencies.handleFaceBiometriaUpload,
    Buffer,
    console: dependencies.console || console,
    process: { env: dependencies.env || {} },
  };

  vm.runInNewContext(executableSource, sandbox, { filename: ROUTE_PATH });
  assert.equal(routes.length, 1, 'A rota delegada de face/upload deveria registrar exatamente um POST');
  return routes[0];
}

test('face/upload etapa 1: a rota futura continua definindo o POST real com requireLogin + requireApiAuth e delega para um owner dedicado unico', async () => {
  const requireLogin = function requireLoginStub() {};
  const requireApiAuth = function requireApiAuthStub() {};
  const callOrder = [];

  const route = loadDelegatedRoute({
    requireLogin,
    requireApiAuth,
    handleFaceBiometriaUpload(req, res) {
      callOrder.push({ req, res });
      return { delegated: true };
    },
  });

  assert.equal(route.routePath, '/api/biometria/face/upload');
  assert.equal(route.handlers.length, 3);
  assert.equal(route.handlers[0], requireLogin);
  assert.equal(route.handlers[1], requireApiAuth);

  const req = { body: { sample: true } };
  const res = { sentinel: true };
  const result = await route.handlers[2](req, res);

  assert.deepEqual(callOrder, [{ req, res }]);
  assert.deepEqual(result, { delegated: true });
});

test('face/upload etapa 1: a rota futura deixa de conter a orquestracao inline depois da extracao', () => {
  const delegatedSource = stripComments(buildDelegatedRouteSource());

  assert.match(delegatedSource, /router\.post\('\/api\/biometria\/face\/upload', requireLogin, requireApiAuth, handleFaceBiometriaUpload\);/);
  assert.doesNotMatch(delegatedSource, /capturas\.length/);
  assert.doesNotMatch(delegatedSource, /BLOB_READ_WRITE_TOKEN/);
  assert.doesNotMatch(delegatedSource, /Buffer\.from\(b64, 'base64'\)/);
  assert.doesNotMatch(delegatedSource, /sharp\(buf\)/);
  assert.doesNotMatch(delegatedSource, /await put\(/);
  assert.doesNotMatch(delegatedSource, /Falha interna no upload facial/);
});

test('face/upload etapa 1: o owner dedicado futuro herdara intactos os gates, parsing, sharp, blob, traducao HTTP e catch final', () => {
  const ownerSource = stripComments(buildExtractedOwnerSource());

  assert.match(ownerSource, /if \(!capturas\.length\) return res\.status\(400\)\.json\(\{ ok: false, error: 'Nenhuma captura enviada' \}\);/);
  assert.match(ownerSource, /if \(!inVercel && !blobToken\) \{/);
  assert.match(ownerSource, /return res\.status\(503\)\.json\(\{ ok: false, error: 'Blob não configurado/);
  assert.match(ownerSource, /const m = \^?\/\^data:\(image\\\/\(png\|jpeg\|webp\)\);base64,\(\.\+\)\$\/i\.exec\(dataUrl\);|const m = \/\^data:\(image\\\/\(png\|jpeg\|webp\)\);base64,\(\.\+\)\$\/i\.exec\(dataUrl\);/);
  assert.match(ownerSource, /const buf = Buffer\.from\(b64, 'base64'\);/);
  assert.match(ownerSource, /const image = sharp\(buf\);/);
  assert.match(ownerSource, /const \{ url \} = await put\(key, webpBuf, putOptions\);/);
  assert.match(ownerSource, /return res\.json\(\{ ok: true, arquivos: saved \}\);/);
  assert.match(ownerSource, /catch \(err\) \{/);
  assert.match(ownerSource, /return res\.status\(500\)\.json\(\{ ok: false, error: 'Falha interna no upload facial' \}\);/);
});

test('face/upload etapa 1: a rota futura minimizada nao reabsorve gates ou pipeline interno do owner dedicado', () => {
  const delegatedSource = stripComments(buildDelegatedRouteSource());
  const ownerSource = stripComments(buildExtractedOwnerSource());

  assert.match(delegatedSource, /handleFaceBiometriaUpload/);
  assert.match(ownerSource, /capturas\.length/);
  assert.match(ownerSource, /sharp\(buf\)/);
  assert.match(ownerSource, /await put\(/);
  assert.match(ownerSource, /catch \(err\) \{/);
});