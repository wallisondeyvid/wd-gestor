import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/cnaeApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

function extractExportedFunction(source, functionName) {
  const signature = `export function ${functionName}`;
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
  const original = extractExportedFunction(CONTROLLER_SOURCE, 'listarCnaes');
  if (original.includes('listCnaesCore(')) {
    return original;
  }

  const currentCorePattern = /const all = loadCnaesFile\(\); const \{ page = '1', limit = '100', search = '', natureza = '' \} = req\.query; let p = parseInt\(page, 10\); if \(isNaN\(p\) \|\| p < 1\) p = 1; let l = parseInt\(limit, 10\); if \(isNaN\(l\) \|\| l < 1\) l = 100; if \(l > 300\) l = 300; const s = String\(search \|\| ''\)\.trim\(\)\.toLowerCase\(\); const nat = String\(natureza \|\| ''\)\.trim\(\); const fil = all\.filter\(c => \{[\s\S]*?\}\); const total = fil\.length; const start = \(p - 1\) \* l; const items = fil\.slice\(start, start \+ l\); return ok\(res, items, \{ page:p, limit:l, total, pages: Math\.ceil\(total \/ l\) \}\);/;

  const delegatedBlock = [
    "const { page = '1', limit = '100', search = '', natureza = '' } = req.query;",
    'const result = listCnaesCore({',
    '  page,',
    '  limit,',
    '  search,',
    '  natureza,',
    '  loadCnaesFile,',
    '});',
    'return ok(res, result.items, result.meta);',
  ].join(' ');

  const replaced = original.replace(currentCorePattern, delegatedBlock);
  assert.notEqual(replaced, original, 'Nao foi possivel instalar a seam estrutural de listarCnaes em memoria.');
  return replaced;
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

function loadOwner(dependencies = {}) {
  const functionSource = extractExportedFunction(CONTROLLER_SOURCE, 'listarCnaes');
  const executableSource = `${functionSource.replace('export function', 'function')}\nmodule.exports = { listarCnaes };`;
  const sandbox = {
    module: { exports: {} },
    exports: {},
    listCnaesCore: dependencies.listCnaesCore,
    ok: dependencies.ok,
    serverError: dependencies.serverError,
    parseInt,
    String,
    Array,
    Math,
    isNaN,
  };

  vm.runInNewContext(executableSource, sandbox, { filename: CONTROLLER_PATH });
  return sandbox.module.exports.listarCnaes;
}

function loadDelegatedOwner(dependencies = {}) {
  const functionSource = buildDelegatedOwnerSource();
  const executableSource = `${functionSource.replace('export function', 'function')}\nmodule.exports = { listarCnaes };`;
  const sandbox = {
    module: { exports: {} },
    exports: {},
    listCnaesCore: dependencies.listCnaesCore,
    loadCnaesFile: dependencies.loadCnaesFile,
    ok: dependencies.ok,
    serverError: dependencies.serverError,
  };

  vm.runInNewContext(executableSource, sandbox, { filename: CONTROLLER_PATH });
  return sandbox.module.exports.listarCnaes;
}

test('listarCnaes: owner real ainda preserva leitura de query, resposta HTTP final e 500', () => {
  const ownerSource = stripComments(extractExportedFunction(CONTROLLER_SOURCE, 'listarCnaes'));

  assert.match(ownerSource, /const\s+\{\s*page\s*=\s*'1'\s*,\s*limit\s*=\s*'100'\s*,\s*search\s*=\s*''\s*,\s*natureza\s*=\s*''\s*\}\s*=\s*req\.query/);
  assert.match(ownerSource, /return\s+ok\s*\(\s*res\s*,/);
  assert.match(ownerSource, /return\s+serverError\s*\(\s*res\s*,\s*err\s*\)/);
});

test('listarCnaes: seam estrutural futura recebe apenas o nucleo canonizado de listagem e preserva ordem owner -> seam -> HTTP', () => {
  const callOrder = [];
  const seamCalls = [];
  const okCalls = [];

  const listarCnaes = loadDelegatedOwner({
    listCnaesCore(args) {
      callOrder.push('seam');
      seamCalls.push({
        page: args.page,
        limit: args.limit,
        search: args.search,
        natureza: args.natureza,
      });
      return {
        items: [{ codigo: '0111-3/01' }],
        meta: { page: 2, limit: 5, total: 11, pages: 3 },
      };
    },
    ok(_res, data, meta) {
      callOrder.push('ok');
      okCalls.push({ data: JSON.parse(JSON.stringify(data)), meta: JSON.parse(JSON.stringify(meta)) });
      return { kind: 'ok', data, meta };
    },
    serverError() {
      callOrder.push('serverError');
    },
  });

  const req = { query: { page: '2', limit: '5', search: ' cereais ', natureza: '1234' } };
  const result = listarCnaes(req, makeRes());

  assert.deepEqual(callOrder, ['seam', 'ok']);
  assert.deepEqual(seamCalls, [{
    page: '2',
    limit: '5',
    search: ' cereais ',
    natureza: '1234',
  }]);
  assert.deepEqual(okCalls, [{
    data: [{ codigo: '0111-3/01' }],
    meta: { page: 2, limit: 5, total: 11, pages: 3 },
  }]);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    kind: 'ok',
    data: [{ codigo: '0111-3/01' }],
    meta: { page: 2, limit: 5, total: 11, pages: 3 },
  });
});

test('listarCnaes: owner com seam estrutural futura traduz erro externo da listagem para 500', () => {
  const callOrder = [];
  const boom = new Error('list exploded');

  const listarCnaes = loadDelegatedOwner({
    listCnaesCore() {
      callOrder.push('seam');
      throw boom;
    },
    loadCnaesFile() {
      throw new Error('nao deveria executar');
    },
    ok() {
      callOrder.push('ok');
    },
    serverError(_res, error) {
      callOrder.push('serverError');
      return { kind: 'serverError', error };
    },
  });

  const result = listarCnaes({ query: {} }, makeRes());

  assert.deepEqual(callOrder, ['seam', 'serverError']);
  assert.equal(result?.kind, 'serverError');
  assert.equal(result?.error, boom);
});

test('listarCnaes: a seam estrutural futura larga do owner leitura/cache, filtro, paginacao e payload de listagem', () => {
  const delegatedSource = stripComments(buildDelegatedOwnerSource());

  assert.match(delegatedSource, /const\s+\{\s*page\s*=\s*'1'\s*,\s*limit\s*=\s*'100'\s*,\s*search\s*=\s*''\s*,\s*natureza\s*=\s*''\s*\}\s*=\s*req\.query/);
  assert.match(delegatedSource, /listCnaesCore\s*\(\s*\{/);
  assert.match(delegatedSource, /return\s+ok\s*\(\s*res\s*,\s*result\.items\s*,\s*result\.meta\s*\)/);
  assert.match(delegatedSource, /return\s+serverError\s*\(\s*res\s*,\s*err\s*\)/);

  assert.doesNotMatch(delegatedSource, /loadCnaesFile\s*\(\s*\)/);
  assert.doesNotMatch(delegatedSource, /\.filter\s*\(/);
  assert.doesNotMatch(delegatedSource, /\.slice\s*\(/);
  assert.doesNotMatch(delegatedSource, /Math\.ceil\s*\(/);
});

test('listarCnaes: owner real atual ainda executa o caminho feliz sem romper o contrato atual', () => {
  const callOrder = [];
  const listarCnaes = loadOwner({
    listCnaesCore(args) {
      callOrder.push('core');
      return {
        items: [{ codigo: '0111-3/01', descricao: 'Cultivo de cereais', naturezas_juridicas: ['1234'] }],
        meta: { page: 1, limit: 1, total: 1, pages: 1 },
      };
    },
    ok(_res, data, meta) {
      callOrder.push('ok');
      return { kind: 'ok', data, meta };
    },
    serverError() {
      callOrder.push('serverError');
    },
  });

  const result = listarCnaes({ query: { page: '1', limit: '1', search: 'cereais', natureza: '1234' } }, makeRes());

  assert.deepEqual(callOrder, ['core', 'ok']);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    kind: 'ok',
    data: [{ codigo: '0111-3/01', descricao: 'Cultivo de cereais', naturezas_juridicas: ['1234'] }],
    meta: { page: 1, limit: 1, total: 1, pages: 1 },
  });
});