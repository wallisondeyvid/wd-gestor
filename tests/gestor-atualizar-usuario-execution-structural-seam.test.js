import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/userController.js');
const SERVICE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/services/usuarios/updateUsuarioExecution.service.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');
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

function createResCapture() {
  return {
    statusCode: 200,
    body: undefined,
    redirectedTo: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
    redirect(code, location) {
      this.statusCode = code;
      this.redirectedTo = location;
      return this;
    },
  };
}

test('atualizarUsuario delega ao owner service e preserva o mapeamento estrutural final para JSON e redirect', async () => {
  const serviceCalls = [];
  const duplicateCalls = [];
  const loadedUser = {
    _id: 'u-1',
    role: 'user',
    unidade_id: 'un-antiga',
    funcionario_id: 'f-antigo',
  };

  const updateUsuarioExecutionService = async (input) => {
    serviceCalls.push(input);
    return {
      kind: 'updated',
      userId: 'u-1',
      updated: true,
    };
  };

  const atualizarUsuario = buildFunction(CONTROLLER_SOURCE, 'export async function atualizarUsuario', {
    findUserById: async () => loadedUser,
    findUserDuplicadoByCpfUnidadeExcludingId: async (...args) => {
      duplicateCalls.push(args);
      return null;
    },
    updateUsuarioExecutionService,
    console,
    String,
  });

  const jsonReq = {
    user: { isMaster: false, role: 'admin' },
    params: { id: 'u-1' },
    body: {
      nome: '  Nome Atualizado  ',
      role: 'diretor',
      cpf: '123.456.789-00',
      unidade_id: 'un-nova',
      funcionario_id: 'f-novo',
    },
    xhr: true,
    headers: { accept: 'application/json' },
    get(header) {
      if (header === 'X-Requested-With') return 'XMLHttpRequest';
      return undefined;
    },
    baseUrl: '/gestor',
  };

  let res = createResCapture();
  await atualizarUsuario(jsonReq, res);

  assert.equal(duplicateCalls.length, 1);
  assert.equal(duplicateCalls[0][0], 'u-1');
  assert.equal(duplicateCalls[0][1], '12345678900');
  assert.equal(duplicateCalls[0][2], 'un-antiga');
  assert.equal(serviceCalls.length, 1);
  assert.equal(serviceCalls[0].user, loadedUser);
  assert.equal(serviceCalls[0].isTargetMaster, false);
  assert.equal(serviceCalls[0].cleanCpf, '12345678900');
  assert.equal(serviceCalls[0].trimmedNome, 'Nome Atualizado');
  assert.equal(serviceCalls[0].role, 'diretor');
  assert.equal(serviceCalls[0].unidadeId, 'un-nova');
  assert.equal(serviceCalls[0].funcionarioId, 'f-novo');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.id, 'u-1');
  assert.equal(res.body.updated, true);

  const redirectReq = {
    user: { isMaster: true, role: 'master' },
    params: { id: 'u-1' },
    body: {
      nome: 'Outro Nome',
      role: 'master',
      cpf: '',
      unidade_id: '',
      funcionario_id: '',
    },
    xhr: false,
    headers: { accept: 'text/html' },
    get() {
      return undefined;
    },
    baseUrl: '/gestor',
  };

  res = createResCapture();
  await atualizarUsuario(redirectReq, res);

  assert.equal(serviceCalls.length, 2);
  assert.equal(serviceCalls[1].isTargetMaster, false);
  assert.equal(serviceCalls[1].cleanCpf, null);
  assert.equal(serviceCalls[1].trimmedNome, 'Outro Nome');
  assert.equal(serviceCalls[1].role, 'master');
  assert.equal(serviceCalls[1].unidadeId, '');
  assert.equal(serviceCalls[1].funcionarioId, '');
  assert.equal(res.statusCode, 303);
  assert.equal(res.redirectedTo, '/gestor/usuarios');
});

test('updateUsuarioExecutionService preserva a ordem semantica entre desvincular, vincular e salvar', async () => {
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
          cpf: user.cpf,
          nome: user.nome,
          role: user.role,
          unidade_id: user.unidade_id,
          funcionario_id: user.funcionario_id,
        },
      });
    },
    console,
    String,
  });

  const user = {
    _id: 'u-99',
    cpf: 'old-cpf',
    nome: 'Nome Antigo',
    role: 'user',
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
  assert.equal(result.userId, 'u-99');
  assert.equal(result.updated, true);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].op, 'unset');
  assert.equal(calls[0].funcionarioId, 'f-antigo');
  assert.equal(calls[0].unidadeId, 'un-antiga');
  assert.equal(calls[1].op, 'set');
  assert.equal(calls[1].funcionarioId, 'f-novo');
  assert.equal(calls[1].userId, 'u-99');
  assert.equal(calls[1].unidadeId, 'un-nova');
  assert.equal(calls[2].op, 'save');
  assert.equal(calls[2].userSnapshot.cpf, '12345678900');
  assert.equal(calls[2].userSnapshot.nome, 'Nome Novo');
  assert.equal(calls[2].userSnapshot.role, 'diretor');
  assert.equal(calls[2].userSnapshot.unidade_id, 'un-nova');
  assert.equal(calls[2].userSnapshot.funcionario_id, 'f-novo');
});