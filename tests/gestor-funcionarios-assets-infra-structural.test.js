import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/funcionarioApiController.js');
const SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

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

function buildAssetsInfraCoreSource() {
  return `function createFuncionarioAssetsInfraCore({
    rootDir,
    fileSystem,
    pathModule,
    putObject,
    deleteObject,
    imageProcessor,
    uuidFactory,
    env,
    now,
    BufferCtor,
  } = {}) {
    const effectiveRootDir = rootDir || '.';

    function ensureDir(dir) {
      if (!fileSystem.existsSync(dir)) fileSystem.mkdirSync(dir, { recursive: true });
    }

    function normalizeAndMaybeMove(fullPath) {
      const normalizedFullPath = String(fullPath || '').split('\\\\').join('/');
      if (normalizedFullPath.includes('/public/uploads/') || normalizedFullPath.includes('/uploads/')) {
        let relative = pathModule.relative(effectiveRootDir, normalizedFullPath).split('\\\\').join('/');
        if (relative.startsWith('public/')) relative = relative.slice('public/'.length);
        if (!relative.startsWith('uploads/')) relative = 'uploads/' + pathModule.basename(normalizedFullPath);
        return { relative, moved: false };
      }

      const destinationDir = pathModule.join(effectiveRootDir, 'public', 'uploads');
      ensureDir(destinationDir);
      const destinationFile = pathModule.join(destinationDir, pathModule.basename(normalizedFullPath));
      if (!fileSystem.existsSync(destinationFile)) fileSystem.copyFileSync(normalizedFullPath, destinationFile);
      return { relative: 'uploads/' + pathModule.basename(destinationFile), moved: true };
    }

    function ensureDiskPathFromMemoryFile(file) {
      if (!file) return file;
      if (file.path || !file.buffer) return file;
      const destinationDir = pathModule.join(effectiveRootDir, 'public', 'uploads');
      ensureDir(destinationDir);
      const safeBase = String(now()) + '-' + String(file.originalname || 'arquivo').replace(/[^a-zA-Z0-9._-]/g, '_');
      const fullPath = pathModule.join(destinationDir, safeBase);
      fileSystem.writeFileSync(fullPath, file.buffer);
      file.path = fullPath;
      return file;
    }

    function mapFiles(list = []) {
      if (!Array.isArray(list)) return [];
      return list.map((file) => {
        if (!file) return null;
        ensureDiskPathFromMemoryFile(file);
        if (!file.path) return null;
        const normalized = normalizeAndMaybeMove(file.path);
        return {
          nome: file.originalname || 'arquivo_sem_nome',
          mime: file.mimetype || 'application/octet-stream',
          tamanho: file.size || 0,
          caminho: normalized.relative,
          data_upload: new Date(now()),
        };
      }).filter(Boolean);
    }

    function getBlobToken() {
      return env.BLOB_READ_WRITE_TOKEN || env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN || env.VERCEL_BLOB_RW_TOKEN || '';
    }

    function isBlobUrl(url) {
      return typeof url === 'string' && url.includes('blob.vercel-storage.com/');
    }

    function canUseBlob() {
      return !!env.VERCEL || !!getBlobToken();
    }

    async function uploadFuncionarioFotoToBlob(buffer, funcionarioId) {
      if (!buffer || !buffer.length) return null;
      const webp = await imageProcessor(buffer)
        .rotate()
        .resize(512, 512, { fit: 'cover', position: 'center', withoutEnlargement: true })
        .toFormat('webp', { quality: 90 })
        .toBuffer();
      const key = 'funcionarios/' + (funcionarioId || 'temp') + '-' + uuidFactory() + '.webp';
      const token = getBlobToken();
      const result = await putObject(key, webp, {
        access: 'public',
        contentType: 'image/webp',
        cacheControl: 'public, max-age=31536000, immutable',
        ...(token ? { token } : {}),
      });
      return result.url;
    }

    async function deleteFromBlobIfNeeded(url) {
      if (!isBlobUrl(url)) return false;
      const token = getBlobToken();
      await deleteObject(url, token ? { token } : undefined);
      return true;
    }

    function parseDataUrl(dataUrl) {
      if (!/^data:/i.test(String(dataUrl))) return null;
      const [header, base64] = String(dataUrl).split(',');
      if (!base64) return null;
      return {
        contentType: header.split(';')[0].split(':')[1] || 'application/octet-stream',
        buffer: BufferCtor.from(base64, 'base64'),
      };
    }

    async function uploadFacePreviewToBlob(buffer, funcionarioId, index) {
      if (!buffer || !buffer.length) return null;
      const webp = await imageProcessor(buffer)
        .rotate()
        .resize(640, 640, { fit: 'inside', withoutEnlargement: true })
        .toFormat('webp', { quality: 92 })
        .toBuffer();
      const key = 'faces/' + (funcionarioId || 'temp') + '-' + uuidFactory() + '-' + ((index ?? 0) + 1) + '.webp';
      const token = getBlobToken();
      const result = await putObject(key, webp, {
        access: 'public',
        contentType: 'image/webp',
        cacheControl: 'public, max-age=31536000, immutable',
        ...(token ? { token } : {}),
      });
      return result.url;
    }

    async function mapBiometriasFaciaisToBlob(items, funcionarioId) {
      if (!Array.isArray(items) || !items.length) return items;
      if (!canUseBlob()) return items;
      const output = [];
      for (let index = 0; index < items.length; index += 1) {
        const current = { ...(items[index] || {}) };
        if (current.imagem && /^data:/i.test(String(current.imagem))) {
          const parsed = parseDataUrl(current.imagem);
          if (parsed?.buffer) {
            const url = await uploadFacePreviewToBlob(parsed.buffer, funcionarioId, index);
            if (url) current.imagem = url;
          }
        }
        output.push(current);
      }
      return output;
    }

    return {
      normalizeAndMaybeMove,
      ensureDiskPathFromMemoryFile,
      mapFiles,
      canUseBlob,
      uploadFuncionarioFotoToBlob,
      deleteFromBlobIfNeeded,
      parseDataUrl,
      uploadFacePreviewToBlob,
      mapBiometriasFaciaisToBlob,
    };
  }`;
}

function buildDelegatedOwnersSource() {
  return `({
    async createOwner(req, deps) {
      const assetsInfra = createFuncionarioAssetsInfraCore(deps.assetsContext);
      const mappedFiles = assetsInfra.mapFiles(req.files?.anexos || []);
      const fotoUrl = req.fotoBuffer ? await assetsInfra.uploadFuncionarioFotoToBlob(req.fotoBuffer, req.funcionarioId) : null;
      const faceItems = await assetsInfra.mapBiometriasFaciaisToBlob(req.biometrias || [], req.funcionarioId);
      return deps.created({ mappedFiles, fotoUrl, faceItems });
    },

    async updateIncrementalOwner(req, deps) {
      const assetsInfra = createFuncionarioAssetsInfraCore(deps.assetsContext);
      if (req.excluirFoto) await assetsInfra.deleteFromBlobIfNeeded(req.fotoAtual);
      const fotoUrl = req.fotoBuffer ? await assetsInfra.uploadFuncionarioFotoToBlob(req.fotoBuffer, req.funcionarioId) : null;
      const mappedFiles = assetsInfra.mapFiles(req.files?.anexos || []);
      const faceItems = await assetsInfra.mapBiometriasFaciaisToBlob(req.biometrias || [], req.funcionarioId);
      return deps.ok({ fotoUrl, mappedFiles, faceItems });
    },

    async updateFullOwner(req, deps) {
      const assetsInfra = createFuncionarioAssetsInfraCore(deps.assetsContext);
      const blobReady = assetsInfra.canUseBlob();
      const fotoUrl = req.fotoBuffer && blobReady
        ? await assetsInfra.uploadFuncionarioFotoToBlob(req.fotoBuffer, req.funcionarioId)
        : null;
      const mappedFiles = assetsInfra.mapFiles(req.files?.anexos || []);
      const parsedFace = req.faceDataUrl ? assetsInfra.parseDataUrl(req.faceDataUrl) : null;
      const faceItems = await assetsInfra.mapBiometriasFaciaisToBlob(req.biometrias || [], req.funcionarioId);
      return deps.ok({ fotoUrl, mappedFiles, parsedFace, faceItems, blobReady });
    },
  })`;
}

test('estado real atual: o controller delega a infraestrutura compartilhada de assets para a seam unica', () => {
  assert.match(SOURCE, /function createFuncionarioAssetsInfraCore\(\{/);
  assert.match(SOURCE, /function ensureDir\(dir\)/);
  assert.match(SOURCE, /function normalizeAndMaybeMove\(fullPath\)/);
  assert.match(SOURCE, /function ensureDiskPathFromMemoryFile\(file\)/);
  assert.match(SOURCE, /function mapFiles\(list = \[\]\)/);
  assert.match(SOURCE, /function getBlobToken\(\)/);
  assert.match(SOURCE, /function canUseBlob\(\)/);
  assert.match(SOURCE, /async function uploadFuncionarioFotoToBlob\(buffer, funcionarioId\)/);
  assert.match(SOURCE, /async function deleteFromBlobIfNeeded\(url\)/);
  assert.match(SOURCE, /function parseDataUrl\(dataUrl\)/);
  assert.match(SOURCE, /async function uploadFacePreviewToBlob\(buffer, funcionarioId, idx\)/);
  assert.match(SOURCE, /async function mapBiometriasFaciaisToBlob\(arr, funcionarioId\)/);

  assert.equal(countOccurrences(SOURCE, 'const assetsInfra = createFuncionarioAssetsInfraCore();'), 3);
  assert.equal(countOccurrences(SOURCE, 'assetsInfra.mapFiles'), 3);
  assert.equal(countOccurrences(SOURCE, 'assetsInfra.uploadFuncionarioFotoToBlob'), 4);
  assert.equal(countOccurrences(SOURCE, 'assetsInfra.deleteFromBlobIfNeeded'), 4);
  assert.equal(countOccurrences(SOURCE, 'assetsInfra.mapBiometriasFaciaisToBlob'), 3);
  assert.equal(countOccurrences(SOURCE, 'assetsInfra.parseDataUrl'), 2);

  assert.doesNotMatch(SOURCE, /^function normalizeAndMaybeMove\(fullPath\)/m);
  assert.doesNotMatch(SOURCE, /^function ensureDiskPathFromMemoryFile\(file\)/m);
  assert.doesNotMatch(SOURCE, /^function mapFiles\(list = \[\]\)/m);
  assert.doesNotMatch(SOURCE, /^function getBlobToken\(\)/m);
  assert.doesNotMatch(SOURCE, /^function canUseBlob\(\)/m);
  assert.doesNotMatch(SOURCE, /^async function uploadFuncionarioFotoToBlob\(buffer, funcionarioId\)/m);
  assert.doesNotMatch(SOURCE, /^async function deleteFromBlobIfNeeded\(url\)/m);
  assert.doesNotMatch(SOURCE, /^function parseDataUrl\(dataUrl\)/m);
  assert.doesNotMatch(SOURCE, /^async function uploadFacePreviewToBlob\(buffer, funcionarioId, idx\)/m);
  assert.doesNotMatch(SOURCE, /^async function mapBiometriasFaciaisToBlob\(arr, funcionarioId\)/m);
});

test('futura seam unica recebe apenas contexto tecnico minimo e concentra somente operacoes de assets', async () => {
  const calls = [];
  const fileState = new Map();
  const createFuncionarioAssetsInfraCore = buildFunctionFromSource(buildAssetsInfraCoreSource(), {
    Date,
  });

  const assetsInfra = createFuncionarioAssetsInfraCore({
    rootDir: '/repo',
    env: {
      VERCEL: '1',
      BLOB_READ_WRITE_TOKEN: 'token-123',
    },
    now: () => 1700000000000,
    uuidFactory: () => 'uuid-1',
    BufferCtor: {
      from(value, encoding) {
        calls.push(['Buffer.from', value, encoding]);
        return { raw: value, encoding, length: String(value || '').length };
      },
    },
    pathModule: {
      join: (...parts) => parts.join('/').replace(/\/+/g, '/'),
      basename: (value) => String(value).split('/').pop(),
      relative: (from, to) => String(to).replace(String(from).replace(/\/+/g, '/'), '').replace(/^\//, ''),
    },
    fileSystem: {
      existsSync(target) {
        return fileState.has(target);
      },
      mkdirSync(target) {
        calls.push(['mkdirSync', target]);
        fileState.set(target, { type: 'dir' });
      },
      copyFileSync(from, to) {
        calls.push(['copyFileSync', from, to]);
        fileState.set(to, { type: 'file', from });
      },
      writeFileSync(target, buffer) {
        calls.push(['writeFileSync', target, buffer]);
        fileState.set(target, { type: 'file', buffer });
      },
    },
    putObject: async (key, buffer, options) => {
      calls.push(['putObject', key, buffer, toPlain(options)]);
      return { url: 'https://blob.example/' + key };
    },
    deleteObject: async (url, options) => {
      calls.push(['deleteObject', url, toPlain(options)]);
    },
    imageProcessor: (buffer) => ({
      rotate() { calls.push(['rotate', buffer]); return this; },
      resize(width, height, options) { calls.push(['resize', width, height, toPlain(options)]); return this; },
      toFormat(format, options) { calls.push(['toFormat', format, toPlain(options)]); return this; },
      async toBuffer() { calls.push(['toBuffer']); return 'webp-buffer'; },
    }),
  });

  const memoryFile = { originalname: 'teste.png', mimetype: 'image/png', buffer: 'raw-buffer', size: 12 };
  const mappedFiles = assetsInfra.mapFiles([memoryFile]);
  const fotoUrl = await assetsInfra.uploadFuncionarioFotoToBlob('foto-buffer', 'func-1');
  const deleted = await assetsInfra.deleteFromBlobIfNeeded('https://blob.vercel-storage.com/foto.webp');
  const parsed = assetsInfra.parseDataUrl('data:image/png;base64,Zm9v');
  const faceUrl = await assetsInfra.uploadFacePreviewToBlob('face-buffer', 'func-1', 0);
  const mappedFaces = await assetsInfra.mapBiometriasFaciaisToBlob([
    { imagem: 'data:image/png;base64,YmFy', hash: 'h1' },
    { imagem: 'https://blob.example/existente.webp', hash: 'h2' },
  ], 'func-1');

  assert.match(buildAssetsInfraCoreSource(), /createFuncionarioAssetsInfraCore\(\{/);
  assert.match(buildAssetsInfraCoreSource(), /function normalizeAndMaybeMove\(fullPath\)/);
  assert.match(buildAssetsInfraCoreSource(), /function ensureDiskPathFromMemoryFile\(file\)/);
  assert.match(buildAssetsInfraCoreSource(), /function mapFiles\(list = \[\]\)/);
  assert.match(buildAssetsInfraCoreSource(), /function canUseBlob\(\)/);
  assert.match(buildAssetsInfraCoreSource(), /async function uploadFuncionarioFotoToBlob\(buffer, funcionarioId\)/);
  assert.match(buildAssetsInfraCoreSource(), /async function deleteFromBlobIfNeeded\(url\)/);
  assert.match(buildAssetsInfraCoreSource(), /function parseDataUrl\(dataUrl\)/);
  assert.match(buildAssetsInfraCoreSource(), /async function uploadFacePreviewToBlob\(buffer, funcionarioId, index\)/);
  assert.match(buildAssetsInfraCoreSource(), /async function mapBiometriasFaciaisToBlob\(items, funcionarioId\)/);
  assert.doesNotMatch(buildAssetsInfraCoreSource(), /req\b|res\b|updateFuncionarioByIdWithOps|createFuncionarioDoc|saveFuncionario|return ok\(|return created\(|return badRequest\(|return notFound\(/);

  assert.deepEqual(toPlain(mappedFiles), [{
    nome: 'teste.png',
    mime: 'image/png',
    tamanho: 12,
    caminho: 'uploads/1700000000000-teste.png',
    data_upload: new Date(1700000000000).toJSON(),
  }]);
  assert.equal(memoryFile.path, '/repo/public/uploads/1700000000000-teste.png');
  assert.equal(assetsInfra.canUseBlob(), true);
  assert.equal(fotoUrl, 'https://blob.example/funcionarios/func-1-uuid-1.webp');
  assert.equal(deleted, true);
  assert.deepEqual(toPlain(parsed), {
    contentType: 'image/png',
    buffer: { raw: 'Zm9v', encoding: 'base64', length: 4 },
  });
  assert.equal(faceUrl, 'https://blob.example/faces/func-1-uuid-1-1.webp');
  assert.deepEqual(toPlain(mappedFaces), [
    { imagem: 'https://blob.example/faces/func-1-uuid-1-1.webp', hash: 'h1' },
    { imagem: 'https://blob.example/existente.webp', hash: 'h2' },
  ]);
});

test('owners futuros continuam HTTP owners e deixam a seam limitada a infraestrutura tecnica de assets', async () => {
  const assetsCalls = [];
  const owners = buildObjectFromSource(buildDelegatedOwnersSource(), {
    createFuncionarioAssetsInfraCore: (assetsContext) => {
      assetsCalls.push(['createAssets', toPlain(assetsContext)]);
      return {
        mapFiles(files) {
          assetsCalls.push(['mapFiles', toPlain(files)]);
          return ['mapped-files'];
        },
        canUseBlob() {
          assetsCalls.push(['canUseBlob']);
          return true;
        },
        async uploadFuncionarioFotoToBlob(buffer, funcionarioId) {
          assetsCalls.push(['uploadFuncionarioFotoToBlob', buffer, funcionarioId]);
          return 'https://blob.example/' + funcionarioId + '.webp';
        },
        async deleteFromBlobIfNeeded(url) {
          assetsCalls.push(['deleteFromBlobIfNeeded', url]);
          return true;
        },
        parseDataUrl(dataUrl) {
          assetsCalls.push(['parseDataUrl', dataUrl]);
          return { parsed: true };
        },
        async mapBiometriasFaciaisToBlob(items, funcionarioId) {
          assetsCalls.push(['mapBiometriasFaciaisToBlob', toPlain(items), funcionarioId]);
          return [{ funcionarioId, mapped: true }];
        },
      };
    },
  });

  const deps = {
    assetsContext: { rootDir: '/repo' },
    created: (payload) => ({ kind: 'http_created', payload }),
    ok: (payload) => ({ kind: 'http_ok', payload }),
  };

  const createResult = await owners.createOwner({
    files: { anexos: [{ originalname: 'c.txt' }] },
    fotoBuffer: 'foto-create',
    funcionarioId: 'func-create',
    biometrias: [{ imagem: 'data:image/png;base64,AAA' }],
  }, deps);

  const incrementalResult = await owners.updateIncrementalOwner({
    files: { anexos: [{ originalname: 'i.txt' }] },
    fotoBuffer: 'foto-inc',
    fotoAtual: 'https://blob.vercel-storage.com/old.webp',
    excluirFoto: true,
    funcionarioId: 'func-inc',
    biometrias: [{ imagem: 'data:image/png;base64,BBB' }],
  }, deps);

  const fullResult = await owners.updateFullOwner({
    files: { anexos: [{ originalname: 'f.txt' }] },
    fotoBuffer: 'foto-full',
    faceDataUrl: 'data:image/png;base64,CCC',
    funcionarioId: 'func-full',
    biometrias: [{ imagem: 'data:image/png;base64,DDD' }],
  }, deps);

  assert.deepEqual(toPlain(createResult), {
    kind: 'http_created',
    payload: {
      mappedFiles: ['mapped-files'],
      fotoUrl: 'https://blob.example/func-create.webp',
      faceItems: [{ funcionarioId: 'func-create', mapped: true }],
    },
  });
  assert.deepEqual(toPlain(incrementalResult), {
    kind: 'http_ok',
    payload: {
      fotoUrl: 'https://blob.example/func-inc.webp',
      mappedFiles: ['mapped-files'],
      faceItems: [{ funcionarioId: 'func-inc', mapped: true }],
    },
  });
  assert.deepEqual(toPlain(fullResult), {
    kind: 'http_ok',
    payload: {
      fotoUrl: 'https://blob.example/func-full.webp',
      mappedFiles: ['mapped-files'],
      parsedFace: { parsed: true },
      faceItems: [{ funcionarioId: 'func-full', mapped: true }],
      blobReady: true,
    },
  });

  assert.match(buildDelegatedOwnersSource(), /createFuncionarioAssetsInfraCore\(deps\.assetsContext\)/);
  assert.match(buildDelegatedOwnersSource(), /mapFiles\(/);
  assert.match(buildDelegatedOwnersSource(), /uploadFuncionarioFotoToBlob\(/);
  assert.match(buildDelegatedOwnersSource(), /deleteFromBlobIfNeeded\(/);
  assert.match(buildDelegatedOwnersSource(), /parseDataUrl\(/);
  assert.match(buildDelegatedOwnersSource(), /mapBiometriasFaciaisToBlob\(/);
  assert.doesNotMatch(buildDelegatedOwnersSource(), /updateFuncionarioByIdWithOps|createFuncionarioDoc|saveFuncionario|badRequest\(|notFound\(/);
});