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

test('GET/POST/DELETE /mensagens/api/msg/markers usam escopo pessoal e candidatos de owner', async () => {
  const source = await readSource();

  assert.match(source, /function buildPersonalOwnerCandidates\(ctxUser, req, scope\)/);

  const routeAssertions = [
    "router.get('/markers', async (req, res) => {",
    "router.post('/markers', express.json({ limit: '64kb' }), async (req, res) => {",
    "router.delete('/markers/:id', async (req, res) => {",
  ];

  for (const signature of routeAssertions) {
    const block = extractRouteBlock(source, signature);

    assert.match(block, /scope = resolvePersonalMessageScope\(ctxUser, req\);/);
    assert.match(block, /ownerCandidatesLower = buildPersonalOwnerCandidates\(ctxUser, req, scope\);/);
    assert.match(block, /const ownerQuery = scope\.mailboxId === 'pessoal' && ownerCandidatesLower\.length/);

    assert.doesNotMatch(block, /ensurePortalEmailInCtxUser\(ctxUser, req\)/);
    assert.doesNotMatch(block, /collectPortalEmailCandidatesLower\(/);
    assert.doesNotMatch(block, /let portalEmailCandidatesLower = \[];/);
  }
});
