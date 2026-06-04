import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const PROJECT_ROOT = process.cwd();
const SERVICE_PATH = path.join(PROJECT_ROOT, 'src/modules/gestor/app/services/auth/passwordRecovery.service.js');
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

test('recovery request: mesmo user_id com emails distintos reutiliza o mesmo token cru e nao auto-invalida o primeiro link', async () => {
  const callLog = [];
  const sentLinks = [];
  const maskEmail = buildFunction(SERVICE_SOURCE, 'function maskEmail(email)');
  const maskCpf = buildFunction(SERVICE_SOURCE, 'function maskCpf(cpf)');
  const requestPasswordRecoveryService = buildFunction(
    SERVICE_SOURCE,
    'export async function requestPasswordRecoveryService({ cpf, email, emailConfirm } = {})',
    {
      Date,
      console: {
        info: () => {},
        warn: () => {},
      },
      process: {
        env: {
          SMTP_USER: 'mailer@example.com',
          SMTP_PASS: 'secret',
          APP_URL: 'http://localhost:3000',
        },
      },
      loadRecoveryUsersByCpf: async () => ([
        { _id: 'user-1', nome: 'Ana', email: 'ana1@example.com', ativo: true },
        { _id: 'user-1', nome: 'Ana', email: 'ana2@example.com', ativo: true },
      ]),
      isEligibleRecoveryUser: buildFunction(SERVICE_SOURCE, 'function isEligibleRecoveryUser(user)', {
        isValidRecoveryEmail: buildFunction(SERVICE_SOURCE, 'function isValidRecoveryEmail(email)'),
        Object,
        String,
      }),
      buildPasswordRecoveryLogMeta: buildFunction(SERVICE_SOURCE, 'function buildPasswordRecoveryLogMeta({ cpfDigits, eligibleCount, queuedCount, failedCount, skippedCount, maskedEmail, reason })', { maskCpf }),
      buildGenericPasswordRecoveryResponse: () => ({
        status: 200,
        body: {
          success: true,
          message: 'Se os dados informados corresponderem a um usuário cadastrado, enviaremos as instruções de recuperação.',
        },
      }),
      nodemailer: {
        createTransport: () => ({
          verify: async () => {},
          sendMail: async (payload) => {
            const hrefMatch = String(payload.html || '').match(/http[^"']+/);
            sentLinks.push({ to: payload.to, link: hrefMatch?.[0] || '' });
            return { accepted: [payload.to] };
          },
        }),
      },
      resolveAppUrl: () => 'http://localhost:3000',
      resetPasswordTemplate: (_nome, link) => ({ html: `<a href="${link}">reset</a>`, text: 'reset' }),
      createPasswordRecoveryTokenData: async ({ userId, rawToken, expiresAt }) => {
        callLog.push(['createPasswordRecoveryTokenData', { userId, rawToken, expiresAt: String(expiresAt) }]);
        return { acknowledged: true };
      },
      crypto: {
        randomBytes: (() => {
          const tokens = ['raw-token-1', 'raw-token-2'];
          return () => ({ toString: () => tokens.shift() });
        })(),
      },
      maskEmail,
      Set,
      Object,
      String,
      Map,
    },
  );

  const result = await requestPasswordRecoveryService({ cpf: '123.456.789-00' });

  assert.deepEqual(toPlainJson(result), {
    status: 200,
    body: {
      success: true,
      message: 'Se os dados informados corresponderem a um usuário cadastrado, enviaremos as instruções de recuperação.',
    },
  });
  assert.equal(callLog.length, 1);
  assert.equal(callLog[0][1].userId, 'user-1');
  assert.equal(callLog[0][1].rawToken, 'raw-token-1');
  assert.deepEqual(sentLinks, [
    { to: 'ana1@example.com', link: 'http://localhost:3000/gestor/reset-password/raw-token-1' },
    { to: 'ana2@example.com', link: 'http://localhost:3000/gestor/reset-password/raw-token-1' },
  ]);
  assert.doesNotMatch(JSON.stringify(sentLinks), /raw-token-2/);
});