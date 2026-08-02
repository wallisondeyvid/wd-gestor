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

test('GET/PATCH/DELETE /mensagens/api/msg/groups no pessoal usam compatibilidade canonica de owner', async () => {
  const source = await readSource();

  assert.match(source, /function buildPersonalGroupOwnerCompat\(ctxUser, req\)/);

  const getBlock = extractRouteBlock(source, "router.get('/groups', async (req, res, next) => {");
  assert.match(getBlock, /const compat = buildPersonalGroupOwnerCompat\(ctxUser, req\);/);
  assert.match(getBlock, /filter = compat\.buildFilter\(\);/);

  const patchBlock = extractRouteBlock(source, "router.patch('/groups/:id', express.json({ limit: '2mb' }), async (req, res, next) => {");
  assert.match(patchBlock, /const compat = buildPersonalGroupOwnerCompat\(ctxUser, req\);/);
  assert.match(patchBlock, /const ok = compat\.matchesDocOwner\(doc\.owner\);/);

  const deleteBlock = extractRouteBlock(source, "router.delete('/groups/:id', async (req, res, next) => {");
  assert.match(deleteBlock, /const compat = buildPersonalGroupOwnerCompat\(ctxUser, req\);/);
  assert.match(deleteBlock, /const ok = compat\.matchesDocOwner\(doc\.owner\);/);

  assert.doesNotMatch(getBlock, /const ownerKey = String\(getMsgOwnerKey\(ctxUser, req\)/);
  assert.doesNotMatch(patchBlock, /const docOwner = String\(doc\.owner \|\| ''\)\.toLowerCase\(\)/);
  assert.doesNotMatch(deleteBlock, /const docOwner = String\(doc\.owner \|\| ''\)\.toLowerCase\(\)/);
});
