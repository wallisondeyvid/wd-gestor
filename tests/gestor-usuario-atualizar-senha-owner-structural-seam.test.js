import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/userController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

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

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

function buildFunction(source, signature, context = {}) {
  const functionSource = extractFunction(source, signature);
  const script = new vm.Script(`(${functionSource})`);
  return script.runInNewContext(context);
}

function buildDelegatedHandlerSource() {
  const original = extractFunction(CONTROLLER_SOURCE, 'export async function atualizarSenhaUsuario');
  if (original.includes('atualizarSenhaUsuarioExecutionService(')) {
    return original;
  }

  const inlineBlock = /const user = await findUserById\(req\.user\.id\);[\s\S]*?return ok\(res, \{ updated:true, primeiro_acesso:false, senha_provisoria:false \}\);/;

  const delegatedBlock = [
    'const result = await atualizarSenhaUsuarioExecutionService({',
    '  userId: req.user.id,',
    '  senhaAtual,',
    '  novaSenha,',
    '});',
    "if (result.kind === 'not_found') return notFound(res, 'Usuário não encontrado');",
    "if (result.kind === 'invalid_current_password') return badRequest(res, 'Senha atual inválida');",
    "return ok(res, { updated:true, primeiro_acesso:false, senha_provisoria:false });",
  ].join('\n\t\t');

  const replaced = original.replace(inlineBlock, delegatedBlock);
  assert.notEqual(replaced, original, 'Nao foi possivel instalar a seam estrutural de atualizarSenhaUsuario em memoria.');
  return replaced;
}

function buildExecutionServiceSource() {
  return [
    'async function atualizarSenhaUsuarioExecutionService({ userId, senhaAtual, novaSenha }) {',
    '  const user = await findUserById(userId);',
    "  if (!user) return { kind: 'not_found' };",
    '  const confere = await bcrypt.compare(senhaAtual, user.senha);',
    "  if (!confere) return { kind: 'invalid_current_password' };",
    "  user.senha = await bcrypt.hash(novaSenha, 10);",
    '  if (user.primeiro_acesso) user.primeiro_acesso = false;',
    '  if (user.senha_provisoria) user.senha_provisoria = false;',
    '  await saveUserDoc(user);',
    "  return { kind: 'updated', updated: true, primeiro_acesso: false, senha_provisoria: false };",
    '}',
  ].join('\n');
}

function createApiRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function toPlainJson(value) {
  return JSON.parse(JSON.stringify(value));
}

test('atualizarSenhaUsuario real atual delega a unidade de dominio e preserva gate, validacao basica e traducao HTTP', () => {
  const handlerSource = stripComments(extractFunction(CONTROLLER_SOURCE, 'export async function atualizarSenhaUsuario'));

  assert.match(handlerSource, /if \(!req\.user\)/);
  assert.match(handlerSource, /const \{ senhaAtual, novaSenha \} = req\.body;/);
  assert.match(handlerSource, /atualizarSenhaUsuarioExecutionService\(\{ userId: req\.user\.id, senhaAtual, novaSenha \}\)/);
  assert.match(handlerSource, /if \(result\.kind === 'not_found'\) return notFound\(res, 'Usuário não encontrado'\);/);
  assert.match(handlerSource, /if \(result\.kind === 'invalid_current_password'\) return badRequest\(res, 'Senha atual inválida'\);/);
  assert.doesNotMatch(handlerSource, /findUserById\(req\.user\.id\)/);
  assert.doesNotMatch(handlerSource, /bcrypt\.compare\(senhaAtual, user\.senha\)/);
  assert.doesNotMatch(handlerSource, /bcrypt\.hash\(novaSenha, 10\)/);
  assert.doesNotMatch(handlerSource, /saveUserDoc\(user\)/);
});

test('atualizarSenhaUsuario com seam futura delega apenas o contexto minimo da troca de senha', async () => {
  const calls = [];
  const atualizarSenhaUsuario = buildFunction(buildDelegatedHandlerSource(), 'async function atualizarSenhaUsuario', {
    atualizarSenhaUsuarioExecutionService: async (input) => {
      calls.push(toPlainJson(input));
      return { kind: 'updated', updated: true, primeiro_acesso: false, senha_provisoria: false };
    },
    badRequest: (res, error) => res.status(400).json({ success: false, error }),
    notFound: (res, error) => res.status(404).json({ success: false, error }),
    ok: (res, data = {}) => res.status(200).json({ success: true, data }),
    serverError: (res, error) => res.status(500).json({ success: false, error }),
    console,
  });

  const req = {
    user: { id: 'u-1' },
    body: { senhaAtual: 'Atual@123', novaSenha: 'Nova@123' },
  };
  const res = createApiRes();

  await atualizarSenhaUsuario(req, res);

  assert.deepEqual(calls, [{ userId: 'u-1', senhaAtual: 'Atual@123', novaSenha: 'Nova@123' }]);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(toPlainJson(res.body), {
    success: true,
    data: { updated: true, primeiro_acesso: false, senha_provisoria: false },
  });
});

test('atualizarSenhaUsuario com seam futura preserva gate de autenticacao e validacao basica de parametros', async () => {
  const calls = [];
  const atualizarSenhaUsuario = buildFunction(buildDelegatedHandlerSource(), 'async function atualizarSenhaUsuario', {
    atualizarSenhaUsuarioExecutionService: async (input) => {
      calls.push(input);
      return { kind: 'updated' };
    },
    badRequest: (res, error) => res.status(400).json({ success: false, error }),
    notFound: (res, error) => res.status(404).json({ success: false, error }),
    ok: (res, data = {}) => res.status(200).json({ success: true, data }),
    serverError: (res, error) => res.status(500).json({ success: false, error }),
    console,
  });

  let res = createApiRes();
  await atualizarSenhaUsuario({ user: null, body: {} }, res);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(toPlainJson(res.body), {
    success: false,
    error: 'Não autenticado',
    code: 'UNAUTHORIZED',
  });

  res = createApiRes();
  await atualizarSenhaUsuario({ user: { id: 'u-1' }, body: { senhaAtual: '', novaSenha: 'Nova@123' } }, res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(toPlainJson(res.body), {
    success: false,
    error: 'Parâmetros insuficientes',
  });

  assert.deepEqual(calls, []);
});

test('atualizarSenhaUsuario com seam futura preserva notFound, senha invalida e serverError', async () => {
  const sequence = [
    { kind: 'not_found' },
    { kind: 'invalid_current_password' },
    new Error('save exploded'),
  ];
  const atualizarSenhaUsuario = buildFunction(buildDelegatedHandlerSource(), 'async function atualizarSenhaUsuario', {
    atualizarSenhaUsuarioExecutionService: async () => {
      const next = sequence.shift();
      if (next instanceof Error) throw next;
      return next;
    },
    badRequest: (res, error) => res.status(400).json({ success: false, error }),
    notFound: (res, error) => res.status(404).json({ success: false, error }),
    ok: (res, data = {}) => res.status(200).json({ success: true, data }),
    serverError: (res, error) => res.status(500).json({ success: false, error }),
    console: { error() {} },
  });

  let res = createApiRes();
  await atualizarSenhaUsuario({ user: { id: 'u-1' }, body: { senhaAtual: 'Atual@123', novaSenha: 'Nova@123' } }, res);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(toPlainJson(res.body), { success: false, error: 'Usuário não encontrado' });

  res = createApiRes();
  await atualizarSenhaUsuario({ user: { id: 'u-1' }, body: { senhaAtual: 'Atual@123', novaSenha: 'Nova@123' } }, res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(toPlainJson(res.body), { success: false, error: 'Senha atual inválida' });

  res = createApiRes();
  await atualizarSenhaUsuario({ user: { id: 'u-1' }, body: { senhaAtual: 'Atual@123', novaSenha: 'Nova@123' } }, res);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(toPlainJson(res.body), { success: false, error: 'Falha ao atualizar senha' });
});

test('atualizarSenhaUsuario futuro handler deixa de falar diretamente com findUserById, bcrypt e saveUserDoc', () => {
  const delegatedSource = stripComments(buildDelegatedHandlerSource());

  assert.match(delegatedSource, /atualizarSenhaUsuarioExecutionService\(/);
  assert.doesNotMatch(delegatedSource, /findUserById\(/);
  assert.doesNotMatch(delegatedSource, /bcrypt\.compare\(/);
  assert.doesNotMatch(delegatedSource, /bcrypt\.hash\(/);
  assert.doesNotMatch(delegatedSource, /saveUserDoc\(/);
});

test('atualizarSenhaUsuarioExecutionService futura concentra busca, validacao, hash, limpeza de flags e persistencia', async () => {
  const calls = [];
  const atualizarSenhaUsuarioExecutionService = buildFunction(buildExecutionServiceSource(), 'async function atualizarSenhaUsuarioExecutionService', {
    findUserById: async (userId) => {
      calls.push({ op: 'findUserById', userId });
      return {
        _id: userId,
        senha: 'HASH_ATUAL',
        primeiro_acesso: true,
        senha_provisoria: true,
      };
    },
    bcrypt: {
      compare: async (senhaAtual, senhaHash) => {
        calls.push({ op: 'compare', senhaAtual, senhaHash });
        return true;
      },
      hash: async (novaSenha, rounds) => {
        calls.push({ op: 'hash', novaSenha, rounds });
        return 'HASH_NOVA';
      },
    },
    saveUserDoc: async (user) => {
      calls.push({
        op: 'saveUserDoc',
        user: {
          _id: user._id,
          senha: user.senha,
          primeiro_acesso: user.primeiro_acesso,
          senha_provisoria: user.senha_provisoria,
        },
      });
    },
  });

  const result = await atualizarSenhaUsuarioExecutionService({
    userId: 'u-1',
    senhaAtual: 'Atual@123',
    novaSenha: 'Nova@123',
  });

  assert.deepEqual(toPlainJson(calls), [
    { op: 'findUserById', userId: 'u-1' },
    { op: 'compare', senhaAtual: 'Atual@123', senhaHash: 'HASH_ATUAL' },
    { op: 'hash', novaSenha: 'Nova@123', rounds: 10 },
    {
      op: 'saveUserDoc',
      user: {
        _id: 'u-1',
        senha: 'HASH_NOVA',
        primeiro_acesso: false,
        senha_provisoria: false,
      },
    },
  ]);
  assert.deepEqual(toPlainJson(result), {
    kind: 'updated',
    updated: true,
    primeiro_acesso: false,
    senha_provisoria: false,
  });
});

test('atualizarSenhaUsuarioExecutionService futura preserva ramos not_found e senha atual invalida', async () => {
  let atualizarSenhaUsuarioExecutionService = buildFunction(buildExecutionServiceSource(), 'async function atualizarSenhaUsuarioExecutionService', {
    findUserById: async () => null,
    bcrypt: {
      compare: async () => true,
      hash: async () => 'HASH_NOVA',
    },
    saveUserDoc: async () => {},
  });

  let result = await atualizarSenhaUsuarioExecutionService({
    userId: 'u-missing',
    senhaAtual: 'Atual@123',
    novaSenha: 'Nova@123',
  });
  assert.deepEqual(toPlainJson(result), { kind: 'not_found' });

  atualizarSenhaUsuarioExecutionService = buildFunction(buildExecutionServiceSource(), 'async function atualizarSenhaUsuarioExecutionService', {
    findUserById: async () => ({ _id: 'u-1', senha: 'HASH_ATUAL', primeiro_acesso: true, senha_provisoria: true }),
    bcrypt: {
      compare: async () => false,
      hash: async () => 'HASH_NOVA',
    },
    saveUserDoc: async () => {
      throw new Error('nao deveria persistir com senha atual invalida');
    },
  });

  result = await atualizarSenhaUsuarioExecutionService({
    userId: 'u-1',
    senhaAtual: 'Atual@123',
    novaSenha: 'Nova@123',
  });
  assert.deepEqual(toPlainJson(result), { kind: 'invalid_current_password' });
});