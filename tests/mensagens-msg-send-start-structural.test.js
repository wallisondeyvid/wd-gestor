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

test('POST /mensagens/api/msg/messages prepara remetente e estado inicial pelo modulo mensagens', async () => {
  const source = await readSource();

  assert.match(source, /async function loadMsgMailboxForSend\(mailboxId\)/);
  assert.match(source, /function userCanSendFromMailbox\(mailboxDoc, ctxUser\)/);
  assert.match(source, /function buildInitialMessageStates\(\{ fromMailboxId, fromOwner, to, cc \}\)/);

  const routeBlock = extractRouteBlock(
    source,
    "router.post('/messages', (req, res, next) => {",
  );

  assert.match(routeBlock, /mensagensUpload\.array\('anexos', 15\)/);
  assert.match(routeBlock, /const payload = rawPayload \? JSON\.parse\(rawPayload \|\| '\{\}'\) : \(req\.body \|\| \{\}\);/);
  assert.match(routeBlock, /const fromMailboxId = String\(payload\?\.fromMailboxId \|\| payload\?\.from_mailbox_id \|\| ''\)\.trim\(\) \|\| 'pessoal';/);

  assert.match(routeBlock, /if \(fromMailboxId === 'pessoal'\) \{/);
  assert.match(routeBlock, /fromOwner = String\(getMsgOwnerKey\(ctxUser, req\) \|\| ''\)\.trim\(\)\.toLowerCase\(\);/);
  assert.match(routeBlock, /const uid = getUserUnidadeId\(ctxUser\);/);
  assert.match(routeBlock, /fromMailboxName = String\(payload\?\.fromMailboxName \|\| 'Pessoal'\)\.trim\(\) \|\| 'Pessoal';/);

  assert.match(routeBlock, /const mailbox = await loadMsgMailboxForSend\(fromMailboxId\);/);
  assert.match(routeBlock, /if \(!userCanSendFromMailbox\(mailbox, ctxUser\)\) \{/);
  assert.match(routeBlock, /unidadeId = mailbox\.unidade_id \|\| null;/);
  assert.match(routeBlock, /fromMailboxName = String\(mailbox\.name \|\| ''\)\.trim\(\);/);

  assert.match(routeBlock, /const initialStates = buildInitialMessageStates\(\{/);
  assert.match(routeBlock, /fromMailboxId,/);
  assert.match(routeBlock, /fromOwner,/);
  assert.match(routeBlock, /to,/);
  assert.match(routeBlock, /cc/);
  assert.match(routeBlock, /states: initialStates,/);

  assert.doesNotMatch(routeBlock, /preparePortalMailboxWriteSideContext/);
});
