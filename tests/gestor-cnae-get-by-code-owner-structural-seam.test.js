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
  const original = extractExportedFunction(CONTROLLER_SOURCE, 'obterCnae');
  if (original.includes('getCnaeByCodeCore(')) {
    return original;
  }

  const currentCorePattern = /const all = loadCnaesFile\(\); const codeReq = String\(req\.params\.codigo\)\.toLowerCase\(\); const found = all\.find\(c => String\(c\.codigo \|\| c\.cod \|\| ''\)\.toLowerCase\(\) === codeReq\); if \(!found\) return notFound\(res, 'CNAE não encontrado'\); return ok\(res, found\);/;

  const delegatedBlock = [
    'const codeReq = String(req.params.codigo).toLowerCase();',
    'const found = getCnaeByCodeCore({ codeReq });',
    "if (!found) return notFound(res, 'CNAE não encontrado');",
    'return ok(res, found);',
  ].join(' ');

  const replaced = original.replace(currentCorePattern, delegatedBlock);
  assert.notEqual(replaced, original, 'Nao foi possivel instalar a seam estrutural de obterCnae em memoria.');
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
  const functionSource = extractExportedFunction(CONTROLLER_SOURCE, 'obterCnae');
  const executableSource = `${functionSource.replace('export function', 'function')}\nmodule.exports = { obterCnae };`;
  const sandbox = {
    module: { exports: {} },
    exports: {},
    getCnaeByCodeCore: dependencies.getCnaeByCodeCore,
    ok: dependencies.ok,
    notFound: dependencies.notFound,
    serverError: dependencies.serverError,
    String,
  };

  vm.runInNewContext(executableSource, sandbox, { filename: CONTROLLER_PATH });
  return sandbox.module.exports.obterCnae;
}

function loadDelegatedOwner(dependencies = {}) {
  const functionSource = buildDelegatedOwnerSource();
  const executableSource = `${functionSource.replace('export function', 'function')}\nmodule.exports = { obterCnae };`;
  const sandbox = {
    module: { exports: {} },
    exports: {},
    getCnaeByCodeCore: dependencies.getCnaeByCodeCore,
    ok: dependencies.ok,
    notFound: dependencies.notFound,
    serverError: dependencies.serverError,
    String,
  };

  vm.runInNewContext(executableSource, sandbox, { filename: CONTROLLER_PATH });
  return sandbox.module.exports.obterCnae;
}

test('obterCnae: owner real ainda preserva leitura de req.params.codigo, 404, resposta HTTP final e 500', () => {
  const ownerSource = stripComments(extractExportedFunction(CONTROLLER_SOURCE, 'obterCnae'));

  assert.match(ownerSource, /String\(req\.params\.codigo\)\.toLowerCase\(\)/);
  assert.match(ownerSource, /if\s*\(!found\)\s*return\s+notFound\s*\(\s*res\s*,\s*'CNAE não encontrado'\s*\)/);
  assert.match(ownerSource, /return\s+ok\s*\(\s*res\s*,\s*found\s*\)/);
  assert.match(ownerSource, /return\s+serverError\s*\(\s*res\s*,\s*err\s*\)/);
});

test('obterCnae: seam estrutural futura recebe apenas o nucleo minimo de leitura por codigo e preserva ordem owner -> seam -> HTTP', () => {
  const callOrder = [];
  const seamCalls = [];

  const obterCnae = loadDelegatedOwner({
    getCnaeByCodeCore(args) {
      callOrder.push('seam');
      seamCalls.push({ codeReq: args.codeReq });
      return { codigo: '0111-3/01', descricao: 'Cultivo de cereais' };
    },
    ok(_res, payload) {
      callOrder.push('ok');
      return { kind: 'ok', payload };
    },
    notFound() {
      callOrder.push('notFound');
    },
    serverError() {
      callOrder.push('serverError');
    },
  });

  const result = obterCnae({ params: { codigo: '0111-3/01' } }, makeRes());

  assert.deepEqual(callOrder, ['seam', 'ok']);
  assert.deepEqual(seamCalls, [{ codeReq: '0111-3/01' }]);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    kind: 'ok',
    payload: { codigo: '0111-3/01', descricao: 'Cultivo de cereais' },
  });
});

test('obterCnae: owner com seam estrutural futura traduz lookup vazio para 404', () => {
  const callOrder = [];

  const obterCnae = loadDelegatedOwner({
    getCnaeByCodeCore() {
      callOrder.push('seam');
      return null;
    },
    ok() {
      callOrder.push('ok');
    },
    notFound(_res, message) {
      callOrder.push(`notFound:${message}`);
      return { kind: 'notFound', message };
    },
    serverError() {
      callOrder.push('serverError');
    },
  });

  const result = obterCnae({ params: { codigo: '0000-0/00' } }, makeRes());

  assert.deepEqual(callOrder, ['seam', 'notFound:CNAE não encontrado']);
  assert.deepEqual(result, { kind: 'notFound', message: 'CNAE não encontrado' });
});

test('obterCnae: owner com seam estrutural futura traduz erro externo da leitura por codigo para 500', () => {
  const callOrder = [];
  const boom = new Error('lookup exploded');

  const obterCnae = loadDelegatedOwner({
    getCnaeByCodeCore() {
      callOrder.push('seam');
      throw boom;
    },
    ok() {
      callOrder.push('ok');
    },
    notFound() {
      callOrder.push('notFound');
    },
    serverError(_res, error) {
      callOrder.push('serverError');
      return { kind: 'serverError', error };
    },
  });

  const result = obterCnae({ params: { codigo: '0111-3/01' } }, makeRes());

  assert.deepEqual(callOrder, ['seam', 'serverError']);
  assert.equal(result?.kind, 'serverError');
  assert.equal(result?.error, boom);
});

test('obterCnae: a seam estrutural futura larga do owner leitura/cache da base CNAE e lookup por codigo', () => {
  const delegatedSource = stripComments(buildDelegatedOwnerSource());

  assert.match(delegatedSource, /String\(req\.params\.codigo\)\.toLowerCase\(\)/);
  assert.match(delegatedSource, /getCnaeByCodeCore\s*\(\s*\{\s*codeReq\s*\}\s*\)/);
  assert.match(delegatedSource, /if\s*\(!found\)\s*return\s+notFound\s*\(\s*res\s*,\s*'CNAE não encontrado'\s*\)/);
  assert.match(delegatedSource, /return\s+ok\s*\(\s*res\s*,\s*found\s*\)/);
  assert.match(delegatedSource, /return\s+serverError\s*\(\s*res\s*,\s*err\s*\)/);

  assert.doesNotMatch(delegatedSource, /loadCnaesFile\s*\(\s*\)/);
  assert.doesNotMatch(delegatedSource, /\.find\s*\(/);
});

test('obterCnae: owner real atual ainda executa o caminho feliz sem romper o contrato atual', () => {
  const callOrder = [];
  const obterCnae = loadOwner({
    getCnaeByCodeCore(args) {
      callOrder.push('core');
      assert.equal(args.codeReq, '0111-3/01');
      return { codigo: '0111-3/01', descricao: 'Cultivo de cereais' };
    },
    ok(_res, payload) {
      callOrder.push('ok');
      return { kind: 'ok', payload };
    },
    notFound() {
      callOrder.push('notFound');
    },
    serverError() {
      callOrder.push('serverError');
    },
  });

  const result = obterCnae({ params: { codigo: '0111-3/01' } }, makeRes());

  assert.deepEqual(callOrder, ['core', 'ok']);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    kind: 'ok',
    payload: { codigo: '0111-3/01', descricao: 'Cultivo de cereais' },
  });
});