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
  if (original.includes('materializeCriarUsuarioMembershipCore(')) {
    return original;
  }

  const currentSubflow = /(\tconst membershipPayload = buildUserMembershipPayload\([\s\S]*?\t\}\r?\n\t\}\r?\n)(?=\r?\n\tconst payload = \{)/;
  const delegatedBlock = [
    'const membershipResult = await materializeCriarUsuarioMembershipCore({',
    '  userId: user._id,',
    '  requestedUserRole,',
    '  unidadeId,',
    '  linkedFuncionarioId,',
    '});',
    "if (membershipResult.kind === 'membership_duplicate') {",
    '  return { kind: "membership_duplicate" };',
    '}',
    "if (membershipResult.kind === 'membership_error') {",
    '  return {',
    '    kind: "membership_error",',
    '    message: membershipResult.message,',
    '  };',
    '}',
  ].join('\n\t');

  const replaced = original.replace(currentSubflow, `${delegatedBlock}\n`);
  assert.notEqual(replaced, original, 'Nao foi possivel instalar a seam estrutural de membership em memoria.');
  return replaced;
}

function buildMembershipCoreSource() {
  return [
    'async function materializeCriarUsuarioMembershipCore({',
    '  userId,',
    '  requestedUserRole,',
    '  unidadeId,',
    '  linkedFuncionarioId,',
    '}) {',
    '  const membershipPayload = buildUserMembershipPayload({',
    '    userId,',
    '    role: requestedUserRole,',
    '    unidadeId,',
    '    funcionarioId: linkedFuncionarioId,',
    '  });',
    '  if (!membershipPayload) {',
    '    return { kind: "ok" };',
    '  }',
    '',
    '  try {',
    '    await createUserMembership(membershipPayload);',
    '  } catch (membershipErr) {',
    '    if (isDuplicateKeyError(membershipErr)) {',
    '      return { kind: "membership_duplicate" };',
    '    }',
    "    console.error('[criarUsuario] falha ao criar membership:', membershipErr);",
    '    return {',
    '      kind: "membership_error",',
    '      message: "Falha ao criar vínculo do usuário com a unidade",',
    '    };',
    '  }',
    '',
    '  return { kind: "ok" };',
    '}',
  ].join('\n');
}

function toPlainJson(value) {
  return JSON.parse(JSON.stringify(value));
}

test('createUsuarioExecutionService real atual delega membership e preserva a orquestracao geral', () => {
  const serviceSource = stripComments(extractFunction(SERVICE_SOURCE, 'export async function createUsuarioExecutionService'));
  const seamSource = stripComments(extractFunction(SERVICE_SOURCE, 'async function materializeCriarUsuarioMembershipCore'));

  assert.match(serviceSource, /materializeCriarUsuarioUserMaterializationCore\(/);
  assert.match(serviceSource, /materializeCriarUsuarioFuncionarioLinkCore\(/);
  assert.match(serviceSource, /materializeCriarUsuarioMembershipCore\(/);
  assert.doesNotMatch(serviceSource, /buildUserMembershipPayload\(/);
  assert.doesNotMatch(serviceSource, /createUserMembership\(/);
  assert.doesNotMatch(serviceSource, /isDuplicateKeyError\(/);
  assert.doesNotMatch(serviceSource, /kind: 'membership_duplicate'/);
  assert.doesNotMatch(serviceSource, /kind: 'membership_error'/);

  assert.match(seamSource, /buildUserMembershipPayload\(/);
  assert.match(seamSource, /createUserMembership\(/);
  assert.match(seamSource, /isDuplicateKeyError\(/);
  assert.match(seamSource, /kind: 'membership_duplicate'/);
  assert.match(seamSource, /kind: 'membership_error'/);
});

test('a seam futura de membership recebe apenas o contexto minimo', async () => {
  const seamCalls = [];
  const createUsuarioExecutionService = buildFunction(buildDelegatedCreateServiceSource(), 'async function createUsuarioExecutionService', {
    materializeCriarUsuarioUserMaterializationCore: async () => ({
      user: {
        _id: 'u-1',
        nome: 'Novo Usuario',
        unidade_id: null,
        funcionario_id: null,
      },
      isExistingUser: false,
      tempPasswordPlain: null,
    }),
    materializeCriarUsuarioFuncionarioLinkCore: async () => ({
      kind: 'ok',
      linkedFuncionarioId: 'f-1',
      funcionarioNovo: null,
    }),
    materializeCriarUsuarioMembershipCore: async (input) => {
      seamCalls.push(toPlainJson(input));
      return { kind: 'ok' };
    },
    console,
    process: { env: { NODE_ENV: 'test' } },
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
    userId: 'u-1',
    requestedUserRole: 'user',
    unidadeId: 'un-1',
    linkedFuncionarioId: 'f-1',
  }]);
  assert.deepEqual(toPlainJson(result), {
    kind: 'created',
    userId: 'u-1',
    payload: { id: 'u-1', funcionario_id: 'f-1', outcome: 'created' },
  });
});

test('createUsuarioExecutionService com seam futura preserva os ramos membership_duplicate e membership_error', async () => {
  const membershipResults = [
    { kind: 'membership_duplicate' },
    { kind: 'membership_error', message: 'Falha ao criar vínculo do usuário com a unidade' },
  ];

  const createUsuarioExecutionService = buildFunction(buildDelegatedCreateServiceSource(), 'async function createUsuarioExecutionService', {
    materializeCriarUsuarioUserMaterializationCore: async () => ({
      user: {
        _id: 'u-2',
        nome: 'Usuario',
        unidade_id: null,
        funcionario_id: null,
      },
      isExistingUser: false,
      tempPasswordPlain: null,
    }),
    materializeCriarUsuarioFuncionarioLinkCore: async () => ({
      kind: 'ok',
      linkedFuncionarioId: 'f-2',
      funcionarioNovo: null,
    }),
    materializeCriarUsuarioMembershipCore: async () => membershipResults.shift(),
    console,
    process: { env: { NODE_ENV: 'test' } },
    String,
  });

  let result = await createUsuarioExecutionService({
    existingUser: null,
    nome: 'Usuario',
    email: 'user@example.com',
    cleanCpf: '99988877766',
    requestedUserRole: 'user',
    unidadeId: 'un-2',
    funcionarioId: null,
    funcionarioDoc: null,
    wantsNewFuncionario: false,
    senha: 'Senha@123',
  });
  assert.deepEqual(toPlainJson(result), { kind: 'membership_duplicate' });

  result = await createUsuarioExecutionService({
    existingUser: null,
    nome: 'Usuario',
    email: 'user@example.com',
    cleanCpf: '99988877766',
    requestedUserRole: 'user',
    unidadeId: 'un-2',
    funcionarioId: null,
    funcionarioDoc: null,
    wantsNewFuncionario: false,
    senha: 'Senha@123',
  });
  assert.deepEqual(toPlainJson(result), {
    kind: 'membership_error',
    message: 'Falha ao criar vínculo do usuário com a unidade',
  });
});

test('createUsuarioExecutionService futuro deixa de conter diretamente a traducao semantica de membership', () => {
  const delegatedSource = stripComments(buildDelegatedCreateServiceSource());

  assert.match(delegatedSource, /materializeCriarUsuarioUserMaterializationCore\(/);
  assert.match(delegatedSource, /materializeCriarUsuarioFuncionarioLinkCore\(/);
  assert.match(delegatedSource, /materializeCriarUsuarioMembershipCore\(/);
  assert.match(delegatedSource, /const payload = \{/);
  assert.doesNotMatch(delegatedSource, /buildUserMembershipPayload\(/);
  assert.doesNotMatch(delegatedSource, /createUserMembership\(/);
  assert.doesNotMatch(delegatedSource, /isDuplicateKeyError\(/);
  assert.doesNotMatch(delegatedSource, /kind: 'membership_duplicate'/);
  assert.doesNotMatch(delegatedSource, /kind: 'membership_error'/);
});

test('a futura seam de membership concentra apenas payload, persistencia e traducao semantica', () => {
  const seamSource = stripComments(buildMembershipCoreSource());

  assert.match(seamSource, /async function materializeCriarUsuarioMembershipCore\(/);
  assert.match(seamSource, /buildUserMembershipPayload\(/);
  assert.match(seamSource, /createUserMembership\(/);
  assert.match(seamSource, /isDuplicateKeyError\(/);
  assert.match(seamSource, /kind: "membership_duplicate"/);
  assert.match(seamSource, /kind: "membership_error"/);
  assert.match(seamSource, /return \{ kind: "ok" \}/);
  assert.doesNotMatch(seamSource, /materializeCriarUsuarioUserMaterializationCore\(/);
  assert.doesNotMatch(seamSource, /materializeCriarUsuarioFuncionarioLinkCore\(/);
  assert.doesNotMatch(seamSource, /const payload = \{/);
  assert.doesNotMatch(seamSource, /outcome:/);
});

test('a futura seam de membership preserva no-op, duplicate e erro generico', async () => {
  const createMembershipCalls = [];
  const membershipPayloads = [null, { ok: 1 }, { ok: 2 }, { ok: 3 }];

  const materializeCriarUsuarioMembershipCore = buildFunction(buildMembershipCoreSource(), 'async function materializeCriarUsuarioMembershipCore', {
    buildUserMembershipPayload: () => membershipPayloads.shift(),
    createUserMembership: async (payload) => {
      createMembershipCalls.push(payload);
      if (createMembershipCalls.length === 2) {
        const error = new Error('duplicate key');
        error.code = 11000;
        throw error;
      }
      if (createMembershipCalls.length === 3) {
        throw new Error('falha generica');
      }
    },
    isDuplicateKeyError: (error) => {
      const code = error?.code || error?.original?.code || null;
      return code === 11000 || /duplicate key/i.test(String(error?.message || error || ''));
    },
    console: { error() {} },
  });

  let result = await materializeCriarUsuarioMembershipCore({
    userId: 'u-1',
    requestedUserRole: 'user',
    unidadeId: 'un-1',
    linkedFuncionarioId: 'f-1',
  });
  assert.deepEqual(toPlainJson(result), { kind: 'ok' });
  assert.equal(createMembershipCalls.length, 0);

  result = await materializeCriarUsuarioMembershipCore({
    userId: 'u-1',
    requestedUserRole: 'user',
    unidadeId: 'un-1',
    linkedFuncionarioId: 'f-1',
  });
  assert.deepEqual(toPlainJson(result), { kind: 'ok' });
  assert.equal(createMembershipCalls.length, 1);

  result = await materializeCriarUsuarioMembershipCore({
    userId: 'u-1',
    requestedUserRole: 'user',
    unidadeId: 'un-1',
    linkedFuncionarioId: 'f-1',
  });
  assert.deepEqual(toPlainJson(result), { kind: 'membership_duplicate' });

  result = await materializeCriarUsuarioMembershipCore({
    userId: 'u-1',
    requestedUserRole: 'user',
    unidadeId: 'un-1',
    linkedFuncionarioId: 'f-1',
  });
  assert.deepEqual(toPlainJson(result), {
    kind: 'membership_error',
    message: 'Falha ao criar vínculo do usuário com a unidade',
  });
});