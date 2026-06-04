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
    statusCode: 200,
    body: null,
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

function loadDelegatedOwners() {
  const script = new vm.Script(`({
    async postEsqueciSenha(req, res, deps) {
      try {
        const result = await deps.requestPasswordRecoveryService({
          cpf: req.body?.cpf,
          email: req.body?.email,
          emailConfirm: req.body?.emailConfirm,
        });
        return res.status(result.status).json(result.body);
      } catch (e) {
        deps.logError('[postEsqueciSenha] erro:', e?.message || e);
        return res.status(500).json({ success: false, message: 'Erro interno.' });
      }
    },

    async listarEmailsPorCPF(req, res, deps) {
      try {
        const result = await deps.listRecoveryEmailsByCpfService({
          cpf: req.query?.cpf,
        });
        return res.status(result.status).json(result.body);
      } catch (e) {
        deps.logError('[listarEmailsPorCPF] erro:', e?.message || e);
        return res.status(500).json({ success: false, message: 'Erro interno.' });
      }
    },
  })`);

  return script.runInNewContext({});
}

test('recovery/reset: owner real delega o subcorredor JSON para services/auth/passwordRecovery.service.js', () => {
  assert.match(CONTROLLER_SOURCE, /passwordRecovery\.service\.js/);
  assert.match(CONTROLLER_SOURCE, /await requestPasswordRecoveryService\(\{/);
  assert.match(CONTROLLER_SOURCE, /await listRecoveryEmailsByCpfService\(\{/);

  const postEsqueciSenhaSource = stripComments(extractExportedAsyncFunction(CONTROLLER_SOURCE, 'postEsqueciSenha'));
  const listarEmailsSource = stripComments(extractExportedAsyncFunction(CONTROLLER_SOURCE, 'listarEmailsPorCPF'));

  assert.doesNotMatch(postEsqueciSenhaSource, /crypto\.randomBytes|nodemailer\.createTransport|findUsersByCpf|findFuncionariosByCpfSelect|createPasswordReset/);
  assert.doesNotMatch(listarEmailsSource, /findUsersByCpf|findFuncionariosByCpfSelect|maskEmail/);
});

test('recovery/reset: seam minima futura recebe apenas o payload de recovery e preserva status/body HTTP', async () => {
  const owners = loadDelegatedOwners();
  const callLog = [];

  const reqPost = { body: { cpf: '123.456.789-00' } };
  const resPost = makeRes();

  await owners.postEsqueciSenha(reqPost, resPost, {
    requestPasswordRecoveryService: async (input) => {
      callLog.push(['requestPasswordRecoveryService', JSON.parse(JSON.stringify(input))]);
      return {
        status: 200,
        body: { success: true, message: 'Se os dados informados corresponderem a um usuário cadastrado, enviaremos as instruções de recuperação.' },
      };
    },
    listRecoveryEmailsByCpfService: async () => ({ status: 200, body: { success: true } }),
    logError: (...args) => callLog.push(['logError', args]),
  });

  const reqList = { query: { cpf: '12345678900' } };
  const resList = makeRes();

  await owners.listarEmailsPorCPF(reqList, resList, {
    requestPasswordRecoveryService: async () => ({ status: 200, body: { success: true } }),
    listRecoveryEmailsByCpfService: async (input) => {
      callLog.push(['listRecoveryEmailsByCpfService', JSON.parse(JSON.stringify(input))]);
      return {
        status: 200,
        body: { success: true, message: 'Se os dados informados corresponderem a um usuário cadastrado, enviaremos as instruções de recuperação.' },
      };
    },
    logError: (...args) => callLog.push(['logError', args]),
  });

  assert.deepEqual(callLog, [
    ['requestPasswordRecoveryService', { cpf: '123.456.789-00' }],
    ['listRecoveryEmailsByCpfService', { cpf: '12345678900' }],
  ]);

  assert.equal(resPost.statusCode, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(resPost.body)), { success: true, message: 'Se os dados informados corresponderem a um usuário cadastrado, enviaremos as instruções de recuperação.' });
  assert.equal(resList.statusCode, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(resList.body)), { success: true, message: 'Se os dados informados corresponderem a um usuário cadastrado, enviaremos as instruções de recuperação.' });
});
