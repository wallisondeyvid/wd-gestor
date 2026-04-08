import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import { registerHooks } from 'node:module';

const API_DB_FILE = path.join(process.cwd(), 'src/modules/gestor/app/db/api.db.js');
const DELETE_SERVICE_FILE = path.join(process.cwd(), 'src/modules/gestor/app/services/usuarios/deleteUsuarioExecution.service.js');
const REPOSITORY_MOCK_MODULE_URL = 'mock:gestor-usuario-delete-cleanup-repository';

const state = {
  repoCalls: [],
};

globalThis.__GESTOR_USUARIO_DELETE_CLEANUP_STATE__ = state;

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
          'const state = globalThis.__GESTOR_USUARIO_DELETE_CLEANUP_STATE__ || { repoCalls: [] };',
          'const capture = (args) => JSON.parse(JSON.stringify(args));',
          'export async function unsetFuncionarioUsuarioIdIfMatchesUserRepo(args) {',
          '  state.repoCalls.push(capture(args));',
          '  return { acknowledged: true, modifiedCount: 1 };',
          '}',
          'export async function findFuncionarioByCpfAndUnidadeRepo() { return null; }',
          'export async function findAllFuncionariosSelectIdNomeCpfLeanRepo() { return []; }',
          'export async function findFuncionarioByIdSelectIdUnidadeUsuarioLeanRepo() { return null; }',
          'export async function findFuncionarioByCpfUnidadeSelectIdUnidadeEmailLeanRepo() { return null; }',
          'export async function findFuncionarioByEmailSelectIdUnidadeEmailLeanRepo() { return null; }',
          'export async function findFuncionarioByCpfOrEmailLeanRepo() { return null; }',
          'export async function unsetFuncionarioUsuarioIdByIdRepo() { return null; }',
          'export async function setFuncionarioUsuarioIdByIdRepo() { return null; }',
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
        ].join('\n'),
      };
    }

    return nextLoad(url, context);
  },
});

const { unsetFuncionarioUsuarioIdIfMatchesUser } = await import('#modules/gestor/app/db/api.db.js');

test('unsetFuncionarioUsuarioIdIfMatchesUser propaga unitScope unitario quando unidadeId esta disponivel', async () => {
  state.repoCalls.length = 0;

  await unsetFuncionarioUsuarioIdIfMatchesUser(
    '507f191e810c19729de860aa',
    '507f1f77bcf86cd799439011',
    '507f191e810c19729de860ab',
  );

  assert.deepEqual(state.repoCalls, [
    {
      unitScope: { type: 'unit', unidadeId: '507f191e810c19729de860ab' },
      funcionarioId: '507f191e810c19729de860aa',
      userId: '507f1f77bcf86cd799439011',
      unidadeId: '507f191e810c19729de860ab',
    },
  ]);
});

test('unsetFuncionarioUsuarioIdIfMatchesUser preserva fallback global sem unidadeId', async () => {
  state.repoCalls.length = 0;

  await unsetFuncionarioUsuarioIdIfMatchesUser(
    '507f191e810c19729de860aa',
    '507f1f77bcf86cd799439011',
  );

  assert.deepEqual(state.repoCalls, [
    {
      unitScope: { type: 'global', unidadeId: null },
      funcionarioId: '507f191e810c19729de860aa',
      userId: '507f1f77bcf86cd799439011',
      unidadeId: null,
    },
  ]);
});

test('deleteUsuarioExecutionService repassa unidadeId para o cleanup condicional', async () => {
  const serviceSource = fs.readFileSync(DELETE_SERVICE_FILE, 'utf8');
  const calls = [];

  const normalizeEntityId = buildFunction(serviceSource, 'function normalizeEntityId', {
    String,
  });

  const deleteUsuarioExecutionService = buildFunction(
    serviceSource,
    'export async function deleteUsuarioExecutionService',
    {
      deleteUserById: async () => ({ acknowledged: true, deletedCount: 1 }),
      unsetFuncionarioUsuarioIdIfMatchesUser: async (...args) => {
        calls.push(args);
        return { acknowledged: true, modifiedCount: 1 };
      },
      normalizeEntityId,
      console,
    }
  );

  await deleteUsuarioExecutionService({
    userId: '507f1f77bcf86cd799439011',
    vinculoFuncionarioId: '507f191e810c19729de860aa',
    unidadeId: '507f191e810c19729de860ab',
  });

  assert.deepEqual(calls, [[
    '507f191e810c19729de860aa',
    '507f1f77bcf86cd799439011',
    '507f191e810c19729de860ab',
  ]]);
});