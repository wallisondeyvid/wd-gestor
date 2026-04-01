import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/bancoApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

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

function buildDelegatedOwnerSource() {
  const original = extractExportedAsyncFunction(CONTROLLER_SOURCE, 'listarBancos');
  if (original.includes('listBancosCore(')) {
    return original;
  }

  const currentCorePattern = /const now = Date\.now\(\);\s*if \(!cache\.data \|\| \(now - cache\.ts\) > TTL_MS\) \{[\s\S]*?\}\s*return res\.json\(\{ ok: true, bancos: cache\.data, total: cache\.data\.length, cached: true \}\);/;

  const delegatedBlock = [
    'const result = await listBancosCore({ now: Date.now() });',
    'return res.json({ ok: true, bancos: result.bancos, total: result.total, cached: true });',
  ].join(' ');

  const replaced = original.replace(currentCorePattern, delegatedBlock);
  assert.notEqual(replaced, original, 'Nao foi possivel instalar a seam estrutural de listarBancos em memoria.');
  return replaced;
}

function createResCapture() {
  return {
    body: undefined,
    json(payload) {
      this.body = JSON.parse(JSON.stringify(payload));
      return this;
    },
  };
}

function loadOwner(dependencies = {}) {
  const functionSource = extractExportedAsyncFunction(CONTROLLER_SOURCE, 'listarBancos');
  const executableSource = `${functionSource.replace('export async function', 'async function')}\nmodule.exports = { listarBancos };`;
  const sandbox = {
    module: { exports: {} },
    exports: {},
    listBancosCore: dependencies.listBancosCore,
    readFile: dependencies.readFile,
    BANCOS_FILE: dependencies.BANCOS_FILE,
    cache: dependencies.cache,
    TTL_MS: dependencies.TTL_MS,
    normalizarBanco: dependencies.normalizarBanco,
    Date: dependencies.Date,
    JSON,
    console: dependencies.console || console,
  };

  vm.runInNewContext(executableSource, sandbox, { filename: CONTROLLER_PATH });
  return sandbox.module.exports.listarBancos;
}

function loadDelegatedOwner(dependencies = {}) {
  const functionSource = buildDelegatedOwnerSource();
  const executableSource = `${functionSource.replace('export async function', 'async function')}\nmodule.exports = { listarBancos };`;
  const sandbox = {
    module: { exports: {} },
    exports: {},
    listBancosCore: dependencies.listBancosCore,
    Date: dependencies.Date,
  };

  vm.runInNewContext(executableSource, sandbox, { filename: CONTROLLER_PATH });
  return sandbox.module.exports.listarBancos;
}

test('listarBancos: owner real ainda preserva resposta HTTP final e tratamento de erro via next', () => {
  const ownerSource = stripComments(extractExportedAsyncFunction(CONTROLLER_SOURCE, 'listarBancos'));

  assert.match(ownerSource, /return\s+res\.json\s*\(\s*\{\s*ok:\s*true\s*,/);
  assert.match(ownerSource, /catch\s*\(\s*err\s*\)\s*\{\s*next\(err\);\s*\}/);
});

test('listarBancos: seam estrutural futura recebe apenas o nucleo canonizado de leitura e preserva ordem owner -> seam -> HTTP', async () => {
  const callOrder = [];
  const seamCalls = [];
  const res = createResCapture();

  const listarBancos = loadDelegatedOwner({
    listBancosCore: async (args) => {
      callOrder.push('seam');
      seamCalls.push({ now: args.now });
      return {
        bancos: [{ codigo: '001', nome: 'Banco A' }],
        total: 1,
      };
    },
    Date: { now: () => 987654 },
  });

  await listarBancos({}, {
    json(payload) {
      callOrder.push('json');
      return res.json(payload);
    },
  }, () => {
    callOrder.push('next');
  });

  assert.deepEqual(callOrder, ['seam', 'json']);
  assert.deepEqual(seamCalls, [{ now: 987654 }]);
  assert.deepEqual(res.body, {
    ok: true,
    bancos: [{ codigo: '001', nome: 'Banco A' }],
    total: 1,
    cached: true,
  });
});

test('listarBancos: owner com seam estrutural futura encaminha erro externo para next', async () => {
  const callOrder = [];
  const boom = new Error('list exploded');
  let nextError = null;

  const listarBancos = loadDelegatedOwner({
    listBancosCore: async () => {
      callOrder.push('seam');
      throw boom;
    },
    Date: { now: () => 123 },
  });

  await listarBancos({}, {
    json() {
      callOrder.push('json');
    },
  }, (error) => {
    callOrder.push('next');
    nextError = error;
  });

  assert.deepEqual(callOrder, ['seam', 'next']);
  assert.equal(nextError, boom);
});

test('listarBancos: a seam estrutural futura larga do owner leitura do arquivo, parse fallback, cache TTL e normalizacao', () => {
  const delegatedSource = stripComments(buildDelegatedOwnerSource());

  assert.match(delegatedSource, /await\s+listBancosCore\s*\(\s*\{\s*now:\s*Date\.now\(\)\s*\}\s*\)/);
  assert.match(delegatedSource, /return\s+res\.json\s*\(\s*\{\s*ok:\s*true\s*,\s*bancos:\s*result\.bancos\s*,\s*total:\s*result\.total\s*,\s*cached:\s*true\s*\}\s*\)/);
  assert.match(delegatedSource, /catch\s*\(\s*err\s*\)\s*\{\s*next\(err\);\s*\}/);

  assert.doesNotMatch(delegatedSource, /readFile\s*\(/);
  assert.doesNotMatch(delegatedSource, /JSON\.parse\s*\(/);
  assert.doesNotMatch(delegatedSource, /normalizarBanco\s*\(/);
  assert.doesNotMatch(delegatedSource, /cache\.data/);
  assert.doesNotMatch(delegatedSource, /TTL_MS/);
});

test('listarBancos: owner real atual ainda executa o caminho feliz sem romper o contrato atual', async () => {
  const callOrder = [];
  const res = createResCapture();

  const listarBancos = loadOwner({
    listBancosCore: async ({ now }) => {
      callOrder.push('seam');
      assert.equal(now, 5000);
      return {
        bancos: [
          { codigo: '001', nome: 'Banco A' },
          { codigo: '045', nome: 'Banco B' },
        ],
        total: 2,
      };
    },
    Date: { now: () => 5000 },
  });

  await listarBancos({}, {
    json(payload) {
      callOrder.push('json');
      return res.json(payload);
    },
  }, () => {
    callOrder.push('next');
  });

  assert.deepEqual(callOrder, ['seam', 'json']);
  assert.deepEqual(res.body, {
    ok: true,
    bancos: [
      { codigo: '001', nome: 'Banco A' },
      { codigo: '045', nome: 'Banco B' },
    ],
    total: 2,
    cached: true,
  });
});