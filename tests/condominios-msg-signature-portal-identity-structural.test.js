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

test('GET e PUT /condominios/api/msg/signature usam helper canônico mínimo de preparo', async () => {
  const source = await readSource();
  assert.match(source, /async function preparePortalSignatureContext\(/);

  const getBlock = extractRouteBlock(source, "app.get('/api/msg/signature', async (req, res) => {");
  assert.match(
    getBlock,
    /const signatureContext = await preparePortalSignatureContext\([\s\S]*?mailboxId: String\(req\.query\.mailboxId \|\| req\.query\.mailbox_id \|\| ''\)\.trim\(\),[\s\S]*?ctxUser = signatureContext\.ctxUser;[\s\S]*?const \{ mailboxId, owner, baseEmail \} = signatureContext;/
  );
  assert.doesNotMatch(getBlock, /const ref = String\(req\.headers\?\.referer/);
  assert.doesNotMatch(getBlock, /ensurePortalEmailInCtxUser\(ctxUser, req\)/);
  assert.doesNotMatch(getBlock, /const owner = String\(getMsgOwnerKey\(ctxUser, req\)/);

  const putBlock = extractRouteBlock(source, "app.put('/api/msg/signature', express.json({ limit: '64kb' }), async (req, res) => {");
  assert.match(
    putBlock,
    /const signatureContext = await preparePortalSignatureContext\([\s\S]*?mailboxId: String\(req\.query\.mailboxId \|\| req\.query\.mailbox_id \|\| req\.body\?\.mailboxId \|\| req\.body\?\.mailbox_id \|\| ''\)\.trim\(\),[\s\S]*?ctxUser = signatureContext\.ctxUser;[\s\S]*?const \{ mailboxId, owner, canonicalOwner, cleanupOwnerKeys \} = signatureContext;/
  );
  assert.doesNotMatch(putBlock, /const ref = String\(req\.headers\?\.referer/);
  assert.doesNotMatch(putBlock, /ensurePortalEmailInCtxUser\(ctxUser, req\)/);
  assert.doesNotMatch(putBlock, /const owner = String\(getMsgOwnerKey\(ctxUser, req\)/);
  assert.doesNotMatch(putBlock, /const canonicalOwner = \(\(\) =>/);
});