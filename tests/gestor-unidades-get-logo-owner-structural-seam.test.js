import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = process.cwd();
const CONTROLLER_PATH = path.join(ROOT, 'src/modules/gestor/app/controllers/unidadeApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

function extractExportedAsyncFunction(source, functionName) {
  const signature = `export async function ${functionName}`;
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `Nao encontrou ${functionName}`);

  const paramsEnd = source.indexOf(')', start);
  assert.ok(paramsEnd >= 0, `Nao encontrou fechamento de parametros de ${functionName}`);

  const braceStart = source.indexOf('{', paramsEnd);
  assert.ok(braceStart >= 0, `Nao encontrou bloco de ${functionName}`);

  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1).replace(/^export\s+/, '');
    }
  }

  throw new Error(`Nao conseguiu extrair ${functionName}`);
}

function buildFunction(functionSource, context = {}) {
  const script = new vm.Script(`(${functionSource})`);
  return script.runInNewContext(context);
}

function createApiRes({ sendFileShouldFail = false } = {}) {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    sent: undefined,
    redirectedTo: undefined,
    filePath: undefined,
    ended: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    set(name, value) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    redirect(location) {
      this.statusCode = 302;
      this.redirectedTo = location;
      return this;
    },
    send(payload) {
      this.sent = payload;
      return this;
    },
    sendFile(filePath, callback) {
      this.filePath = filePath;
      if (typeof callback === 'function') callback(sendFileShouldFail ? new Error('forced-sendfile-failure') : undefined);
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

function buildGetUnidadeLogoWithSeam() {
  const original = extractExportedAsyncFunction(CONTROLLER_SOURCE, 'getUnidadeLogo');

  const installedSeamBlock = `const resolvedLogoResource = await resolveUnidadeLogoResource({
      unidade,
      parseDataUrl: _parseDataUrl,
      fs,
      path,
      cwd: () => process.cwd(),
    });

    if (resolvedLogoResource.kind === 'redirect') {
      res.set('Cache-Control', resolvedLogoResource.cacheControl);
      return res.redirect(resolvedLogoResource.url);
    }

    if (resolvedLogoResource.kind === 'buffer') {
      res.set('Content-Type', resolvedLogoResource.contentType);
      res.set('Cache-Control', resolvedLogoResource.cacheControl);
      return res.send(resolvedLogoResource.buffer);
    }

    if (resolvedLogoResource.kind === 'file') {
      res.set('Content-Type', resolvedLogoResource.contentType);
      res.set('Cache-Control', resolvedLogoResource.cacheControl);
      if (resolvedLogoResource.fallbackTo204OnError) {
        return res.sendFile(resolvedLogoResource.filePath, err => err ? res.status(204).end() : undefined);
      }
      return res.sendFile(resolvedLogoResource.filePath);
    }

    return res.status(204).end();`;

  if (original.includes(installedSeamBlock)) {
    return original;
  }

  const seamBlock = `const resolvedLogoResource = await resolveUnidadeLogoResource({
      unidade,
      parseDataUrl: _parseDataUrl,
      fs,
      path,
      cwd: () => process.cwd(),
    });

    if (resolvedLogoResource.kind === 'redirect') {
      res.set('Cache-Control', resolvedLogoResource.cacheControl);
      return res.redirect(resolvedLogoResource.url);
    }

    if (resolvedLogoResource.kind === 'buffer') {
      res.set('Content-Type', resolvedLogoResource.contentType);
      res.set('Cache-Control', resolvedLogoResource.cacheControl);
      return res.send(resolvedLogoResource.buffer);
    }

    if (resolvedLogoResource.kind === 'file') {
      res.set('Content-Type', resolvedLogoResource.contentType);
      res.set('Cache-Control', resolvedLogoResource.cacheControl);
      if (resolvedLogoResource.fallbackTo204OnError) {
        return res.sendFile(resolvedLogoResource.filePath, err => err ? res.status(204).end() : undefined);
      }
      return res.sendFile(resolvedLogoResource.filePath);
    }

    return res.status(204).end();`;

  const resolutionStartMarker = "const logo = unidade.logo || '';";
  const resolutionEndMarker = "\n  } catch (e) {";
  const resolutionStart = original.indexOf(resolutionStartMarker);
  const resolutionEnd = original.indexOf(resolutionEndMarker, resolutionStart);
  assert.ok(resolutionStart >= 0, 'Nao encontrou inicio do bloco atual de resolucao de logo');
  assert.ok(resolutionEnd > resolutionStart, 'Nao encontrou fim do bloco atual de resolucao de logo');

  const replaced = `${original.slice(0, resolutionStart)}${seamBlock}${original.slice(resolutionEnd)}`;
  assert.notEqual(replaced, original, 'Nao conseguiu substituir o bloco atual de resolucao de logo');
  return replaced;
}

test('getUnidadeLogo: preserva autorizacao/lookup, delega resolucao via seam e emite redirect no owner', async () => {
  const callOrder = [];
  let authorizeId = null;
  let lookupId = null;
  let seamArgs = null;

  const getUnidadeLogo = buildFunction(
    buildGetUnidadeLogoWithSeam(),
    {
      createUnidadePolicyContextCore: () => ({
        ensureCanAccessUnidade: async (id) => {
          callOrder.push('authorize');
          authorizeId = id;
          return true;
        },
      }),
      findUnidadeByIdLean: async (id) => {
        callOrder.push('lookup');
        lookupId = id;
        return { _id: id, logo: 'https://blob.vercel-storage.com/unidades/u-filial/logo.webp' };
      },
      resolveUnidadeLogoResource: async (input) => {
        callOrder.push('resolveLogo');
        seamArgs = input;
        return {
          kind: 'redirect',
          url: 'https://blob.vercel-storage.com/unidades/u-filial/logo.webp',
          cacheControl: 'public, max-age=60',
        };
      },
      _parseDataUrl: (value) => ({ parsed: value }),
      fs: {},
      path,
      process: { cwd: () => ROOT },
      badRequest: (res, message) => res.status(400).json({ success: false, code: 'BAD_REQUEST', message }),
      notFound: (res, message) => res.status(404).json({ success: false, code: 'NOT_FOUND', message }),
      serverError: (res, error) => res.status(500).json({ success: false, code: 'SERVER_ERROR', message: error?.message }),
      console,
    }
  );

  const res = createApiRes();
  await getUnidadeLogo({ params: { id: 'u-filial' }, user: { role: 'admin' } }, res);

  assert.equal(authorizeId, 'u-filial');
  assert.equal(lookupId, 'u-filial');
  assert.ok(seamArgs, 'O bloco atual de resolucao de logo deve ser extraivel via seam adapter');
  assert.equal(seamArgs.unidade._id, 'u-filial');
  assert.equal(typeof seamArgs.parseDataUrl, 'function');
  assert.equal(typeof seamArgs.cwd, 'function');
  assert.equal(seamArgs.cwd(), ROOT);
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers['cache-control'], 'public, max-age=60');
  assert.equal(res.redirectedTo, 'https://blob.vercel-storage.com/unidades/u-filial/logo.webp');
  assert.deepEqual(callOrder, ['authorize', 'lookup', 'resolveLogo']);
});

test('getUnidadeLogo: preserva 400 fora do escopo contextual sem chamar a seam de resolucao', async () => {
  let seamCalled = false;

  const getUnidadeLogo = buildFunction(
    buildGetUnidadeLogoWithSeam(),
    {
      createUnidadePolicyContextCore: () => ({
        ensureCanAccessUnidade: async () => false,
      }),
      findUnidadeByIdLean: async () => {
        throw new Error('nao deve fazer lookup quando nao tem acesso');
      },
      resolveUnidadeLogoResource: async () => {
        seamCalled = true;
        throw new Error('nao deve chamar seam sem acesso');
      },
      _parseDataUrl: () => null,
      fs: {},
      path,
      process: { cwd: () => ROOT },
      badRequest: (res, message) => res.status(400).json({ success: false, code: 'BAD_REQUEST', message }),
      notFound: (res, message) => res.status(404).json({ success: false, code: 'NOT_FOUND', message }),
      serverError: (res, error) => res.status(500).json({ success: false, code: 'SERVER_ERROR', message: error?.message }),
      console,
    }
  );

  const res = createApiRes();
  await getUnidadeLogo({ params: { id: 'u-fora' }, user: { role: 'admin' } }, res);

  assert.equal(seamCalled, false);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    code: 'BAD_REQUEST',
    message: 'Acesso à unidade não autorizado.',
  });
});

test('getUnidadeLogo: preserva emissao de buffer no owner a partir da resolucao da seam', async () => {
  const callOrder = [];
  const sentBuffer = Buffer.from('decoded-data-url');

  const getUnidadeLogo = buildFunction(
    buildGetUnidadeLogoWithSeam(),
    {
      createUnidadePolicyContextCore: () => ({
        ensureCanAccessUnidade: async () => {
          callOrder.push('authorize');
          return true;
        },
      }),
      findUnidadeByIdLean: async (id) => {
        callOrder.push('lookup');
        return { _id: id, logo: 'data:image/png;base64,AAAA' };
      },
      resolveUnidadeLogoResource: async () => {
        callOrder.push('resolveLogo');
        return {
          kind: 'buffer',
          buffer: sentBuffer,
          contentType: 'image/png',
          cacheControl: 'private, max-age=300',
        };
      },
      _parseDataUrl: () => ({ buffer: sentBuffer, contentType: 'image/png' }),
      fs: {},
      path,
      process: { cwd: () => ROOT },
      badRequest: (res, message) => res.status(400).json({ success: false, code: 'BAD_REQUEST', message }),
      notFound: (res, message) => res.status(404).json({ success: false, code: 'NOT_FOUND', message }),
      serverError: (res, error) => res.status(500).json({ success: false, code: 'SERVER_ERROR', message: error?.message }),
      console,
    }
  );

  const res = createApiRes();
  await getUnidadeLogo({ params: { id: 'u-data' }, user: { role: 'admin' } }, res);

  assert.equal(res.headers['content-type'], 'image/png');
  assert.equal(res.headers['cache-control'], 'private, max-age=300');
  assert.equal(res.sent, sentBuffer);
  assert.deepEqual(callOrder, ['authorize', 'lookup', 'resolveLogo']);
});

test('getUnidadeLogo: preserva emissao de arquivo no owner e fallback 204 para placeholder quando sendFile falha', async () => {
  const callOrder = [];

  const getUnidadeLogo = buildFunction(
    buildGetUnidadeLogoWithSeam(),
    {
      createUnidadePolicyContextCore: () => ({
        ensureCanAccessUnidade: async () => {
          callOrder.push('authorize');
          return true;
        },
      }),
      findUnidadeByIdLean: async (id) => {
        callOrder.push('lookup');
        return { _id: id, logo: '' };
      },
      resolveUnidadeLogoResource: async () => {
        callOrder.push('resolveLogo');
        return {
          kind: 'file',
          filePath: path.join(ROOT, 'public', 'img', 'placeholder-logo.svg'),
          contentType: 'image/svg+xml',
          cacheControl: 'public, max-age=600',
          fallbackTo204OnError: true,
        };
      },
      _parseDataUrl: () => null,
      fs: {},
      path,
      process: { cwd: () => ROOT },
      badRequest: (res, message) => res.status(400).json({ success: false, code: 'BAD_REQUEST', message }),
      notFound: (res, message) => res.status(404).json({ success: false, code: 'NOT_FOUND', message }),
      serverError: (res, error) => res.status(500).json({ success: false, code: 'SERVER_ERROR', message: error?.message }),
      console,
    }
  );

  const res = createApiRes({ sendFileShouldFail: true });
  await getUnidadeLogo({ params: { id: 'u-placeholder' }, user: { role: 'admin' } }, res);

  assert.equal(res.headers['content-type'], 'image/svg+xml');
  assert.equal(res.headers['cache-control'], 'public, max-age=600');
  assert.equal(res.filePath, path.join(ROOT, 'public', 'img', 'placeholder-logo.svg'));
  assert.equal(res.statusCode, 204);
  assert.equal(res.ended, true);
  assert.deepEqual(callOrder, ['authorize', 'lookup', 'resolveLogo']);
});