import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const PROJECT_ROOT = process.cwd();
const FACADE_PATH = path.join(PROJECT_ROOT, 'src/modules/gestor/app/data/auth/resetPasswordRenderDataFacade.js');
const SERVICE_PATH = path.join(PROJECT_ROOT, 'src/modules/gestor/app/services/auth/passwordRecovery.service.js');

const FACADE_SOURCE = fs.readFileSync(FACADE_PATH, 'utf8');
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

function toPlainJson(value) {
  return JSON.parse(JSON.stringify(value));
}

test('reset render tenant-aware: facade delega token e lookup auxiliar com GLOBAL_SCOPE explicito e local', () => {
  const loadPasswordResetTokenDataBlock = extractFunction(
    FACADE_SOURCE,
    'export async function loadPasswordResetTokenData({ token })',
  );
  const loadPasswordResetUserNameDataBlock = extractFunction(
    FACADE_SOURCE,
    'export async function loadPasswordResetUserNameData({ userId })',
  );

  assert.match(loadPasswordResetTokenDataBlock, /const tokenHash = hashPasswordRecoveryToken\(token\)/);
  assert.match(loadPasswordResetTokenDataBlock, /findPasswordResetByTokenRepo\s*\(\{\s*unitScope:\s*GLOBAL_SCOPE,\s*token:\s*tokenHash\s*\}\)/);
  assert.match(loadPasswordResetUserNameDataBlock, /findUserByIdSelectRepo\s*\(\{\s*unitScope:\s*GLOBAL_SCOPE,\s*id:\s*userId,\s*select:\s*'nome email'\s*\}\)/);

  assert.doesNotMatch(loadPasswordResetTokenDataBlock, /mongoose\.connect|createConnection|supertest|#server\//i);
  assert.doesNotMatch(loadPasswordResetUserNameDataBlock, /mongoose\.connect|createConnection|supertest|#server\//i);
});

test('reset render tenant-aware: service congela token como primeira leitura material e lookup auxiliar apenas apos token valido', () => {
  const loadResetPasswordRenderModelServiceBlock = extractFunction(
    SERVICE_SOURCE,
    'export async function loadResetPasswordRenderModelService({ token } = {})',
  );

  assert.match(loadResetPasswordRenderModelServiceBlock, /const passwordReset = await loadPasswordResetTokenData\(\{ token \}\)/);
  assert.match(loadResetPasswordRenderModelServiceBlock, /if \(isPasswordResetInvalidOrExpired\(passwordReset\)\)/);
  assert.match(loadResetPasswordRenderModelServiceBlock, /const userIdRef = resolvePasswordResetUserId\(passwordReset\)/);
  assert.match(loadResetPasswordRenderModelServiceBlock, /if \(userIdRef\) \{/);
  assert.match(loadResetPasswordRenderModelServiceBlock, /await loadPasswordResetUserNameData\(\{ userId: userIdRef \}\)/);

  const tokenLookupIndex = loadResetPasswordRenderModelServiceBlock.indexOf('loadPasswordResetTokenData');
  const invalidGateIndex = loadResetPasswordRenderModelServiceBlock.indexOf('isPasswordResetInvalidOrExpired');
  const userIdResolveIndex = loadResetPasswordRenderModelServiceBlock.indexOf('resolvePasswordResetUserId');
  const userLookupIndex = loadResetPasswordRenderModelServiceBlock.indexOf('loadPasswordResetUserNameData');

  assert.ok(tokenLookupIndex >= 0, 'A leitura do token deve existir.');
  assert.ok(invalidGateIndex > tokenLookupIndex, 'O gate de token invalido ou expirado deve ocorrer apos a leitura do token.');
  assert.ok(userIdResolveIndex > invalidGateIndex, 'A resolucao de userId deve ocorrer apos o gate de token invalido ou expirado.');
  assert.ok(userLookupIndex > userIdResolveIndex, 'O lookup auxiliar por userId deve ocorrer apenas depois do token valido e do userId resolvido.');
});

test('reset render tenant-aware: token valido permite lookup auxiliar por userId e retorna render model compativel', async () => {
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
  const loadResetPasswordRenderModelService = buildFunction(
    SERVICE_SOURCE,
    'export async function loadResetPasswordRenderModelService({ token } = {})',
    {
      Date,
      hashPasswordRecoveryToken: (token) => `sha256:${token}`,
      buildResetPasswordErrorResult,
      isPasswordResetInvalidOrExpired,
      resolvePasswordResetUserId,
      loadPasswordResetTokenData: async (args) => {
        callLog.push(['loadPasswordResetTokenData', toPlainJson(args)]);
        return {
          _id: 'reset-1',
          user_id: 'user-1',
          expiresAt: new Date('2099-01-01T00:00:00.000Z'),
        };
      },
      loadPasswordResetUserNameData: async (args) => {
        callLog.push(['loadPasswordResetUserNameData', toPlainJson(args)]);
        return { nome: 'Ana Silva', email: 'ana@example.com' };
      },
    },
  );

  const result = await loadResetPasswordRenderModelService({ token: 'token-valido' });

  assert.deepEqual(callLog, [
    ['loadPasswordResetTokenData', { token: 'token-valido' }],
    ['loadPasswordResetUserNameData', { userId: 'user-1' }],
  ]);
  assert.deepEqual(toPlainJson(result), {
    ok: true,
    view: 'reset-password',
    locals: {
      title: 'Redefinir Senha',
      token: 'token-valido',
      userName: 'Ana',
    },
  });
});

test('reset render tenant-aware: token invalido ou ausente nao dispara lookup auxiliar por userId e preserva contrato atual', async () => {
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
  const loadResetPasswordRenderModelService = buildFunction(
    SERVICE_SOURCE,
    'export async function loadResetPasswordRenderModelService({ token } = {})',
    {
      Date,
      hashPasswordRecoveryToken: (token) => `sha256:${token}`,
      buildResetPasswordErrorResult,
      isPasswordResetInvalidOrExpired,
      resolvePasswordResetUserId,
      loadPasswordResetTokenData: async (args) => {
        callLog.push(['loadPasswordResetTokenData', toPlainJson(args)]);
        return null;
      },
      loadPasswordResetUserNameData: async (args) => {
        callLog.push(['loadPasswordResetUserNameData', toPlainJson(args)]);
        return { nome: 'Nao deveria ocorrer' };
      },
    },
  );

  const result = await loadResetPasswordRenderModelService({ token: undefined });

  assert.deepEqual(callLog, [
    ['loadPasswordResetTokenData', {}],
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

test('reset render tenant-aware: token expirado nao dispara lookup auxiliar por userId e preserva contrato atual', async () => {
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
  const loadResetPasswordRenderModelService = buildFunction(
    SERVICE_SOURCE,
    'export async function loadResetPasswordRenderModelService({ token } = {})',
    {
      Date,
      hashPasswordRecoveryToken: (token) => `sha256:${token}`,
      buildResetPasswordErrorResult,
      isPasswordResetInvalidOrExpired,
      resolvePasswordResetUserId,
      loadPasswordResetTokenData: async (args) => {
        callLog.push(['loadPasswordResetTokenData', toPlainJson(args)]);
        return {
          _id: 'reset-expirado',
          user_id: 'user-expirado',
          expiresAt: new Date('2000-01-01T00:00:00.000Z'),
        };
      },
      loadPasswordResetUserNameData: async (args) => {
        callLog.push(['loadPasswordResetUserNameData', toPlainJson(args)]);
        return { nome: 'Nao deveria ocorrer' };
      },
    },
  );

  const result = await loadResetPasswordRenderModelService({ token: 'token-expirado' });

  assert.deepEqual(callLog, [
    ['loadPasswordResetTokenData', { token: 'token-expirado' }],
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

test('reset render tenant-aware: token valido sem usuario encontrado preserva render model compativel e nome auxiliar padrao', async () => {
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
  const loadResetPasswordRenderModelService = buildFunction(
    SERVICE_SOURCE,
    'export async function loadResetPasswordRenderModelService({ token } = {})',
    {
      Date,
      hashPasswordRecoveryToken: (token) => `sha256:${token}`,
      buildResetPasswordErrorResult,
      isPasswordResetInvalidOrExpired,
      resolvePasswordResetUserId,
      loadPasswordResetTokenData: async (args) => {
        callLog.push(['loadPasswordResetTokenData', toPlainJson(args)]);
        return {
          _id: 'reset-2',
          user_id: 'user-ausente',
          expiresAt: new Date('2099-01-01T00:00:00.000Z'),
        };
      },
      loadPasswordResetUserNameData: async (args) => {
        callLog.push(['loadPasswordResetUserNameData', toPlainJson(args)]);
        return null;
      },
    },
  );

  const result = await loadResetPasswordRenderModelService({ token: 'token-sem-usuario' });

  assert.deepEqual(callLog, [
    ['loadPasswordResetTokenData', { token: 'token-sem-usuario' }],
    ['loadPasswordResetUserNameData', { userId: 'user-ausente' }],
  ]);
  assert.deepEqual(toPlainJson(result), {
    ok: true,
    view: 'reset-password',
    locals: {
      title: 'Redefinir Senha',
      token: 'token-sem-usuario',
      userName: 'Usuário',
    },
  });
});