import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import { registerHooks } from 'node:module';

const API_DB_FILE = path.join(process.cwd(), 'src/modules/gestor/app/db/api.db.js');
const SERVICE_FILE = path.join(process.cwd(), 'src/modules/gestor/app/services/usuarios/createUsuarioExecution.service.js');
const REPOSITORY_MOCK_MODULE_URL = 'mock:gestor-usuario-create-set-if-empty-repository';

const state = {
  repoCalls: [],
};

globalThis.__GESTOR_USUARIO_CREATE_SET_IF_EMPTY_STATE__ = state;

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
          'const state = globalThis.__GESTOR_USUARIO_CREATE_SET_IF_EMPTY_STATE__ || { repoCalls: [] };',
          'const capture = (args) => JSON.parse(JSON.stringify(args));',
          'export async function setFuncionarioUsuarioIdIfEmptyRepo(args) {',
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
          'export async function unsetFuncionarioUsuarioIdIfMatchesUserRepo() { return null; }',
          'export async function findFuncionariosParaListagemComRefsSelectLeanRepo() { return []; }',
          'export async function findFuncionariosDisponiveisSemUsuarioPorUnidadeSelectLeanRepo() { return []; }',
          'export async function findFuncionarioByEmailRepo() { return null; }',
          'export async function findFuncionarioByEmailSelectLeanRepo() { return null; }',
          'export async function findFuncionariosByUnidadeIdsSelectIdNomeCpfLeanRepo() { return []; }',
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

const { setFuncionarioUsuarioIdIfEmpty } = await import('#modules/gestor/app/db/api.db.js');

test('setFuncionarioUsuarioIdIfEmpty propaga unitScope unitario quando unidadeId esta disponivel', async () => {
  state.repoCalls.length = 0;

  await setFuncionarioUsuarioIdIfEmpty(
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

test('setFuncionarioUsuarioIdIfEmpty preserva fallback global sem unidadeId', async () => {
  state.repoCalls.length = 0;

  await setFuncionarioUsuarioIdIfEmpty(
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

test('materializeCriarUsuarioFuncionarioLinkCore repassa unidade do funcionarioDoc para setIfEmpty', async () => {
  const serviceSource = fs.readFileSync(SERVICE_FILE, 'utf8');
  const calls = [];

  const materializeCriarUsuarioFuncionarioLinkCore = buildFunction(
    serviceSource,
    'async function materializeCriarUsuarioFuncionarioLinkCore',
    {
      saveUserDoc: async () => undefined,
      findCriarUsuarioFuncionarioByCpfUnidade: async () => null,
      setCriarUsuarioFuncionarioUsuarioIdIfEmpty: async (...args) => {
        calls.push(args);
        return { acknowledged: true, modifiedCount: 1 };
      },
      setCriarUsuarioFuncionarioUsuarioIdById: async () => {
        throw new Error('setById nao deveria ser chamado neste ramo');
      },
      createCriarUsuarioFuncionarioDoc: async () => {
        throw new Error('createFuncionarioDoc nao deveria ser chamado neste ramo');
      },
      console,
      Date,
      String,
    }
  );

  await materializeCriarUsuarioFuncionarioLinkCore({
    user: { _id: 'u-1', nome: 'User', unidade_id: null, funcionario_id: null },
    isExistingUser: false,
    nome: 'User',
    email: 'user@example.com',
    cleanCpf: '12345678900',
    unidadeId: 'un-fallback',
    funcionarioId: 'f-1',
    funcionarioDoc: { _id: 'f-1', unidade_id: 'un-doc' },
    wantsNewFuncionario: false,
  });

  assert.deepEqual(calls, [['f-1', 'u-1', 'un-doc']]);
});