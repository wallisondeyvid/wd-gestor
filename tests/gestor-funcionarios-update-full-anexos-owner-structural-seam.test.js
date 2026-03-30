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
  if (original.includes('reconcileUpdateFuncionarioFullAnexos({')) {
    return original;
  }

  const currentBlock = [
    "let anexosFinal=[]; if(req.body.anexos_existentes && typeof req.body.anexos_existentes === 'string'){ try { anexosFinal=JSON.parse(req.body.anexos_existentes); } catch{} }",
    "if(req.body.anexos_excluidos && typeof req.body.anexos_excluidos === 'string'){ try { const excluidos=JSON.parse(req.body.anexos_excluidos); const caminhos=new Set(excluidos.map(a=>a.caminho)); anexosFinal = anexosFinal.filter(e=>!caminhos.has(e.caminho)); for(const ex of excluidos){ if(ex.caminho){ const abs=path.join(ROOT, '.', ex.caminho.replace(/^public\\//,'')); try { if(fs.existsSync(abs)) fs.unlinkSync(abs); } catch{} } } } catch{} }",
    "if(req.files?.anexos?.length){ const novos=mapFiles(req.files.anexos); console.log('[UPLOAD][update-full] novos anexos normalizados:', novos.length); anexosFinal = anexosFinal.concat(novos); }",
    "if(anexosFinal.length>0) ops.$set.anexos = anexosFinal; else ops.$unset.anexos=1;",
  ].join('\n\t');
  const blockStart = original.indexOf(currentBlock);

  assert.ok(blockStart >= 0, 'Nao foi possivel localizar o bloco atual de anexos do owner full.');

  const delegatedBlock = [
    'const anexosReconciliados = reconcileUpdateFuncionarioFullAnexos({',
    '  anexosExistentes: req.body.anexos_existentes,',
    '  anexosExcluidos: req.body.anexos_excluidos,',
    '  novosUploads: req.files?.anexos || [],',
    '  mapFiles,',
    '  fs,',
    '  path,',
    '  rootDir: ROOT,',
    '});',
    'if (anexosReconciliados.length > 0) ops.$set.anexos = anexosReconciliados;',
    'else ops.$unset.anexos = 1;',
  ].join('\n\t');

  const replaced = `${original.slice(0, blockStart)}${delegatedBlock}${original.slice(blockStart + currentBlock.length)}`;
  assert.notEqual(replaced, original, 'Nao foi possivel instalar a seam estrutural de anexos full em memoria.');
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

function loadFullOwnerHarness(runtimeOverrides = {}) {
  const snippet = buildDelegatedFullSnippet();
  const responseHelpers = makeResponseHelpers();
  const callLog = {
    seamCalls: [],
    updateCalls: [],
    mapFilesCalls: [],
    deleteFromBlobCalls: [],
    consoleErrors: [],
    deletedPaths: [],
  };

  const fsStub = runtimeOverrides.fs ?? {
    existsSync(targetPath) {
      callLog.deletedPaths.push({ checked: targetPath });
      return true;
    },
    unlinkSync(targetPath) {
      callLog.deletedPaths.push({ deleted: targetPath });
    },
  };

  const deps = {
    path,
    fs: fsStub,
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
    reconcileUpdateFuncionarioIncrementalAnexos: runtimeOverrides.reconcileUpdateFuncionarioIncrementalAnexos ?? (() => []),
    reconcileUpdateFuncionarioFullAnexos: runtimeOverrides.reconcileUpdateFuncionarioFullAnexos ?? ((input) => {
      callLog.seamCalls.push(input);
      return [];
    }),
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

test('updateFuncionario: owner preserva gate de contexto antes da seam de anexos full', async () => {
  const { updateFuncionario, callLog } = loadFullOwnerHarness({
    requestedUnitMatchesContext: () => false,
    reconcileUpdateFuncionarioFullAnexos: () => {
      throw new Error('nao deve delegar anexos full fora do contexto');
    },
  });

  const req = buildReq({
    unidade_id: 'unit-fora-ctx',
    anexos_existentes: '[]',
    anexos_excluidos: '[]',
  });
  const res = makeRes();

  await updateFuncionario(req, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.code, 'NOT_FOUND');
  assert.equal(res.body.message, 'Unidade não encontrada');
  assert.equal(callLog.seamCalls.length, 0);
  assert.equal(callLog.updateCalls.length, 0);
});

test('updateFuncionario: owner preserva lookup e notFound antes da seam de anexos full', async () => {
  const { updateFuncionario, callLog } = loadFullOwnerHarness({
    findFuncionarioById: async () => null,
    reconcileUpdateFuncionarioFullAnexos: () => {
      throw new Error('nao deve delegar anexos full sem funcionario');
    },
  });

  const req = buildReq({ anexos_existentes: '[]', anexos_excluidos: '[]' });
  const res = makeRes();

  await updateFuncionario(req, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.code, 'NOT_FOUND');
  assert.equal(res.body.message, 'Funcionário não encontrado');
  assert.equal(callLog.seamCalls.length, 0);
  assert.equal(callLog.updateCalls.length, 0);
});

test('updateFuncionario: owner delega so o recorte de anexos full e preserva ordem seam persistencia resposta', async () => {
  const callOrder = [];
  let seamArgs = null;
  const { updateFuncionario, callLog } = loadFullOwnerHarness({
    findFuncionarioById: async () => createExistingFuncionario(),
    reconcileUpdateFuncionarioFullAnexos: (input) => {
      callOrder.push('seam');
      callLog.seamCalls.push(input);
      seamArgs = input;

      input.fs.existsSync(path.join(input.rootDir, 'uploads/tests/remove-full-owner.txt'));
      input.fs.unlinkSync(path.join(input.rootDir, 'uploads/tests/remove-full-owner.txt'));

      return [
        {
          nome: 'keep-full-owner.txt',
          mime: 'text/plain',
          tamanho: 8,
          caminho: 'uploads/tests/keep-full-owner.txt',
        },
        ...input.mapFiles(input.novosUploads),
      ];
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
          nome: 'keep-full-owner.txt',
          mime: 'text/plain',
          tamanho: 8,
          caminho: 'uploads/tests/keep-full-owner.txt',
        },
        {
          nome: 'remove-full-owner.txt',
          mime: 'text/plain',
          tamanho: 9,
          caminho: 'uploads/tests/remove-full-owner.txt',
        },
      ]),
      anexos_excluidos: JSON.stringify([
        {
          nome: 'remove-full-owner.txt',
          caminho: 'uploads/tests/remove-full-owner.txt',
        },
      ]),
    },
    {
      files: {
        anexos: [
          {
            originalname: 'novo-full-owner.txt',
            mimetype: 'text/plain',
            size: 999,
          },
        ],
      },
    }
  );
  const res = makeRes();

  await updateFuncionario(req, res);

  assert.ok(seamArgs, 'A seam de anexos full deve ser chamada pelo owner real.');
  assert.deepEqual(
    Object.keys(seamArgs).sort(),
    ['anexosExcluidos', 'anexosExistentes', 'fs', 'mapFiles', 'novosUploads', 'path', 'rootDir'].sort()
  );
  assert.equal(seamArgs.anexosExistentes, req.body.anexos_existentes);
  assert.equal(seamArgs.anexosExcluidos, req.body.anexos_excluidos);
  assert.equal(seamArgs.novosUploads, req.files.anexos);
  assert.equal(typeof seamArgs.mapFiles, 'function');
  assert.equal(seamArgs.fs, loadFullOwnerHarness().callLog ? seamArgs.fs : seamArgs.fs);
  assert.equal(typeof seamArgs.path.join, 'function');
  assert.equal(typeof seamArgs.rootDir, 'string');
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
            nome: 'keep-full-owner.txt',
            mime: 'text/plain',
            tamanho: 8,
            caminho: 'uploads/tests/keep-full-owner.txt',
          },
          {
            nome: 'novo-full-owner.txt',
            mime: 'text/plain',
            tamanho: 999,
            caminho: 'uploads/novo-full-owner.txt',
            data_upload: '2026-03-24T12:00:00.000Z',
          },
        ],
      },
      $unset: {},
    },
    unitId: 'unit-ctx-001',
  });
  assert.equal(JSON.stringify(callLog.deletedPaths), JSON.stringify([
    { checked: path.join(process.cwd(), 'uploads/tests/remove-full-owner.txt') },
    { deleted: path.join(process.cwd(), 'uploads/tests/remove-full-owner.txt') },
  ]));
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.stringify(res.body), JSON.stringify({ success: true, data: { updated: true } }));
});

test('updateFuncionario: owner preserva tratamento de erro externo quando a seam de anexos full falha', async () => {
  const { updateFuncionario, callLog } = loadFullOwnerHarness({
    reconcileUpdateFuncionarioFullAnexos: (input) => {
      callLog.seamCalls.push(input);
      throw new Error('forced update full anexos seam failure');
    },
  });

  const req = buildReq({
    anexos_existentes: JSON.stringify([{ nome: 'body-only.txt', caminho: 'uploads/tests/body-only.txt' }]),
    anexos_excluidos: '[]',
  });
  const res = makeRes();

  await updateFuncionario(req, res);

  assert.equal(callLog.seamCalls.length, 1);
  assert.equal(callLog.updateCalls.length, 0);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.success, false);
  assert.equal(res.body.code, 'SERVER_ERROR');
  assert.equal(res.body.message, 'forced update full anexos seam failure');
  assert.equal(callLog.consoleErrors.length, 1);
});