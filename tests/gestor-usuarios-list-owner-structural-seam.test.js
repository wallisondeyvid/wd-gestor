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
    Promise,
    findUsersByQueryLean: async (query) => {
      queryCalls.push(query);
      return [{ _id: 'u-master', nome: 'Master' }];
    },
    findAllUnidadesSelectIdCodigoNomeLean: async () => {
      unidadesCalls.push(true);
      return [{ _id: 'un-1', codigo: '001', nome: 'Unidade A' }];
    },
    findAllFuncionariosSelectIdNomeCpfLean: async () => {
      funcionariosCalls.push(true);
      return [{ _id: 'f-1', nome: 'Funcionario A', cpf: '123' }];
    },
  });

  let result = await listUsuariosOwnerService({ isMaster: true });
  assert.equal(result.kind, 'ok');
  assert.equal(queryCalls.length, 1);
  assert.equal(Object.keys(queryCalls[0]).length, 0);
  assert.equal(result.usuarios.length, 1);
  assert.equal(result.unidadesFiltradas.length, 1);
  assert.equal(result.funcionarios.length, 1);

  result = await listUsuariosOwnerService({ isMaster: false });
  assert.equal(result.kind, 'ok');
  assert.equal(queryCalls.length, 2);
  assert.equal(queryCalls[1].role.$ne, 'master');
  assert.equal(unidadesCalls.length, 2);
  assert.equal(funcionariosCalls.length, 2);
});

test('enrichUsuariosMembershipsSummary preserva o resumo de memberships e os defaults vazios', async () => {
  const membershipCalls = [];
  const unidadeCalls = [];

  const enrichUsuariosMembershipsSummary = buildFunction(
    SERVICE_SOURCE,
    'export async function enrichUsuariosMembershipsSummary',
    {
      Promise,
      Set,
      Map,
      normalizeId: (value) => String(value || '').trim(),
      buildUnidadeMembershipLabel: (unidade) => {
        const codigo = String(unidade?.codigo || '').trim();
        const nome = String(unidade?.nome || '').trim();
        if (codigo && nome) return `${codigo} - ${nome}`;
        return nome || codigo || null;
      },
      findUserMembershipsByUserIdsLean: async (userIds) => {
        membershipCalls.push(userIds);
        return [
          {
            user_id: 'u-1',
            unidade_id: 'un-1',
            papel_contextual: 'gestor',
            status: 'inactive',
            funcionario_id: 'f-1',
          },
        ];
      },
      findUnidadesByIdsNomeCodigoLean: async (unidadeIds) => {
        unidadeCalls.push(unidadeIds);
        return [{ _id: 'un-1', codigo: '001', nome: 'Unidade A' }];
      },
    },
  );

  let result = await enrichUsuariosMembershipsSummary([]);
  assert.deepEqual(result, []);
  assert.equal(membershipCalls.length, 0);
  assert.equal(unidadeCalls.length, 0);

  result = await enrichUsuariosMembershipsSummary([
    { _id: 'u-1', email: 'user-1@example.com' },
    { _id: 'u-2', email: 'user-2@example.com' },
  ]);

  assert.equal(membershipCalls.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(membershipCalls[0])), ['u-1', 'u-2']);
  assert.equal(unidadeCalls.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(unidadeCalls[0])), ['un-1']);
  assert.equal(result[0].membershipsCount, 1);
  assert.equal(Array.isArray(result[0].membershipsSummary), true);
  assert.equal(result[0].membershipsSummary[0].unidade_nome, '001 - Unidade A');
  assert.equal(result[0].membershipsSummary[0].papel_contextual, 'gestor');
  assert.equal(result[0].membershipsSummary[0].status, 'inactive');
  assert.equal(result[0].membershipsSummary[0].funcionario_id, 'f-1');
  assert.equal(result[1].membershipsCount, 0);
  assert.equal(Array.isArray(result[1].membershipsSummary), true);
  assert.equal(result[1].membershipsSummary.length, 0);
});