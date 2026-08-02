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

test('groups compartilhados no modulo mensagens usam mailbox alvo para acesso e unidade', async () => {
  const source = await readSource();

  const getBlock = extractRouteBlock(source, "router.get('/groups', async (req, res, next) => {");
  assert.match(getBlock, /const mailbox = await loadMsgMailboxForSignature\(mailboxId, ctxUser\);/);
  assert.match(getBlock, /const sharedMailboxId = String\(mailbox\?\._id \|\| mailboxId\);/);
  assert.match(getBlock, /mailbox_id: sharedMailboxId,/);
  assert.match(getBlock, /owner: '',/);

  const postBlock = extractRouteBlock(source, "router.post('/groups', express.json({ limit: '2mb' }), async (req, res, next) => {");
  assert.match(postBlock, /const mailbox = await loadMsgMailboxForSignature\(mailboxId, ctxUser\);/);
  assert.match(postBlock, /targetMailboxId = String\(mailbox\?\._id \|\| mailboxId\);/);
  assert.match(postBlock, /owner = '';/);
  assert.match(postBlock, /unidadeId = mailbox\?\.unidade_id \|\| null;/);

  const patchBlock = extractRouteBlock(source, "router.patch('/groups/:id', express.json({ limit: '2mb' }), async (req, res, next) => {");
  assert.match(patchBlock, /const mailboxId = String\(doc\.mailbox_id \|\| ''\)\.trim\(\);/);
  assert.match(patchBlock, /await loadMsgMailboxForSignature\(mailboxId, ctxUser\);/);

  const deleteBlock = extractRouteBlock(source, "router.delete('/groups/:id', async (req, res, next) => {");
  assert.match(deleteBlock, /const mailboxId = String\(doc\.mailbox_id \|\| ''\)\.trim\(\);/);
  assert.match(deleteBlock, /await loadMsgMailboxForSignature\(mailboxId, ctxUser\);/);

  assert.doesNotMatch(source, /async function prepareMsgSharedGroupContext\(/);
  assert.doesNotMatch(getBlock, /prepareMsgSharedGroupContext/);
  assert.doesNotMatch(postBlock, /prepareMsgSharedGroupContext/);
  assert.doesNotMatch(patchBlock, /prepareMsgSharedGroupContext/);
  assert.doesNotMatch(deleteBlock, /prepareMsgSharedGroupContext/);
});
