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

  const end = source.indexOf('\n// API: listar marcadores', start + routeSignature.length);
  if (end === -1) return source.slice(start);
  return source.slice(start, end);
}

test('POST /condominios/api/msg/messages usa preparo canônico mínimo para Portal, mailbox origem e autorização básica', async () => {
  const source = await readSource();
  assert.match(source, /async function preparePortalMailboxWriteSideContext\(/);

  const routeBlock = extractRouteBlock(source, "app.post('/api/msg/messages', maybeUploadMsgAttachments, async (req, res) => {");
  assert.match(
    routeBlock,
    /const mailboxWriteContext = await preparePortalMailboxWriteSideContext\(\{ ctxUser, req \}\);[\s\S]*?ctxUser = mailboxWriteContext\.ctxUser;[\s\S]*?const fromPortal = mailboxWriteContext\.fromPortal;[\s\S]*?const admin = mailboxWriteContext\.admin;[\s\S]*?const preparedUnidadeId = mailboxWriteContext\.unidadeId;/
  );
  assert.match(routeBlock, /if \(!unitIds\.length && preparedUnidadeId\) unitIds\.push\(preparedUnidadeId\);/);
  assert.match(routeBlock, /const uid = preparedUnidadeId \|\| getUserUnidadeId\(ctxUser\);/);
  assert.doesNotMatch(routeBlock, /const fromPortal = String\(req\.headers\['x-wdg-portal'\] \|\| ''\)\.trim\(\) === '1';/);
  assert.doesNotMatch(routeBlock, /const admin = userCanScopeAll\(ctxUser\);/);
});