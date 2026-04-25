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

test('GET/POST/DELETE /condominios/api/msg/markers usam seam canônico no corredor pessoal do Portal', async () => {
  const source = await readSource();
  assert.match(source, /async function preparePortalPersonalReadSideContext\(/);

  const routeAssertions = [
    {
      signature: "app.get('/api/msg/markers', async (req, res) => {",
      expected: /const readSideContext = await preparePortalPersonalReadSideContext\([\s\S]*?includePortalEmailCandidatesInOwnerCandidates: true,[\s\S]*?includePortalHabitacaoOwnerVariantsInOwnerCandidates: true,[\s\S]*?const \{ fromPortal, admin, scope, ownerCandidatesLower \} = readSideContext;/,
    },
    {
      signature: "app.post('/api/msg/markers', express.json(), async (req, res) => {",
      expected: /const readSideContext = await preparePortalPersonalReadSideContext\([\s\S]*?includePortalEmailCandidatesInOwnerCandidates: true,[\s\S]*?includePortalHabitacaoOwnerVariantsInOwnerCandidates: true,[\s\S]*?const \{ admin, scope, ownerCandidatesLower \} = readSideContext;/,
    },
    {
      signature: "app.delete('/api/msg/markers/:id', async (req, res) => {",
      expected: /const readSideContext = await preparePortalPersonalReadSideContext\([\s\S]*?includePortalEmailCandidatesInOwnerCandidates: true,[\s\S]*?includePortalHabitacaoOwnerVariantsInOwnerCandidates: true,[\s\S]*?const \{ admin, scope, ownerCandidatesLower \} = readSideContext;/,
    },
  ];

  for (const item of routeAssertions) {
    const routeBlock = extractRouteBlock(source, item.signature);
    assert.match(routeBlock, item.expected);
    assert.doesNotMatch(routeBlock, /let portalEmailCandidatesLower = \[];/);
    assert.doesNotMatch(routeBlock, /const ownerCandidatesLower = \(\(\) => \{/);
    assert.doesNotMatch(routeBlock, /const scope = resolveMailboxScope\(/);
    assert.doesNotMatch(routeBlock, /ensurePortalEmailInCtxUser\(/);
    assert.doesNotMatch(routeBlock, /collectPortalEmailCandidatesLower\(/);
  }
});