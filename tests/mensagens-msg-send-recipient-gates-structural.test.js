import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const filePath = path.resolve(process.cwd(), 'src/modules/mensagens/app/mensagens-api.js');

async function readSource() {
  return fs.readFile(filePath, 'utf8');
}

function extractRouteBlock(source, routeSignature) {
  const start = source.indexOf(routeSignature);
  assert.notEqual(start, -1, `rota nao encontrada: ${routeSignature}`);

  const end = source.indexOf('\nrouter.', start + routeSignature.length);
  if (end === -1) return source.slice(start);
  return source.slice(start, end);
}

test('POST /mensagens/api/msg/messages valida destinatarios pessoais e caixas antes do envio', async () => {
  const source = await readSource();

  assert.match(source, /function sanitizeMessageRecipients\(input\)/);

  const routeBlock = extractRouteBlock(
    source,
    "router.post('/messages', (req, res, next) => {",
  );

  assert.match(routeBlock, /const to = sanitizeMessageRecipients\(payload\?\.to\);/);
  assert.match(routeBlock, /const cc = sanitizeMessageRecipients\(payload\?\.cc\);/);
  assert.match(routeBlock, /if \(!to\.length\) return res\.status\(400\)\.json\(\{ error: 'Informe ao menos um destinatário em Para\.' \}\);/);

  assert.match(routeBlock, /for \(const member of \[\.\.\.to, \.\.\.cc\]\) \{/);
  assert.match(routeBlock, /const type = String\(member\?\.type \|\| ''\)\.trim\(\)\.toLowerCase\(\);/);

  assert.match(routeBlock, /if \(type === 'mailbox'\) \{/);
  assert.match(routeBlock, /const mailboxId = String\(member\?\.mailboxId \|\| ''\)\.trim\(\);/);
  assert.match(routeBlock, /if \(!mailboxId \|\| !mongoose\.isValidObjectId\(mailboxId\)\) \{/);
  assert.match(routeBlock, /const exists = await CondMsgMailbox\.exists\(\{/);
  assert.match(routeBlock, /_id: mailboxId,/);
  assert.match(routeBlock, /ativo: \{ \$ne: false \}/);
  assert.match(routeBlock, /if \(!exists\) \{/);

  assert.match(routeBlock, /const email = String\(member\?\.email \|\| ''\)\.trim\(\)\.toLowerCase\(\);/);
  assert.match(routeBlock, /if \(!isEmailish\(email\)\) \{/);

  assert.doesNotMatch(routeBlock, /recipientPermsContext/);
  assert.doesNotMatch(routeBlock, /preparePortalRecipientPermsContext/);
});
