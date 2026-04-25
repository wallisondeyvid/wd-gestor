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

test('GET /condominios/api/msg/mailboxes e /recipients usam helper canônico de preparo Portal', async () => {
  const source = await readSource();
  assert.match(source, /async function preparePortalMailboxReadSideContext\(/);

  const recipientsBlock = extractRouteBlock(source, "app.get('/api/msg/mailboxes/recipients', async (req, res) => {");
  assert.match(
    recipientsBlock,
    /const mailboxReadContext = await preparePortalMailboxReadSideContext\([\s\S]*?includeAllowedUnitIds: true,[\s\S]*?const \{ admin, fromPortal, unidadeId, allowedUnitIds, portalHabIds \} = mailboxReadContext;/
  );
  assert.doesNotMatch(recipientsBlock, /const admin = userCanScopeAll\(ctxUser\);/);
  assert.doesNotMatch(recipientsBlock, /const ref = String\(req\.headers\?\.referer/);
  assert.doesNotMatch(recipientsBlock, /ctxUser = await ensurePortalEmailInCtxUser\(ctxUser, req\);/);
  assert.doesNotMatch(recipientsBlock, /let allowedUnitIds = \[];/);
  assert.doesNotMatch(recipientsBlock, /let portalHabIds = \[];/);
  assert.doesNotMatch(recipientsBlock, /await collectPortalHabitacaoIds\(ctxUser, req, unidadeId\)/);

  const mailboxesBlock = extractRouteBlock(source, "app.get('/api/msg/mailboxes', async (req, res) => {");
  assert.match(
    mailboxesBlock,
    /const mailboxReadContext = await preparePortalMailboxReadSideContext\([\s\S]*?const \{ admin, fromPortal, unidadeId, portalHabIds \} = mailboxReadContext;/
  );
  assert.doesNotMatch(mailboxesBlock, /const admin = userCanScopeAll\(ctxUser\);/);
  assert.doesNotMatch(mailboxesBlock, /const ref = String\(req\.headers\?\.referer/);
  assert.doesNotMatch(mailboxesBlock, /ctxUser = await ensurePortalEmailInCtxUser\(ctxUser, req\);/);
  assert.doesNotMatch(mailboxesBlock, /let portalHabIds = \[];/);
  assert.doesNotMatch(mailboxesBlock, /await collectPortalHabitacaoIds\(ctxUser, req, unidadeId\)/);
});

test('POST/PATCH/DELETE /condominios/api/msg/mailboxes usam helper canônico mínimo de write-side', async () => {
  const source = await readSource();
  assert.match(source, /async function preparePortalMailboxWriteSideContext\(/);

  const postBlock = extractRouteBlock(source, "app.post('/api/msg/mailboxes', express.json(), async (req, res) => {");
  assert.match(
    postBlock,
    /const mailboxWriteContext = await preparePortalMailboxWriteSideContext\([\s\S]*?qUnidade: String\(req\.body\?\.unitId \|\| req\.body\?\.unidade_id \|\| req\.body\?\.unidadeId \|\| ''\)\.trim\(\),[\s\S]*?ctxUser = mailboxWriteContext\.ctxUser;[\s\S]*?const \{ unidadeId \} = mailboxWriteContext;/
  );
  assert.doesNotMatch(postBlock, /const admin = userCanScopeAll\(ctxUser\);/);
  assert.doesNotMatch(postBlock, /getUserUnidadeId\(ctxUser\)/);

  const patchBlock = extractRouteBlock(source, "app.patch('/api/msg/mailboxes/:id', express.json(), async (req, res) => {");
  assert.match(
    patchBlock,
    /const mailboxWriteContext = await preparePortalMailboxWriteSideContext\(\{ ctxUser, req \}\);[\s\S]*?ctxUser = mailboxWriteContext\.ctxUser;[\s\S]*?const \{ admin \} = mailboxWriteContext;/
  );
  assert.doesNotMatch(patchBlock, /const admin = userCanScopeAll\(ctxUser\);/);
  assert.doesNotMatch(patchBlock, /const ref = String\(req\.headers\?\.referer/);
  assert.doesNotMatch(patchBlock, /ensurePortalEmailInCtxUser\(ctxUser, req\)/);

  const deleteBlock = extractRouteBlock(source, "app.delete('/api/msg/mailboxes/:id', async (req, res) => {");
  assert.match(
    deleteBlock,
    /const mailboxWriteContext = await preparePortalMailboxWriteSideContext\(\{ ctxUser, req \}\);[\s\S]*?ctxUser = mailboxWriteContext\.ctxUser;[\s\S]*?const \{ admin \} = mailboxWriteContext;/
  );
  assert.doesNotMatch(deleteBlock, /const admin = userCanScopeAll\(ctxUser\);/);
  assert.doesNotMatch(deleteBlock, /const ref = String\(req\.headers\?\.referer/);
  assert.doesNotMatch(deleteBlock, /ensurePortalEmailInCtxUser\(ctxUser, req\)/);
});