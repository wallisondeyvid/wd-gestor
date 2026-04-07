import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/funcionarioApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

function extractFullOwnerSnippet(source) {
  const start = source.indexOf('const bracketToDot =');
  const end = source.indexOf('function isValidObjectIdLike', start);

  assert.ok(start >= 0, 'Nao foi possivel localizar o inicio do recorte de update full.');
  assert.ok(end > start, 'Nao foi possivel localizar o fim do recorte de update full.');

  return source
    .slice(start, end)
    .replace(/export\s+async\s+function\s+updateFuncionarioIncremental/g, 'async function updateFuncionarioIncremental')
    .replace(/export\s+async\s+function\s+updateFuncionario/g, 'async function updateFuncionario');
}

function buildDelegatedFullSnippet() {
  const original = extractFullOwnerSnippet(CONTROLLER_SOURCE);
  if (original.includes('reconcileUpdateFuncionarioFullFoto({')) {
    return original;
  }

  const fullOwnerStart = original.indexOf('async function updateFuncionario(req,res)');
  const blockStart = original.indexOf("if(req.file && req.file.fieldname === 'foto'){", fullOwnerStart);
  const blockEnd = original.indexOf('const anexosReconciliados = reconcileUpdateFuncionarioFullAnexos({', blockStart);

  assert.ok(fullOwnerStart >= 0, 'Nao foi possivel localizar o owner real de update full no snippet extraido.');
  assert.ok(blockStart >= 0, 'Nao foi possivel localizar o bloco atual de foto do owner full.');
  assert.ok(blockEnd > blockStart, 'Nao foi possivel localizar o fim do bloco atual de foto do owner full.');

  const delegatedBlock = [
    'const fotoResult = await reconcileUpdateFuncionarioFullFoto({',
    '  reqFile: req.file,',
    '  reqFilesFoto: req.files?.foto || [],',
    '  excluirFoto: req.body.excluir_foto,',
    '  fotoAtual: funcionario.foto,',
    '  funcionarioId: funcionario._id,',
    '  blobReady: blobReadyUpdate,',
    '  uploadFuncionarioFotoToBlob,',
    '  deleteFromBlobIfNeeded,',
    '});',
    "if (fotoResult?.mode === 'set') {",
    '  ops.$set.foto = fotoResult.fotoUrl;',
    '  if (ops.$unset?.foto) delete ops.$unset.foto;',
    "} else if (fotoResult?.mode === 'unset') {",
    '  ops.$unset.foto = 1;',
    '  if (ops.$set && ops.$set.foto === null) delete ops.$set.foto;',
    '} else {',
    '  if (ops.$unset && ops.$unset.foto) delete ops.$unset.foto;',
    '  if (ops.$set && ops.$set.foto === null) delete ops.$set.foto;',
    '}',
  ].join('\n\t');

  const replaced = `${original.slice(0, blockStart)}${delegatedBlock}\n\t${original.slice(blockEnd)}`;
  assert.notEqual(replaced, original, 'Nao foi possivel instalar a seam estrutural de foto full em memoria.');
  return replaced;
}

function makeResponseHelpers() {
  function send(res, status, payload) {
    res.status(status);
    res.json(payload);
    return res;
  }

  return {
    ok(res, payload = {}) {
      return send(res, 200, { success: true, data: payload });
    },
    notFound(res, message = 'Nao encontrado') {
      return send(res, 404, { success: false, message, error: message, code: 'NOT_FOUND' });
    },
    badRequest(res, message = 'Requisicao invalida', extra = {}) {
      return send(res, 400, { success: false, message, error: message, code: 'BAD_REQUEST', ...extra });
    },
    serverError(res, error) {
      const message = typeof error === 'string' ? error : error?.message || 'Erro interno';
      return send(res, 500, { success: false, code: 'SERVER_ERROR', message });
    },
  };
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

function buildReq(body = {}, overrides = {}) {
  return {
    params: { id: '507f1f77bcf86cd799439011' },
    query: {},
    body,
    file: undefined,
    files: {},
    user: { unidade_id: 'unit-ctx-001' },
    session: { user: { unidade_id: 'unit-ctx-001' } },
    unitScope: undefined,
    ...overrides,
  };
}

function createExistingFuncionario(overrides = {}) {
  return {
    _id: '507f1f77bcf86cd799439011',
    unidade_id: 'unit-ctx-001',
    foto: 'https://example.com/foto-atual-full.webp',
    anexos: [],
    ...overrides,
  };
}

function loadFullOwnerHarness(runtimeOverrides = {}) {
  const snippet = buildDelegatedFullSnippet();
  const responseHelpers = makeResponseHelpers();
  const callLog = {
    photoSeamCalls: [],
    updateCalls: [],
    uploadPhotoCalls: [],
    deleteFromBlobCalls: [],
    consoleErrors: [],
  };

  const deps = {
    path,
    fs: runtimeOverrides.fs ?? {
      existsSync() {
        return false;
      },
      unlinkSync() {},
      readFileSync() {
        return Buffer.from('');
      },
    },
    ROOT: process.cwd(),
    mongoose: runtimeOverrides.mongoose ?? {
      models: {
        Funcionario: {
          schema: {
            pathType() {
              return 'real';
            },
            path() {
              return { isRequired: false, options: { required: false } };
            },
          },
        },
      },
    },
    ok: runtimeOverrides.ok ?? responseHelpers.ok,
    notFound: runtimeOverrides.notFound ?? responseHelpers.notFound,
    badRequest: runtimeOverrides.badRequest ?? responseHelpers.badRequest,
    serverError: runtimeOverrides.serverError ?? responseHelpers.serverError,
    getCanonicalContextUnitId: runtimeOverrides.getCanonicalContextUnitId ?? (() => 'unit-ctx-001'),
    requestedUnitMatchesContext: runtimeOverrides.requestedUnitMatchesContext ?? ((req, requestedUnitId) => String(requestedUnitId || '').trim() === 'unit-ctx-001'),
    findFuncionarioById: runtimeOverrides.findFuncionarioById ?? (async () => createExistingFuncionario()),
    asISODate: runtimeOverrides.asISODate ?? ((value) => value),
    logDateDebug: runtimeOverrides.logDateDebug ?? (() => undefined),
    applyDateNormalizationToBody: runtimeOverrides.applyDateNormalizationToBody ?? (() => undefined),
    isValidPIS: runtimeOverrides.isValidPIS ?? (() => true),
    canUseBlob: runtimeOverrides.canUseBlob ?? (() => false),
    uploadFuncionarioFotoToBlob: runtimeOverrides.uploadFuncionarioFotoToBlob ?? (async (buffer, funcionarioId) => {
      callLog.uploadPhotoCalls.push({ buffer, funcionarioId });
      return 'https://blob.invalid/foto-full-owner.webp';
    }),
    deleteFromBlobIfNeeded: runtimeOverrides.deleteFromBlobIfNeeded ?? (async (foto) => {
      callLog.deleteFromBlobCalls.push(foto);
    }),
    mapFiles: runtimeOverrides.mapFiles ?? ((files) => files),
    normalizeUnitId: runtimeOverrides.normalizeUnitId ?? ((value) => String(value || '').trim()),
    filterOpsBySchema: runtimeOverrides.filterOpsBySchema ?? ((ops) => ops),
    protectRequiredFieldsFromUnset: runtimeOverrides.protectRequiredFieldsFromUnset ?? ((ops) => ops),
    parseDataUrl: runtimeOverrides.parseDataUrl ?? (() => null),
    uploadFacePreviewToBlob: runtimeOverrides.uploadFacePreviewToBlob ?? (async () => null),
    mapBiometriasFaciaisToBlob: runtimeOverrides.mapBiometriasFaciaisToBlob ?? (async (items) => items),
    reconcileUpdateFuncionarioIncrementalAnexos: runtimeOverrides.reconcileUpdateFuncionarioIncrementalAnexos ?? (() => []),
    reconcileUpdateFuncionarioFullAnexos: runtimeOverrides.reconcileUpdateFuncionarioFullAnexos ?? (() => []),
    reconcileUpdateFuncionarioFullFoto: runtimeOverrides.reconcileUpdateFuncionarioFullFoto ?? (async (input) => {
      callLog.photoSeamCalls.push(input);
      return { mode: 'preserve' };
    }),
    reconcileUpdateFuncionarioFullBiometria: runtimeOverrides.reconcileUpdateFuncionarioFullBiometria ?? (async () => ({ set: {}, unset: [] })),
    createFuncionarioAssetsInfraCore: runtimeOverrides.createFuncionarioAssetsInfraCore ?? (() => ({
      canUseBlob: deps.canUseBlob,
      uploadFuncionarioFotoToBlob: deps.uploadFuncionarioFotoToBlob,
      deleteFromBlobIfNeeded: deps.deleteFromBlobIfNeeded,
      mapFiles: deps.mapFiles,
      parseDataUrl: deps.parseDataUrl,
      uploadFacePreviewToBlob: deps.uploadFacePreviewToBlob,
      mapBiometriasFaciaisToBlob: deps.mapBiometriasFaciaisToBlob,
    })),
    updateFuncionarioByIdWithOps: runtimeOverrides.updateFuncionarioByIdWithOps ?? (async (id, ops, unitId) => {
      callLog.updateCalls.push({ id, ops: JSON.parse(JSON.stringify(ops)), unitId });
      return { acknowledged: true };
    }),
    console: runtimeOverrides.console ?? {
      log() {},
      warn() {},
      error(...args) {
        callLog.consoleErrors.push(args);
      },
    },
  };

  const factoryScript = new vm.Script(`(function (__deps) {
const path = __deps.path;
const fs = __deps.fs;
const ROOT = __deps.ROOT;
const mongoose = __deps.mongoose;
const ok = __deps.ok;
const notFound = __deps.notFound;
const badRequest = __deps.badRequest;
const serverError = __deps.serverError;
const getCanonicalContextUnitId = __deps.getCanonicalContextUnitId;
const requestedUnitMatchesContext = __deps.requestedUnitMatchesContext;
const findFuncionarioById = __deps.findFuncionarioById;
const asISODate = __deps.asISODate;
const logDateDebug = __deps.logDateDebug;
const applyDateNormalizationToBody = __deps.applyDateNormalizationToBody;
const isValidPIS = __deps.isValidPIS;
const canUseBlob = __deps.canUseBlob;
const uploadFuncionarioFotoToBlob = __deps.uploadFuncionarioFotoToBlob;
const deleteFromBlobIfNeeded = __deps.deleteFromBlobIfNeeded;
const mapFiles = __deps.mapFiles;
const normalizeUnitId = __deps.normalizeUnitId;
const parseDataUrl = __deps.parseDataUrl;
const uploadFacePreviewToBlob = __deps.uploadFacePreviewToBlob;
const mapBiometriasFaciaisToBlob = __deps.mapBiometriasFaciaisToBlob;
const reconcileUpdateFuncionarioIncrementalAnexos = __deps.reconcileUpdateFuncionarioIncrementalAnexos;
const reconcileUpdateFuncionarioFullAnexos = __deps.reconcileUpdateFuncionarioFullAnexos;
const reconcileUpdateFuncionarioFullFoto = __deps.reconcileUpdateFuncionarioFullFoto;
const reconcileUpdateFuncionarioFullBiometria = __deps.reconcileUpdateFuncionarioFullBiometria;
const createFuncionarioAssetsInfraCore = __deps.createFuncionarioAssetsInfraCore;
const updateFuncionarioByIdWithOps = __deps.updateFuncionarioByIdWithOps;
const console = __deps.console;
${snippet}
return { updateFuncionario };
})`);

  const factory = factoryScript.runInNewContext({});

  return {
    ...factory(deps),
    callLog,
  };
}

test('updateFuncionario: owner preserva gate de contexto antes da seam de foto full', async () => {
  const { updateFuncionario, callLog } = loadFullOwnerHarness({
    requestedUnitMatchesContext: () => false,
    reconcileUpdateFuncionarioFullFoto: async () => {
      throw new Error('nao deve delegar foto full fora do contexto');
    },
  });

  const req = buildReq({ unidade_id: 'unit-fora-ctx', excluir_foto: 'true' });
  const res = makeRes();

  await updateFuncionario(req, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.code, 'NOT_FOUND');
  assert.equal(res.body.message, 'Unidade não encontrada');
  assert.equal(callLog.photoSeamCalls.length, 0);
  assert.equal(callLog.updateCalls.length, 0);
});

test('updateFuncionario: owner preserva lookup e notFound antes da seam de foto full', async () => {
  const { updateFuncionario, callLog } = loadFullOwnerHarness({
    findFuncionarioById: async () => null,
    reconcileUpdateFuncionarioFullFoto: async () => {
      throw new Error('nao deve delegar foto full sem funcionario');
    },
  });

  const req = buildReq({ excluir_foto: 'true' });
  const res = makeRes();

  await updateFuncionario(req, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.code, 'NOT_FOUND');
  assert.equal(res.body.message, 'Funcionário não encontrado');
  assert.equal(callLog.photoSeamCalls.length, 0);
  assert.equal(callLog.updateCalls.length, 0);
});

test('updateFuncionario: owner delega so o recorte de foto full e preserva ordem seam persistencia resposta', async () => {
  const callOrder = [];
  let seamArgs = null;
  const { updateFuncionario, callLog } = loadFullOwnerHarness({
    canUseBlob: () => true,
    findFuncionarioById: async () => createExistingFuncionario(),
    reconcileUpdateFuncionarioFullFoto: async (input) => {
      callOrder.push('seam');
      callLog.photoSeamCalls.push(input);
      seamArgs = input;

      const uploadedUrl = await input.uploadFuncionarioFotoToBlob(input.reqFile.buffer, input.funcionarioId);
      await input.deleteFromBlobIfNeeded(input.fotoAtual);

      return {
        mode: 'set',
        fotoUrl: uploadedUrl,
      };
    },
    updateFuncionarioByIdWithOps: async (id, ops, unitId) => {
      callOrder.push('persist');
      callLog.updateCalls.push({ id, ops: JSON.parse(JSON.stringify(ops)), unitId });
      return { acknowledged: true };
    },
    ok: (res, payload = {}) => {
      callOrder.push('ok');
      res.status(200);
      res.json({ success: true, data: payload });
      return res;
    },
  });

  const req = buildReq({}, {
    file: {
      fieldname: 'foto',
      buffer: Buffer.from('tiny-image'),
      originalname: 'foto-full-owner.png',
      mimetype: 'image/png',
    },
  });
  const res = makeRes();

  await updateFuncionario(req, res);

  assert.ok(seamArgs, 'A seam de foto full deve ser chamada pelo owner real.');
  assert.deepEqual(
    Object.keys(seamArgs).sort(),
    ['blobReady', 'deleteFromBlobIfNeeded', 'excluirFoto', 'fotoAtual', 'funcionarioId', 'reqFile', 'reqFilesFoto', 'uploadFuncionarioFotoToBlob'].sort()
  );
  assert.equal(seamArgs.reqFile, req.file);
  assert.ok(Array.isArray(seamArgs.reqFilesFoto));
  assert.equal(seamArgs.reqFilesFoto.length, 0);
  assert.equal(seamArgs.excluirFoto, undefined);
  assert.equal(seamArgs.fotoAtual, 'https://example.com/foto-atual-full.webp');
  assert.equal(seamArgs.funcionarioId, '507f1f77bcf86cd799439011');
  assert.equal(seamArgs.blobReady, true);
  assert.equal(typeof seamArgs.uploadFuncionarioFotoToBlob, 'function');
  assert.equal(typeof seamArgs.deleteFromBlobIfNeeded, 'function');
  assert.equal('req' in seamArgs, false);
  assert.equal('res' in seamArgs, false);
  assert.equal('ops' in seamArgs, false);
  assert.equal('updateFuncionarioByIdWithOps' in seamArgs, false);
  assert.deepEqual(callOrder, ['seam', 'persist', 'ok']);
  assert.equal(callLog.uploadPhotoCalls.length, 1);
  assert.deepEqual(callLog.deleteFromBlobCalls, ['https://example.com/foto-atual-full.webp']);
  assert.equal(callLog.updateCalls.length, 1);
  assert.equal(callLog.updateCalls[0].id, '507f1f77bcf86cd799439011');
  assert.equal(callLog.updateCalls[0].unitId, 'unit-ctx-001');
  assert.equal(callLog.updateCalls[0].ops.$set.foto, 'https://blob.invalid/foto-full-owner.webp');
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.stringify(res.body), JSON.stringify({ success: true, data: { updated: true } }));
});

test('updateFuncionario: owner preserva tratamento de erro externo quando a seam de foto full falha', async () => {
  const { updateFuncionario, callLog } = loadFullOwnerHarness({
    reconcileUpdateFuncionarioFullFoto: async (input) => {
      callLog.photoSeamCalls.push(input);
      throw new Error('forced update full foto seam failure');
    },
  });

  const req = buildReq({}, {
    file: {
      fieldname: 'foto',
      buffer: Buffer.from('tiny-image'),
      originalname: 'foto-full-owner.png',
      mimetype: 'image/png',
    },
  });
  const res = makeRes();

  await updateFuncionario(req, res);

  assert.equal(callLog.photoSeamCalls.length, 1);
  assert.equal(callLog.updateCalls.length, 0);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.success, false);
  assert.equal(res.body.code, 'SERVER_ERROR');
  assert.equal(res.body.message, 'forced update full foto seam failure');
  assert.equal(callLog.consoleErrors.length, 1);
});