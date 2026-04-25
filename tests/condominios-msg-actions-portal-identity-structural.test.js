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

test('POST /condominios/api/msg/messages/actions usa seam canônico no corredor pessoal do Portal', async () => {
  const source = await readSource();
  const routeBlock = extractRouteBlock(source, "app.post('/api/msg/messages/actions', express.json(), async (req, res) => {");

  assert.match(source, /async function preparePortalPersonalReadSideContext\(/);
  assert.match(
    routeBlock,
    /const readSideContext = await preparePortalPersonalReadSideContext\([\s\S]*?includePortalEmailCandidatesInOwnerCandidates: true,[\s\S]*?includePortalHabitacaoOwnerVariantsInOwnerCandidates: true,[\s\S]*?const \{ ctxUser: ctxUserForScope, fromPortal, admin, scope, ownerCandidatesLower \} = readSideContext;/
  );
  assert.doesNotMatch(routeBlock, /let portalEmailCandidatesLower = \[];/);
  assert.doesNotMatch(routeBlock, /const ownerCandidatesLower = \(\(\) => \{/);
  assert.doesNotMatch(routeBlock, /const scope = resolveMailboxScope\(/);
  assert.doesNotMatch(routeBlock, /ensurePortalEmailInCtxUser\(/);
  assert.doesNotMatch(routeBlock, /collectPortalEmailCandidatesLower\(/);
});