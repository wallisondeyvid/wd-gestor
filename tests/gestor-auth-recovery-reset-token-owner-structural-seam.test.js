import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/authController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

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

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
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

function loadDelegatedOwners() {
  const script = new vm.Script(`({
    async renderResetPassword(req, res, deps) {
      try {
        const result = await deps.loadResetPasswordRenderModelService({ token: req.params?.token });
        return res.render(result.view, result.locals);
      } catch (e) {
        deps.logError('[renderResetPassword] erro:', e?.message || e);
        return res.render('reset-password-error', { title: 'Erro', message: 'Erro ao validar token', showRetry: true });
      }
    },

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

  return script.runInNewContext({});
}

test('recovery/reset: owner real delega o reset por token/render para services/auth/passwordRecovery.service.js', () => {
  assert.match(CONTROLLER_SOURCE, /passwordRecovery\.service\.js/);
  assert.match(CONTROLLER_SOURCE, /await loadResetPasswordRenderModelService\(\{ token \}\)/);
  assert.match(CONTROLLER_SOURCE, /await resetPasswordByTokenService\(\{[\s\S]*token: req\.body\?\.token,[\s\S]*senha: req\.body\?\.senha,[\s\S]*\}\)/);

  const renderResetPasswordSource = stripComments(extractExportedAsyncFunction(CONTROLLER_SOURCE, 'renderResetPassword'));
  const postResetPasswordSource = stripComments(extractExportedAsyncFunction(CONTROLLER_SOURCE, 'postResetPassword'));

  assert.doesNotMatch(renderResetPasswordSource, /findPasswordResetByToken|findUserByIdSelect/);
  assert.doesNotMatch(postResetPasswordSource, /findPasswordResetByToken|findUserByIdWithMaxTime|deletePasswordResetById|bcrypt\.hash/);
});

test('recovery/reset: seam minima futura recebe apenas token payload e preserva o render HTTP', async () => {
  const owners = loadDelegatedOwners();
  const callLog = [];

  const renderReq = { params: { token: 'token-render' } };
  const renderRes = makeRes();
  await owners.renderResetPassword(renderReq, renderRes, {
    loadResetPasswordRenderModelService: async (input) => {
      callLog.push(['loadResetPasswordRenderModelService', JSON.parse(JSON.stringify(input))]);
      return {
        ok: true,
        view: 'reset-password',
        locals: { title: 'Redefinir Senha', token: 'token-render', userName: 'Ana' },
      };
    },
    resetPasswordByTokenService: async () => ({ ok: true, view: 'reset-password-success', locals: { title: 'Senha Redefinida' } }),
    logError: (...args) => callLog.push(['logError', args]),
  });

  const postReq = { baseUrl: '/gestor', body: { token: 'token-post', senha: 'NovaSenha123' } };
  const postRes = makeRes();
  await owners.postResetPassword(postReq, postRes, {
    loadResetPasswordRenderModelService: async () => ({ ok: true, view: 'reset-password', locals: {} }),
    resetPasswordByTokenService: async (input) => {
      callLog.push(['resetPasswordByTokenService', JSON.parse(JSON.stringify(input))]);
      return {
        ok: true,
        view: 'reset-password-success',
        locals: { title: 'Senha Redefinida', message: 'Sua senha foi redefinida com sucesso.' },
      };
    },
    logError: (...args) => callLog.push(['logError', args]),
  });

  assert.deepEqual(callLog, [
    ['loadResetPasswordRenderModelService', { token: 'token-render' }],
    ['resetPasswordByTokenService', { token: 'token-post', senha: 'NovaSenha123' }],
  ]);

  assert.equal(renderRes.view, 'reset-password');
  assert.deepEqual(JSON.parse(JSON.stringify(renderRes.locals)), {
    title: 'Redefinir Senha',
    token: 'token-render',
    userName: 'Ana',
  });
  assert.equal(postRes.view, 'reset-password-success');
  assert.deepEqual(JSON.parse(JSON.stringify(postRes.locals)), {
    title: 'Senha Redefinida',
    message: 'Sua senha foi redefinida com sucesso.',
    loginLink: '/gestor/login',
  });
});