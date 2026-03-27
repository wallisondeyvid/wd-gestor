import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/userController.js');
const SERVICE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/services/usuarios/listUsuariosOwner.service.js');
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

function createRenderRes() {
  return {
    statusCode: 200,
    view: null,
    locals: null,
    sent: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(payload) {
      this.sent = payload;
      return this;
    },
    render(view, locals) {
      this.view = view;
      this.locals = locals;
      return this;
    },
  };
}

test('listarUsuarios delega ao service owner e preserva o render do caminho feliz', async () => {
  const calls = [];
  const listUsuariosOwnerService = async (input) => {
    calls.push(input);
    return {
      kind: 'ok',
      usuarios: [{ _id: 'u-1', nome: 'Usuario A' }],
      unidadesFiltradas: [{ _id: 'un-1', nome: 'Unidade A' }],
      funcionarios: [{ _id: 'f-1', nome: 'Funcionario A' }],
    };
  };

  const listarUsuarios = buildFunction(CONTROLLER_SOURCE, 'export async function listarUsuarios', {
    listUsuariosOwnerService,
    console,
  });

  const req = {
    user: { isMaster: false, role: 'admin', email: 'admin@example.com' },
  };
  const res = createRenderRes();
  let nextError = null;

  await listarUsuarios(req, res, (error) => {
    nextError = error;
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].isMaster, false);
  assert.equal(nextError, null);
  assert.equal(res.statusCode, 200);
  assert.equal(res.view, 'usuarios');
  assert.equal(res.locals.user, req.user);
  assert.equal(res.locals.usuarios.length, 1);
  assert.equal(res.locals.usuarios[0]._id, 'u-1');
  assert.equal(res.locals.unidadesFiltradas.length, 1);
  assert.equal(res.locals.unidadesFiltradas[0]._id, 'un-1');
  assert.equal(res.locals.funcionarios.length, 1);
  assert.equal(res.locals.funcionarios[0]._id, 'f-1');
});

test('listUsuariosOwnerService preserva a derivacao da query por isMaster e devolve o bundle semantico', async () => {
  const queryCalls = [];
  const unidadesCalls = [];
  const funcionariosCalls = [];

  const listUsuariosOwnerService = buildFunction(SERVICE_SOURCE, 'export async function listUsuariosOwnerService', {
    GLOBAL_SCOPE: { type: 'global', unidadeId: null },
    Promise,
    findUsersByQueryLeanRepo: async (input) => {
      queryCalls.push(input);
      return [{ _id: 'u-master', nome: 'Master' }];
    },
    findAllUnidadesSelectIdCodigoNomeLeanRepo: async (input) => {
      unidadesCalls.push(input);
      return [{ _id: 'un-1', codigo: '001', nome: 'Unidade A' }];
    },
    findAllFuncionariosSelectIdNomeCpfLeanRepo: async (input) => {
      funcionariosCalls.push(input);
      return [{ _id: 'f-1', nome: 'Funcionario A', cpf: '123' }];
    },
  });

  let result = await listUsuariosOwnerService({ isMaster: true });
  assert.equal(result.kind, 'ok');
  assert.equal(queryCalls.length, 1);
  assert.equal(Object.keys(queryCalls[0].query).length, 0);
  assert.equal(queryCalls[0].unitScope.type, 'global');
  assert.equal(result.usuarios.length, 1);
  assert.equal(result.unidadesFiltradas.length, 1);
  assert.equal(result.funcionarios.length, 1);

  result = await listUsuariosOwnerService({ isMaster: false });
  assert.equal(result.kind, 'ok');
  assert.equal(queryCalls.length, 2);
  assert.equal(queryCalls[1].query.role.$ne, 'master');
  assert.equal(unidadesCalls.length, 2);
  assert.equal(funcionariosCalls.length, 2);
  assert.equal(unidadesCalls[1].unitScope.type, 'global');
  assert.equal(funcionariosCalls[1].unitScope.type, 'global');
});