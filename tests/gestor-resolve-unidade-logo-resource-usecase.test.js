import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { resolveUnidadeLogoResource } from '../src/modules/gestor/app/usecases/unidades/resolveUnidadeLogoResource.js';

const ROOT = process.cwd();

test('resolveUnidadeLogoResource: resolve redirect para URL publica', async () => {
  const result = await resolveUnidadeLogoResource({
    unidade: { _id: 'u-filial', logo: 'https://blob.vercel-storage.com/unidades/u-filial/logo.webp' },
    parseDataUrl: () => null,
    fs: { stat: async () => null },
    path,
    cwd: () => ROOT,
  });

  assert.deepEqual(result, {
    kind: 'redirect',
    url: 'https://blob.vercel-storage.com/unidades/u-filial/logo.webp',
    cacheControl: 'public, max-age=60',
  });
});

test('resolveUnidadeLogoResource: resolve buffer quando a logo esta em data URL valida', async () => {
  const parsed = { buffer: Buffer.from('decoded-logo'), contentType: 'image/png' };

  const result = await resolveUnidadeLogoResource({
    unidade: { _id: 'u-filial', logo: 'data:image/png;base64,AAAA' },
    parseDataUrl: () => parsed,
    fs: { stat: async () => null },
    path,
    cwd: () => ROOT,
  });

  assert.equal(result.kind, 'buffer');
  assert.equal(result.buffer, parsed.buffer);
  assert.equal(result.contentType, 'image/png');
  assert.equal(result.cacheControl, 'private, max-age=300');
});

test('resolveUnidadeLogoResource: resolve arquivo legado quando encontra caminho existente', async () => {
  const result = await resolveUnidadeLogoResource({
    unidade: { _id: 'u-filial', logo: 'uploads/logo-legado.webp' },
    parseDataUrl: () => null,
    fs: {
      stat: async (filePath) => ({
        isFile: () => filePath === path.join(ROOT, 'public', 'uploads/logo-legado.webp'),
      }),
    },
    path,
    cwd: () => ROOT,
  });

  assert.deepEqual(result, {
    kind: 'file',
    filePath: path.join(ROOT, 'public', 'uploads/logo-legado.webp'),
    contentType: 'image/webp',
    cacheControl: 'private, max-age=300',
    fallbackTo204OnError: false,
  });
});

test('resolveUnidadeLogoResource: cai para placeholder quando nenhum recurso e encontrado', async () => {
  const result = await resolveUnidadeLogoResource({
    unidade: { _id: 'u-filial', logo: '' },
    parseDataUrl: () => null,
    fs: { stat: async () => null },
    path,
    cwd: () => ROOT,
  });

  assert.deepEqual(result, {
    kind: 'file',
    filePath: path.join(ROOT, 'public', 'img', 'placeholder-logo.svg'),
    contentType: 'image/svg+xml',
    cacheControl: 'public, max-age=600',
    fallbackTo204OnError: true,
  });
});