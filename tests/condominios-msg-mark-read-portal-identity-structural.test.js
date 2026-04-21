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

test('POST /condominios/api/msg/messages/:id/read usa seam canônico de identidade/acesso do Portal pessoal', async () => {
  const source = await readSource();
  const routeBlock = extractRouteBlock(source, "app.post('/api/msg/messages/:id/read', async (req, res) => {");

  assert.match(source, /async function preparePortalPersonalReadSideContext\(/);
  assert.match(
    routeBlock,
    /const readSideContext = await preparePortalPersonalReadSideContext\([\s\S]*?allowNameFallbackWhenEmailResolved: true,[\s\S]*?includePortalEmailCandidatesInOwnerCandidates: true,[\s\S]*?const \{ fromPortal, admin, scope, ownerCandidatesLower, nameFallback \} = readSideContext;/
  );
  assert.doesNotMatch(routeBlock, /let portalEmailCandidatesLower = \[];/);
  assert.doesNotMatch(routeBlock, /const ownerCandidatesLower = \(\(\) => \{/);
  assert.doesNotMatch(routeBlock, /const nameFallback = \(\(\) => \{/);
  assert.doesNotMatch(routeBlock, /resolveMailboxScope\(ctxUser, mailboxId, req\)/);
});