import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const preloadModuleUrl = pathToFileURL(
  path.join(process.cwd(), 'src/shared/db/unitDatabaseRegistryPreload.js')
).href;

let importNonce = 0;

async function loadPreloadModuleFresh() {
  importNonce += 1;
  return import(`${preloadModuleUrl}?test=${importNonce}`);
}

test('preloadUnitDatabaseRegistryForUnits retorna relatorio vazio quando unidadeIds nao e lista', async () => {
  const preload = await loadPreloadModuleFresh();

  const result = await preload.preloadUnitDatabaseRegistryForUnits({ unidadeIds: null });

  assert.deepEqual(result, {
    loaded: [],
    missing: [],
    failed: [],
    skipped: [],
  });
});

test('preloadUnitDatabaseRegistryForUnits marca skipped para unidade ausente, invalida e duplicada', async () => {
  const preload = await loadPreloadModuleFresh();
  const calls = [];

  preload.__setPrimeUnitDatabaseRegistryCacheForTests(async ({ unidadeId }) => {
    calls.push(unidadeId);
    return { unidadeId };
  });

  try {
    const result = await preload.preloadUnitDatabaseRegistryForUnits({
      unidadeIds: [null, '', 'abc', '000000000000000000000010', '000000000000000000000010'],
    });

    assert.deepEqual(calls, ['000000000000000000000010']);
    assert.deepEqual(result, {
      loaded: ['000000000000000000000010'],
      missing: [],
      failed: [],
      skipped: [
        {
          input: null,
          reason: 'missing-unidade-id',
        },
        {
          input: '',
          reason: 'missing-unidade-id',
        },
        {
          input: 'abc',
          reason: 'invalid-unidade-id',
        },
        {
          input: '000000000000000000000010',
          reason: 'duplicate-unidade-id',
        },
      ],
    });
  } finally {
    preload.__resetPrimeUnitDatabaseRegistryCacheForTests();
  }
});

test('preloadUnitDatabaseRegistryForUnits adiciona em loaded quando prime retorna entry', async () => {
  const preload = await loadPreloadModuleFresh();
  const calls = [];

  preload.__setPrimeUnitDatabaseRegistryCacheForTests(async ({ unidadeId }) => {
    calls.push(unidadeId);
    return { unidadeId, dbName: `wdgestor_unit_${unidadeId}` };
  });

  try {
    const result = await preload.preloadUnitDatabaseRegistryForUnits({
      unidadeIds: ['000000000000000000000010'],
    });

    assert.deepEqual(calls, ['000000000000000000000010']);
    assert.deepEqual(result, {
      loaded: ['000000000000000000000010'],
      missing: [],
      failed: [],
      skipped: [],
    });
  } finally {
    preload.__resetPrimeUnitDatabaseRegistryCacheForTests();
  }
});

test('preloadUnitDatabaseRegistryForUnits adiciona em missing quando prime retorna null', async () => {
  const preload = await loadPreloadModuleFresh();

  preload.__setPrimeUnitDatabaseRegistryCacheForTests(async () => null);

  try {
    const result = await preload.preloadUnitDatabaseRegistryForUnits({
      unidadeIds: ['000000000000000000000010'],
    });

    assert.deepEqual(result, {
      loaded: [],
      missing: ['000000000000000000000010'],
      failed: [],
      skipped: [],
    });
  } finally {
    preload.__resetPrimeUnitDatabaseRegistryCacheForTests();
  }
});

test('preloadUnitDatabaseRegistryForUnits adiciona em failed quando prime lanca erro sem derrubar o lote', async () => {
  const preload = await loadPreloadModuleFresh();
  const calls = [];

  preload.__setPrimeUnitDatabaseRegistryCacheForTests(async ({ unidadeId }) => {
    calls.push(unidadeId);
    if (unidadeId === '000000000000000000000011') {
      throw new Error('REGISTRY_PRELOAD_FAILED');
    }

    return { unidadeId };
  });

  try {
    const result = await preload.preloadUnitDatabaseRegistryForUnits({
      unidadeIds: ['000000000000000000000010', '000000000000000000000011', '000000000000000000000012'],
    });

    assert.deepEqual(calls, [
      '000000000000000000000010',
      '000000000000000000000011',
      '000000000000000000000012',
    ]);
    assert.deepEqual(result, {
      loaded: ['000000000000000000000010', '000000000000000000000012'],
      missing: [],
      failed: [
        {
          unidadeId: '000000000000000000000011',
          reason: 'prime-failed',
          error: 'REGISTRY_PRELOAD_FAILED',
        },
      ],
      skipped: [],
    });
  } finally {
    preload.__resetPrimeUnitDatabaseRegistryCacheForTests();
  }
});

test('preloadUnitDatabaseRegistryForUnits retorna relatorio deterministico com loaded, missing, failed e skipped', async () => {
  const preload = await loadPreloadModuleFresh();

  preload.__setPrimeUnitDatabaseRegistryCacheForTests(async ({ unidadeId }) => {
    if (unidadeId === '000000000000000000000010') {
      return { unidadeId };
    }

    if (unidadeId === '000000000000000000000011') {
      return null;
    }

    throw new Error('UNEXPECTED_PRELOAD_ERROR');
  });

  try {
    const result = await preload.preloadUnitDatabaseRegistryForUnits({
      unidadeIds: [
        '000000000000000000000010',
        '000000000000000000000011',
        '000000000000000000000012',
        'abc',
        '000000000000000000000010',
      ],
    });

    assert.deepEqual(result, {
      loaded: ['000000000000000000000010'],
      missing: ['000000000000000000000011'],
      failed: [
        {
          unidadeId: '000000000000000000000012',
          reason: 'prime-failed',
          error: 'UNEXPECTED_PRELOAD_ERROR',
        },
      ],
      skipped: [
        {
          input: 'abc',
          reason: 'invalid-unidade-id',
        },
        {
          input: '000000000000000000000010',
          reason: 'duplicate-unidade-id',
        },
      ],
    });
  } finally {
    preload.__resetPrimeUnitDatabaseRegistryCacheForTests();
  }
});