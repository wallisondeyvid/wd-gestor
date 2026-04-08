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
  if (original.includes('materializeCriarUsuarioFuncionarioLinkCore(')) {
    return original;
  }

  const currentSubflow = /(\tlet linkedFuncionarioId = funcionarioDoc\?\._id \|\| null;[\s\S]*?)(?=\n\r?\n\tconst membershipPayload = buildUserMembershipPayload\()/;
  const delegatedBlock = [
    'let linkedFuncionarioId = funcionarioDoc?._id || null;',
    'let funcionarioNovo = null;',
    '',
    'const funcionarioLinkResult = await materializeCriarUsuarioFuncionarioLinkCore({',
    '  user,',
    '  isExistingUser,',
    '  nome,',
    '  email,',
    '  cleanCpf,',
    '  unidadeId,',
    '  funcionarioId,',
    '  funcionarioDoc,',
    '  wantsNewFuncionario,',
    '});',
    "if (funcionarioLinkResult.kind === 'funcionario_create_error') {",
    '  return {',
    "    kind: 'funcionario_create_error',",
    '    message: funcionarioLinkResult.message,',
    '  };',
    '}',
    'linkedFuncionarioId = funcionarioLinkResult.linkedFuncionarioId;',
    'funcionarioNovo = funcionarioLinkResult.funcionarioNovo;',
  ].join('\n\t');

  const replaced = original.replace(currentSubflow, delegatedBlock);
  assert.notEqual(replaced, original, 'Nao foi possivel instalar a seam estrutural de funcionario em memoria.');
  return replaced;
}

function buildFuncionarioLinkCoreSource() {
  return [
    'async function materializeCriarUsuarioFuncionarioLinkCore({',
    '  user,',
    '  isExistingUser,',
    '  nome,',
    '  email,',
    '  cleanCpf,',
    '  unidadeId,',
    '  funcionarioId,',
    '  funcionarioDoc,',
    '  wantsNewFuncionario,',
    '}) {',
    '  let linkedFuncionarioId = funcionarioDoc?._id || null;',
    '  let funcionarioNovo = null;',
    '',
    '  if (funcionarioDoc) {',
    '    try {',
    '      const shouldSyncUserFuncionarioId = !user.funcionario_id;',
    '      if (!isExistingUser || shouldSyncUserFuncionarioId) {',
    '        user.funcionario_id = funcionarioDoc._id;',
    '        if (!user.unidade_id) user.unidade_id = funcionarioDoc.unidade_id;',
    '        await saveUserDoc(user);',
    '      }',
    '      await setCriarUsuarioFuncionarioUsuarioIdIfEmpty(funcionarioDoc._id, user._id, funcionarioDoc.unidade_id || unidadeId || null);',
    '    } catch (linkErr) {',
    "      console.warn('[criarUsuario] falha ao vincular funcionario_id informado:', linkErr?.message || linkErr);",
    '    }',
    '  }',
    '',
    '  if (wantsNewFuncionario && !funcionarioId) {',
    '    try {',
    '      const existente = await findCriarUsuarioFuncionarioByCpfUnidade(cleanCpf, unidadeId);',
    '      if (existente) {',
    '        linkedFuncionarioId = existente._id;',
    '        const shouldSyncUserFuncionarioId = !user.funcionario_id;',
    '        if (!isExistingUser || shouldSyncUserFuncionarioId) {',
    '          user.funcionario_id = existente._id;',
    '          if (!user.unidade_id) user.unidade_id = existente.unidade_id || unidadeId;',
    '          await saveUserDoc(user);',
    '        }',
    '        try { await setCriarUsuarioFuncionarioUsuarioIdById(existente._id, user._id); } catch (_up) {}',
    "        console.log('[criarUsuario] Vinculado a funcionário existente', { funcionario_id: existente._id.toString(), user_id: user._id.toString() });",
    '      } else {',
    "        const placeholderRG = 'RG' + Date.now();",
    "        const placeholderNascimento = new Date('2000-01-01');",
    "        const placeholderTelefone = '(00) 0000-0000';",
    '        funcionarioNovo = await createCriarUsuarioFuncionarioDoc({',
    '          unidade_id: unidadeId,',
    "          nome: user.nome || (nome && nome.trim()) || String(email || '').split('@')[0],",
    '          rg: placeholderRG,',
    '          cpf: cleanCpf,',
    '          data_nascimento: placeholderNascimento,',
    "          sexo: 'N',",
    '          email,',
    '          telefone: placeholderTelefone,',
    '          usuario_id: user._id,',
    '        });',
    '        linkedFuncionarioId = funcionarioNovo._id;',
    '        if (!isExistingUser) {',
    '          user.funcionario_id = funcionarioNovo._id;',
    '          if (!user.unidade_id) user.unidade_id = unidadeId;',
    '          await saveUserDoc(user);',
    '        }',
    "        console.log('[criarUsuario] Funcionário placeholder criado e vinculado', { funcionario_id: funcionarioNovo._id.toString(), user_id: user._id.toString() });",
    '      }',
    '    } catch (errFuncionario) {',
    "      const msg = String(errFuncionario && (errFuncionario.message || errFuncionario));",
    "      const code = (errFuncionario && (errFuncionario.code || errFuncionario?.original?.code)) || null;",
    "      const isDup = code === 11000 || /duplicate key/i.test(msg);",
    '      if (isDup) {',
    '        try {',
    '          const existente = cleanCpf',
    '            ? await findCriarUsuarioFuncionarioByCpfUnidade(cleanCpf, unidadeId)',
    '            : null;',
    '          if (existente) {',
    '            linkedFuncionarioId = existente._id;',
    '            if (!isExistingUser) {',
    '              user.funcionario_id = existente._id;',
    '              if (!user.unidade_id) user.unidade_id = existente.unidade_id || unidadeId;',
    '              await saveUserDoc(user);',
    '            }',
    '            try { await setCriarUsuarioFuncionarioUsuarioIdById(existente._id, user._id); } catch (_up2) {}',
    "            console.warn('[criarUsuario] Conflito ao criar funcionário; vinculado a existente', { funcionario_id: existente._id.toString() });",
    '          }',
    '        } catch (_e) {}',
    '      } else {',
    '        return {',
    "          kind: 'funcionario_create_error',",
    "          message: 'Falha ao criar funcionário automático: ' + (errFuncionario.message || 'erro'),",
    '        };',
    '      }',
    '    }',
    '  }',
    '',
    '  return { kind: \"ok\", linkedFuncionarioId, funcionarioNovo };',
    '}',
  ].join('\n');
}

function toPlainJson(value) {
  return JSON.parse(JSON.stringify(value));
}

test('createUsuarioExecutionService real atual delega funcionario e preserva sua fronteira isolada', () => {
  const serviceSource = stripComments(extractFunction(SERVICE_SOURCE, 'export async function createUsuarioExecutionService'));
  const seamSource = stripComments(extractFunction(SERVICE_SOURCE, 'async function materializeCriarUsuarioFuncionarioLinkCore'));

  assert.match(serviceSource, /materializeCriarUsuarioUserMaterializationCore\(/);
  assert.match(serviceSource, /materializeCriarUsuarioFuncionarioLinkCore\(/);
  assert.doesNotMatch(serviceSource, /findCriarUsuarioFuncionarioByCpfUnidade\(/);
  assert.doesNotMatch(serviceSource, /setCriarUsuarioFuncionarioUsuarioIdIfEmpty\(/);
  assert.doesNotMatch(serviceSource, /setCriarUsuarioFuncionarioUsuarioIdById\(/);
  assert.doesNotMatch(serviceSource, /createCriarUsuarioFuncionarioDoc\(/);

  assert.match(seamSource, /findCriarUsuarioFuncionarioByCpfUnidade\(/);
  assert.match(seamSource, /setCriarUsuarioFuncionarioUsuarioIdIfEmpty\(/);
  assert.match(seamSource, /setCriarUsuarioFuncionarioUsuarioIdById\(/);
  assert.match(seamSource, /createCriarUsuarioFuncionarioDoc\(/);
});

test('a seam futura de funcionario recebe apenas o contexto minimo de vinculo e materializacao', async () => {
  const seamCalls = [];
  const createUsuarioExecutionService = buildFunction(buildDelegatedCreateServiceSource(), 'async function createUsuarioExecutionService', {
    materializeCriarUsuarioUserMaterializationCore: async () => ({
      user: { _id: 'u-1', nome: 'Novo Usuario', unidade_id: null, funcionario_id: null },
      isExistingUser: false,
      tempPasswordPlain: null,
    }),
    materializeCriarUsuarioMembershipCore: async () => ({ kind: 'ok' }),
    materializeCriarUsuarioFuncionarioLinkCore: async (input) => {
      seamCalls.push(toPlainJson({
        ...input,
        user: {
          _id: input.user._id,
          nome: input.user.nome,
          unidade_id: input.user.unidade_id,
          funcionario_id: input.user.funcionario_id,
        },
      }));
      return { kind: 'ok', linkedFuncionarioId: 'f-1', funcionarioNovo: { _id: 'f-1' } };
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
    user: { _id: 'u-1', nome: 'Novo Usuario', unidade_id: null, funcionario_id: null },
    isExistingUser: false,
    nome: 'Novo Usuario',
    email: 'novo@example.com',
    cleanCpf: '12345678900',
    unidadeId: 'un-1',
    funcionarioId: null,
    funcionarioDoc: null,
    wantsNewFuncionario: true,
  }]);
  assert.deepEqual(toPlainJson(result), {
    kind: 'created',
    userId: 'u-1',
    payload: { id: 'u-1', funcionario_id: 'f-1', outcome: 'created' },
  });
});

test('createUsuarioExecutionService com seam futura preserva a orquestracao geral e o ramo funcionario_create_error', async () => {
  const createUsuarioExecutionService = buildFunction(buildDelegatedCreateServiceSource(), 'async function createUsuarioExecutionService', {
    materializeCriarUsuarioUserMaterializationCore: async () => ({
      user: { _id: 'u-2', nome: 'Erro Usuario', unidade_id: null, funcionario_id: null },
      isExistingUser: false,
      tempPasswordPlain: null,
    }),
    materializeCriarUsuarioMembershipCore: async () => ({ kind: 'ok' }),
    materializeCriarUsuarioFuncionarioLinkCore: async () => ({
      kind: 'funcionario_create_error',
      message: 'Falha ao criar funcionário automático: erro',
    }),
    console,
    process: { env: { NODE_ENV: 'test' } },
    String,
  });

  const result = await createUsuarioExecutionService({
    existingUser: null,
    nome: 'Erro Usuario',
    email: 'erro@example.com',
    cleanCpf: '99988877766',
    requestedUserRole: 'user',
    unidadeId: 'un-2',
    funcionarioId: null,
    funcionarioDoc: null,
    wantsNewFuncionario: true,
    senha: 'Senha@123',
  });

  assert.deepEqual(toPlainJson(result), {
    kind: 'funcionario_create_error',
    message: 'Falha ao criar funcionário automático: erro',
  });
});

test('createUsuarioExecutionService futuro deixa de conter diretamente o subfluxo de funcionario', () => {
  const delegatedSource = stripComments(buildDelegatedCreateServiceSource());

  assert.match(delegatedSource, /materializeCriarUsuarioFuncionarioLinkCore\(/);
  assert.match(delegatedSource, /materializeCriarUsuarioUserMaterializationCore\(/);
  assert.match(delegatedSource, /materializeCriarUsuarioMembershipCore\(/);
  assert.doesNotMatch(delegatedSource, /findCriarUsuarioFuncionarioByCpfUnidade\(/);
  assert.doesNotMatch(delegatedSource, /setCriarUsuarioFuncionarioUsuarioIdIfEmpty\(/);
  assert.doesNotMatch(delegatedSource, /setCriarUsuarioFuncionarioUsuarioIdById\(/);
  assert.doesNotMatch(delegatedSource, /createCriarUsuarioFuncionarioDoc\(/);
});

test('a futura seam de funcionario concentra localizar, vincular, materializar e sincronizar funcionario', () => {
  const seamSource = stripComments(buildFuncionarioLinkCoreSource());

  assert.match(seamSource, /async function materializeCriarUsuarioFuncionarioLinkCore\(/);
  assert.match(seamSource, /findCriarUsuarioFuncionarioByCpfUnidade\(/);
  assert.match(seamSource, /setCriarUsuarioFuncionarioUsuarioIdIfEmpty\(/);
  assert.match(seamSource, /setCriarUsuarioFuncionarioUsuarioIdById\(/);
  assert.match(seamSource, /createCriarUsuarioFuncionarioDoc\(/);
  assert.match(seamSource, /saveUserDoc\(user\)/);
  assert.doesNotMatch(seamSource, /materializeCriarUsuarioUserMaterializationCore\(/);
  assert.doesNotMatch(seamSource, /materializeCriarUsuarioMembershipCore\(/);
});

test('a futura seam de funcionario preserva os ramos de vinculo existente, criacao placeholder e erro semantico', async () => {
  const calls = [];
  const materializeCriarUsuarioFuncionarioLinkCore = buildFunction(buildFuncionarioLinkCoreSource(), 'async function materializeCriarUsuarioFuncionarioLinkCore', {
    saveUserDoc: async (user) => {
      calls.push({ op: 'saveUserDoc', user: { _id: user._id, unidade_id: user.unidade_id, funcionario_id: user.funcionario_id } });
    },
    findCriarUsuarioFuncionarioByCpfUnidade: async (cleanCpf, unidadeId) => {
      calls.push({ op: 'findFuncionario', cleanCpf, unidadeId });
      if (cleanCpf === '111') return { _id: 'f-existing', unidade_id: 'un-existing', toString() { return 'f-existing'; } };
      if (cleanCpf === '333') throw new Error('falha inesperada');
      return null;
    },
    setCriarUsuarioFuncionarioUsuarioIdIfEmpty: async (funcionarioId, userId, unidadeId) => {
      calls.push({ op: 'setIfEmpty', funcionarioId, userId, unidadeId });
    },
    setCriarUsuarioFuncionarioUsuarioIdById: async (funcionarioId, userId) => {
      calls.push({ op: 'setById', funcionarioId, userId });
    },
    createCriarUsuarioFuncionarioDoc: async (doc) => {
      calls.push({ op: 'createFuncionarioDoc', doc: { unidade_id: doc.unidade_id, cpf: doc.cpf, email: doc.email, usuario_id: doc.usuario_id } });
      return { _id: 'f-new', ...doc, toString() { return 'f-new'; } };
    },
    console: { log() {}, warn() {} },
    Date: class FakeDate extends Date {
      constructor(value) { super(value || '2026-01-01T00:00:00.000Z'); }
      static now() { return 1234567890; }
    },
    String,
  });

  let user = { _id: 'u-1', nome: 'Existente', unidade_id: null, funcionario_id: null };
  let result = await materializeCriarUsuarioFuncionarioLinkCore({
    user,
    isExistingUser: true,
    nome: 'Existente',
    email: 'existente@example.com',
    cleanCpf: '111',
    unidadeId: 'un-1',
    funcionarioId: 'f-doc',
    funcionarioDoc: { _id: 'f-doc', unidade_id: 'un-doc' },
    wantsNewFuncionario: false,
  });
  assert.deepEqual(toPlainJson(result), { kind: 'ok', linkedFuncionarioId: 'f-doc', funcionarioNovo: null });

  user = { _id: 'u-2', nome: 'Novo', unidade_id: null, funcionario_id: null };
  result = await materializeCriarUsuarioFuncionarioLinkCore({
    user,
    isExistingUser: false,
    nome: 'Novo',
    email: 'novo@example.com',
    cleanCpf: '222',
    unidadeId: 'un-2',
    funcionarioId: null,
    funcionarioDoc: null,
    wantsNewFuncionario: true,
  });
  assert.equal(result.kind, 'ok');
  assert.equal(result.linkedFuncionarioId, 'f-new');
  assert.equal(result.funcionarioNovo._id, 'f-new');

  user = { _id: 'u-3', nome: 'Erro', unidade_id: null, funcionario_id: null };
  result = await materializeCriarUsuarioFuncionarioLinkCore({
    user,
    isExistingUser: false,
    nome: 'Erro',
    email: 'erro@example.com',
    cleanCpf: '333',
    unidadeId: 'un-3',
    funcionarioId: null,
    funcionarioDoc: null,
    wantsNewFuncionario: true,
  });
  assert.equal(result.kind, 'funcionario_create_error');
  assert.match(result.message, /Falha ao criar funcionário automático:/);

  const setIfEmptyCall = calls.find((entry) => entry.op === 'setIfEmpty');
  assert.deepEqual(setIfEmptyCall, {
    op: 'setIfEmpty',
    funcionarioId: 'f-doc',
    userId: 'u-1',
    unidadeId: 'un-doc',
  });
});