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

test('rotas /mensagens/api/msg/mailboxes respeitam escopo de unidade e permissao do usuario', async () => {
  const source = await readSource();

  const recipientsBlock = extractRouteBlock(source, "router.get('/mailboxes/recipients', async (req, res, next) => {");
  assert.match(recipientsBlock, /const admin = userCanScopeAll\(ctxUser\);/);
  assert.match(recipientsBlock, /const unidadeId = admin \? qUnidade : getUserUnidadeId\(ctxUser\);/);
  assert.match(recipientsBlock, /filter\.unidade_id = unidadeId;/);
  assert.match(recipientsBlock, /mailboxIsHabitacao\(d\)/);

  const listBlock = extractRouteBlock(source, "router.get('/mailboxes', async (req, res, next) => {");
  assert.match(listBlock, /const admin = userCanScopeAll\(ctxUser\);/);
  assert.match(listBlock, /const unidadeId = admin \? qUnidade : getUserUnidadeId\(ctxUser\);/);
  assert.match(listBlock, /const docsFiltered = \(docs \|\| \[]\)\.filter\(d => !mailboxIsHabitacao\(d\)\);/);
  assert.match(listBlock, /filter\(d => mailboxIsMember\(d, ctxUser\)\)/);
  assert.match(listBlock, /mb\.canAdmin = !!\(admin \|\| \(perms && typeof perms === 'object' && perms\.administrar\)\);/);

  const postBlock = extractRouteBlock(source, "router.post('/mailboxes', express.json(), async (req, res, next) => {");
  assert.match(postBlock, /const admin = userCanScopeAll\(ctxUser\);/);
  assert.match(postBlock, /const ctxUnidadeIdRaw = String\(getUserUnidadeId\(ctxUser\) \|\| ''\)\.trim\(\);/);
  assert.match(postBlock, /const sessionUnidadeIdRaw = String\(/);
  assert.match(postBlock, /const unidadeId = admin/);
  assert.match(postBlock, /\? \(bodyUnidadeId \|\| ctxUnidadeId \|\| sessionUnidadeId\)/);
  assert.match(postBlock, /: \(ctxUnidadeId \|\| sessionUnidadeId\);/);
  assert.match(postBlock, /const creator = getMsgOwnerKey\(ctxUser, req\) \|\| String\(ctxUser\?\.nome \|\| ctxUser\?\.name \|\| ''\)\.trim\(\);/);
  assert.match(postBlock, /const operators = \[\{ user: creator, perms: defaultCreatorPermsServer\(\) \}\];/);

  const patchBlock = extractRouteBlock(source, "router.patch('/mailboxes/:id', express.json(), async (req, res, next) => {");
  assert.match(patchBlock, /const admin = userCanScopeAll\(ctxUser\);/);
  assert.match(patchBlock, /if \(!admin && !mailboxIsMember\(doc, ctxUser\)\) \{/);
  assert.match(patchBlock, /const perms = mailboxGetUserPerms\(doc, ctxUser\);/);
  assert.match(patchBlock, /if \(!perms \|\| !perms\.administrar\) \{/);
  assert.match(patchBlock, /else if \(!mailboxCanEdit\(doc, ctxUser\)\) \{/);

  const deleteBlock = extractRouteBlock(source, "router.delete('/mailboxes/:id', async (req, res, next) => {");
  assert.match(deleteBlock, /const admin = userCanScopeAll\(ctxUser\);/);
  assert.match(deleteBlock, /if \(!admin && !mailboxIsMember\(doc, ctxUser\)\) \{/);
  assert.match(deleteBlock, /if \(!mailboxCanEdit\(doc, ctxUser\)\) \{/);
  assert.match(deleteBlock, /const deleted = await hardDeleteMailboxWithCleanup\(id, \{/);

  assert.doesNotMatch(source, /preparePortalMailboxReadSideContext/);
  assert.doesNotMatch(source, /preparePortalMailboxWriteSideContext/);
});
