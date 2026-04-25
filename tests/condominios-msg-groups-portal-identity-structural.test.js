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

test('GET/PATCH/DELETE /condominios/api/msg/groups no pessoal usam helper local de compat de owner', async () => {
  const source = await readSource();
  assert.match(source, /function buildPersonalGroupOwnerCompat\(ctxUser, req\)/);

  const getBlock = extractRouteBlock(source, "app.get('/api/msg/groups', async (req, res) => {");
  assert.match(getBlock, /const compat = buildPersonalGroupOwnerCompat\(ctxUser, req\);[\s\S]*?const filter = compat\.buildFilter\(\);/);
  assert.doesNotMatch(getBlock, /const ownerKey = String\(getMsgOwnerKey\(ctxUser, req\)/);
  assert.doesNotMatch(getBlock, /const baseEmail = ownerKeyBaseEmailLower\(ownerKey\)/);
  assert.doesNotMatch(getBlock, /const basePrefixRx = .*escapeRegExp\(baseEmail\).*;/);

  const patchBlock = extractRouteBlock(source, "app.patch('/api/msg/groups/:id', express.json({ limit: '2mb' }), async (req, res) => {");
  assert.match(patchBlock, /const compat = buildPersonalGroupOwnerCompat\(ctxUser, req\);[\s\S]*?const ok = compat\.matchesDocOwner\(doc\.owner\);/);
  assert.doesNotMatch(patchBlock, /const ownerKey = String\(getMsgOwnerKey\(ctxUser, req\)/);
  assert.doesNotMatch(patchBlock, /const baseEmail = ownerKeyBaseEmailLower\(ownerKey\)/);
  assert.doesNotMatch(patchBlock, /const docOwner = String\(doc\.owner \|\| ''\)\.toLowerCase\(\)/);

  const deleteBlock = extractRouteBlock(source, "app.delete('/api/msg/groups/:id', async (req, res) => {");
  assert.match(deleteBlock, /const compat = buildPersonalGroupOwnerCompat\(ctxUser, req\);[\s\S]*?const ok = compat\.matchesDocOwner\(doc\.owner\);/);
  assert.doesNotMatch(deleteBlock, /const ownerKey = String\(getMsgOwnerKey\(ctxUser, req\)/);
  assert.doesNotMatch(deleteBlock, /const baseEmail = ownerKeyBaseEmailLower\(ownerKey\)/);
  assert.doesNotMatch(deleteBlock, /const docOwner = String\(doc\.owner \|\| ''\)\.toLowerCase\(\)/);
});