import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/unidadeApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');
const SAMPLE_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+JxQAAAAASUVORK5CYII=';

function extractExportedConstArray(source, constName) {
  const signature = `export const ${constName} = [`;
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `Nao encontrou ${constName}`);

  const arrayStart = source.indexOf('[', start);
  assert.ok(arrayStart >= 0, `Nao encontrou array de ${constName}`);

  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let escaped = false;

  for (let index = arrayStart; index < source.length; index += 1) {
    const char = source[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (!inDouble && !inTemplate && char === "'") {
      inSingle = !inSingle;
      continue;
    }

    if (!inSingle && !inTemplate && char === '"') {
      inDouble = !inDouble;
      continue;
    }

    if (!inSingle && !inDouble && char === '`') {
      inTemplate = !inTemplate;
      continue;
    }

    if (inSingle || inDouble || inTemplate) {
      continue;
    }

    if (char === '[') depth += 1;
    if (char === ']') {
      depth -= 1;
      if (depth === 0) {
        const semicolonIndex = source.indexOf(';', index);
        assert.ok(semicolonIndex >= 0, `Nao encontrou fim de ${constName}`);
        return source.slice(start, semicolonIndex + 1).replace(/^export\s+/, '');
      }
    }
  }

  throw new Error(`Nao conseguiu extrair ${constName}`);
}

function buildUploadLogoUnidadeHandler(source, context = {}) {
  const script = new vm.Script(`${source}\nuploadLogoUnidade;`);
  const uploadLogoUnidade = script.runInNewContext(context);
  assert.ok(Array.isArray(uploadLogoUnidade), 'uploadLogoUnidade deve continuar sendo um array [middleware, handler]');
  assert.equal(typeof uploadLogoUnidade[1], 'function', 'uploadLogoUnidade[1] deve continuar sendo o handler async');
  return uploadLogoUnidade[1];
}

function createApiRes() {
  return {
    statusCode: 200,
    body: undefined,
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

function buildUploadLogoUnidadeJsonBranchWithSeam() {
  const original = extractExportedConstArray(CONTROLLER_SOURCE, 'uploadLogoUnidade');

  const installedSeamBlock = `let uploadedLogo;
        try {
          uploadedLogo = await uploadLogoUnidadeInlineWrite({
            unidade,
            buffer,
            processarEEnviarParaBlob: _processarEEnviarParaBlob,
            removeBlobLogo: del,
            saveUnidade: saveUnidadeDoc,
          });
        } catch (err) {
          if (err && err.code === 'BLOB_NOT_CONFIGURED') return badRequest(res, err.message);
          throw err;
        }
        unidade.logo = uploadedLogo.logo;`;

  if (original.includes(installedSeamBlock)) {
    return original;
  }

  const currentJsonBranchBlock = `let uploaded;
        try {
          uploaded = await _processarEEnviarParaBlob(buffer, { keyPrefix: \`unidades/\${unidade._id}\` });
        } catch (err) {
          if (err && err.code === 'BLOB_NOT_CONFIGURED') return badRequest(res, err.message);
          throw err;
        }
        // Remove anterior (best-effort) se era Blob
        try {
          if (unidade.logo && /^https?:\\/\\/.*blob\\.vercel-storage\\.com\\//i.test(unidade.logo)) {
            await del(unidade.logo, uploaded.token ? { token: uploaded.token } : undefined);
          }
        } catch {}
        unidade.logo = uploaded.url;
        await saveUnidadeDoc(unidade);`;

  const seamBlock = `let uploadedLogo;
        try {
          uploadedLogo = await uploadLogoUnidadeInlineWrite({
            unidade,
            buffer,
            processarEEnviarParaBlob: _processarEEnviarParaBlob,
            removeBlobLogo: del,
            saveUnidade: saveUnidadeDoc,
          });
        } catch (err) {
          if (err && err.code === 'BLOB_NOT_CONFIGURED') return badRequest(res, err.message);
          throw err;
        }
        unidade.logo = uploadedLogo.logo;`;

  const replaced = original.replace(currentJsonBranchBlock, seamBlock);
  assert.notEqual(replaced, original, 'Nao conseguiu substituir o bloco JSON dataUrl atual');
  return replaced;
}

test('uploadLogoUnidade[json]: owner real preserva validacao, lookup, autorizacao e responde por ok ao delegar write do branch JSON via seam', async () => {
  const callOrder = [];
  let lookupId = null;
  let authorizeId = null;
  let seamArgs = null;
  let processArgs = null;
  let removedArgs = null;
  let savedLogo = null;

  const handler = buildUploadLogoUnidadeHandler(
    buildUploadLogoUnidadeJsonBranchWithSeam(),
    {
      Buffer,
      findUnidadeById: async (id) => {
        callOrder.push('lookup');
        lookupId = id;
        return {
          _id: id,
          logo: 'https://blob.vercel-storage.com/unidades/u-filial/logo-antiga.webp',
        };
      },
      ensureCanAccessUnidade: async (_req, unidadeId) => {
        callOrder.push('authorize');
        authorizeId = unidadeId;
        return true;
      },
      uploadLogoUnidadeInlineWrite: async (input) => {
        callOrder.push('seam');
        seamArgs = input;
        assert.deepEqual(Object.keys(input).sort(), [
          'buffer',
          'processarEEnviarParaBlob',
          'removeBlobLogo',
          'saveUnidade',
          'unidade',
        ]);

        const uploaded = await input.processarEEnviarParaBlob(input.buffer, {
          keyPrefix: `unidades/${input.unidade._id}`,
        });

        try {
          if (input.unidade.logo && /^https?:\/\/.*blob\.vercel-storage\.com\//i.test(input.unidade.logo)) {
            await input.removeBlobLogo(input.unidade.logo, uploaded.token ? { token: uploaded.token } : undefined);
          }
        } catch {}

        input.unidade.logo = uploaded.url;
        await input.saveUnidade(input.unidade);
        return { logo: input.unidade.logo };
      },
      _processarEEnviarParaBlob: async (buffer, options) => {
        processArgs = { buffer, options };
        return {
          url: 'https://blob.vercel-storage.com/unidades/u-filial/logo-final.webp',
          token: 'token-test',
        };
      },
      del: async (url, options) => {
        removedArgs = { url, options };
      },
      saveUnidadeDoc: async (unidade) => {
        savedLogo = unidade.logo;
      },
      ok: (res, data) => {
        callOrder.push('ok');
        return res.status(200).json({ success: true, data });
      },
      badRequest: (res, message) => res.status(400).json({ success: false, code: 'BAD_REQUEST', message }),
      notFound: (res, message) => res.status(404).json({ success: false, code: 'NOT_FOUND', message }),
      serverError: (res, error) => res.status(500).json({ success: false, code: 'SERVER_ERROR', message: error?.message }),
      console,
    }
  );

  const req = {
    user: { role: 'admin' },
    params: { id: 'u-filial' },
    body: { dataUrl: SAMPLE_DATA_URL },
    headers: { 'content-type': 'application/json' },
  };
  const res = createApiRes();

  await handler(req, res);

  assert.equal(lookupId, 'u-filial');
  assert.equal(authorizeId, 'u-filial');
  assert.ok(seamArgs, 'O bloco atual do branch JSON deve ser extraivel via seam adapter');
  assert.equal(seamArgs.unidade._id, 'u-filial');
  assert.ok(Buffer.isBuffer(seamArgs.buffer));
  assert.deepEqual(seamArgs.buffer, Buffer.from(SAMPLE_DATA_URL.split(',')[1], 'base64'));
  assert.equal(processArgs.options.keyPrefix, 'unidades/u-filial');
  assert.deepEqual(removedArgs, {
    url: 'https://blob.vercel-storage.com/unidades/u-filial/logo-antiga.webp',
    options: { token: 'token-test' },
  });
  assert.equal(savedLogo, 'https://blob.vercel-storage.com/unidades/u-filial/logo-final.webp');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.uploaded, true);
  assert.equal(res.body.data.logo, 'https://blob.vercel-storage.com/unidades/u-filial/logo-final.webp');
  assert.deepEqual(callOrder, [
    'lookup',
    'authorize',
    'seam',
    'ok',
  ]);
});

test('uploadLogoUnidade[json]: owner real mantem mapeamento de BLOB_NOT_CONFIGURED ao delegar write do branch JSON via seam', async () => {
  const callOrder = [];

  const handler = buildUploadLogoUnidadeHandler(
    buildUploadLogoUnidadeJsonBranchWithSeam(),
    {
      Buffer,
      findUnidadeById: async (id) => {
        callOrder.push('lookup');
        return { _id: id, logo: '' };
      },
      ensureCanAccessUnidade: async () => {
        callOrder.push('authorize');
        return true;
      },
      uploadLogoUnidadeInlineWrite: async () => {
        callOrder.push('seam');
        const error = new Error('Blob não configurado (conecte a Store no Vercel OU defina BLOB_READ_WRITE_TOKEN/WDGESTOR_DB_DADOS_READ_WRITE_TOKEN)');
        error.code = 'BLOB_NOT_CONFIGURED';
        throw error;
      },
      _processarEEnviarParaBlob: async () => {
        throw new Error('nao deve chamar helper direto quando a seam esta instalada');
      },
      del: async () => {},
      saveUnidadeDoc: async () => {},
      ok: (res, data) => {
        callOrder.push('ok');
        return res.status(200).json({ success: true, data });
      },
      badRequest: (res, message) => {
        callOrder.push('badRequest');
        return res.status(400).json({ success: false, code: 'BAD_REQUEST', message });
      },
      notFound: (res, message) => res.status(404).json({ success: false, code: 'NOT_FOUND', message }),
      serverError: (res, error) => res.status(500).json({ success: false, code: 'SERVER_ERROR', message: error?.message }),
      console,
    }
  );

  const req = {
    user: { role: 'admin' },
    params: { id: 'u-filial' },
    body: { dataUrl: SAMPLE_DATA_URL },
    headers: { 'content-type': 'application/json' },
  };
  const res = createApiRes();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    code: 'BAD_REQUEST',
    message: 'Blob não configurado (conecte a Store no Vercel OU defina BLOB_READ_WRITE_TOKEN/WDGESTOR_DB_DADOS_READ_WRITE_TOKEN)',
  });
  assert.deepEqual(callOrder, [
    'lookup',
    'authorize',
    'seam',
    'badRequest',
  ]);
});

test('uploadLogoUnidade[multipart]: branch multipart continua fora da costura JSON e usa o helper direto no owner atual', async () => {
  const callOrder = [];
  let seamCalled = false;
  let processArgs = null;
  let savedLogo = null;

  const handler = buildUploadLogoUnidadeHandler(
    buildUploadLogoUnidadeJsonBranchWithSeam(),
    {
      Buffer,
      findUnidadeById: async (id) => {
        callOrder.push('lookup');
        return { _id: id, logo: '' };
      },
      ensureCanAccessUnidade: async () => {
        callOrder.push('authorize');
        return true;
      },
      uploadLogoUnidadeInlineWrite: async () => {
        seamCalled = true;
        throw new Error('nao deve usar seam do branch JSON no multipart');
      },
      _processarEEnviarParaBlob: async (buffer, options) => {
        callOrder.push('processMultipart');
        processArgs = { buffer, options };
        return {
          url: 'https://blob.vercel-storage.com/unidades/u-filial/logo-multipart.webp',
          token: 'token-test',
        };
      },
      del: async () => {},
      saveUnidadeDoc: async (unidade) => {
        callOrder.push('save');
        savedLogo = unidade.logo;
      },
      ok: (res, data) => {
        callOrder.push('ok');
        return res.status(200).json({ success: true, data });
      },
      badRequest: (res, message) => res.status(400).json({ success: false, code: 'BAD_REQUEST', message }),
      notFound: (res, message) => res.status(404).json({ success: false, code: 'NOT_FOUND', message }),
      serverError: (res, error) => res.status(500).json({ success: false, code: 'SERVER_ERROR', message: error?.message }),
      console,
    }
  );

  const req = {
    user: { role: 'admin' },
    params: { id: 'u-filial' },
    body: {},
    headers: { 'content-type': 'multipart/form-data' },
    file: { buffer: Buffer.from('multipart-image'), size: 123 },
  };
  const res = createApiRes();

  await handler(req, res);

  assert.equal(seamCalled, false);
  assert.ok(Buffer.isBuffer(processArgs.buffer));
  assert.deepEqual(processArgs.buffer, Buffer.from('multipart-image'));
  assert.equal(processArgs.options.keyPrefix, 'unidades/u-filial');
  assert.equal(savedLogo, 'https://blob.vercel-storage.com/unidades/u-filial/logo-multipart.webp');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.logo, 'https://blob.vercel-storage.com/unidades/u-filial/logo-multipart.webp');
  assert.deepEqual(callOrder, [
    'lookup',
    'authorize',
    'processMultipart',
    'save',
    'ok',
  ]);
});