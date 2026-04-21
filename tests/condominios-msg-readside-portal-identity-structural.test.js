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

test('GET /condominios/api/msg/messages usa seam canônico de identidade read-side do Portal', async () => {
  const source = await readSource();
  const routeBlock = extractRouteBlock(source, "app.get('/api/msg/messages', async (req, res) => {");

  assert.match(source, /async function preparePortalPersonalReadSideContext\(/);
  assert.match(
    routeBlock,
    /const readSideContext = await preparePortalPersonalReadSideContext\([\s\S]*?allowRefererPortal: true,[\s\S]*?const \{ fromPortal, admin, scope, ownerCandidatesLower, nameFallback \} = readSideContext;/
  );
  assert.doesNotMatch(
    routeBlock,
    /const ownerCandidatesLower = \(\(\) => \{/,
  );
  assert.doesNotMatch(
    routeBlock,
    /const nameFallback = \(\(\) => \{/,
  );
});

test('GET /condominios/api/msg/messages/:id usa seam canônico de identidade read-side do Portal', async () => {
  const source = await readSource();
  const routeBlock = extractRouteBlock(source, "app.get('/api/msg/messages/:id', async (req, res) => {");

  assert.match(
    routeBlock,
    /const readSideContext = await preparePortalPersonalReadSideContext\([\s\S]*?allowNameFallbackWhenEmailResolved: true,[\s\S]*?const \{ fromPortal, admin, scope, ownerCandidatesLower, nameFallback \} = readSideContext;/
  );
  assert.doesNotMatch(
    routeBlock,
    /const ownerCandidatesLower = \(\(\) => \{/,
  );
  assert.doesNotMatch(
    routeBlock,
    /const nameFallback = \(\(\) => \{/,
  );
});