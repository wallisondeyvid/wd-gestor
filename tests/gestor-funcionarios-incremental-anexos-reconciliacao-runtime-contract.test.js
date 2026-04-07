import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const controllerPath = path.resolve(__dirname, '../src/modules/gestor/app/controllers/funcionarioApiController.js');

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
    notFound(res, message = 'Não encontrado') {
      return send(res, 404, { success: false, message, error: message, code: 'NOT_FOUND' });
    },
    badRequest(res, message = 'Requisição inválida', extra = {}) {
      return send(res, 400, { success: false, message, error: message, code: 'BAD_REQUEST', ...extra });
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
    foto: '',
    anexos: [
      {
        nome: 'holerite-antigo.pdf',
        mime: 'application/pdf',
        tamanho: 1200,
        caminho: 'uploads/holerite-antigo.pdf',
        data_upload: '2026-03-24T00:00:00.000Z',
      },
      {
        nome: 'contrato-antigo.pdf',
        mime: 'application/pdf',
        tamanho: 2400,
        caminho: 'uploads/contrato-antigo.pdf',
        data_upload: '2026-03-24T00:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

function loadIncrementalHarness(runtimeOverrides = {}) {
  const source = fs.readFileSync(controllerPath, 'utf8');
  const start = source.indexOf('const bracketToDot =');
  const end = source.indexOf('export async function updateFuncionario(req,res){', start);

  if (start < 0 || end < 0) {
    throw new Error('Não foi possível localizar o recorte do owner incremental no controller.');
  }

  const snippet = source
    .slice(start, end)
    .replace(/export\s+async\s+function\s+updateFuncionarioIncremental/g, 'async function updateFuncionarioIncremental');

  const responseHelpers = makeResponseHelpers();
  const callLog = {
    mapFilesCalls: [],
    updateCalls: [],
    deleteFromBlobCalls: [],
  };

  const deps = {
    path,
    fs,
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
    ...responseHelpers,
    getCanonicalContextUnitId: runtimeOverrides.getCanonicalContextUnitId ?? (() => 'unit-ctx-001'),
    requestedUnitMatchesContext: runtimeOverrides.requestedUnitMatchesContext ?? ((req, requestedUnitId) => String(requestedUnitId || '').trim() === 'unit-ctx-001'),
    findFuncionarioById: runtimeOverrides.findFuncionarioById ?? (async () => createExistingFuncionario()),
    asISODate: runtimeOverrides.asISODate ?? ((value) => value),
    logDateDebug: runtimeOverrides.logDateDebug ?? (() => undefined),
    applyDateNormalizationToBody: runtimeOverrides.applyDateNormalizationToBody ?? (() => undefined),
    isValidPIS: runtimeOverrides.isValidPIS ?? (() => true),
    canUseBlob: runtimeOverrides.canUseBlob ?? (() => false),
    uploadFuncionarioFotoToBlob: runtimeOverrides.uploadFuncionarioFotoToBlob ?? (async () => 'https://blob.invalid/foto.webp'),
    deleteFromBlobIfNeeded: runtimeOverrides.deleteFromBlobIfNeeded ?? (async (foto) => {
      callLog.deleteFromBlobCalls.push(foto);
    }),
    mapFiles: runtimeOverrides.mapFiles ?? ((files) => {
      callLog.mapFilesCalls.push(files);
      return files.map((file, index) => ({
        nome: file.originalname || file.name || `arquivo-${index}.pdf`,
        mime: file.mimetype || file.type || 'application/octet-stream',
        tamanho: file.size || file.tamanho || 0,
        caminho: `uploads/${file.originalname || file.name || `arquivo-${index}.pdf`}`,
        data_upload: '2026-03-24T12:00:00.000Z',
      }));
    }),
    normalizeUnitId: runtimeOverrides.normalizeUnitId ?? ((value) => String(value || '').trim()),
    filterOpsBySchema: runtimeOverrides.filterOpsBySchema ?? ((ops) => ops),
    protectRequiredFieldsFromUnset: runtimeOverrides.protectRequiredFieldsFromUnset ?? ((ops) => ops),
    parseDataUrl: runtimeOverrides.parseDataUrl ?? (() => null),
    uploadFacePreviewToBlob: runtimeOverrides.uploadFacePreviewToBlob ?? (async () => null),
    mapBiometriasFaciaisToBlob: runtimeOverrides.mapBiometriasFaciaisToBlob ?? (async (items) => items),
    reconcileUpdateFuncionarioIncrementalAnexos: runtimeOverrides.reconcileUpdateFuncionarioIncrementalAnexos ?? ((input) => {
      let anexosBase = Array.isArray(input.funcionarioAtual?.anexos) ? input.funcionarioAtual.anexos : [];
      if (typeof input.anexosExistentes === 'string' && input.anexosExistentes.trim()) {
        try {
          const parsed = JSON.parse(input.anexosExistentes);
          anexosBase = Array.isArray(parsed) ? parsed : [];
        } catch {
          anexosBase = [];
        }
      }
      if (typeof input.anexosExcluidos === 'string' && input.anexosExcluidos.trim()) {
        try {
          const parsed = JSON.parse(input.anexosExcluidos);
          const caminhosExcluidos = new Set((Array.isArray(parsed) ? parsed : []).map((item) => item?.caminho).filter(Boolean));
          anexosBase = anexosBase.filter((item) => !caminhosExcluidos.has(item?.caminho));
        } catch {
          anexosBase = anexosBase.slice();
        }
      }
      const uploads = Array.isArray(input.novosUploads) ? input.novosUploads : [];
      if (!uploads.length) return anexosBase.slice();
      return anexosBase.concat(input.mapFiles(uploads));
    }),
    updateFuncionarioByIdWithOps: runtimeOverrides.updateFuncionarioByIdWithOps ?? (async (id, ops, unitId) => {
      callLog.updateCalls.push({ id, ops: JSON.parse(JSON.stringify(ops)), unitId });
      return { acknowledged: true };
    }),
    createFuncionarioAssetsInfraCore: runtimeOverrides.createFuncionarioAssetsInfraCore ?? (() => ({
      canUseBlob: deps.canUseBlob,
      uploadFuncionarioFotoToBlob: deps.uploadFuncionarioFotoToBlob,
      deleteFromBlobIfNeeded: deps.deleteFromBlobIfNeeded,
      mapFiles: deps.mapFiles,
      parseDataUrl: deps.parseDataUrl,
      uploadFacePreviewToBlob: deps.uploadFacePreviewToBlob,
      mapBiometriasFaciaisToBlob: deps.mapBiometriasFaciaisToBlob,
    })),
  };

  const factory = new Function(
    '__deps',
    `
const path = __deps.path;
const fs = __deps.fs;
const ROOT = __deps.ROOT;
const mongoose = __deps.mongoose;
const ok = __deps.ok;
const notFound = __deps.notFound;
const badRequest = __deps.badRequest;
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
const updateFuncionarioByIdWithOps = __deps.updateFuncionarioByIdWithOps;
const createFuncionarioAssetsInfraCore = __deps.createFuncionarioAssetsInfraCore;
${snippet}
return { buildUpdateOpsFromBody, updateFuncionarioIncremental };
`
  );

  return {
    ...factory(deps),
    callLog,
  };
}

test('updateFuncionarioIncremental: fora do escopo contextual retorna 404', async () => {
  const { updateFuncionarioIncremental, callLog } = loadIncrementalHarness();
  const req = buildReq(
    { unidade_id: 'unit-fora-ctx', anexos_existentes: '[]' },
    { user: { unidade_id: 'unit-ctx-001' }, session: { user: { unidade_id: 'unit-ctx-001' } } }
  );
  const res = makeRes();

  await updateFuncionarioIncremental(req, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.code, 'NOT_FOUND');
  assert.equal(res.body.message, 'Unidade não encontrada');
  assert.equal(callLog.updateCalls.length, 0);
});

test('updateFuncionarioIncremental: funcionário inexistente retorna 404', async () => {
  const { updateFuncionarioIncremental, callLog } = loadIncrementalHarness({
    findFuncionarioById: async () => null,
  });
  const req = buildReq({ anexos_existentes: '[]' });
  const res = makeRes();

  await updateFuncionarioIncremental(req, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.code, 'NOT_FOUND');
  assert.equal(res.body.message, 'Funcionário não encontrado');
  assert.equal(callLog.updateCalls.length, 0);
});

test('updateFuncionarioIncremental: envio apenas de anexos_existentes aplica a lista reconciliada do body', async () => {
  const funcionario = createExistingFuncionario();
  const { updateFuncionarioIncremental, callLog } = loadIncrementalHarness({
    findFuncionarioById: async () => funcionario,
  });
  const req = buildReq({
    anexos_existentes: JSON.stringify([
      { nome: 'somente-body.pdf', mime: 'application/pdf', tamanho: 777, caminho: 'uploads/somente-body.pdf' },
    ]),
  });
  const res = makeRes();

  await updateFuncionarioIncremental(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.deepEqual(res.body.data, { updated: true });
  assert.equal(callLog.updateCalls.length, 1);
  assert.deepEqual(callLog.updateCalls[0].ops, {
    $set: {
      anexos: [
        { nome: 'somente-body.pdf', mime: 'application/pdf', tamanho: 777, caminho: 'uploads/somente-body.pdf' },
      ],
    },
    $unset: {},
  });
});

test('updateFuncionarioIncremental: envio apenas de anexos_excluidos remove do estado atual', async () => {
  const funcionario = createExistingFuncionario();
  const { updateFuncionarioIncremental, callLog } = loadIncrementalHarness({
    findFuncionarioById: async () => funcionario,
  });
  const req = buildReq({
    anexos_excluidos: JSON.stringify([
      { nome: 'contrato-antigo.pdf', caminho: 'uploads/contrato-antigo.pdf' },
    ]),
  });
  const res = makeRes();

  await updateFuncionarioIncremental(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.deepEqual(res.body.data, { updated: true });
  assert.equal(callLog.updateCalls.length, 1);
  assert.deepEqual(callLog.updateCalls[0].ops, {
    $set: {
      anexos: [
        {
          nome: 'holerite-antigo.pdf',
          mime: 'application/pdf',
          tamanho: 1200,
          caminho: 'uploads/holerite-antigo.pdf',
          data_upload: '2026-03-24T00:00:00.000Z',
        },
      ],
    },
    $unset: {},
  });
});

test('updateFuncionarioIncremental: envio combinado de anexos_existentes e anexos_excluidos reconcilia o body', async () => {
  const funcionario = createExistingFuncionario();
  const { updateFuncionarioIncremental, callLog } = loadIncrementalHarness({
    findFuncionarioById: async () => funcionario,
  });
  const req = buildReq({
    anexos_existentes: JSON.stringify([
      { nome: 'apenas-no-body.pdf', mime: 'application/pdf', tamanho: 321, caminho: 'uploads/apenas-no-body.pdf' },
    ]),
    anexos_excluidos: JSON.stringify([
      { nome: 'holerite-antigo.pdf', caminho: 'uploads/holerite-antigo.pdf' },
    ]),
  });
  const res = makeRes();

  await updateFuncionarioIncremental(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.deepEqual(res.body.data, { updated: true });
  assert.equal(callLog.updateCalls.length, 1);
  assert.deepEqual(callLog.updateCalls[0].ops, {
    $set: {
      anexos: [
        {
          nome: 'apenas-no-body.pdf',
          mime: 'application/pdf',
          tamanho: 321,
          caminho: 'uploads/apenas-no-body.pdf',
        },
      ],
    },
    $unset: {},
  });
});

test('updateFuncionarioIncremental: combinado com upload novo reconcilia body e incorpora novos uploads', async () => {
  const funcionario = createExistingFuncionario();
  const novoUpload = {
    originalname: 'novo-anexo.pdf',
    mimetype: 'application/pdf',
    size: 999,
  };
  const { updateFuncionarioIncremental, callLog } = loadIncrementalHarness({
    findFuncionarioById: async () => funcionario,
  });
  const req = buildReq(
    {
      anexos_existentes: JSON.stringify([
        { nome: 'body-existente.pdf', mime: 'application/pdf', tamanho: 888, caminho: 'uploads/body-existente.pdf' },
      ]),
      anexos_excluidos: JSON.stringify([
        { nome: 'contrato-antigo.pdf', caminho: 'uploads/contrato-antigo.pdf' },
      ]),
    },
    {
      files: { anexos: [novoUpload] },
    }
  );
  const res = makeRes();

  await updateFuncionarioIncremental(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.deepEqual(res.body.data, { updated: true });
  assert.equal(callLog.updateCalls.length, 1);
  assert.deepEqual(callLog.updateCalls[0].ops, {
    $set: {
      anexos: [
        {
          nome: 'body-existente.pdf',
          mime: 'application/pdf',
          tamanho: 888,
          caminho: 'uploads/body-existente.pdf',
        },
        {
          nome: 'novo-anexo.pdf',
          mime: 'application/pdf',
          tamanho: 999,
          caminho: 'uploads/novo-anexo.pdf',
          data_upload: '2026-03-24T12:00:00.000Z',
        },
      ],
    },
    $unset: {},
  });
});

test('updateFuncionarioIncremental: erro interno induzido no update retorna 500', async () => {
  const { updateFuncionarioIncremental, callLog } = loadIncrementalHarness({
    updateFuncionarioByIdWithOps: async (id, ops, unitId) => {
      callLog.updateCalls.push({ id, ops: JSON.parse(JSON.stringify(ops)), unitId });
      throw new Error('forced incremental anexos reconciliation failure');
    },
  });
  const req = buildReq({ anexos_existentes: JSON.stringify([{ nome: 'body-only.pdf', caminho: 'uploads/body-only.pdf' }]) });
  const res = makeRes();

  await updateFuncionarioIncremental(req, res);

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.success, false);
  assert.equal(res.body.code, 'SERVER_ERROR');
  assert.equal(res.body.message, 'Falha ao atualizar funcionário');
  assert.equal(callLog.updateCalls.length, 1);
});