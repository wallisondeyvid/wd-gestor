import test from 'node:test';
import assert from 'node:assert/strict';

import { uploadLogoUnidadeInlineWrite } from '../src/modules/gestor/app/usecases/unidades/uploadLogoUnidadeInlineWrite.js';

test('uploadLogoUnidadeInlineWrite: processa, remove logo blob anterior em best-effort e persiste a nova URL', async () => {
  const callOrder = [];
  let processArg = null;
  let removeArgs = null;
  let saveArg = null;

  const unidade = {
    _id: 'u-filial',
    logo: 'https://blob.vercel-storage.com/unidades/u-filial/logo-antiga.webp',
  };
  const buffer = Buffer.from('inline-image');

  const result = await uploadLogoUnidadeInlineWrite({
    unidade,
    buffer,
    processarEEnviarParaBlob: async (receivedBuffer, options) => {
      callOrder.push('process');
      processArg = { receivedBuffer, options };
      return {
        url: 'https://blob.vercel-storage.com/unidades/u-filial/logo-final.webp',
        token: 'token-test',
      };
    },
    removeBlobLogo: async (url, options) => {
      callOrder.push('remove');
      removeArgs = { url, options };
    },
    saveUnidade: async (doc) => {
      callOrder.push('save');
      saveArg = doc;
    },
  });

  assert.deepEqual(processArg, {
    receivedBuffer: buffer,
    options: { keyPrefix: 'unidades/u-filial' },
  });
  assert.deepEqual(removeArgs, {
    url: 'https://blob.vercel-storage.com/unidades/u-filial/logo-antiga.webp',
    options: { token: 'token-test' },
  });
  assert.equal(saveArg, unidade);
  assert.equal(unidade.logo, 'https://blob.vercel-storage.com/unidades/u-filial/logo-final.webp');
  assert.deepEqual(result, {
    logo: 'https://blob.vercel-storage.com/unidades/u-filial/logo-final.webp',
  });
  assert.deepEqual(callOrder, ['process', 'remove', 'save']);
});

test('uploadLogoUnidadeInlineWrite: tolera falha ao remover logo blob anterior e ainda persiste a nova URL', async () => {
  const callOrder = [];
  let saveArg = null;

  const unidade = {
    _id: 'u-filial',
    logo: 'https://blob.vercel-storage.com/unidades/u-filial/logo-antiga.webp',
  };

  const result = await uploadLogoUnidadeInlineWrite({
    unidade,
    buffer: Buffer.from('inline-image'),
    processarEEnviarParaBlob: async () => {
      callOrder.push('process');
      return {
        url: 'https://blob.vercel-storage.com/unidades/u-filial/logo-final.webp',
        token: 'token-test',
      };
    },
    removeBlobLogo: async () => {
      callOrder.push('remove');
      throw new Error('forced-remove-failure');
    },
    saveUnidade: async (doc) => {
      callOrder.push('save');
      saveArg = doc;
    },
  });

  assert.equal(saveArg, unidade);
  assert.equal(result.logo, 'https://blob.vercel-storage.com/unidades/u-filial/logo-final.webp');
  assert.deepEqual(callOrder, ['process', 'remove', 'save']);
});