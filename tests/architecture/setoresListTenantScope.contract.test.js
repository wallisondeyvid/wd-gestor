import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const PROJECT_ROOT = process.cwd();
const REPOSITORY_PATH = path.join(
  PROJECT_ROOT,
  'src/modules/gestor/app/repositories/SetorReadRepository.js',
);
const API_DB_PATH = path.join(
  PROJECT_ROOT,
  'src/modules/gestor/app/db/api.db.js',
);
const CORE_PATH = path.join(
  PROJECT_ROOT,
  'src/modules/gestor/app/controllers/utils/listSetoresCore.js',
);
const CONTROLLER_PATH = path.join(
  PROJECT_ROOT,
  'src/modules/gestor/app/controllers/setorApiController.js',
);
const UNIT_SCOPE_PATH = path.join(PROJECT_ROOT, 'src/shared/unitScope.js');
const BASE_REPOSITORY_PATH = path.join(
  PROJECT_ROOT,
  'src/shared/repositories/BaseRepository.js',
);

const REPOSITORY_SOURCE = fs.readFileSync(REPOSITORY_PATH, 'utf8');
const API_DB_SOURCE = fs.readFileSync(API_DB_PATH, 'utf8');
const CORE_SOURCE = fs.readFileSync(CORE_PATH, 'utf8');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');
const UNIT_SCOPE_SOURCE = fs.readFileSync(UNIT_SCOPE_PATH, 'utf8');
const BASE_REPOSITORY_SOURCE = fs.readFileSync(BASE_REPOSITORY_PATH, 'utf8');

function extractFunctionBlock(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `Nao encontrou assinatura: ${signature}`);

  const paramsEnd = source.indexOf(')', start);
  assert.ok(paramsEnd >= 0, `Nao encontrou fechamento de parametros para: ${signature}`);

  const braceStart = source.indexOf('{', paramsEnd);
  assert.ok(braceStart >= 0, `Nao encontrou bloco da assinatura: ${signature}`);

  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`Nao conseguiu extrair funcao: ${signature}`);
}

function buildFunction(source, signature, context = {}) {
  const functionSource = extractFunctionBlock(source, signature).replace(/^export\s+/, '');
  const script = new vm.Script(`(${functionSource})`);
  return script.runInNewContext(context);
}

function createGlobalScope() {
  return {
    type: 'global',
    unidadeId: null,
  };
}

function createScopedUnitIdExtractor() {
  return (input) => {
    if (input && typeof input === 'object' && !Array.isArray(input)) {
      const inValues = Array.isArray(input.$in)
        ? input.$in.map((value) => String(value || '').trim()).filter(Boolean)
        : [];
      return inValues.length === 1 ? inValues[0] : '';
    }

    if (Array.isArray(input)) {
      const values = input.map((value) => String(value || '').trim()).filter(Boolean);
      return values.length === 1 ? values[0] : '';
    }

    return String(input || '').trim();
  };
}

function assertSourceDoesNotContain(source, patterns, label) {
  for (const pattern of patterns) {
    assert.doesNotMatch(source, pattern, `${label} nao deve conter ${pattern}`);
  }
}

function toPlainJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function extractListOwnerSnippet(source) {
  const start = source.indexOf('function normalizeUnitId(');
  const end = source.indexOf('export async function deleteSetor', start);

  assert.ok(start >= 0, 'Nao foi possivel localizar o inicio do recorte de listarSetores.');
  assert.ok(end > start, 'Nao foi possivel localizar o fim do recorte de listarSetores.');

  return source
    .slice(start, end)
    .replace(/export\s+async\s+function\s+/g, 'async function ');
}

function loadListOwnerHarness(runtimeOverrides = {}) {
  const snippet = extractListOwnerSnippet(CONTROLLER_SOURCE);
  const calls = {
    seamCalls: [],
    consoleErrors: [],
  };

  const deps = {
    ok: runtimeOverrides.ok ?? ((res, payload) => {
      res.statusCode = 200;
      res.body = { success: true, data: payload };
      return res;
    }),
    serverError: runtimeOverrides.serverError ?? ((res, error) => {
      res.statusCode = 500;
      res.body = { success: false, message: error?.message || 'Erro interno' };
      return res;
    }),
    listSetoresCore: runtimeOverrides.listSetoresCore ?? (async (input) => {
      calls.seamCalls.push(input);
      return [];
    }),
    findSetoresByFiltroPopulateUnidadeLean:
      runtimeOverrides.findSetoresByFiltroPopulateUnidadeLean ?? (async () => []),
    findUnidadesByIdsNomeCodigoLean:
      runtimeOverrides.findUnidadesByIdsNomeCodigoLean ?? (async () => []),
    console: runtimeOverrides.console ?? {
      error(...args) {
        calls.consoleErrors.push(args);
      },
      log() {},
      warn() {},
    },
  };

  const factoryScript = new vm.Script(`(function (__deps) {
const ok = __deps.ok;
const serverError = __deps.serverError;
const listSetoresCore = __deps.listSetoresCore;
const findSetoresByFiltroPopulateUnidadeLean = __deps.findSetoresByFiltroPopulateUnidadeLean;
const findUnidadesByIdsNomeCodigoLean = __deps.findUnidadesByIdsNomeCodigoLean;
const console = __deps.console;
${snippet}
return { listarSetores };
})`);

  const factory = factoryScript.runInNewContext({});
  return {
    ...factory(deps),
    calls,
  };
}

test('SetorReadRepository congela apenas o helper de listagem geral com resolveModel e unitScope explicito sem forcar BaseRepository', () => {
  const helperBlock = extractFunctionBlock(
    REPOSITORY_SOURCE,
    'export async function findSetoresByFiltroPopulateUnidadeLeanRepo({ unitScope, filtro })',
  );

  assert.match(helperBlock, /resolveModel\s*\(/);
  assert.match(helperBlock, /name:\s*Setor\.modelName\s*\|\|\s*'Setor'/);
  assert.match(helperBlock, /schema:\s*Setor\.schema/);
  assert.match(helperBlock, /unitScope/);
  assert.match(helperBlock, /SetorModel\.find\(filtro\)/);
  assert.match(helperBlock, /\.select\('nome descricao unidade_id'\)/);
  assert.match(helperBlock, /\.populate\(\{ path:\s*'unidade_id', select:\s*'nome codigo' \}\)/);
  assert.match(helperBlock, /\.lean\(\)/);

  assert.match(REPOSITORY_SOURCE, /export async function findSetoresByUnidadeIdPopulateLeanRepo/);
  assert.match(REPOSITORY_SOURCE, /export async function findSetoresAtivosPopulateUnidadeOrdenadosLeanRepo/);

  assertSourceDoesNotContain(
    helperBlock,
    [
      /getSetoresByUnitCore/,
      /counter/i,
      /createSetorRepo/,
      /findSetorByIdAndDeleteRepo/,
      /findOneAndUpdateCounterSetorCodigoRepo/,
      /Feedback/i,
      /Funcionario/i,
      /UserMembership/i,
      /UserRepository/i,
      /widget/i,
      /bundle/i,
      /pagina/i,
    ],
    'findSetoresByFiltroPopulateUnidadeLeanRepo',
  );

  assert.match(BASE_REPOSITORY_SOURCE, /assertTenantScope\s*\(/);
  assert.doesNotMatch(REPOSITORY_SOURCE, /class\s+SetorReadRepository\s+extends\s+BaseRepository/);
});

test('api.db.findSetoresByFiltroPopulateUnidadeLean permanece bridge pequena e congela o comportamento real de scopeFromSetorFiltro', async () => {
  const scopeBlock = extractFunctionBlock(API_DB_SOURCE, 'function scopeFromSetorFiltro(filtro)');
  const bridgeBlock = extractFunctionBlock(
    API_DB_SOURCE,
    'export async function findSetoresByFiltroPopulateUnidadeLean(filtro)',
  );

  assert.match(scopeBlock, /extractSingleScopedUnitId\(filtro\?\.unidade_id\)/);
  assert.match(scopeBlock, /scopeFromUnidadeId\(unidadeId\)/);
  assert.match(scopeBlock, /GLOBAL_SCOPE/);
  assert.match(bridgeBlock, /findSetoresByFiltroPopulateUnidadeLeanRepo/);
  assert.match(bridgeBlock, /scopeFromSetorFiltro\(filtro\)/);

  assertSourceDoesNotContain(
    bridgeBlock,
    [
      /getSetoresByUnitCore/,
      /page bundle/i,
      /counter/i,
      /createSetor/i,
      /deleteSetor/i,
      /updateSetor/i,
      /Feedback/i,
      /Funcionario/i,
      /UserMembership/i,
      /Portal/i,
    ],
    'api.db.findSetoresByFiltroPopulateUnidadeLean',
  );

  const scopeFromSetorFiltro = buildFunction(API_DB_SOURCE, 'function scopeFromSetorFiltro(filtro)', {
    GLOBAL_SCOPE: createGlobalScope(),
    extractSingleScopedUnitId: createScopedUnitIdExtractor(),
    scopeFromUnidadeId: (unidadeId) => ({ type: 'unit', unidadeId: String(unidadeId) }),
  });

  const calls = [];
  const findSetoresByFiltroPopulateUnidadeLean = buildFunction(
    API_DB_SOURCE,
    'export async function findSetoresByFiltroPopulateUnidadeLean(filtro)',
    {
      scopeFromSetorFiltro,
      findSetoresByFiltroPopulateUnidadeLeanRepo: async (args) => {
        calls.push(args);
        return [];
      },
    },
  );

  await findSetoresByFiltroPopulateUnidadeLean({ unidade_id: '507f191e810c19729de860ea' });
  await findSetoresByFiltroPopulateUnidadeLean({ unidade_id: { $in: ['507f191e810c19729de860eb'] } });
  await findSetoresByFiltroPopulateUnidadeLean({ unidade_id: { $in: ['507f191e810c19729de860ec', '507f191e810c19729de860ed'] } });
  await findSetoresByFiltroPopulateUnidadeLean({ descricao: /financeiro/i });

  assert.deepEqual(toPlainJson(calls), [
    {
      unitScope: { type: 'unit', unidadeId: '507f191e810c19729de860ea' },
      filtro: { unidade_id: '507f191e810c19729de860ea' },
    },
    {
      unitScope: { type: 'unit', unidadeId: '507f191e810c19729de860eb' },
      filtro: { unidade_id: { $in: ['507f191e810c19729de860eb'] } },
    },
    {
      unitScope: { type: 'global', unidadeId: null },
      filtro: { unidade_id: { $in: ['507f191e810c19729de860ec', '507f191e810c19729de860ed'] } },
    },
    {
      unitScope: { type: 'global', unidadeId: null },
      filtro: { descricao: {} },
    },
  ]);

  assert.match(UNIT_SCOPE_SOURCE, /export function createUnitScope\(\{ unidadeId }\)/);
  assert.doesNotMatch(bridgeBlock, /createUnitScope\(/);
});

test('listSetoresCore permanece core fino e usa lookup auxiliar de Unidades por ids apenas quando o populate nao vem resolvido', async () => {
  const coreBlock = extractFunctionBlock(CORE_SOURCE, 'export async function listSetoresCore({');

  assert.match(coreBlock, /findSetoresByFiltroPopulateUnidadeLean\(filtro\)/);
  assert.match(coreBlock, /findUnidadesByIdsNomeCodigoLean\(Array\.from\(unidadeIdsRaw\),\s*\{[\s\S]*?scopedUnitId[\s\S]*?}\s*\)/);
  assert.match(coreBlock, /return setores\.map/);

  assertSourceDoesNotContain(
    coreBlock,
    [
      /getSetoresByUnitCore/,
      /loadPagina/i,
      /counter/i,
      /create/i,
      /delete/i,
      /update/i,
      /Feedback/i,
      /Funcionario/i,
      /UserMembership/i,
      /tenant registry/i,
      /createServer/i,
      /start\.js/i,
      /server\.js/i,
      /bootstrap/i,
    ],
    'listSetoresCore',
  );

  const listSetoresCore = buildFunction(CORE_SOURCE, 'export async function listSetoresCore({');

  const populated = await listSetoresCore({
    filtro: { unidade_id: 'u-contexto' },
    scopedUnitId: 'u-contexto',
    findSetoresByFiltroPopulateUnidadeLean: async () => [
      {
        _id: 's-1',
        nome: 'Financeiro',
        descricao: 'Backoffice',
        unidade_id: { _id: 'u-contexto', codigo: '001', nome: 'Matriz' },
      },
    ],
    findUnidadesByIdsNomeCodigoLean: async () => {
      throw new Error('nao deve fazer lookup auxiliar quando populate ja veio resolvido');
    },
  });

  assert.deepEqual(toPlainJson(populated), [
    {
      _id: 's-1',
      nome: 'Financeiro',
      descricao: 'Backoffice',
      unidade_id: { _id: 'u-contexto', codigo: '001', nome: 'Matriz' },
      unidade_nome: '001 - Matriz',
      unidade_label: '001 - Matriz',
      unidade_id_raw: 'u-contexto',
    },
  ]);

  const lookupCalls = [];
  const fallback = await listSetoresCore({
    filtro: { unidade_id: 'u-contexto' },
    scopedUnitId: 'u-contexto',
    findSetoresByFiltroPopulateUnidadeLean: async () => [
      {
        _id: 's-2',
        nome: 'RH',
        descricao: '',
        unidade_id: 'u-contexto',
      },
    ],
    findUnidadesByIdsNomeCodigoLean: async (unidadeIds, options) => {
      lookupCalls.push({ unidadeIds, options });
      return [{ _id: 'u-contexto', codigo: '001', nome: 'Matriz' }];
    },
  });

  assert.deepEqual(toPlainJson(lookupCalls), [
    {
      unidadeIds: ['u-contexto'],
      options: { scopedUnitId: 'u-contexto' },
    },
  ]);
  assert.deepEqual(toPlainJson(fallback), [
    {
      _id: 's-2',
      nome: 'RH',
      descricao: '',
      unidade_id: 'u-contexto',
      unidade_nome: '001 - Matriz',
      unidade_label: '001 - Matriz',
      unidade_id_raw: 'u-contexto',
    },
  ]);
});

test('listarSetores permanece owner fino e delega ao core com dependencias minimas sem reabrir getSetoresByUnitCore', async () => {
  const listarSetoresBlock = extractFunctionBlock(
    CONTROLLER_SOURCE,
    'export async function listarSetores(req,res)',
  );

  assert.match(listarSetoresBlock, /resolveListSetoresScope\(req\)/);
  assert.match(listarSetoresBlock, /listSetoresCore\(\{/);
  assert.match(listarSetoresBlock, /findSetoresByFiltroPopulateUnidadeLean/);
  assert.match(listarSetoresBlock, /findUnidadesByIdsNomeCodigoLean/);
  assert.doesNotMatch(listarSetoresBlock, /getSetoresByUnitCore/);

  const { listarSetores, calls } = loadListOwnerHarness({
    listSetoresCore: async (input) => {
      calls.seamCalls.push(input);
      return [{ _id: 's-1', nome: 'Financeiro' }];
    },
  });

  const req = {
    user: { role: 'diretor', isMaster: false },
    unitScope: { unidadeId: 'u-contexto' },
    query: { unidade_id: 'u-query' },
  };
  const res = { statusCode: 200, body: null };

  await listarSetores(req, res);

  assert.equal(calls.seamCalls.length, 1);
  assert.deepEqual(toPlainJson(calls.seamCalls[0]), {
    filtro: { unidade_id: 'u-contexto' },
    scopedUnitId: 'u-contexto',
  });
  assert.equal(typeof calls.seamCalls[0].findSetoresByFiltroPopulateUnidadeLean, 'function');
  assert.equal(typeof calls.seamCalls[0].findUnidadesByIdsNomeCodigoLean, 'function');
  assert.equal('req' in calls.seamCalls[0], false);
  assert.equal('res' in calls.seamCalls[0], false);
  assert.deepEqual(toPlainJson(res.body), {
    success: true,
    data: [{ _id: 's-1', nome: 'Financeiro' }],
  });
});

test('o corredor protegido nao depende de tenant registry, harness sintetico, app server, rotas, scripts, jobs ou bootstrap e nao reabre dominios proibidos', () => {
  const protectedSlice = [
    extractFunctionBlock(
      REPOSITORY_SOURCE,
      'export async function findSetoresByFiltroPopulateUnidadeLeanRepo({ unitScope, filtro })',
    ),
    extractFunctionBlock(
      API_DB_SOURCE,
      'export async function findSetoresByFiltroPopulateUnidadeLean(filtro)',
    ),
    extractFunctionBlock(CORE_SOURCE, 'export async function listSetoresCore({'),
    extractFunctionBlock(CONTROLLER_SOURCE, 'export async function listarSetores(req,res)'),
  ].join('\n');

  assertSourceDoesNotContain(
    protectedSlice,
    [
      /unitDatabaseRegistry/i,
      /tenant registry/i,
      /withHarness/i,
      /createServer/i,
      /start\.js/i,
      /server\.js/i,
      /createServer\.js/i,
      /#routes\//i,
      /scripts\//i,
      /\bcli\b/i,
      /\bjob\b/i,
      /bootstrap/i,
      /Portal/i,
      /getSetoresByUnitCore/,
      /loadPagina/i,
      /counter/i,
      /createSetor/i,
      /deleteSetor/i,
      /updateSetor/i,
      /Feedback/i,
      /Funcionario/i,
      /UserMembership/i,
    ],
    'corredor protegido de listagem geral de setores',
  );
});