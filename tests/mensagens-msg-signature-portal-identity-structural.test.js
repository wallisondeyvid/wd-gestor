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

test('GET e PUT /mensagens/api/msg/signature usam contexto canonico de assinatura pessoal', async () => {
  const source = await readSource();

  assert.match(source, /function preparePersonalSignatureContext\(/);

  const getBlock = extractRouteBlock(source, "router.get('/signature', async (req, res, next) => {");
  assert.match(getBlock, /const signatureContext = preparePersonalSignatureContext\(\{/);
  assert.match(getBlock, /ctxUser,/);
  assert.match(getBlock, /req,/);
  assert.match(getBlock, /mailboxId/);
  assert.match(getBlock, /const \{ owner, baseEmail \} = signatureContext;/);
  assert.match(getBlock, /owner: baseEmail,/);
  assert.doesNotMatch(getBlock, /ensurePortalEmailInCtxUser\(ctxUser, req\)/);
  assert.doesNotMatch(getBlock, /const ref = String\(req\.headers\?\.referer/);

  const putBlock = extractRouteBlock(source, "router.put('/signature', express.json({ limit: '64kb' }), async (req, res, next) => {");
  assert.match(putBlock, /const signatureContext = preparePersonalSignatureContext\(\{/);
  assert.match(putBlock, /const \{[\s\S]*?owner,[\s\S]*?canonicalOwner,[\s\S]*?cleanupOwnerKeys[\s\S]*?\} = signatureContext;/);
  assert.match(putBlock, /owner: String\(canonicalOwner\)\.toLowerCase\(\),/);
  assert.match(putBlock, /cleanupOwnerKeys/);
  assert.doesNotMatch(putBlock, /ensurePortalEmailInCtxUser\(ctxUser, req\)/);
  assert.doesNotMatch(putBlock, /const canonicalOwner = \(\(\) =>/);
});
