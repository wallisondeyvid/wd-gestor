import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const filePath = path.resolve(process.cwd(), 'src/modules/condominios/app/condominios-app.js');

async function readSource() {
  return fs.readFile(filePath, 'utf8');
}

function extractRouteBlock(source, routeSignature) {
  const start = source.indexOf(routeSignature);
  assert.notEqual(start, -1, `rota não encontrada: ${routeSignature}`);

  const end = source.indexOf("\napp.", start + routeSignature.length);
  if (end === -1) return source.slice(start);
  return source.slice(start, end);
}

test('groups fora do pessoal usam helper mínimo comum de mailbox alvo e autorização', async () => {
  const source = await readSource();
  assert.match(source, /async function prepareMsgSharedGroupContext\(/);

  const getBlock = extractRouteBlock(source, "app.get('/api/msg/groups', async (req, res) => {");
  assert.match(
    getBlock,
    /const sharedGroupContext = await prepareMsgSharedGroupContext\(\{ ctxUser, req, mailboxId \}\);[\s\S]*?const \{ mailbox \} = sharedGroupContext;/
  );
  assert.doesNotMatch(getBlock, /const mailbox = await loadMailboxOrThrow\(mailboxId\);/);
  assert.doesNotMatch(getBlock, /if \(!\(await canAccessMsgMailbox\(mailbox, ctxUser, req\)\)\)/);

  const postBlock = extractRouteBlock(source, "app.post('/api/msg/groups', express.json({ limit: '2mb' }), async (req, res) => {");
  assert.match(
    postBlock,
    /const sharedGroupContext = await prepareMsgSharedGroupContext\(\{ ctxUser, req, mailboxId, requireManage: true \}\);[\s\S]*?const \{ mailbox \} = sharedGroupContext;/
  );
  assert.doesNotMatch(postBlock, /const mailbox = await loadMailboxOrThrow\(mailboxId\);/);
  assert.doesNotMatch(postBlock, /mailboxCanManageGroups\(mailbox, ctxUser\)/);

  const patchBlock = extractRouteBlock(source, "app.patch('/api/msg/groups/:id', express.json({ limit: '2mb' }), async (req, res) => {");
  assert.match(
    patchBlock,
    /await prepareMsgSharedGroupContext\(\{ ctxUser, req, mailboxId, requireManage: true \}\);/
  );
  assert.doesNotMatch(patchBlock, /const mailbox = await loadMailboxOrThrow\(mailboxId\);/);
  assert.doesNotMatch(patchBlock, /mailboxCanManageGroups\(mailbox, ctxUser\)/);

  const deleteBlock = extractRouteBlock(source, "app.delete('/api/msg/groups/:id', async (req, res) => {");
  assert.match(
    deleteBlock,
    /await prepareMsgSharedGroupContext\(\{ ctxUser, req, mailboxId, requireManage: true \}\);/
  );
  assert.doesNotMatch(deleteBlock, /const mailbox = await loadMailboxOrThrow\(mailboxId\);/);
  assert.doesNotMatch(deleteBlock, /mailboxCanManageGroups\(mailbox, ctxUser\)/);
});