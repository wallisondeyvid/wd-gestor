import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/unidadeApiController.js');
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

function buildGetUnidadePublicWithSeam() {
  const original = extractExportedAsyncFunction(CONTROLLER_SOURCE, 'getUnidadePublic');

  const installedSeamBlock = `const payload = buildUnidadePublicPayload({ unidade });`;
  if (original.includes(installedSeamBlock)) {
    return original;
  }

  const seamBlock = `const payload = buildUnidadePublicPayload({ unidade });`;

  const payloadStartMarker = 'const payload = {';
  const payloadEndMarker = '\n    return ok(res, payload);';
  const payloadStart = original.indexOf(payloadStartMarker);
  const payloadEnd = original.indexOf(payloadEndMarker, payloadStart);
  assert.ok(payloadStart >= 0, 'Nao encontrou inicio do bloco atual de payload publico');
  assert.ok(payloadEnd > payloadStart, 'Nao encontrou fim do bloco atual de payload publico');

  const replaced = `${original.slice(0, payloadStart)}${seamBlock}${original.slice(payloadEnd)}`;
  assert.notEqual(replaced, original, 'Nao conseguiu substituir o bloco atual de payload publico');
  return replaced;
}

test('getUnidadePublic: owner real preserva gate/lookup e responde por ok ao delegar payload publico via seam', async () => {
  const callOrder = [];
  let lookupId = null;
  let seamArgs = null;

  const getUnidadePublic = buildFunction(
    buildGetUnidadePublicWithSeam(),
    {
      findUnidadeByIdLean: async (id) => {
        callOrder.push('lookup');
        lookupId = id;
        return {
          _id: id,
          nome: 'Clinica Publica',
          logo: 'uploads/unidades/logo.png',
          is_active: true,
        };
      },
      buildUnidadePublicPayload: ({ unidade }) => {
        callOrder.push('buildPayload');
        seamArgs = { unidade };
        return {
          _id: unidade._id,
          nome: unidade.nome || '',
          razaoSocial: '',
          endereco: '',
          telefone: '',
          emailPrincipal: '',
          banco: '',
          agencia: '',
          contaCorrente: '',
          pixChave: '',
          tipoPix: '',
          is_principal: false,
          subunidade: false,
          logoUrl: `/api/unidades/${unidade._id}/logo`,
        };
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

  const res = createApiRes();
  await getUnidadePublic({ params: { id: 'u-publica' }, app: { locals: {} } }, res);

  assert.equal(lookupId, 'u-publica');
  assert.ok(seamArgs, 'O bloco atual de payload publico deve ser extraivel via seam adapter');
  assert.equal(seamArgs.unidade._id, 'u-publica');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.logoUrl, '/api/unidades/u-publica/logo');
  assert.deepEqual(callOrder, ['lookup', 'buildPayload', 'ok']);
});

test('getUnidadePublic: owner real preserva skipDb sem chamar lookup nem seam', async () => {
  let seamCalled = false;
  let lookupCalled = false;

  const getUnidadePublic = buildFunction(
    buildGetUnidadePublicWithSeam(),
    {
      findUnidadeByIdLean: async () => {
        lookupCalled = true;
        throw new Error('nao deve fazer lookup quando skipDb esta ativo');
      },
      buildUnidadePublicPayload: () => {
        seamCalled = true;
        throw new Error('nao deve montar payload quando skipDb esta ativo');
      },
      ok: (res, data) => res.status(200).json({ success: true, data }),
      badRequest: (res, message) => res.status(400).json({ success: false, code: 'BAD_REQUEST', message }),
      notFound: (res, message) => res.status(404).json({ success: false, code: 'NOT_FOUND', message }),
      serverError: (res, error) => res.status(500).json({ success: false, code: 'SERVER_ERROR', message: error?.message }),
      console,
    }
  );

  const res = createApiRes();
  await getUnidadePublic({ params: { id: 'u-publica' }, app: { locals: { skipDb: true } } }, res);

  assert.equal(lookupCalled, false);
  assert.equal(seamCalled, false);
  assert.equal(res.statusCode, 200);
  assert.equal(
    JSON.stringify(res.body),
    JSON.stringify({
      success: true,
      data: {},
    })
  );
});

test('getUnidadePublic: owner real preserva 404 para unidade inativa sem chamar a seam', async () => {
  let seamCalled = false;

  const getUnidadePublic = buildFunction(
    buildGetUnidadePublicWithSeam(),
    {
      findUnidadeByIdLean: async () => ({ _id: 'u-inativa', is_active: false }),
      buildUnidadePublicPayload: () => {
        seamCalled = true;
        throw new Error('nao deve montar payload para unidade inativa');
      },
      ok: (res, data) => res.status(200).json({ success: true, data }),
      badRequest: (res, message) => res.status(400).json({ success: false, code: 'BAD_REQUEST', message }),
      notFound: (res, message) => res.status(404).json({ success: false, code: 'NOT_FOUND', message }),
      serverError: (res, error) => res.status(500).json({ success: false, code: 'SERVER_ERROR', message: error?.message }),
      console,
    }
  );

  const res = createApiRes();
  await getUnidadePublic({ params: { id: 'u-inativa' }, app: { locals: {} } }, res);

  assert.equal(seamCalled, false);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, {
    success: false,
    code: 'NOT_FOUND',
    message: 'Unidade inativa.',
  });
});