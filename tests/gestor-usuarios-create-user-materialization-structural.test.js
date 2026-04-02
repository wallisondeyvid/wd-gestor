import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const SERVICE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/services/usuarios/createUsuarioExecution.service.js');
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

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

function buildDelegatedCreateServiceSource() {
  const original = extractFunction(SERVICE_SOURCE, 'export async function createUsuarioExecutionService');
  if (original.includes('materializeCriarUsuarioUserMaterializationCore(')) {
    return original;
  }

  const currentUserBlock = /(\tconst isExistingUser = !!existingUser;[\s\S]*?\t\}\r?\n)(?=\r?\n\tconst funcionarioLinkResult = await materializeCriarUsuarioFuncionarioLinkCore\()/;
  const delegatedUserBlock = [
    'const userMaterializationResult = await materializeCriarUsuarioUserMaterializationCore({',
    '  existingUser,',
    '  nome,',
    '  email,',
    '  cleanCpf,',
    '  requestedUserRole,',
    '  unidadeId,',
    '  funcionarioId,',
    '  senha,',
    '});',
    'const { user, isExistingUser, tempPasswordPlain } = userMaterializationResult;',
  ].join('\n\t');

  const replacedUserBlock = original.replace(currentUserBlock, `${delegatedUserBlock}\n`);
  assert.notEqual(replacedUserBlock, original, 'Nao foi possivel instalar a seam estrutural de materializacao de usuario em memoria.');

  return replacedUserBlock.replace(
    /\tif \(user\._temp_password_plain && process\.env\.NODE_ENV !== 'production'\) \{\r?\n\t\tpayload\.tempPassword = user\._temp_password_plain;\r?\n\t\}/,
    "\tif (tempPasswordPlain && process.env.NODE_ENV !== 'production') {\n\t\tpayload.tempPassword = tempPasswordPlain;\n\t}"
  );
}

function buildUserMaterializationCoreSource() {
  return [
    'async function materializeCriarUsuarioUserMaterializationCore({',
    '  existingUser = null,',
    '  nome,',
    '  email,',
    '  cleanCpf,',
    '  requestedUserRole,',
    '  unidadeId,',
    '  funcionarioId = null,',
    '  senha,',
    '}) {',
    '  const isExistingUser = !!existingUser;',
    '  let user = existingUser;',
    '  let tempPasswordPlain = null;',
    '',
    '  if (!user) {',
    "    console.log('[criarUsuario] disparando createUserAndSendPassword');",
    '    user = await createUserAndSendPassword({',
    "      nome: (nome && nome.trim()) || String(email || '').split('@')[0],",
    '      email,',
    '      cpf: cleanCpf || undefined,',
    '      role: requestedUserRole,',
    '      unidade_id: unidadeId || null,',
    '      funcionario_id: funcionarioId || null,',
    '      senha,',
    '    });',
    '    tempPasswordPlain = user._temp_password_plain || null;',
    '  }',
    '',
    '  return { user, isExistingUser, tempPasswordPlain };',
    '}',
  ].join('\n');
}

function toPlainJson(value) {
  return JSON.parse(JSON.stringify(value));
}

test('createUsuarioExecutionService real atual delega a materializacao do usuario e preserva a orquestracao geral', () => {
  const serviceSource = stripComments(extractFunction(SERVICE_SOURCE, 'export async function createUsuarioExecutionService'));
  const seamSource = stripComments(extractFunction(SERVICE_SOURCE, 'async function materializeCriarUsuarioUserMaterializationCore'));

  assert.match(serviceSource, /materializeCriarUsuarioUserMaterializationCore\(/);
  assert.match(serviceSource, /materializeCriarUsuarioFuncionarioLinkCore\(/);
  assert.match(serviceSource, /materializeCriarUsuarioMembershipCore\(/);
  assert.match(serviceSource, /const payload = \{/);
  assert.doesNotMatch(serviceSource, /createUserAndSendPassword\(/);
  assert.doesNotMatch(serviceSource, /let user = existingUser/);
  assert.doesNotMatch(serviceSource, /const isExistingUser = !!existingUser/);

  assert.match(seamSource, /createUserAndSendPassword\(/);
  assert.match(seamSource, /const isExistingUser = !!existingUser/);
  assert.match(seamSource, /tempPasswordPlain/);
  assert.doesNotMatch(seamSource, /materializeCriarUsuarioFuncionarioLinkCore\(/);
  assert.doesNotMatch(seamSource, /materializeCriarUsuarioMembershipCore\(/);
  assert.doesNotMatch(seamSource, /const payload = \{/);
});

test('a seam futura de materializacao de usuario recebe apenas o contexto minimo necessario', async () => {
  const seamCalls = [];
  const funcionarioCalls = [];
  const membershipCalls = [];

  const createUsuarioExecutionService = buildFunction(buildDelegatedCreateServiceSource(), 'async function createUsuarioExecutionService', {
    materializeCriarUsuarioUserMaterializationCore: async (input) => {
      seamCalls.push(toPlainJson(input));
      return {
        user: { _id: 'u-1', nome: 'Novo Usuario', funcionario_id: null, unidade_id: null },
        isExistingUser: false,
        tempPasswordPlain: 'TEMP1234',
      };
    },
    materializeCriarUsuarioFuncionarioLinkCore: async (input) => {
      funcionarioCalls.push(toPlainJson({
        ...input,
        user: {
          _id: input.user._id,
          nome: input.user.nome,
          unidade_id: input.user.unidade_id,
          funcionario_id: input.user.funcionario_id,
        },
      }));
      return { kind: 'ok', linkedFuncionarioId: 'f-1', funcionarioNovo: null };
    },
    materializeCriarUsuarioMembershipCore: async (input) => {
      membershipCalls.push(toPlainJson(input));
      return { kind: 'ok' };
    },
    process: { env: { NODE_ENV: 'test' } },
    console,
    String,
  });

  const result = await createUsuarioExecutionService({
    existingUser: null,
    nome: 'Novo Usuario',
    email: 'novo@example.com',
    cleanCpf: '12345678900',
    requestedUserRole: 'user',
    unidadeId: 'un-1',
    funcionarioId: null,
    funcionarioDoc: null,
    wantsNewFuncionario: true,
    senha: 'Senha@123',
  });

  assert.deepEqual(seamCalls, [{
    existingUser: null,
    nome: 'Novo Usuario',
    email: 'novo@example.com',
    cleanCpf: '12345678900',
    requestedUserRole: 'user',
    unidadeId: 'un-1',
    funcionarioId: null,
    senha: 'Senha@123',
  }]);
  assert.equal(funcionarioCalls.length, 1);
  assert.equal(funcionarioCalls[0].user._id, 'u-1');
  assert.deepEqual(membershipCalls, [{
    userId: 'u-1',
    requestedUserRole: 'user',
    unidadeId: 'un-1',
    linkedFuncionarioId: 'f-1',
  }]);
  assert.deepEqual(toPlainJson(result), {
    kind: 'created',
    userId: 'u-1',
    payload: {
      id: 'u-1',
      funcionario_id: 'f-1',
      outcome: 'created',
      tempPassword: 'TEMP1234',
    },
  });
});

test('createUsuarioExecutionService com seam futura preserva outcome linked sem mover o payload final para dentro da seam', async () => {
  const createUsuarioExecutionService = buildFunction(buildDelegatedCreateServiceSource(), 'async function createUsuarioExecutionService', {
    materializeCriarUsuarioUserMaterializationCore: async () => ({
      user: { _id: 'u-existing', nome: 'Existente', funcionario_id: null, unidade_id: null },
      isExistingUser: true,
      tempPasswordPlain: null,
    }),
    materializeCriarUsuarioFuncionarioLinkCore: async () => ({
      kind: 'ok',
      linkedFuncionarioId: 'f-existing',
      funcionarioNovo: null,
    }),
    materializeCriarUsuarioMembershipCore: async () => ({ kind: 'ok' }),
    process: { env: { NODE_ENV: 'test' } },
    console,
    String,
  });

  const result = await createUsuarioExecutionService({
    existingUser: { _id: 'u-existing' },
    nome: 'Existente',
    email: 'existente@example.com',
    cleanCpf: '11122233344',
    requestedUserRole: 'user',
    unidadeId: 'un-2',
    funcionarioId: null,
    funcionarioDoc: null,
    wantsNewFuncionario: false,
    senha: undefined,
  });

  assert.deepEqual(toPlainJson(result), {
    kind: 'created',
    userId: 'u-existing',
    payload: {
      id: 'u-existing',
      funcionario_id: 'f-existing',
      outcome: 'linked',
    },
  });
});

test('createUsuarioExecutionService futuro deixa de conter diretamente createUserAndSendPassword e a decisao existingUser vs novo user', () => {
  const delegatedSource = stripComments(buildDelegatedCreateServiceSource());

  assert.match(delegatedSource, /materializeCriarUsuarioUserMaterializationCore\(/);
  assert.match(delegatedSource, /materializeCriarUsuarioFuncionarioLinkCore\(/);
  assert.match(delegatedSource, /materializeCriarUsuarioMembershipCore\(/);
  assert.match(delegatedSource, /const payload = \{/);
  assert.doesNotMatch(delegatedSource, /createUserAndSendPassword\(/);
  assert.doesNotMatch(delegatedSource, /let user = existingUser/);
  assert.doesNotMatch(delegatedSource, /const isExistingUser = !!existingUser/);
});

test('a futura seam de materializacao de usuario concentra apenas reaproveitamento ou criacao do user', () => {
  const seamSource = stripComments(buildUserMaterializationCoreSource());

  assert.match(seamSource, /async function materializeCriarUsuarioUserMaterializationCore\(/);
  assert.match(seamSource, /const isExistingUser = !!existingUser/);
  assert.match(seamSource, /createUserAndSendPassword\(/);
  assert.match(seamSource, /tempPasswordPlain/);
  assert.doesNotMatch(seamSource, /materializeCriarUsuarioFuncionarioLinkCore\(/);
  assert.doesNotMatch(seamSource, /materializeCriarUsuarioMembershipCore\(/);
  assert.doesNotMatch(seamSource, /const payload = \{/);
  assert.doesNotMatch(seamSource, /outcome:/);
});

test('a futura seam de materializacao de usuario preserva os caminhos de reaproveitamento e criacao', async () => {
  const createCalls = [];

  const materializeCriarUsuarioUserMaterializationCore = buildFunction(
    buildUserMaterializationCoreSource(),
    'async function materializeCriarUsuarioUserMaterializationCore',
    {
      createUserAndSendPassword: async (input) => {
        createCalls.push(toPlainJson(input));
        return {
          _id: 'u-new',
          nome: input.nome,
          unidade_id: null,
          funcionario_id: null,
          _temp_password_plain: 'TEMP9999',
        };
      },
      console,
      String,
    }
  );

  let result = await materializeCriarUsuarioUserMaterializationCore({
    existingUser: { _id: 'u-existing', nome: 'Existente' },
    nome: 'Existente',
    email: 'existente@example.com',
    cleanCpf: '11122233344',
    requestedUserRole: 'user',
    unidadeId: 'un-1',
    funcionarioId: null,
    senha: undefined,
  });

  assert.deepEqual(toPlainJson(result), {
    user: { _id: 'u-existing', nome: 'Existente' },
    isExistingUser: true,
    tempPasswordPlain: null,
  });
  assert.equal(createCalls.length, 0);

  result = await materializeCriarUsuarioUserMaterializationCore({
    existingUser: null,
    nome: 'Novo Usuario',
    email: 'novo@example.com',
    cleanCpf: '12345678900',
    requestedUserRole: 'user',
    unidadeId: 'un-2',
    funcionarioId: 'func-1',
    senha: 'Senha@123',
  });

  assert.equal(result.user._id, 'u-new');
  assert.equal(result.isExistingUser, false);
  assert.equal(result.tempPasswordPlain, 'TEMP9999');
  assert.deepEqual(createCalls, [{
    nome: 'Novo Usuario',
    email: 'novo@example.com',
    cpf: '12345678900',
    role: 'user',
    unidade_id: 'un-2',
    funcionario_id: 'func-1',
    senha: 'Senha@123',
  }]);
});