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
  const runtimeContext = {
    ...context,
    createUnidadePolicyContextCore: context.createUnidadePolicyContextCore || (() => ({
      ensureCanAccessUnidade: (unidadeId) => context.ensureCanAccessUnidade?.(context.__currentReqForPolicyContext, unidadeId),
    })),
  };
  return script.runInNewContext(runtimeContext);
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

function defaultNormalizeUnitId(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function buildToggleAccessWithSeam() {
  const original = extractExportedAsyncFunction(CONTROLLER_SOURCE, 'toggleAccessUnidades');

  const installedSeamBlock = `const coreResult = await executeToggleAccessCore({`;
  if (original.includes(installedSeamBlock)) {
    return original;
  }

  const blockStartMarker = 'const accessChecks = await Promise.all(';
  const blockEndMarker = '\n\n    return ok(res, { newStatus: activate });';
  const blockStart = original.indexOf(blockStartMarker);
  const blockEnd = original.indexOf(blockEndMarker, blockStart);

  assert.ok(blockStart >= 0, 'Nao encontrou inicio do nucleo atual pos-normalizacao');
  assert.ok(blockEnd > blockStart, 'Nao encontrou fim do nucleo atual pos-normalizacao');

  const seamBlock = `const coreResult = await executeToggleAccessCore({
      unitIds: normalizedUnitIds,
      activate,
      role: req.user.role,
      canAccessUnitId: (unitId) => ensureCanAccessUnidade(req, unitId),
      findUnidadesPrincipaisByIds,
      updateManyUnidadesAccessByIds,
    });
    if (coreResult.kind === 'bad_request') {
      return badRequest(res, coreResult.message);
    }`;

  const replaced = `${original.slice(0, blockStart)}${seamBlock}${original.slice(blockEnd)}`;
  assert.notEqual(replaced, original, 'Nao conseguiu substituir o nucleo atual pos-normalizacao');
  return replaced;
}

function buildToggleAccess(context = {}) {
  const functionSource = buildToggleAccessWithSeam();
  return async function toggleAccessWithRuntimeReq(req, res) {
    const executable = buildFunction(functionSource, {
      ...context,
      __currentReqForPolicyContext: req,
    });
    return executable(req, res);
  };
}

test('toggleAccessUnidades: owner real preserva gate, shape, normalizacao e ok final ao delegar o nucleo pos-normalizacao via seam', async () => {
  const callOrder = [];
  let seamArgs = null;

  const toggleAccessUnidades = buildToggleAccess({
      normalizeUnitId: defaultNormalizeUnitId,
      ensureCanAccessUnidade: async () => {
        throw new Error('nao deve usar ensureCanAccessUnidade fora da seam');
      },
      findUnidadesPrincipaisByIds: async () => {
        throw new Error('nao deve consultar unidades principais fora da seam');
      },
      updateManyUnidadesAccessByIds: async () => {
        throw new Error('nao deve mutar fora da seam');
      },
      executeToggleAccessCore: async (input) => {
        callOrder.push('core');
        seamArgs = input;
        return { kind: 'ok' };
      },
      ok: (res, data) => {
        callOrder.push('ok');
        return res.status(200).json({ success: true, data });
      },
      badRequest: (res, message) => res.status(400).json({ success: false, code: 'BAD_REQUEST', message }),
      serverError: (res, error) => res.status(500).json({ success: false, code: 'SERVER_ERROR', message: error?.message }),
      console,
    });

  const res = createApiRes();
  await toggleAccessUnidades({
    body: { unitIds: ['u-1', ' u-1 ', '', 'u-2', null, 'u-2'], activate: false },
    user: { role: 'admin', isMaster: true },
  }, res);

  assert.ok(seamArgs, 'O nucleo pos-normalizacao deve ser extraivel via seam adapter');
  assert.equal(JSON.stringify(seamArgs.unitIds), JSON.stringify(['u-1', 'u-2']));
  assert.equal(seamArgs.activate, false);
  assert.equal(seamArgs.role, 'admin');
  assert.equal(typeof seamArgs.canAccessUnitId, 'function');
  assert.equal(typeof seamArgs.findUnidadesPrincipaisByIds, 'function');
  assert.equal(typeof seamArgs.updateManyUnidadesAccessByIds, 'function');
  assert.equal(res.statusCode, 200);
  assert.equal(
    JSON.stringify(res.body),
    JSON.stringify({
      success: true,
      data: { newStatus: false },
    })
  );
  assert.deepEqual(callOrder, ['core', 'ok']);
});

test('toggleAccessUnidades: owner real preserva gate inicial de papel sem chamar a seam', async () => {
  let seamCalled = false;

  const toggleAccessUnidades = buildToggleAccess({
      normalizeUnitId: defaultNormalizeUnitId,
      ensureCanAccessUnidade: async () => true,
      findUnidadesPrincipaisByIds: async () => [],
      updateManyUnidadesAccessByIds: async () => ({ modifiedCount: 1 }),
      executeToggleAccessCore: async () => {
        seamCalled = true;
        throw new Error('nao deve executar o nucleo quando o papel ja falha');
      },
      ok: (res, data) => res.status(200).json({ success: true, data }),
      badRequest: (res, message) => res.status(400).json({ success: false, code: 'BAD_REQUEST', message }),
      serverError: (res, error) => res.status(500).json({ success: false, code: 'SERVER_ERROR', message: error?.message }),
      console,
    });

  const res = createApiRes();
  await toggleAccessUnidades({
    body: { unitIds: ['u-1'], activate: true },
    user: { role: 'user' },
  }, res);

  assert.equal(seamCalled, false);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    code: 'BAD_REQUEST',
    message: 'Você não tem permissão para alterar o acesso de unidades.',
  });
});

test('toggleAccessUnidades: owner real preserva validacao bruta do payload sem chamar a seam', async () => {
  let seamCalled = false;

  const toggleAccessUnidades = buildToggleAccess({
      normalizeUnitId: defaultNormalizeUnitId,
      ensureCanAccessUnidade: async () => true,
      findUnidadesPrincipaisByIds: async () => [],
      updateManyUnidadesAccessByIds: async () => ({ modifiedCount: 1 }),
      executeToggleAccessCore: async () => {
        seamCalled = true;
        throw new Error('nao deve executar o nucleo quando o shape do payload e invalido');
      },
      ok: (res, data) => res.status(200).json({ success: true, data }),
      badRequest: (res, message) => res.status(400).json({ success: false, code: 'BAD_REQUEST', message }),
      serverError: (res, error) => res.status(500).json({ success: false, code: 'SERVER_ERROR', message: error?.message }),
      console,
    });

  const res = createApiRes();
  await toggleAccessUnidades({
    body: { activate: 'true' },
    user: { role: 'admin' },
  }, res);

  assert.equal(seamCalled, false);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    code: 'BAD_REQUEST',
    message: 'Parâmetros inválidos.',
  });
});

test('toggleAccessUnidades: owner real preserva normalizacao e aborta antes da seam quando nenhum id valido sobra', async () => {
  let seamCalled = false;

  const toggleAccessUnidades = buildToggleAccess({
      normalizeUnitId: defaultNormalizeUnitId,
      ensureCanAccessUnidade: async () => true,
      findUnidadesPrincipaisByIds: async () => [],
      updateManyUnidadesAccessByIds: async () => ({ modifiedCount: 1 }),
      executeToggleAccessCore: async () => {
        seamCalled = true;
        throw new Error('nao deve executar o nucleo quando a normalizacao elimina todos os ids');
      },
      ok: (res, data) => res.status(200).json({ success: true, data }),
      badRequest: (res, message) => res.status(400).json({ success: false, code: 'BAD_REQUEST', message }),
      serverError: (res, error) => res.status(500).json({ success: false, code: 'SERVER_ERROR', message: error?.message }),
      console,
    });

  const res = createApiRes();
  await toggleAccessUnidades({
    body: { unitIds: ['   ', '', null], activate: true },
    user: { role: 'admin' },
  }, res);

  assert.equal(seamCalled, false);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    code: 'BAD_REQUEST',
    message: 'Parâmetros inválidos.',
  });
});

test('toggleAccessUnidades: owner real preserva o mapeamento de badRequest do nucleo sem assumir o trabalho interno da seam', async () => {
  let seamArgs = null;
  let okCalled = false;

  const toggleAccessUnidades = buildToggleAccess({
      normalizeUnitId: defaultNormalizeUnitId,
      ensureCanAccessUnidade: async () => true,
      findUnidadesPrincipaisByIds: async () => [],
      updateManyUnidadesAccessByIds: async () => ({ modifiedCount: 1 }),
      executeToggleAccessCore: async (input) => {
        seamArgs = input;
        return { kind: 'bad_request', message: 'Nenhuma unidade atualizada.' };
      },
      ok: (res, data) => {
        okCalled = true;
        return res.status(200).json({ success: true, data });
      },
      badRequest: (res, message) => res.status(400).json({ success: false, code: 'BAD_REQUEST', message }),
      serverError: (res, error) => res.status(500).json({ success: false, code: 'SERVER_ERROR', message: error?.message }),
      console,
    });

  const res = createApiRes();
  await toggleAccessUnidades({
    body: { unitIds: ['u-1'], activate: true },
    user: { role: 'admin' },
  }, res);

  assert.ok(seamArgs);
  assert.equal(okCalled, false);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    code: 'BAD_REQUEST',
    message: 'Nenhuma unidade atualizada.',
  });
});

test('toggleAccessUnidades: owner real preserva tratamento de erro externo quando a seam falha', async () => {
  const toggleAccessUnidades = buildToggleAccess({
      normalizeUnitId: defaultNormalizeUnitId,
      ensureCanAccessUnidade: async () => true,
      findUnidadesPrincipaisByIds: async () => [],
      updateManyUnidadesAccessByIds: async () => ({ modifiedCount: 1 }),
      executeToggleAccessCore: async () => {
        throw new Error('forced-toggle-access-core-failure');
      },
      ok: (res, data) => res.status(200).json({ success: true, data }),
      badRequest: (res, message) => res.status(400).json({ success: false, code: 'BAD_REQUEST', message }),
      serverError: (res, error) => res.status(500).json({ success: false, code: 'SERVER_ERROR', message: error?.message }),
      console,
    });

  const res = createApiRes();
  await toggleAccessUnidades({
    body: { unitIds: ['u-1'], activate: true },
    user: { role: 'admin' },
  }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, {
    success: false,
    code: 'SERVER_ERROR',
    message: 'forced-toggle-access-core-failure',
  });
});