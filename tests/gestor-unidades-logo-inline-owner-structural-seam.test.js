import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/unidadeApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');
const SAMPLE_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+JxQAAAAASUVORK5CYII=';

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

function buildUploadLogoUnidadeInlineWithSeam() {
  const original = extractExportedAsyncFunction(CONTROLLER_SOURCE, 'uploadLogoUnidadeInline');

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

  const currentWriteBlock = `let uploaded;
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

  const replaced = original.replace(currentWriteBlock, seamBlock);
  assert.notEqual(replaced, original, 'Nao conseguiu substituir o bloco atual de write inline');
  return replaced;
}

test('uploadLogoUnidadeInline: owner real preserva validacao, lookup, autorizacao e responde por ok ao delegar write via seam', async () => {
  const callOrder = [];
  let lookupId = null;
  let authorizeId = null;
  let seamArgs = null;
  let processArgs = null;
  let removedArgs = null;
  let savedLogo = null;

  const uploadLogoUnidadeInline = buildFunction(
    buildUploadLogoUnidadeInlineWithSeam(),
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
      createUnidadePolicyContextCore: () => ({
        ensureCanAccessUnidade: async (unidadeId) => {
          callOrder.push('authorize');
          authorizeId = unidadeId;
          return true;
        },
      }),
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
  };
  const res = createApiRes();

  await uploadLogoUnidadeInline(req, res);

  assert.equal(lookupId, 'u-filial');
  assert.equal(authorizeId, 'u-filial');
  assert.ok(seamArgs, 'O bloco atual de write inline deve ser extraivel via seam adapter');
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
}
);

test('uploadLogoUnidadeInline: owner real mantem mapeamento de BLOB_NOT_CONFIGURED ao delegar write via seam', async () => {
  const callOrder = [];

  const uploadLogoUnidadeInline = buildFunction(
    buildUploadLogoUnidadeInlineWithSeam(),
    {
      Buffer,
      findUnidadeById: async (id) => {
        callOrder.push('lookup');
        return { _id: id, logo: '' };
      },
      createUnidadePolicyContextCore: () => ({
        ensureCanAccessUnidade: async () => {
          callOrder.push('authorize');
          return true;
        },
      }),
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
  };
  const res = createApiRes();

  await uploadLogoUnidadeInline(req, res);

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