import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/widgetSettingsApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');
const SERVICE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/services/widgetSettings/readFeedbackWidgetVisibility.service.js');
const SERVICE_SOURCE = fs.readFileSync(SERVICE_PATH, 'utf8');

function extractExportedAsyncFunction(source, functionName) {
  const signature = `export async function ${functionName}`;
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `Funcao ${functionName} nao encontrada`);

  const bodyStart = source.indexOf('{', start);
  assert.notEqual(bodyStart, -1, `Corpo de ${functionName} nao encontrado`);

  let index = bodyStart;
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;

  while (index < source.length) {
    const current = source[index];
    const next = source[index + 1];
    const previous = source[index - 1];

    if (inLineComment) {
      if (current === '\n') inLineComment = false;
      index += 1;
      continue;
    }

    if (inBlockComment) {
      if (previous === '*' && current === '/') inBlockComment = false;
      index += 1;
      continue;
    }

    if (!inSingle && !inDouble && !inTemplate) {
      if (current === '/' && next === '/') {
        inLineComment = true;
        index += 1;
        continue;
      }

      if (current === '/' && next === '*') {
        inBlockComment = true;
        index += 1;
        continue;
      }
    }

    if (!inDouble && !inTemplate && current === '\'' && previous !== '\\') {
      inSingle = !inSingle;
      index += 1;
      continue;
    }

    if (!inSingle && !inTemplate && current === '"' && previous !== '\\') {
      inDouble = !inDouble;
      index += 1;
      continue;
    }

    if (!inSingle && !inDouble && current === '`' && previous !== '\\') {
      inTemplate = !inTemplate;
      index += 1;
      continue;
    }

    if (inSingle || inDouble || inTemplate) {
      index += 1;
      continue;
    }

    if (current === '{') {
      depth += 1;
    } else if (current === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }

    index += 1;
  }

  throw new Error(`Nao foi possivel extrair ${functionName}`);
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

function createResponseCapture(callOrder = []) {
  const record = { statusCode: 200, jsonBody: undefined };
  const res = {
    status(code) {
      callOrder.push(`status:${code}`);
      record.statusCode = code;
      return this;
    },
    json(body) {
      callOrder.push('json');
      record.jsonBody = body;
      return body;
    },
  };

  return { res, record };
}

function extractAsyncFunction(source, functionName) {
  const signature = `async function ${functionName}`;
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `Funcao ${functionName} nao encontrada`);

  const bodyStart = source.indexOf('{', start);
  assert.notEqual(bodyStart, -1, `Corpo de ${functionName} nao encontrado`);

  let index = bodyStart;
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;

  while (index < source.length) {
    const current = source[index];
    const next = source[index + 1];
    const previous = source[index - 1];

    if (inLineComment) {
      if (current === '\n') inLineComment = false;
      index += 1;
      continue;
    }

    if (inBlockComment) {
      if (previous === '*' && current === '/') inBlockComment = false;
      index += 1;
      continue;
    }

    if (!inSingle && !inDouble && !inTemplate) {
      if (current === '/' && next === '/') {
        inLineComment = true;
        index += 1;
        continue;
      }

      if (current === '/' && next === '*') {
        inBlockComment = true;
        index += 1;
        continue;
      }
    }

    if (!inDouble && !inTemplate && current === '\'' && previous !== '\\') {
      inSingle = !inSingle;
      index += 1;
      continue;
    }

    if (!inSingle && !inTemplate && current === '"' && previous !== '\\') {
      inDouble = !inDouble;
      index += 1;
      continue;
    }

    if (!inSingle && !inDouble && current === '`' && previous !== '\\') {
      inTemplate = !inTemplate;
      index += 1;
      continue;
    }

    if (inSingle || inDouble || inTemplate) {
      index += 1;
      continue;
    }

    if (current === '{') {
      depth += 1;
    } else if (current === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }

    index += 1;
  }

  throw new Error(`Nao foi possivel extrair ${functionName}`);
}

async function loadOwner(dependencies = {}) {
  const functionSource = extractExportedAsyncFunction(CONTROLLER_SOURCE, 'getFeedbackWidgetVisibility');
  const executableSource = `${functionSource.replace('export async function', 'async function')}\nmodule.exports = { getFeedbackWidgetVisibility };`;

  const sandbox = {
    module: { exports: {} },
    exports: {},
    console: dependencies.console ?? { error() {} },
    KNOWN_MODULES: dependencies.KNOWN_MODULES ?? [],
    normalizeModuleIdFromInput: dependencies.normalizeModuleIdFromInput,
    readFeedbackWidgetVisibilityPayload: dependencies.readFeedbackWidgetVisibilityPayload,
  };

  vm.runInNewContext(executableSource, sandbox, { filename: CONTROLLER_PATH });
  return sandbox.module.exports.getFeedbackWidgetVisibility;
}

test('getFeedbackWidgetVisibility: owner real preserva alias de module query e resposta HTTP final', async () => {
  const callOrder = [];
  const getFeedbackWidgetVisibility = await loadOwner({
    KNOWN_MODULES: [{ id: 'gestor' }, { id: 'portal-morador' }],
    normalizeModuleIdFromInput(value) {
      callOrder.push(`normalize:${value}`);
      return 'portal_morador';
    },
    async readFeedbackWidgetVisibilityPayload(moduleId, options) {
      callOrder.push(`read-seam:${moduleId}:${options?.knownModules?.map((moduleDef) => moduleDef.id).join(',')}`);
      return {
        module: moduleId,
        enabled: false,
      };
    },
  });

  const { res, record } = createResponseCapture(callOrder);
  await getFeedbackWidgetVisibility({ query: { module: '/portal_morador' } }, res);

  assert.deepEqual(callOrder, [
    'normalize:/portal_morador',
    'read-seam:portal-morador:gestor,portal-morador',
    'json',
  ]);
  assert.equal(record.statusCode, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(record.jsonBody)), {
    ok: true,
    module: 'portal-morador',
    enabled: false,
  });
});

test('getFeedbackWidgetVisibility: owner real preserva tratamento de erro 500', async () => {
  const logged = [];
  const boom = new Error('cache exploded');
  const getFeedbackWidgetVisibility = await loadOwner({
    KNOWN_MODULES: [{ id: 'gestor' }],
    async readFeedbackWidgetVisibilityPayload() {
      throw boom;
    },
    normalizeModuleIdFromInput(value) {
      return value;
    },
    console: {
      error(...args) {
        logged.push(args);
      },
    },
  });

  const callOrder = [];
  const { res, record } = createResponseCapture(callOrder);
  await getFeedbackWidgetVisibility({ query: { module: 'gestor' } }, res);

  assert.deepEqual(callOrder, ['status:500', 'json']);
  assert.equal(record.statusCode, 500);
  assert.deepEqual(JSON.parse(JSON.stringify(record.jsonBody)), {
    ok: false,
    error: 'Erro ao carregar configuração do widget.',
  });
  assert.equal(logged.length, 1);
  assert.equal(logged[0][0], '[widgetSettingsApi] GET feedback visibility erro:');
  assert.equal(logged[0][1], boom);
});

test('getFeedbackWidgetVisibility: owner deve largar defaults e resolucao final no corredor de leitura dedicado', () => {
  const ownerSource = stripComments(extractExportedAsyncFunction(CONTROLLER_SOURCE, 'getFeedbackWidgetVisibility'));

  assert.match(ownerSource, /normalizeModuleIdFromInput\s*\(\s*req\.query\?\.module\s*\)/);
  assert.match(ownerSource, /moduleQ\s*===\s*'portal_morador'\s*\?\s*'portal-morador'\s*:\s*moduleQ/);
  assert.match(ownerSource, /readFeedbackWidgetVisibilityPayload\s*\(\s*moduleId\s*,\s*\{\s*knownModules\s*:\s*KNOWN_MODULES\s*\}\s*\)/);
  assert.match(ownerSource, /res\.status\s*\(\s*500\s*\)\.json\s*\(/);

  assert.doesNotMatch(ownerSource, /getVisibilityMapCached\s*\(/);
  assert.doesNotMatch(
    ownerSource,
    /enabledByModule\s*\[\s*key\s*\]\s*!==\s*false/,
    [
      'Owner ainda resolve o valor final por modulo dentro do GET.',
      'A proxima costura deve mover defaults e resolucao final para a seam de leitura,',
      'mantendo no owner apenas alias/query e traducao HTTP.',
    ].join(' '),
  );
});

test('readFeedbackWidgetVisibilityPayload: seam minima concentra cache defaults e resolucao final', async () => {
  const callOrder = [];
  const functionSource = extractAsyncFunction(SERVICE_SOURCE, 'readFeedbackWidgetVisibilityPayload');
  const helper = vm.runInNewContext(`(${functionSource})`, {
    getVisibilityMapCached: async ({ knownModules }) => {
      callOrder.push(`cache:${knownModules.map((moduleDef) => moduleDef.id).join(',')}`);
      return {
        gestor: true,
        'portal-morador': false,
      };
    },
  });

  const knownModules = [{ id: 'gestor' }, { id: 'portal-morador' }];

  const single = await helper('portal-morador', { knownModules });
  const full = await helper('', { knownModules });

  assert.deepEqual(callOrder, ['cache:gestor,portal-morador', 'cache:gestor,portal-morador']);
  assert.deepEqual(JSON.parse(JSON.stringify(single)), {
    module: 'portal-morador',
    enabled: false,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(full)), {
    enabledByModule: {
      gestor: true,
      'portal-morador': false,
    },
  });
});