import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const SERVICE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/services/usuarios/updateUsuarioExecution.service.js');
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

test('updateUsuarioExecutionService preserva a ordem estrutural tenant-aware do contexto antigo antes das mutacoes', () => {
  const prevUnidadeCaptureIndex = SERVICE_SOURCE.indexOf("const prevUnidadeId = user.unidade_id ? String(user.unidade_id) : null;");
  const unidadeMutationIndex = SERVICE_SOURCE.indexOf('user.unidade_id = unidadeId || null;');
  const prevFuncionarioCaptureIndex = SERVICE_SOURCE.indexOf("const prevFuncionarioId = user.funcionario_id ? String(user.funcionario_id) : null;");
  const nextFuncionarioCaptureIndex = SERVICE_SOURCE.indexOf("const nextFuncionarioId = funcionarioId ? String(funcionarioId) : null;");
  const funcionarioMutationIndex = SERVICE_SOURCE.indexOf('user.funcionario_id = nextFuncionarioId || null;');
  const unsetCallIndex = SERVICE_SOURCE.indexOf('await unsetFuncionarioUsuarioIdById(prevFuncionarioId, prevUnidadeId);');
  const setCallIndex = SERVICE_SOURCE.indexOf('await setFuncionarioUsuarioIdById(nextFuncionarioId, user._id, unidadeId || null);');
  const saveIndex = SERVICE_SOURCE.indexOf('await saveUserDoc(user);');

  assert.ok(prevUnidadeCaptureIndex >= 0, 'Deve capturar prevUnidadeId antes da mutacao.');
  assert.ok(unidadeMutationIndex >= 0, 'Deve existir a mutacao de user.unidade_id.');
  assert.ok(prevFuncionarioCaptureIndex >= 0, 'Deve capturar prevFuncionarioId antes da mutacao.');
  assert.ok(nextFuncionarioCaptureIndex >= 0, 'Deve capturar nextFuncionarioId.');
  assert.ok(funcionarioMutationIndex >= 0, 'Deve existir a mutacao de user.funcionario_id.');
  assert.ok(unsetCallIndex >= 0, 'Deve existir o cleanup do vinculo anterior.');
  assert.ok(setCallIndex >= 0, 'Deve existir o religamento do novo vinculo.');
  assert.ok(saveIndex >= 0, 'Deve persistir o usuario ao final.');

  assert.ok(prevUnidadeCaptureIndex < unidadeMutationIndex, 'prevUnidadeId precisa ser capturado antes de sobrescrever user.unidade_id.');
  assert.ok(prevFuncionarioCaptureIndex < funcionarioMutationIndex, 'prevFuncionarioId precisa ser capturado antes de sobrescrever user.funcionario_id.');
  assert.ok(unidadeMutationIndex < prevFuncionarioCaptureIndex, 'A unidade antiga precisa ser capturada antes do bloco de funcionario.');
  assert.ok(prevFuncionarioCaptureIndex < nextFuncionarioCaptureIndex, 'prevFuncionarioId precisa ser avaliado antes do novo funcionario.');
  assert.ok(funcionarioMutationIndex < unsetCallIndex, 'A sincronizacao deve ocorrer apos a mutacao do funcionario em memoria.');
  assert.ok(unsetCallIndex < setCallIndex, 'O cleanup do vinculo anterior deve ocorrer antes do religamento do novo vinculo.');
  assert.ok(setCallIndex < saveIndex, 'saveUserDoc precisa ocorrer apos a sincronizacao de vinculo.');
});

test('updateUsuarioExecutionService protege a troca de funcionario e unidade com cleanup antigo e religamento novo', async () => {
  const calls = [];

  const updateUsuarioExecutionService = buildFunction(SERVICE_SOURCE, 'export async function updateUsuarioExecutionService', {
    unsetFuncionarioUsuarioIdById: async (funcionarioId, unidadeId) => {
      calls.push({ op: 'unset', funcionarioId, unidadeId });
    },
    setFuncionarioUsuarioIdById: async (funcionarioId, userId, unidadeId) => {
      calls.push({ op: 'set', funcionarioId, userId, unidadeId });
    },
    saveUserDoc: async (user) => {
      calls.push({
        op: 'save',
        userSnapshot: {
          _id: user._id,
          unidade_id: user.unidade_id,
          funcionario_id: user.funcionario_id,
          role: user.role,
          cpf: user.cpf,
          nome: user.nome,
        },
      });
    },
    console,
    String,
  });

  const user = {
    _id: 'u-100',
    role: 'user',
    cpf: 'cpf-antigo',
    nome: 'Nome Antigo',
    unidade_id: 'un-antiga',
    funcionario_id: 'f-antigo',
  };

  const result = await updateUsuarioExecutionService({
    user,
    isTargetMaster: false,
    cleanCpf: '12345678900',
    trimmedNome: 'Nome Novo',
    role: 'diretor',
    unidadeId: 'un-nova',
    funcionarioId: 'f-novo',
  });

  assert.equal(result.kind, 'updated');
  assert.equal(result.userId, 'u-100');
  assert.equal(result.updated, true);
  assert.deepEqual(calls, [
    { op: 'unset', funcionarioId: 'f-antigo', unidadeId: 'un-antiga' },
    { op: 'set', funcionarioId: 'f-novo', userId: 'u-100', unidadeId: 'un-nova' },
    {
      op: 'save',
      userSnapshot: {
        _id: 'u-100',
        unidade_id: 'un-nova',
        funcionario_id: 'f-novo',
        role: 'diretor',
        cpf: '12345678900',
        nome: 'Nome Novo',
      },
    },
  ]);
});

test('updateUsuarioExecutionService protege a remocao de funcionario limpando o vinculo anterior no escopo antigo sem religar', async () => {
  const calls = [];

  const updateUsuarioExecutionService = buildFunction(SERVICE_SOURCE, 'export async function updateUsuarioExecutionService', {
    unsetFuncionarioUsuarioIdById: async (funcionarioId, unidadeId) => {
      calls.push({ op: 'unset', funcionarioId, unidadeId });
    },
    setFuncionarioUsuarioIdById: async (funcionarioId, userId, unidadeId) => {
      calls.push({ op: 'set', funcionarioId, userId, unidadeId });
    },
    saveUserDoc: async (user) => {
      calls.push({
        op: 'save',
        userSnapshot: {
          _id: user._id,
          unidade_id: user.unidade_id,
          funcionario_id: user.funcionario_id,
        },
      });
    },
    console,
    String,
  });

  const user = {
    _id: 'u-200',
    role: 'diretor',
    unidade_id: 'un-antiga',
    funcionario_id: 'f-antigo',
  };

  const result = await updateUsuarioExecutionService({
    user,
    isTargetMaster: false,
    cleanCpf: null,
    trimmedNome: null,
    role: 'diretor',
    unidadeId: 'un-nova',
    funcionarioId: '',
  });

  assert.equal(result.kind, 'updated');
  assert.equal(result.userId, 'u-200');
  assert.equal(result.updated, true);
  assert.deepEqual(calls, [
    { op: 'unset', funcionarioId: 'f-antigo', unidadeId: 'un-antiga' },
    {
      op: 'save',
      userSnapshot: {
        _id: 'u-200',
        unidade_id: 'un-nova',
        funcionario_id: null,
      },
    },
  ]);
  assert.equal(calls.some((entry) => entry.op === 'set'), false, 'Nao deve religar funcionario quando nao ha novo vinculo.');
});
