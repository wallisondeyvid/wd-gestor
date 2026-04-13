import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROUTE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/routes/feedbackApi.js');
const UPLOAD_CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/feedbackUploadApiController.js');
const UPLOAD_INFRA_PATH = path.join(process.cwd(), 'src/modules/gestor/app/routes/utils/createFeedbackUploadStorageInfra.js');
const ROUTE_SOURCE = fs.readFileSync(ROUTE_PATH, 'utf8');
const UPLOAD_CONTROLLER_SOURCE = fs.readFileSync(UPLOAD_CONTROLLER_PATH, 'utf8');
const UPLOAD_INFRA_SOURCE = fs.readFileSync(UPLOAD_INFRA_PATH, 'utf8');

function buildFunctionFromSource(functionSource, context = {}) {
  const script = new vm.Script(`(${functionSource})`);
  return script.runInNewContext(context);
}

function buildObjectFromSource(source, context = {}) {
  const script = new vm.Script(source);
  return script.runInNewContext(context);
}

function toPlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function countOccurrences(source, fragment) {
  return source.split(fragment).length - 1;
}

function buildUploadStorageInfraCoreSource() {
  return UPLOAD_INFRA_SOURCE
    .replace(/import fs from 'fs';\r?\n/g, '')
    .replace(/import path from 'path';\r?\n/g, '')
    .replace(/import \{ put \} from '@vercel\/blob';\r?\n/g, '')
    .replace(/import \{ processFeedbackUploadStorageCore \} from '\.\/processFeedbackUploadStorageCore\.js';\r?\n\r?\n/g, '')
    .replace(/export default createFeedbackUploadStorageInfraCore;\s*/g, '')
    .replace('export function safeFileName(', 'function safeFileName(')
    .replace('export function getBlobToken(', 'function getBlobToken(')
    .replace('export function shouldUseBlobStorage(', 'function shouldUseBlobStorage(')
    .replace('export function isBlobNotConfiguredError(', 'function isBlobNotConfiguredError(')
    .replace('export function safeExtFromFile(', 'function safeExtFromFile(')
    .replace('export function createFeedbackUploadStorageInfraCore(', 'function createFeedbackUploadStorageInfraCore(');
}

function buildDelegatedUploadOwnerSource() {
  return `({
    async uploadFeedbackAnexoHandler(req, res, deps) {
      const feedbackId = String(req.params.feedbackId || '').trim();
      if (!feedbackId) return deps.apiFail(res, 400, 'ID inválido.');
      if (!/^[0-9a-fA-F]{24}$/.test(feedbackId)) return deps.apiFail(res, 400, 'ID inválido.');

      const fb = await deps.findFeedbackById(feedbackId);
      if (!fb) return deps.apiFail(res, 404, 'Feedback não encontrado.');

      const creator = fb?.criadoPor?.userId ? String(fb.criadoPor.userId) : '';
      const me = req.user?._id || req.user?.id;
      if (creator && me && String(me) !== creator) {
        return deps.apiFail(res, 403, 'Acesso negado.');
      }

      const uploadResult = await deps.uploadStorageInfra.processUpload({
        file: req.file,
        files: req.files,
        baseUrl: req.baseUrl || '',
        feedbackId: String(fb._id),
      });
      if (uploadResult.kind === 'missing_file') return deps.apiFail(res, 400, 'Arquivo ausente.');

      fb.anexos = Array.isArray(fb.anexos) ? fb.anexos : [];
      fb.anexos.push({
        nome: uploadResult.stored.originalName,
        url: uploadResult.stored.url,
        mime: uploadResult.file.mimetype,
        size: uploadResult.file.size || (uploadResult.file.buffer ? uploadResult.file.buffer.length : 0),
      });
      await deps.saveFeedbackDoc(fb);

      return deps.apiOk(res, fb.toObject(), { id: fb._id });
    },
  })`;
}

test('estado real atual: a rota delega o miolo tecnico de upload-storage para a seam unica', () => {
  assert.match(ROUTE_SOURCE, /function uploadFeedbackAnexoMiddleware\(req, res, next\)/);
  assert.match(
    ROUTE_SOURCE,
    /import\s*\{[\s\S]*\bcreateFeedbackUploadStorageInfraCore\b[\s\S]*\}\s*from '#modules\/gestor\/app\/routes\/utils\/createFeedbackUploadStorageInfra\.js';/,
  );
  assert.match(ROUTE_SOURCE, /const uploadStorageInfra = createFeedbackUploadStorageInfraCore\(\);/);
  assert.match(ROUTE_SOURCE, /const uploadFeedbackAnexoHandler = createUploadFeedbackAnexoHandler\(\{/);
  assert.match(ROUTE_SOURCE, /uploadStorageInfra,/);

  assert.match(UPLOAD_INFRA_SOURCE, /export function createFeedbackUploadStorageInfraCore\(\{/);
  assert.match(UPLOAD_INFRA_SOURCE, /export function safeFileName\(name\) \{/);
  assert.match(UPLOAD_INFRA_SOURCE, /export function getBlobToken\(\) \{/);
  assert.match(UPLOAD_INFRA_SOURCE, /export function shouldUseBlobStorage\(\) \{/);
  assert.match(UPLOAD_INFRA_SOURCE, /export function isBlobNotConfiguredError\(err\) \{/);
  assert.match(UPLOAD_INFRA_SOURCE, /export function safeExtFromFile\(\{ originalName, mimeType \}\) \{/);
  assert.match(UPLOAD_INFRA_SOURCE, /function pickFileFromRequest\(\{ file, files \}\)/);
  assert.match(UPLOAD_INFRA_SOURCE, /async function processUpload\(\{ file, files, baseUrl, feedbackId \}\)/);
  assert.match(UPLOAD_INFRA_SOURCE, /processStorageCore = processFeedbackUploadStorageCore,/);

  assert.match(UPLOAD_CONTROLLER_SOURCE, /const uploadResult = await uploadStorageInfra\.processUpload\(\{/);
  assert.match(UPLOAD_CONTROLLER_SOURCE, /if \(uploadResult.kind === 'missing_file'\) return apiFail\(res, 400, 'Arquivo ausente\.'\);/);

  assert.equal(countOccurrences(UPLOAD_INFRA_SOURCE, 'export function createFeedbackUploadStorageInfraCore({'), 1);
  assert.equal(countOccurrences(UPLOAD_INFRA_SOURCE, 'export function safeFileName(name) {'), 1);
  assert.equal(countOccurrences(UPLOAD_INFRA_SOURCE, 'export function getBlobToken() {'), 1);
  assert.equal(countOccurrences(UPLOAD_INFRA_SOURCE, 'async function processUpload({ file, files, baseUrl, feedbackId })'), 1);
  assert.equal(countOccurrences(UPLOAD_CONTROLLER_SOURCE, 'uploadStorageInfra.processUpload({'), 1);
});

test('futura seam unica recebe apenas contexto tecnico minimo de arquivo-feedback-storage e concentra o miolo tecnico', async () => {
  const functionSource = buildUploadStorageInfraCoreSource();
  assert.match(functionSource, /function createFeedbackUploadStorageInfraCore\(\{/);
  assert.doesNotMatch(functionSource, /findFeedbackById|saveFeedbackDoc|apiOk|apiFail/);
  assert.doesNotMatch(functionSource, /\bres\b/);

  const calls = [];
  const { createFeedbackUploadStorageInfraCore } = buildObjectFromSource(
    `${functionSource}\n({ createFeedbackUploadStorageInfraCore })`,
  );
  const uploadStorageInfra = createFeedbackUploadStorageInfraCore({
    safeFileName: (name) => {
      calls.push(['safeFileName', name]);
      return String(name || '').replace(/[^A-Za-z0-9_.-]/g, '_');
    },
    safeExtFromFile: ({ originalName, mimeType }) => {
      calls.push(['safeExtFromFile', { originalName, mimeType }]);
      return mimeType === 'image/png' ? '.png' : '.jpg';
    },
    shouldUseBlobStorage: () => {
      calls.push(['shouldUseBlobStorage']);
      return true;
    },
    getBlobToken: () => {
      calls.push(['getBlobToken']);
      return 'blob-token';
    },
    putBlob: async () => {
      calls.push(['putBlob']);
      return { url: 'https://blob.example/file.png' };
    },
    fsModule: {
      mkdirSync: () => calls.push(['mkdirSync']),
      writeFileSync: () => calls.push(['writeFileSync']),
    },
    pathModule: {
      join: (...parts) => parts.join('/'),
    },
    cwdProvider: () => 'C:/Projeto3',
    isBlobNotConfiguredError: (error) => {
      calls.push(['isBlobNotConfiguredError', error?.message || null]);
      return false;
    },
    isVercel: true,
    processStorageCore: async (input) => {
      calls.push(['processStorageCore', {
        baseUrl: input.baseUrl,
        feedbackId: input.feedbackId,
        fileOriginalName: input.file.originalname,
        fileMime: input.file.mimetype,
      }]);
      const normalizedName = input.safeFileName(input.file.originalname);
      const ext = input.safeExtFromFile({ originalName: normalizedName, mimeType: input.file.mimetype });
      const useBlob = input.shouldUseBlobStorage();
      const token = input.getBlobToken();
      if (useBlob && token) await input.putBlob();
      return {
        url: useBlob ? 'https://blob.example/feedback/fb-1/file' + ext : input.baseUrl + '/uploads/file' + ext,
        storedIn: useBlob ? 'blob' : 'fs',
        originalName: normalizedName,
      };
    },
  });

  const missingResult = await uploadStorageInfra.processUpload({
    file: null,
    files: [],
    baseUrl: '/gestor',
    feedbackId: 'fb-0',
  });
  assert.deepEqual(toPlain(missingResult), { kind: 'missing_file' });

  const storedResult = await uploadStorageInfra.processUpload({
    file: null,
    files: [
      { fieldname: 'outro', originalname: 'ignorar.tmp', mimetype: 'application/octet-stream', buffer: Buffer.from('x') },
      { fieldname: 'anexo', originalname: 'Tela Final.png', mimetype: 'image/png', buffer: Buffer.from('abc'), size: 3 },
    ],
    baseUrl: '/gestor',
    feedbackId: 'fb-1',
  });

  assert.deepEqual(toPlain(storedResult), {
    kind: 'stored',
    file: {
      fieldname: 'anexo',
      originalname: 'Tela Final.png',
      mimetype: 'image/png',
      buffer: { type: 'Buffer', data: [97, 98, 99] },
      size: 3,
    },
    stored: {
      url: 'https://blob.example/feedback/fb-1/file.png',
      storedIn: 'blob',
      originalName: 'Tela_Final.png',
    },
  });
  assert.deepEqual(calls, [
    ['processStorageCore', {
      baseUrl: '/gestor',
      feedbackId: 'fb-1',
      fileOriginalName: 'Tela Final.png',
      fileMime: 'image/png',
    }],
    ['safeFileName', 'Tela Final.png'],
    ['safeExtFromFile', { originalName: 'Tela_Final.png', mimeType: 'image/png' }],
    ['shouldUseBlobStorage'],
    ['getBlobToken'],
    ['putBlob'],
  ]);
});

test('o endpoint de upload continua owner HTTP apos a extracao da seam unica', async () => {
  const lifecycle = [];
  const owner = buildObjectFromSource(buildDelegatedUploadOwnerSource());

  const req = {
    params: { feedbackId: '507f1f77bcf86cd799439011' },
    user: { _id: 'user-1' },
    file: null,
    files: [{ fieldname: 'anexo', originalname: 'print.png', mimetype: 'image/png', buffer: Buffer.from('abc'), size: 3 }],
    baseUrl: '/gestor',
  };
  const res = { marker: 'res' };
  const feedbackDoc = {
    _id: 'fb-1',
    criadoPor: { userId: 'user-1' },
    anexos: [],
    toObject() {
      return { _id: 'fb-1', anexos: this.anexos.slice() };
    },
  };
  const deps = {
    apiFail: (targetRes, status, message) => {
      lifecycle.push(['apiFail', targetRes.marker, status, message]);
      return { status, message };
    },
    apiOk: (targetRes, data, extra) => {
      lifecycle.push(['apiOk', targetRes.marker, toPlain(data), toPlain(extra)]);
      return { ok: true, data, extra };
    },
    findFeedbackById: async (id) => {
      lifecycle.push(['findFeedbackById', id]);
      return feedbackDoc;
    },
    saveFeedbackDoc: async (fb) => {
      lifecycle.push(['saveFeedbackDoc', toPlain(fb.toObject())]);
      return fb;
    },
    uploadStorageInfra: {
      processUpload: async (input) => {
        lifecycle.push(['processUpload', {
          fileFieldName: input.file,
          filesLength: Array.isArray(input.files) ? input.files.length : 0,
          baseUrl: input.baseUrl,
          feedbackId: input.feedbackId,
        }]);
        return {
          kind: 'stored',
          file: input.files[0],
          stored: {
            originalName: 'print.png',
            url: 'https://blob.example/feedback/fb-1/print.png',
          },
        };
      },
    },
  };

  const result = await owner.uploadFeedbackAnexoHandler(req, res, deps);
  assert.deepEqual(toPlain(result), {
    ok: true,
    data: {
      _id: 'fb-1',
      anexos: [{
        nome: 'print.png',
        url: 'https://blob.example/feedback/fb-1/print.png',
        mime: 'image/png',
        size: 3,
      }],
    },
    extra: { id: 'fb-1' },
  });
  assert.deepEqual(lifecycle, [
    ['findFeedbackById', '507f1f77bcf86cd799439011'],
    ['processUpload', {
      fileFieldName: null,
      filesLength: 1,
      baseUrl: '/gestor',
      feedbackId: 'fb-1',
    }],
    ['saveFeedbackDoc', {
      _id: 'fb-1',
      anexos: [{
        nome: 'print.png',
        url: 'https://blob.example/feedback/fb-1/print.png',
        mime: 'image/png',
        size: 3,
      }],
    }],
    ['apiOk', 'res', {
      _id: 'fb-1',
      anexos: [{
        nome: 'print.png',
        url: 'https://blob.example/feedback/fb-1/print.png',
        mime: 'image/png',
        size: 3,
      }],
    }, { id: 'fb-1' }],
  ]);

  const ownerSource = buildDelegatedUploadOwnerSource();
  assert.doesNotMatch(ownerSource, /pickFile\(|safeFileName|safeExtFromFile|getBlobToken|shouldUseBlobStorage|isBlobNotConfiguredError|processFeedbackUploadStorageCore/);
  assert.doesNotMatch(ownerSource, /putBlob|fsModule|pathModule|cwdProvider/);
});