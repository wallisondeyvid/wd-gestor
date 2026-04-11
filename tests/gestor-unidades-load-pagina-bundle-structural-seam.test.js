import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const SERVICE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/services/unidades/loadPaginaUnidadesBundle.service.js');
const SERVICE_SOURCE = fs.readFileSync(SERVICE_PATH, 'utf8');

function extractFunction(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `Nao encontrou assinatura: ${signature}`);

  const paramsEnd = source.indexOf(')', start);
  assert.ok(paramsEnd >= 0, `Nao encontrou fechamento de parametros para: ${signature}`);

  const braceStart = source.indexOf('{', paramsEnd);
  assert.ok(braceStart >= 0, `Nao encontrou bloco para: ${signature}`);

  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1).replace(/^export\s+/, '');
      }
    }
  }

  throw new Error(`Nao conseguiu extrair funcao: ${signature}`);
}

function buildFunction(source, signature, context = {}) {
  const functionSource = extractFunction(source, signature);
  const script = new vm.Script(`(${functionSource})`);
  return script.runInNewContext(context);
}

test('loadPaginaUnidadesBundle preserva os ramos contextual, vazio nao privilegiado e privilegiado com fallback de matrizes', async () => {
  const calls = {
    scoped: [],
    findAllUnidades: 0,
    findAllModulosLean: 0,
    findModulosAtivosStatusLean: 0,
    findUnidadesPrincipaisLean: 0,
    loadPaginaUnidadesDiretores: [],
  };

  let allUnidadesResponse = [];
  let allModulosResponse = [{ _id: 'mod-master', nome: 'Gestor Premium' }];
  let modulosAtivosResponse = [{ _id: 'mod-ativo', nome: 'Gestor Base' }];
  let matrizesResponse = [{ _id: 'u-matriz', nome: 'Matriz Fallback', is_principal: true }];
  let diretoresResponse = [{ _id: 'dir-1', email: 'diretor@example.com' }];

  const loadPaginaUnidadesBundle = buildFunction(SERVICE_SOURCE, 'export async function loadPaginaUnidadesBundle', {
    findAllUnidades: async () => {
      calls.findAllUnidades += 1;
      return allUnidadesResponse;
    },
    findAllModulosLean: async () => {
      calls.findAllModulosLean += 1;
      return allModulosResponse;
    },
    findModulosAtivosStatusLean: async () => {
      calls.findModulosAtivosStatusLean += 1;
      return modulosAtivosResponse;
    },
    findUnidadesPrincipaisLean: async () => {
      calls.findUnidadesPrincipaisLean += 1;
      return matrizesResponse;
    },
    loadPaginaUnidadesDiretores: async ({ user }) => {
      calls.loadPaginaUnidadesDiretores.push(user?.email || user?.role || null);
      return diretoresResponse;
    },
    console: {
      log() {},
      warn() {},
      error() {},
    },
  });

  let result = await loadPaginaUnidadesBundle({
    req: { user: { email: 'ctx@example.com', role: 'diretor', isMaster: false } },
    isMaster: false,
    privilegedUser: false,
    loadScopedUnidadesClusterForPage: async (req) => {
      calls.scoped.push(req.user.email);
      return {
        scopedUnitId: 'u-filial',
        unidadesFiltradas: [
          {
            _id: 'u-filial',
            nome: 'Filial Norte',
            modulosAcessiveis: 'valor-invalido',
          },
        ],
        principalUnit: { _id: 'u-principal', nome: 'Matriz Norte' },
        scopedUnit: { _id: 'u-filial', nome: 'Filial Norte' },
      };
    },
  });

  assert.equal(calls.scoped[0], 'ctx@example.com');
  assert.equal(result.unidadesFiltradas.length, 1);
  assert.equal(result.unidadesFiltradas[0]._id, 'u-filial');
  assert.equal(result.unidadesFiltradas[0].naturezaJuridica, '');
  assert.equal(JSON.stringify(result.unidadesFiltradas[0].modulosAcessiveis), JSON.stringify([]));
  assert.equal(result.principalUnits.length, 1);
  assert.equal(result.principalUnits[0]._id, 'u-principal');
  assert.equal(JSON.stringify(result.modulos), JSON.stringify(modulosAtivosResponse));
  assert.equal(JSON.stringify(result.usuariosDiretor), JSON.stringify(diretoresResponse));
  assert.equal(calls.findAllUnidades, 0);
  assert.equal(calls.findUnidadesPrincipaisLean, 0);

  result = await loadPaginaUnidadesBundle({
    req: { user: { email: 'empty@example.com', role: 'diretor', isMaster: false } },
    isMaster: false,
    privilegedUser: false,
    loadScopedUnidadesClusterForPage: async () => ({
      scopedUnitId: '',
      unidadesFiltradas: [],
      principalUnit: null,
      scopedUnit: null,
    }),
  });

  assert.equal(result.unidadesFiltradas.length, 0);
  assert.equal(result.principalUnits.length, 0);
  assert.equal(JSON.stringify(result.modulos), JSON.stringify(modulosAtivosResponse));
  assert.equal(calls.findAllUnidades, 0);
  assert.equal(calls.findModulosAtivosStatusLean >= 2, true);

  allUnidadesResponse = [];
  result = await loadPaginaUnidadesBundle({
    req: { user: { email: 'master@example.com', role: 'master', isMaster: true } },
    isMaster: true,
    privilegedUser: true,
    loadScopedUnidadesClusterForPage: async () => ({
      scopedUnitId: '',
      unidadesFiltradas: [],
      principalUnit: null,
      scopedUnit: null,
    }),
  });

  assert.equal(calls.findAllUnidades, 1);
  assert.equal(calls.findUnidadesPrincipaisLean, 1);
  assert.equal(calls.findAllModulosLean, 1);
  assert.equal(result.unidadesFiltradas.length, 1);
  assert.equal(result.unidadesFiltradas[0]._id, 'u-matriz');
  assert.equal(JSON.stringify(result.modulos), JSON.stringify(allModulosResponse));
  assert.deepEqual(calls.loadPaginaUnidadesDiretores, ['ctx@example.com', 'empty@example.com', 'master@example.com']);
});
