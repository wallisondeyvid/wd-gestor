import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileUpdateFuncionarioIncrementalAnexos } from '../src/modules/gestor/app/controllers/utils/reconcileFuncionarioAnexos.js';

function createFuncionarioAtual(overrides = {}) {
  return {
    _id: '507f1f77bcf86cd799439011',
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

function createMapFilesSpy() {
  const calls = [];
  const mapFiles = (files) => {
    calls.push(files);
    return files.map((file, index) => ({
      nome: file.originalname || `arquivo-${index}.pdf`,
      mime: file.mimetype || 'application/octet-stream',
      tamanho: file.size || 0,
      caminho: `uploads/${file.originalname || `arquivo-${index}.pdf`}`,
      data_upload: '2026-03-24T12:00:00.000Z',
    }));
  };

  return { mapFiles, calls };
}

test('reconcileFuncionarioAnexosUsecase: a seam pura expõe apenas a fronteira mínima e não conhece req/res/ops/HTTP', async () => {
  const usecase = reconcileUpdateFuncionarioIncrementalAnexos;

  assert.equal(typeof usecase, 'function');

  const { mapFiles } = createMapFilesSpy();
  const result = await usecase({
    funcionarioAtual: createFuncionarioAtual(),
    anexosExistentes: undefined,
    anexosExcluidos: undefined,
    novosUploads: [],
    mapFiles,
    req: { proibido: true },
    res: { proibido: true },
    ops: { proibido: true },
  });

  assert.equal(Array.isArray(result), true);
});

test('reconcileFuncionarioAnexosUsecase: preserva anexos atuais quando não há instruções', async () => {
  const usecase = reconcileUpdateFuncionarioIncrementalAnexos;
  const funcionarioAtual = createFuncionarioAtual();
  const { mapFiles, calls } = createMapFilesSpy();

  const result = await usecase({
    funcionarioAtual,
    anexosExistentes: undefined,
    anexosExcluidos: undefined,
    novosUploads: [],
    mapFiles,
  });

  assert.equal(JSON.stringify(result), JSON.stringify(funcionarioAtual.anexos));
  assert.equal(calls.length, 0);
});

test('reconcileFuncionarioAnexosUsecase: aplica anexosExistentes quando vierem no body', async () => {
  const usecase = reconcileUpdateFuncionarioIncrementalAnexos;
  const funcionarioAtual = createFuncionarioAtual();
  const { mapFiles, calls } = createMapFilesSpy();
  const anexosExistentes = JSON.stringify([
    {
      nome: 'body-permanece.pdf',
      mime: 'application/pdf',
      tamanho: 333,
      caminho: 'uploads/body-permanece.pdf',
    },
  ]);

  const result = await usecase({
    funcionarioAtual,
    anexosExistentes,
    anexosExcluidos: undefined,
    novosUploads: [],
    mapFiles,
  });

  assert.equal(
    JSON.stringify(result),
    JSON.stringify([
      {
        nome: 'body-permanece.pdf',
        mime: 'application/pdf',
        tamanho: 333,
        caminho: 'uploads/body-permanece.pdf',
      },
    ])
  );
  assert.equal(calls.length, 0);
});

test('reconcileFuncionarioAnexosUsecase: remove os listados em anexosExcluidos', async () => {
  const usecase = reconcileUpdateFuncionarioIncrementalAnexos;
  const funcionarioAtual = createFuncionarioAtual();
  const { mapFiles, calls } = createMapFilesSpy();

  const result = await usecase({
    funcionarioAtual,
    anexosExistentes: undefined,
    anexosExcluidos: JSON.stringify([
      { nome: 'contrato-antigo.pdf', caminho: 'uploads/contrato-antigo.pdf' },
    ]),
    novosUploads: [],
    mapFiles,
  });

  assert.equal(
    JSON.stringify(result),
    JSON.stringify([
      {
        nome: 'holerite-antigo.pdf',
        mime: 'application/pdf',
        tamanho: 1200,
        caminho: 'uploads/holerite-antigo.pdf',
        data_upload: '2026-03-24T00:00:00.000Z',
      },
    ])
  );
  assert.equal(calls.length, 0);
});

test('reconcileFuncionarioAnexosUsecase: incorpora novos uploads já mapeados por mapFiles', async () => {
  const usecase = reconcileUpdateFuncionarioIncrementalAnexos;
  const funcionarioAtual = createFuncionarioAtual();
  const { mapFiles, calls } = createMapFilesSpy();
  const novosUploads = [
    {
      originalname: 'novo-anexo.pdf',
      mimetype: 'application/pdf',
      size: 999,
    },
  ];

  const result = await usecase({
    funcionarioAtual,
    anexosExistentes: undefined,
    anexosExcluidos: undefined,
    novosUploads,
    mapFiles,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0], novosUploads);
  assert.equal(
    JSON.stringify(result),
    JSON.stringify([
      ...funcionarioAtual.anexos,
      {
        nome: 'novo-anexo.pdf',
        mime: 'application/pdf',
        tamanho: 999,
        caminho: 'uploads/novo-anexo.pdf',
        data_upload: '2026-03-24T12:00:00.000Z',
      },
    ])
  );
});

test('reconcileFuncionarioAnexosUsecase: combina existentes, exclusões e novos uploads de forma determinística', async () => {
  const usecase = reconcileUpdateFuncionarioIncrementalAnexos;
  const { mapFiles, calls } = createMapFilesSpy();
  const novosUploads = [
    {
      originalname: 'novo-anexo.pdf',
      mimetype: 'application/pdf',
      size: 999,
    },
  ];

  const result = await usecase({
    funcionarioAtual: createFuncionarioAtual(),
    anexosExistentes: JSON.stringify([
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
    anexosExcluidos: JSON.stringify([
      { nome: 'contrato-antigo.pdf', caminho: 'uploads/contrato-antigo.pdf' },
    ]),
    novosUploads,
    mapFiles,
  });

  assert.equal(calls.length, 1);
  assert.equal(
    JSON.stringify(result),
    JSON.stringify([
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
    ])
  );
});