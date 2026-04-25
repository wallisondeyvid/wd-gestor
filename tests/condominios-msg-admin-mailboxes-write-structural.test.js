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

test('PATCH status e DELETE admin mailboxes usam helper mínimo comum de alvo e escopo', async () => {
  const source = await readSource();
  assert.match(source, /async function prepareMsgAdminMailboxWriteTargetContext\(/);

  const patchBlock = extractRouteBlock(source, "app.patch('/api/msg/admin/mailboxes/:id/status', express.json({ limit: '20kb' }), async (req, res) => {");
  assert.match(
    patchBlock,
    /const adminMailboxWriteContext = await prepareMsgAdminMailboxWriteTargetContext\([\s\S]*?mailboxId: req\.params\?\.id,[\s\S]*?const \{ id, doc, hasGlobalScope \} = adminMailboxWriteContext;/
  );
  assert.doesNotMatch(patchBlock, /if \(!id \|\| !mongoose\.isValidObjectId\(id\)\)/);
  assert.doesNotMatch(patchBlock, /const doc = await CondMsgMailbox\.findById\(id\);/);
  assert.match(patchBlock, /const st = e && e\.status \? Number\(e\.status\) : 500;/);

  const deleteBlock = extractRouteBlock(source, "app.delete('/api/msg/admin/mailboxes/:id', async (req, res) => {");
  const deleteRouteOnly = deleteBlock.split('\nasync function hardDeleteMailboxWithCleanup')[0];
  assert.match(
    deleteRouteOnly,
    /const adminMailboxWriteContext = await prepareMsgAdminMailboxWriteTargetContext\([\s\S]*?mailboxId: req\.params\?\.id,[\s\S]*?requireGlobalScope: true,[\s\S]*?const \{ id, doc \} = adminMailboxWriteContext;/
  );
  assert.doesNotMatch(deleteRouteOnly, /if \(!userCanScopeAll\(ctxUser\)\) return res\.status\(403\)\.json\(\{ error: 'Acesso negado' \}\);/);
  assert.doesNotMatch(deleteRouteOnly, /if \(!id \|\| !mongoose\.isValidObjectId\(id\)\)/);
  assert.doesNotMatch(deleteRouteOnly, /const doc = await CondMsgMailbox\.findById\(id\);/);
  assert.match(deleteRouteOnly, /const st = e && e\.status \? Number\(e\.status\) : 500;/);
});