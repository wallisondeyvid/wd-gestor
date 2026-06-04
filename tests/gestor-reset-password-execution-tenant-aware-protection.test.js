import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const PROJECT_ROOT = process.cwd();
const SERVICE_PATH = path.join(PROJECT_ROOT, 'src/modules/gestor/app/services/auth/passwordRecovery.service.js');
const CONTROLLER_PATH = path.join(PROJECT_ROOT, 'src/modules/gestor/app/controllers/authController.js');

const SERVICE_SOURCE = fs.readFileSync(SERVICE_PATH, 'utf8');
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

function extractExportedAsyncFunction(source, functionName) {
  const signature = `export async function ${functionName}`;
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `Funcao ${functionName} nao encontrada.`);

  const bodyStart = source.indexOf('{', start);
  assert.notEqual(bodyStart, -1, `Corpo de ${functionName} nao encontrado.`);

  let index = bodyStart;
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;

  while (index < source.length) {
    const current = source[index];
    const next = source[index + 1];
    const previous = source[index - 1];

    if (inLineComment) {
      if (current === '\n') inLineComment = false;
      index += 1;
      continue;
    }

    if (inBlockComment) {
      if (previous === '*' && current === '/') inBlockComment = false;
      index += 1;
      continue;
    }

    if (!inSingle && !inDouble && !inTemplate) {
      if (current === '/' && next === '/') {
        inLineComment = true;
        index += 1;
        continue;
      }

      if (current === '/' && next === '*') {
        inBlockComment = true;
        index += 1;
        continue;
      }
    }

    if (!inDouble && !inTemplate && current === '\'' && previous !== '\\') {
      inSingle = !inSingle;
      index += 1;
      continue;
    }

    if (!inSingle && !inTemplate && current === '"' && previous !== '\\') {
      inDouble = !inDouble;
      index += 1;
      continue;
    }

    if (!inSingle && !inDouble && current === '`' && previous !== '\\') {
      inTemplate = !inTemplate;
      index += 1;
      continue;
    }

    if (inSingle || inDouble || inTemplate) {
      index += 1;
      continue;
    }

    if (current === '{') {
      depth += 1;
    } else if (current === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }

    index += 1;
  }

  throw new Error(`Nao foi possivel extrair ${functionName}.`);
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

function toPlainJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeRes() {
  return {
    view: null,
    locals: null,
    render(view, locals) {
      this.view = view;
      this.locals = locals;
      return this;
    },
  };
}

test('reset execution tenant-aware: service congela leitura por token como primeira leitura material e write derivado local apos hash', () => {
  const resetPasswordByTokenServiceBlock = extractFunction(
    SERVICE_SOURCE,
    'export async function resetPasswordByTokenService({ token, senha } = {})',
  );

  assert.match(resetPasswordByTokenServiceBlock, /const \{ passwordReset, user \} = await loadPasswordResetExecutionData\(\{ token \}\)/);
  assert.match(resetPasswordByTokenServiceBlock, /if \(isPasswordResetInvalidOrExpired\(passwordReset\)\)/);
  assert.match(resetPasswordByTokenServiceBlock, /if \(!user\)/);
  assert.match(resetPasswordByTokenServiceBlock, /const senhaHash = await bcrypt\.hash\(senha, 10\)/);
  assert.match(resetPasswordByTokenServiceBlock, /await completePasswordResetData\(\{[\s\S]*userId:\s*user\._id,[\s\S]*passwordHash:\s*senhaHash,[\s\S]*passwordResetId:\s*passwordReset\._id,[\s\S]*\}\)/);

  const loadIndex = resetPasswordByTokenServiceBlock.indexOf('loadPasswordResetExecutionData');
  const gateIndex = resetPasswordByTokenServiceBlock.indexOf('isPasswordResetInvalidOrExpired');
  const missingUserIndex = resetPasswordByTokenServiceBlock.indexOf('if (!user)');
  const hashIndex = resetPasswordByTokenServiceBlock.indexOf('bcrypt.hash');
  const completeIndex = resetPasswordByTokenServiceBlock.indexOf('completePasswordResetData');

  assert.ok(loadIndex >= 0, 'A leitura material do token deve existir.');
  assert.ok(gateIndex > loadIndex, 'O gate de expiracao deve ocorrer apos a leitura material do token.');
  assert.ok(missingUserIndex > gateIndex, 'A verificacao de user deve ocorrer apos o gate do token.');
  assert.ok(hashIndex > missingUserIndex, 'O hash deve ocorrer apenas apos token valido e user presente.');
  assert.ok(completeIndex > hashIndex, 'O complete deve ocorrer somente depois do hash.');

  assert.doesNotMatch(resetPasswordByTokenServiceBlock, /mongoose\.connect|createConnection|supertest|#server\//i);
  assert.doesNotMatch(resetPasswordByTokenServiceBlock, /auth\.db\.js/i);
});

test('reset execution tenant-aware: token invalido ou ausente nao chama completePasswordResetData', async () => {
  const callLog = [];
  const buildResetPasswordErrorResult = buildFunction(
    SERVICE_SOURCE,
    'function buildResetPasswordErrorResult({ title, message, showRetry })',
  );
  const isPasswordResetInvalidOrExpired = buildFunction(
    SERVICE_SOURCE,
    'function isPasswordResetInvalidOrExpired(passwordReset)',
    { Date },
  );
  const resetPasswordByTokenService = buildFunction(
    SERVICE_SOURCE,
    'export async function resetPasswordByTokenService({ token, senha } = {})',
    {
      Date,
      bcrypt: {
        hash: async (...args) => {
          callLog.push(['bcrypt.hash', toPlainJson(args)]);
          return 'hash-nao-deveria-ocorrer';
        },
      },
      buildResetPasswordErrorResult,
      isPasswordResetInvalidOrExpired,
      loadPasswordResetExecutionData: async (args) => {
        callLog.push(['loadPasswordResetExecutionData', toPlainJson(args)]);
        return { passwordReset: null, user: null };
      },
      completePasswordResetData: async (args) => {
        callLog.push(['completePasswordResetData', toPlainJson(args)]);
      },
    },
  );

  const result = await resetPasswordByTokenService({ token: undefined, senha: 'NovaSenha123' });

  assert.deepEqual(callLog, []);
  assert.deepEqual(toPlainJson(result), {
    ok: false,
    view: 'reset-password-error',
    locals: {
      title: 'Dados incompletos',
      message: 'Dados incompletos',
      showRetry: true,
    },
  });
});

test('reset execution tenant-aware: token expirado nao chama completePasswordResetData', async () => {
  const callLog = [];
  const buildResetPasswordErrorResult = buildFunction(
    SERVICE_SOURCE,
    'function buildResetPasswordErrorResult({ title, message, showRetry })',
  );
  const isPasswordResetInvalidOrExpired = buildFunction(
    SERVICE_SOURCE,
    'function isPasswordResetInvalidOrExpired(passwordReset)',
    { Date },
  );
  const resetPasswordByTokenService = buildFunction(
    SERVICE_SOURCE,
    'export async function resetPasswordByTokenService({ token, senha } = {})',
    {
      Date,
      bcrypt: {
        hash: async (...args) => {
          callLog.push(['bcrypt.hash', toPlainJson(args)]);
          return 'hash-nao-deveria-ocorrer';
        },
      },
      buildResetPasswordErrorResult,
      isPasswordResetInvalidOrExpired,
      loadPasswordResetExecutionData: async (args) => {
        callLog.push(['loadPasswordResetExecutionData', toPlainJson(args)]);
        return {
          passwordReset: {
            _id: 'reset-expirado',
            user_id: 'user-expirado',
            expiresAt: new Date('2000-01-01T00:00:00.000Z'),
          },
          user: { _id: 'user-expirado' },
        };
      },
      completePasswordResetData: async (args) => {
        callLog.push(['completePasswordResetData', toPlainJson(args)]);
      },
    },
  );

  const result = await resetPasswordByTokenService({ token: 'token-expirado', senha: 'NovaSenha123' });

  assert.deepEqual(callLog, [
    ['loadPasswordResetExecutionData', { token: 'token-expirado' }],
  ]);
  assert.deepEqual(toPlainJson(result), {
    ok: false,
    view: 'reset-password-error',
    locals: {
      title: 'Link inválido',
      message: 'Token inválido ou expirado',
      showRetry: true,
    },
  });
});

test('reset execution tenant-aware: token valido sem user nao chama completePasswordResetData', async () => {
  const callLog = [];
  const buildResetPasswordErrorResult = buildFunction(
    SERVICE_SOURCE,
    'function buildResetPasswordErrorResult({ title, message, showRetry })',
  );
  const isPasswordResetInvalidOrExpired = buildFunction(
    SERVICE_SOURCE,
    'function isPasswordResetInvalidOrExpired(passwordReset)',
    { Date },
  );
  const resetPasswordByTokenService = buildFunction(
    SERVICE_SOURCE,
    'export async function resetPasswordByTokenService({ token, senha } = {})',
    {
      Date,
      bcrypt: {
        hash: async (...args) => {
          callLog.push(['bcrypt.hash', toPlainJson(args)]);
          return 'hash-nao-deveria-ocorrer';
        },
      },
      buildResetPasswordErrorResult,
      isPasswordResetInvalidOrExpired,
      loadPasswordResetExecutionData: async (args) => {
        callLog.push(['loadPasswordResetExecutionData', toPlainJson(args)]);
        return {
          passwordReset: {
            _id: 'reset-valido-sem-user',
            user_id: 'user-ausente',
            expiresAt: new Date('2099-01-01T00:00:00.000Z'),
          },
          user: null,
        };
      },
      completePasswordResetData: async (args) => {
        callLog.push(['completePasswordResetData', toPlainJson(args)]);
      },
    },
  );

  const result = await resetPasswordByTokenService({ token: 'token-valido-sem-user', senha: 'NovaSenha123' });

  assert.deepEqual(callLog, [
    ['loadPasswordResetExecutionData', { token: 'token-valido-sem-user' }],
  ]);
  assert.deepEqual(toPlainJson(result), {
    ok: false,
    view: 'reset-password-error',
    locals: {
      title: 'Usuário não encontrado',
      message: 'Usuário não encontrado',
      showRetry: false,
    },
  });
});

test('reset execution tenant-aware: token valido sem userId nao deve chamar completePasswordResetData', async () => {
  const callLog = [];
  const buildResetPasswordErrorResult = buildFunction(
    SERVICE_SOURCE,
    'function buildResetPasswordErrorResult({ title, message, showRetry })',
  );
  const isPasswordResetInvalidOrExpired = buildFunction(
    SERVICE_SOURCE,
    'function isPasswordResetInvalidOrExpired(passwordReset)',
    { Date },
  );
  const resolvePasswordResetUserId = buildFunction(
    SERVICE_SOURCE,
    'function resolvePasswordResetUserId(passwordReset)',
  );
  const resetPasswordByTokenService = buildFunction(
    SERVICE_SOURCE,
    'export async function resetPasswordByTokenService({ token, senha } = {})',
    {
      Date,
      bcrypt: {
        hash: async (...args) => {
          callLog.push(['bcrypt.hash', toPlainJson(args)]);
          return 'hash-gerado-sem-user-id';
        },
      },
      buildResetPasswordErrorResult,
      isPasswordResetInvalidOrExpired,
      resolvePasswordResetUserId,
      loadPasswordResetExecutionData: async (args) => {
        callLog.push(['loadPasswordResetExecutionData', toPlainJson(args)]);
        return {
          passwordReset: {
            _id: 'reset-sem-user-id',
            expiresAt: new Date('2099-01-01T00:00:00.000Z'),
          },
          user: { email: 'sem-id@example.com' },
        };
      },
      completePasswordResetData: async (args) => {
        callLog.push(['completePasswordResetData', toPlainJson(args)]);
      },
    },
  );

  const result = await resetPasswordByTokenService({ token: 'token-sem-user-id', senha: 'NovaSenha123' });

  assert.equal(callLog.some(([name]) => name === 'completePasswordResetData'), false);
  assert.deepEqual(toPlainJson(result), {
    ok: false,
    view: 'reset-password-error',
    locals: {
      title: 'Usuário não encontrado',
      message: 'Usuário não encontrado',
      showRetry: false,
    },
  });
});

test('reset execution tenant-aware: token valido com userId chama hash antes de complete e preserva payload derivado local', async () => {
  const callLog = [];
  const buildResetPasswordErrorResult = buildFunction(
    SERVICE_SOURCE,
    'function buildResetPasswordErrorResult({ title, message, showRetry })',
  );
  const isPasswordResetInvalidOrExpired = buildFunction(
    SERVICE_SOURCE,
    'function isPasswordResetInvalidOrExpired(passwordReset)',
    { Date },
  );
  const resolvePasswordResetUserId = buildFunction(
    SERVICE_SOURCE,
    'function resolvePasswordResetUserId(passwordReset)',
  );
  const resetPasswordByTokenService = buildFunction(
    SERVICE_SOURCE,
    'export async function resetPasswordByTokenService({ token, senha } = {})',
    {
      Date,
      bcrypt: {
        hash: async (...args) => {
          callLog.push(['bcrypt.hash', toPlainJson(args)]);
          return 'hash-gerado';
        },
      },
      buildResetPasswordErrorResult,
      isPasswordResetInvalidOrExpired,
      resolvePasswordResetUserId,
      loadPasswordResetExecutionData: async (args) => {
        callLog.push(['loadPasswordResetExecutionData', toPlainJson(args)]);
        return {
          passwordReset: {
            _id: 'reset-1',
            user_id: 'user-1',
            expiresAt: new Date('2099-01-01T00:00:00.000Z'),
          },
          user: { _id: 'user-1', email: 'ana@example.com' },
        };
      },
      completePasswordResetData: async (args) => {
        callLog.push(['completePasswordResetData', toPlainJson(args)]);
      },
    },
  );

  const result = await resetPasswordByTokenService({ token: 'token-valido', senha: 'NovaSenha123' });

  assert.deepEqual(callLog, [
    ['loadPasswordResetExecutionData', { token: 'token-valido' }],
    ['bcrypt.hash', ['NovaSenha123', 10]],
    ['completePasswordResetData', {
      userId: 'user-1',
      passwordHash: 'hash-gerado',
      passwordResetId: 'reset-1',
    }],
  ]);
  assert.deepEqual(toPlainJson(result), {
    ok: true,
    view: 'reset-password-success',
    locals: {
      title: 'Senha Redefinida',
      message: 'Sua senha foi redefinida com sucesso.',
    },
  });
});

test('reset execution tenant-aware: erro do complete sobe ao owner e preserva contrato HTTP atual', async () => {
  const postResetPasswordSource = stripComments(extractExportedAsyncFunction(CONTROLLER_SOURCE, 'postResetPassword'));
  assert.match(postResetPasswordSource, /await resetPasswordByTokenService\(/);

  const script = new vm.Script(`({
    async postResetPassword(req, res, deps) {
      try {
        const result = await deps.resetPasswordByTokenService({
          token: req.body?.token,
          senha: req.body?.senha,
        });
        if (result.ok) {
          const basePath = req.baseUrl || '';
          return res.render(result.view, { ...result.locals, loginLink: basePath + '/login' });
        }

        return res.render(result.view, result.locals);
      } catch (e) {
        deps.logError('[postResetPassword] erro:', e?.message || e);
        return res.render('reset-password-error', { title: 'Erro', message: 'Erro ao redefinir senha', showRetry: false });
      }
    },
  })`);
  const owners = script.runInNewContext({});
  const callLog = [];
  const res = makeRes();

  await owners.postResetPassword(
    { baseUrl: '/gestor', body: { token: 'token-valido', senha: 'NovaSenha123' } },
    res,
    {
      resetPasswordByTokenService: async () => {
        throw new Error('falha-complete');
      },
      logError: (...args) => callLog.push(['logError', args]),
    },
  );

  assert.deepEqual(callLog, [
    ['logError', ['[postResetPassword] erro:', 'falha-complete']],
  ]);
  assert.equal(res.view, 'reset-password-error');
  assert.deepEqual(toPlainJson(res.locals), {
    title: 'Erro',
    message: 'Erro ao redefinir senha',
    showRetry: false,
  });
});