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

test('GET /condominios/api/msg/recipients/perms usa helper canônico mínimo de preparo', async () => {
  const source = await readSource();
  assert.match(source, /async function preparePortalRecipientPermsContext\(/);

  const routeBlock = extractRouteBlock(source, "app.get('/api/msg/recipients/perms', async (req, res) => {");
  assert.match(
    routeBlock,
    /const recipientPermsContext = await preparePortalRecipientPermsContext\(\{ ctxUser, req \}\);[\s\S]*?ctxUser = recipientPermsContext\.ctxUser;[\s\S]*?const \{ fromPortal, unidadeId, emailLower \} = recipientPermsContext;/
  );
  assert.doesNotMatch(routeBlock, /const ref = String\(req\.headers\?\.referer/);
  assert.doesNotMatch(routeBlock, /ensurePortalEmailInCtxUser\(ctxUser, req\)/);
  assert.doesNotMatch(routeBlock, /const unidadeId = String\(getUserUnidadeId\(ctxUser\)/);
  assert.doesNotMatch(routeBlock, /const ownerKey = String\(getMsgOwnerKey\(ctxUser, req\)/);
});