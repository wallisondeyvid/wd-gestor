import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import { registerHooks } from 'node:module';

const API_DB_FILE = path.join(process.cwd(), 'src/modules/gestor/app/db/api.db.js');
const CONTROLLER_FILE = path.join(process.cwd(), 'src/modules/gestor/app/controllers/userController.js');
const REPOSITORY_MOCK_MODULE_URL = 'mock:gestor-funcionario-anchor-by-id-repository';

const state = {
  repoCalls: [],
};

globalThis.__GESTOR_FUNCIONARIO_ANCHOR_BY_ID_STATE__ = state;

function extractFunction(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `Nao encontrou assinatura: ${signature}`);

  const paramsEnd = source.indexOf(')', start);
  const braceStart = source.indexOf('{', paramsEnd);
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

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '#modules/gestor/app/repositories/FuncionarioRepository.js') {
      return { url: REPOSITORY_MOCK_MODULE_URL, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === REPOSITORY_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'const state = globalThis.__GESTOR_FUNCIONARIO_ANCHOR_BY_ID_STATE__ || { repoCalls: [] };',
          'const capture = (args) => JSON.parse(JSON.stringify(args));',
          'export async function findFuncionarioByIdSelectIdUnidadeUsuarioLeanRepo(args) {',
          '  state.repoCalls.push(capture(args));',
          '  return { _id: args.funcionarioId, unidade_id: args.unidadeId || null, usuario_id: null };',
          '}',
          'export async function findFuncionarioByCpfAndUnidadeRepo() { return null; }',
          'export async function findAllFuncionariosSelectIdNomeCpfLeanRepo() { return []; }',
          'export async function findFuncionarioByCpfUnidadeSelectIdUnidadeEmailLeanRepo() { return null; }',
          'export async function findFuncionarioByEmailSelectIdUnidadeEmailLeanRepo() { return null; }',
          'export async function findFuncionarioByCpfOrEmailLeanRepo() { return null; }',
          'export async function unsetFuncionarioUsuarioIdByIdRepo() { return null; }',
          'export async function setFuncionarioUsuarioIdByIdRepo() { return null; }',
          'export async function unsetFuncionarioUsuarioIdIfMatchesUserRepo() { return null; }',
          'export async function setFuncionarioUsuarioIdIfEmptyRepo() { return null; }',
          'export async function findFuncionariosParaListagemComRefsSelectLeanRepo() { return []; }',
          'export async function findFuncionariosDisponiveisSemUsuarioPorUnidadeSelectLeanRepo() { return []; }',
          'export async function findFuncionarioByEmailRepo() { return null; }',
          'export async function findFuncionarioByEmailSelectLeanRepo() { return null; }',
          'export async function findFuncionariosByEmailsSelectEmailNomeLeanRepo() { return []; }',
          'export async function createFuncionarioDocRepo() { return null; }',
          'export async function findFuncionarioByIdRepo() { return null; }',
          'export async function updateFuncionarioByIdWithOpsRepo() { return null; }',
          'export async function findFuncionarioByIdPopulateRefsRepo() { return null; }',
          'export async function findFuncionarioByIdLeanRepo() { return null; }',
          'export async function deleteFuncionarioByIdRepo() { return null; }',
          'export async function findFuncionariosDisponiveisByUnidadeLeanRepo() { return []; }',
          'export async function findFuncionarioByIdSelectBasicLeanRepo() { return null; }',
          'export async function findFuncionarioByCpfAndUnidadeSelectLeanRepo() { return null; }',
          'export async function findUserByFuncionarioIdRepo() { return null; }',
        ].join('\n'),
      };
    }

    return nextLoad(url, context);
  },
});

const { findFuncionarioByIdSelectIdUnidadeUsuarioLean } = await import('#modules/gestor/app/db/api.db.js');

test('findFuncionarioByIdSelectIdUnidadeUsuarioLean propaga unitScope unitario quando unidadeId esta disponivel', async () => {
  state.repoCalls.length = 0;

  await findFuncionarioByIdSelectIdUnidadeUsuarioLean('func-1', '507f191e810c19729de860ea');

  assert.deepEqual(state.repoCalls, [
    {
      unitScope: { type: 'unit', unidadeId: '507f191e810c19729de860ea' },
      funcionarioId: 'func-1',
      unidadeId: '507f191e810c19729de860ea',
    },
  ]);
});

test('findFuncionarioByIdSelectIdUnidadeUsuarioLean preserva fallback global sem unidadeId', async () => {
  state.repoCalls.length = 0;

  await findFuncionarioByIdSelectIdUnidadeUsuarioLean('func-2');

  assert.deepEqual(state.repoCalls, [
    {
      unitScope: { type: 'global', unidadeId: null },
      funcionarioId: 'func-2',
      unidadeId: null,
    },
  ]);
});

test('resolveCriarUsuarioProvidedFuncionario repassa unidadeId para a leitura-ancora', async () => {
  const controllerSource = fs.readFileSync(CONTROLLER_FILE, 'utf8');
  const calls = [];

  const findCriarUsuarioFuncionarioById = buildFunction(
    controllerSource,
    'async function findCriarUsuarioFuncionarioById',
    {
      findFuncionarioByIdSelectIdUnidadeUsuarioLean: async (...args) => {
        calls.push(args);
        return null;
      },
    }
  );

  const resolveCriarUsuarioProvidedFuncionario = buildFunction(
    controllerSource,
    'async function resolveCriarUsuarioProvidedFuncionario',
    {
      findCriarUsuarioFuncionarioById,
      String,
    }
  );

  await resolveCriarUsuarioProvidedFuncionario({
    funcionarioId: 'func-3',
    unidadeId: '507f191e810c19729de860eb',
  });

  assert.deepEqual(calls, [
    ['func-3', '507f191e810c19729de860eb'],
    ['func-3', null],
  ]);
});