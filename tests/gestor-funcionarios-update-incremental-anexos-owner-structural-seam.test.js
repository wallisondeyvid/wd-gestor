import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/funcionarioApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

function extractIncrementalOwnerSnippet(source) {
  const start = source.indexOf('const bracketToDot =');
  const end = source.indexOf('export async function updateFuncionario(req,res){', start);

  assert.ok(start >= 0, 'Nao foi possivel localizar o inicio do recorte incremental.');
  assert.ok(end > start, 'Nao foi possivel localizar o fim do recorte incremental.');

  return source
    .slice(start, end)
    .replace(/export\s+async\s+function\s+updateFuncionarioIncremental/g, 'async function updateFuncionarioIncremental');
}

function buildDelegatedIncrementalSnippet() {
  const original = extractIncrementalOwnerSnippet(CONTROLLER_SOURCE);
  if (original.includes('reconcileUpdateFuncionarioIncrementalAnexos({')) {
    return original;
  }

  const currentBlock = "if(req.files?.anexos?.length){ const novos=mapFiles(req.files.anexos); console.log('[UPLOAD][incremental] novos anexos normalizados:', novos.length); const existentes=ops.$set.anexos || funcionario.anexos || []; ops.$set.anexos = existentes.concat(novos); console.log('[UPLOAD][incremental] anexos total após concat:', ops.$set.anexos.length); }";
  const blockStart = original.indexOf(currentBlock);

  assert.ok(blockStart >= 0, 'Nao foi possivel localizar o bloco atual de anexos do owner incremental.');

  const delegatedBlock = [
    'const hasAnexosMutation = req.body.anexos_existentes !== undefined || req.body.anexos_excluidos !== undefined || !!req.files?.anexos?.length;',
    'if(hasAnexosMutation){',
    'const anexosReconciliados = reconcileUpdateFuncionarioIncrementalAnexos({',
    '  funcionarioAtual: funcionario,',
    '  anexosExistentes: req.body.anexos_existentes,',
    '  anexosExcluidos: req.body.anexos_excluidos,',
    '  novosUploads: req.files?.anexos || [],',
    '  mapFiles,',
    '});',
    'if (anexosReconciliados.length > 0) ops.$set.anexos = anexosReconciliados;',
    'else ops.$unset.anexos = 1;',
    '}',
  ].join('\n');

  const replaced = `${original.slice(0, blockStart)}${delegatedBlock}${original.slice(blockStart + currentBlock.length)}`;
  assert.notEqual(replaced, original, 'Nao foi possivel instalar a seam estrutural de anexos em memoria.');
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

function loadIncrementalOwnerHarness(runtimeOverrides = {}) {
  const snippet = buildDelegatedIncrementalSnippet();
  const responseHelpers = makeResponseHelpers();
  const callLog = {
    seamCalls: [],
    updateCalls: [],
    deleteFromBlobCalls: [],
    mapFilesCalls: [],
    consoleErrors: [],
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
    ok: runtimeOverrides.ok ?? responseHelpers.ok,
    notFound: runtimeOverrides.notFound ?? responseHelpers.notFound,
    badRequest: runtimeOverrides.badRequest ?? responseHelpers.badRequest,
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
    updateFuncionarioByIdWithOps: runtimeOverrides.updateFuncionarioByIdWithOps ?? (async (id, ops, unitId) => {
      callLog.updateCalls.push({ id, ops: JSON.parse(JSON.stringify(ops)), unitId });
      return { acknowledged: true };
    }),
    reconcileUpdateFuncionarioIncrementalAnexos: runtimeOverrides.reconcileUpdateFuncionarioIncrementalAnexos ?? (async (input) => {
      callLog.seamCalls.push(input);
      return Array.isArray(input.funcionarioAtual?.anexos) ? input.funcionarioAtual.anexos.slice() : [];
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
const updateFuncionarioByIdWithOps = __deps.updateFuncionarioByIdWithOps;
const reconcileUpdateFuncionarioIncrementalAnexos = __deps.reconcileUpdateFuncionarioIncrementalAnexos;
const console = __deps.console;
${snippet}
return { updateFuncionarioIncremental };
})`);

  const factory = factoryScript.runInNewContext({});

  return {
    ...factory(deps),
    callLog,
  };
}

test('updateFuncionarioIncremental: owner preserva gate de contexto antes da seam de anexos', async () => {
  const { updateFuncionarioIncremental, callLog } = loadIncrementalOwnerHarness({
    requestedUnitMatchesContext: () => false,
    reconcileUpdateFuncionarioIncrementalAnexos: async () => {
      throw new Error('nao deve delegar anexos fora do contexto');
    },
  });

  const req = buildReq({
    unidade_id: 'unit-fora-ctx',
    anexos_existentes: '[]',
    anexos_excluidos: '[]',
  });
  const res = makeRes();

  await updateFuncionarioIncremental(req, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.code, 'NOT_FOUND');
  assert.equal(res.body.message, 'Unidade não encontrada');
  assert.equal(callLog.seamCalls.length, 0);
  assert.equal(callLog.updateCalls.length, 0);
});

test('updateFuncionarioIncremental: owner preserva lookup e notFound antes da seam de anexos', async () => {
  const { updateFuncionarioIncremental, callLog } = loadIncrementalOwnerHarness({
    findFuncionarioById: async () => null,
    reconcileUpdateFuncionarioIncrementalAnexos: async () => {
      throw new Error('nao deve delegar anexos sem funcionario');
    },
  });

  const req = buildReq({ anexos_existentes: '[]', anexos_excluidos: '[]' });
  const res = makeRes();

  await updateFuncionarioIncremental(req, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.code, 'NOT_FOUND');
  assert.equal(res.body.message, 'Funcionário não encontrado');
  assert.equal(callLog.seamCalls.length, 0);
  assert.equal(callLog.updateCalls.length, 0);
});

test('updateFuncionarioIncremental: owner delega so o recorte de anexos e preserva ordem seam persistencia resposta', async () => {
  const funcionario = createExistingFuncionario();
  const novoUpload = {
    originalname: 'novo-anexo.pdf',
    mimetype: 'application/pdf',
    size: 999,
  };
  const callOrder = [];
  let seamArgs = null;

  const { updateFuncionarioIncremental, callLog } = loadIncrementalOwnerHarness({
    findFuncionarioById: async () => funcionario,
    reconcileUpdateFuncionarioIncrementalAnexos: (input) => {
      callOrder.push('seam');
      callLog.seamCalls.push(input);
      seamArgs = input;

      const bodyExistentes = JSON.parse(input.anexosExistentes);
      const bodyExcluidos = JSON.parse(input.anexosExcluidos);
      const caminhosExcluidos = new Set(bodyExcluidos.map((item) => item.caminho));
      const reconciliados = bodyExistentes
        .filter((item) => !caminhosExcluidos.has(item.caminho))
        .concat(input.mapFiles(input.novosUploads));

      return reconciliados;
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

  const req = buildReq(
    {
      anexos_existentes: JSON.stringify([
        {
          nome: 'body-permanece.pdf',
          mime: 'application/pdf',
          tamanho: 333,
          caminho: 'uploads/body-permanece.pdf',
        },
        {
          nome: 'contrato-antigo.pdf',
          mime: 'application/pdf',
          tamanho: 2400,
          caminho: 'uploads/contrato-antigo.pdf',
        },
      ]),
      anexos_excluidos: JSON.stringify([
        {
          nome: 'contrato-antigo.pdf',
          caminho: 'uploads/contrato-antigo.pdf',
        },
      ]),
    },
    {
      files: { anexos: [novoUpload] },
    }
  );
  const res = makeRes();

  await updateFuncionarioIncremental(req, res);

  assert.ok(seamArgs, 'A seam de anexos deve ser chamada pelo owner incremental.');
  assert.deepEqual(
    Object.keys(seamArgs).sort(),
    ['anexosExcluidos', 'anexosExistentes', 'funcionarioAtual', 'mapFiles', 'novosUploads'].sort()
  );
  assert.equal(seamArgs.funcionarioAtual, funcionario);
  assert.equal(seamArgs.anexosExistentes, req.body.anexos_existentes);
  assert.equal(seamArgs.anexosExcluidos, req.body.anexos_excluidos);
  assert.equal(seamArgs.novosUploads, req.files.anexos);
  assert.equal(typeof seamArgs.mapFiles, 'function');
  assert.equal('req' in seamArgs, false);
  assert.equal('res' in seamArgs, false);
  assert.equal('ops' in seamArgs, false);
  assert.equal('updateFuncionarioByIdWithOps' in seamArgs, false);
  assert.equal(callLog.updateCalls.length, 1);
  assert.deepEqual(callOrder, ['seam', 'persist', 'ok']);
  assert.deepEqual(callLog.updateCalls[0], {
    id: '507f1f77bcf86cd799439011',
    ops: {
      $set: {
        anexos: [
          {
            nome: 'body-permanece.pdf',
            mime: 'application/pdf',
            tamanho: 333,
            caminho: 'uploads/body-permanece.pdf',
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
    },
    unitId: 'unit-ctx-001',
  });
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.stringify(res.body), JSON.stringify({ success: true, data: { updated: true } }));
});

test('updateFuncionarioIncremental: owner preserva tratamento de erro externo quando a seam de anexos falha', async () => {
  const { updateFuncionarioIncremental, callLog } = loadIncrementalOwnerHarness({
    reconcileUpdateFuncionarioIncrementalAnexos: (input) => {
      callLog.seamCalls.push(input);
      throw new Error('forced incremental anexos seam failure');
    },
  });

  const req = buildReq({
    anexos_existentes: JSON.stringify([{ nome: 'body-only.pdf', caminho: 'uploads/body-only.pdf' }]),
    anexos_excluidos: '[]',
  });
  const res = makeRes();

  await updateFuncionarioIncremental(req, res);

  assert.equal(callLog.seamCalls.length, 1);
  assert.equal(callLog.updateCalls.length, 0);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.success, false);
  assert.equal(res.body.code, 'SERVER_ERROR');
  assert.equal(res.body.message, 'forced incremental anexos seam failure');
  assert.equal(callLog.consoleErrors.length, 1);
});