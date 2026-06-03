import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/authController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');
const SERVICE_FILE = path.resolve(process.cwd(), 'src/modules/gestor/app/services/auth/evaluateLoginPreAuthGate.service.js');

const BCRYPT_MOCK_MODULE_URL = 'mock:gestor-auth-login-pre-auth-bcryptjs';
const LOGIN_PRE_AUTH_FACADE_MOCK_MODULE_URL = 'mock:gestor-auth-login-pre-auth-data-facade';

const LOGIN_PRE_AUTH_FACADE_EXPORTS = [
  'loadLoginPreAuthUserData',
  'saveLoginPreAuthUserStateData',
];

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'bcryptjs') return { url: BCRYPT_MOCK_MODULE_URL, shortCircuit: true };
    if (specifier === '#modules/gestor/app/data/auth/loginPreAuthGateDataFacade.js') return { url: LOGIN_PRE_AUTH_FACADE_MOCK_MODULE_URL, shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === BCRYPT_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'const getState = () => globalThis.__GESTOR_AUTH_LOGIN_PRE_AUTH_BCRYPT_STATE__ || {};',
          'export default {',
          '  async compare(...args) {',
          '    const state = getState();',
          '    if (typeof state.compare === "function") return await state.compare(...args);',
          '    return false;',
          '  },',
          '};',
        ].join('\n'),
      };
    }

    if (url === LOGIN_PRE_AUTH_FACADE_MOCK_MODULE_URL) {
      const lines = [
        'const getState = () => globalThis.__GESTOR_AUTH_LOGIN_PRE_AUTH_DATA_FACADE_STATE__ || {};',
        'const resolveImpl = (name) => {',
        '  const state = getState();',
        '  const fn = state[name];',
        '  if (typeof fn === "function") return fn;',
        '  return async () => null;',
        '};',
      ];
      for (const exportName of LOGIN_PRE_AUTH_FACADE_EXPORTS) {
        lines.push(`export async function ${exportName}(...args) { return await resolveImpl('${exportName}')(...args); }`);
      }
      return {
        format: 'module',
        shortCircuit: true,
        source: lines.join('\n'),
      };
    }

    return nextLoad(url, context);
  },
});

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

    if (current === '{') depth += 1;
    if (current === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }

    index += 1;
  }

  throw new Error(`Nao foi possivel extrair ${functionName}.`);
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

function importFresh(filePath, token) {
  return import(`${pathToFileURL(filePath).href}?case=${token}`);
}

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test('login: owner real delega o gate pre-auth para services/auth/evaluateLoginPreAuthGate.service.js', () => {
  assert.match(CONTROLLER_SOURCE, /evaluateLoginPreAuthGate\.service\.js/);
  assert.match(CONTROLLER_SOURCE, /openLocalPostAuthSession\.service\.js/);
  assert.match(CONTROLLER_SOURCE, /const preAuthResult = await evaluateLoginPreAuthGateService\(\{ email, senha \}\);/);

  const loginSource = stripComments(extractExportedAsyncFunction(CONTROLLER_SOURCE, 'login'));
  assert.doesNotMatch(loginSource, /findUserByEmailForLogin|bcrypt\.compare/);
  assert.doesNotMatch(loginSource, /failed_login_attempts|lock_until|Retry-After|X-Account-Lock/);
  assert.match(loginSource, /await openLocalPostAuthSession\(\{/);
  assert.match(loginSource, /createRememberToken\(/);
  assert.match(loginSource, /authContextOrchestration\.resolveLoginAuthContext/);
});

test('login pre-auth service preserva semantica de bloqueio, senha incorreta e sucesso antes da sessao', async () => {
  const prevBaseDelay = process.env.LOGIN_FAILED_DELAY_BASE_MS;
  const prevMaxDelay = process.env.LOGIN_FAILED_DELAY_MAX_MS;
  const prevMaxAttempts = process.env.LOGIN_MAX_ATTEMPTS;
  const prevLockMinutes = process.env.LOGIN_LOCK_MINUTES;
  const prevMasterBypassLockout = process.env.MASTER_BYPASS_LOCKOUT;

  process.env.LOGIN_FAILED_DELAY_BASE_MS = '0';
  process.env.LOGIN_FAILED_DELAY_MAX_MS = '0';
  process.env.LOGIN_MAX_ATTEMPTS = '3';
  process.env.LOGIN_LOCK_MINUTES = '15';
  delete process.env.MASTER_BYPASS_LOCKOUT;

  const callLog = [];
  globalThis.__GESTOR_AUTH_LOGIN_PRE_AUTH_BCRYPT_STATE__ = {
    compare: async () => false,
  };
  globalThis.__GESTOR_AUTH_LOGIN_PRE_AUTH_DATA_FACADE_STATE__ = {
    async loadLoginPreAuthUserData() {
      return {
        _id: '507f1f77bcf86cd799439911',
        email: 'login@gestor.test',
        senha: 'hash-salvo',
        role: 'diretor',
        global_role: null,
        ativo: true,
        failed_login_attempts: 2,
        lock_until: null,
      };
    },
    async saveLoginPreAuthUserStateData({ user }) {
      callLog.push(['saveLoginPreAuthUserStateData', { failed_login_attempts: user.failed_login_attempts, hasLockUntil: !!user.lock_until }]);
      return user;
    },
  };

  const { evaluateLoginPreAuthGateService } = await importFresh(SERVICE_FILE, 'blocked');
  const blockedResult = await evaluateLoginPreAuthGateService({ email: 'LOGIN@gestor.test', senha: 'senha-incorreta' });
  assert.equal(blockedResult.ok, false);
  assert.equal(blockedResult.code, 'bloqueado');
  assert.equal(typeof blockedResult.headers['Retry-After'], 'number');
  assert.equal(blockedResult.headers['X-Account-Lock-Seconds'], String(blockedResult.headers['Retry-After']));
  assert.equal(blockedResult.headers['X-Account-Lock-Minutes'], String(blockedResult.min));

  globalThis.__GESTOR_AUTH_LOGIN_PRE_AUTH_DATA_FACADE_STATE__ = {
    async loadLoginPreAuthUserData() {
      return {
        _id: '507f1f77bcf86cd799439912',
        email: 'login@gestor.test',
        senha: 'hash-salvo',
        role: 'diretor',
        global_role: null,
        ativo: true,
        failed_login_attempts: 1,
        lock_until: null,
      };
    },
    async saveLoginPreAuthUserStateData({ user }) {
      callLog.push(['saveLoginPreAuthUserStateData', { failed_login_attempts: user.failed_login_attempts, hasLockUntil: !!user.lock_until }]);
      return user;
    },
  };

  const wrongPasswordResult = await evaluateLoginPreAuthGateService({ email: 'login@gestor.test', senha: 'senha-incorreta' });
  assert.equal(wrongPasswordResult.ok, false);
  assert.equal(wrongPasswordResult.code, 'senha');
  assert.equal(wrongPasswordResult.restantes, 1);
  assert.deepEqual(wrongPasswordResult.headers, {
    'X-Account-Attempts-Used': '2',
    'X-Account-Attempts-Remaining': '1',
    'X-Account-Attempts-Limit': '3',
  });

  globalThis.__GESTOR_AUTH_LOGIN_PRE_AUTH_BCRYPT_STATE__ = {
    compare: async () => true,
  };
  globalThis.__GESTOR_AUTH_LOGIN_PRE_AUTH_DATA_FACADE_STATE__ = {
    async loadLoginPreAuthUserData() {
      return {
        _id: '507f1f77bcf86cd799439913',
        email: 'login@gestor.test',
        senha: 'hash-salvo',
        role: 'diretor',
        global_role: null,
        ativo: true,
        failed_login_attempts: 2,
        lock_until: new Date(Date.now() - 60_000),
      };
    },
    async saveLoginPreAuthUserStateData({ user }) {
      callLog.push(['saveLoginPreAuthUserStateData', { failed_login_attempts: user.failed_login_attempts, hasLockUntil: !!user.lock_until }]);
      return user;
    },
  };

  const successResult = await evaluateLoginPreAuthGateService({ email: 'login@gestor.test', senha: 'senha-correta' });
  assert.equal(successResult.ok, true);
  assert.equal(successResult.user.email, 'login@gestor.test');
  assert.deepEqual(callLog, [
    ['saveLoginPreAuthUserStateData', { failed_login_attempts: 3, hasLockUntil: true }],
    ['saveLoginPreAuthUserStateData', { failed_login_attempts: 2, hasLockUntil: false }],
    ['saveLoginPreAuthUserStateData', { failed_login_attempts: 0, hasLockUntil: false }],
  ]);

  restoreEnv('LOGIN_FAILED_DELAY_BASE_MS', prevBaseDelay);
  restoreEnv('LOGIN_FAILED_DELAY_MAX_MS', prevMaxDelay);
  restoreEnv('LOGIN_MAX_ATTEMPTS', prevMaxAttempts);
  restoreEnv('LOGIN_LOCK_MINUTES', prevLockMinutes);
  restoreEnv('MASTER_BYPASS_LOCKOUT', prevMasterBypassLockout);
});

test('login pre-auth service aplica lockout ao master por padrão e só bypassa com env explícita sem contador falso', async () => {
  const prevBaseDelay = process.env.LOGIN_FAILED_DELAY_BASE_MS;
  const prevMaxDelay = process.env.LOGIN_FAILED_DELAY_MAX_MS;
  const prevMaxAttempts = process.env.LOGIN_MAX_ATTEMPTS;
  const prevLockMinutes = process.env.LOGIN_LOCK_MINUTES;
  const prevMasterBypassLockout = process.env.MASTER_BYPASS_LOCKOUT;

  process.env.LOGIN_FAILED_DELAY_BASE_MS = '0';
  process.env.LOGIN_FAILED_DELAY_MAX_MS = '0';
  process.env.LOGIN_MAX_ATTEMPTS = '5';
  process.env.LOGIN_LOCK_MINUTES = '15';
  delete process.env.MASTER_BYPASS_LOCKOUT;

  globalThis.__GESTOR_AUTH_LOGIN_PRE_AUTH_BCRYPT_STATE__ = {
    compare: async () => false,
  };

  globalThis.__GESTOR_AUTH_LOGIN_PRE_AUTH_DATA_FACADE_STATE__ = {
    async loadLoginPreAuthUserData() {
      return {
        _id: '507f1f77bcf86cd799439921',
        email: 'master@gestor.test',
        senha: 'hash-salvo',
        role: 'master',
        global_role: 'master',
        ativo: true,
        failed_login_attempts: 0,
        lock_until: null,
      };
    },
    async saveLoginPreAuthUserStateData({ user }) {
      return user;
    },
  };

  const { evaluateLoginPreAuthGateService } = await importFresh(SERVICE_FILE, 'master-default-lockout');

  const firstWrongPassword = await evaluateLoginPreAuthGateService({ email: 'master@gestor.test', senha: 'senha-incorreta' });
  assert.equal(firstWrongPassword.ok, false);
  assert.equal(firstWrongPassword.code, 'senha');
  assert.equal(firstWrongPassword.restantes, 4);
  assert.deepEqual(firstWrongPassword.headers, {
    'X-Account-Attempts-Used': '1',
    'X-Account-Attempts-Remaining': '4',
    'X-Account-Attempts-Limit': '5',
  });

  globalThis.__GESTOR_AUTH_LOGIN_PRE_AUTH_DATA_FACADE_STATE__ = {
    async loadLoginPreAuthUserData() {
      return {
        _id: '507f1f77bcf86cd799439922',
        email: 'master@gestor.test',
        senha: 'hash-salvo',
        role: 'master',
        global_role: 'master',
        ativo: true,
        failed_login_attempts: 4,
        lock_until: null,
      };
    },
    async saveLoginPreAuthUserStateData({ user }) {
      return user;
    },
  };

  const blockedMaster = await evaluateLoginPreAuthGateService({ email: 'master@gestor.test', senha: 'senha-incorreta' });
  assert.equal(blockedMaster.ok, false);
  assert.equal(blockedMaster.code, 'bloqueado');
  assert.equal(blockedMaster.restantes, undefined);
  assert.equal(typeof blockedMaster.headers['Retry-After'], 'number');

  process.env.MASTER_BYPASS_LOCKOUT = 'true';
  globalThis.__GESTOR_AUTH_LOGIN_PRE_AUTH_DATA_FACADE_STATE__ = {
    async loadLoginPreAuthUserData() {
      return {
        _id: '507f1f77bcf86cd799439923',
        email: 'master@gestor.test',
        senha: 'hash-salvo',
        role: 'master',
        global_role: 'master',
        ativo: true,
        failed_login_attempts: 4,
        lock_until: null,
      };
    },
    async saveLoginPreAuthUserStateData({ user }) {
      return user;
    },
  };

  const bypassWrongPassword = await evaluateLoginPreAuthGateService({ email: 'master@gestor.test', senha: 'senha-incorreta' });
  assert.equal(bypassWrongPassword.ok, false);
  assert.equal(bypassWrongPassword.code, 'senha');
  assert.equal(bypassWrongPassword.restantes, undefined);
  assert.deepEqual(bypassWrongPassword.headers, {
    'X-Account-Attempts-Used': '5',
    'X-Account-Attempts-Limit': '5',
  });

  globalThis.__GESTOR_AUTH_LOGIN_PRE_AUTH_BCRYPT_STATE__ = {
    compare: async () => true,
  };
  globalThis.__GESTOR_AUTH_LOGIN_PRE_AUTH_DATA_FACADE_STATE__ = {
    async loadLoginPreAuthUserData() {
      return {
        _id: '507f1f77bcf86cd799439924',
        email: 'master@gestor.test',
        senha: 'hash-salvo',
        role: 'master',
        global_role: 'master',
        ativo: true,
        failed_login_attempts: 3,
        lock_until: new Date(Date.now() + 60_000),
      };
    },
    async saveLoginPreAuthUserStateData({ user }) {
      return user;
    },
  };

  const bypassSuccess = await evaluateLoginPreAuthGateService({ email: 'master@gestor.test', senha: 'senha-correta' });
  assert.equal(bypassSuccess.ok, true);
  assert.equal(bypassSuccess.user.failed_login_attempts, 0);
  assert.equal(bypassSuccess.user.lock_until, null);

  restoreEnv('LOGIN_FAILED_DELAY_BASE_MS', prevBaseDelay);
  restoreEnv('LOGIN_FAILED_DELAY_MAX_MS', prevMaxDelay);
  restoreEnv('LOGIN_MAX_ATTEMPTS', prevMaxAttempts);
  restoreEnv('LOGIN_LOCK_MINUTES', prevLockMinutes);
  restoreEnv('MASTER_BYPASS_LOCKOUT', prevMasterBypassLockout);
});