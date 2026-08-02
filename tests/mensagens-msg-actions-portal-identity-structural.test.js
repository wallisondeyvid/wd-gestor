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

test('POST /mensagens/api/msg/messages/actions usa candidatos e matcher canonicos no pessoal', async () => {
  const source = await readSource();

  assert.match(source, /function buildPersonalOwnerCandidates\(ctxUser, req, scope\)/);
  assert.match(source, /function buildPersonalOwnerMatcher\(scope, ownerCandidatesLower = \[]\)/);

  const routeBlock = extractRouteBlock(
    source,
    "router.post('/messages/actions', express.json({ limit: '128kb' }), async (req, res, next) => {",
  );

  assert.match(routeBlock, /scope = resolvePersonalMessageScope\(ctxUser, req\);/);
  assert.match(routeBlock, /const ownerCandidatesLower = buildPersonalOwnerCandidates\(ctxUser, req, scope\);/);
  assert.match(routeBlock, /ownerMatcher = buildPersonalOwnerMatcher\(scope, ownerCandidatesLower\);/);
  assert.match(routeBlock, /await cleanupMsgBlobAttachments\(doc\.anexos, blobToken\);/);

  assert.doesNotMatch(routeBlock, /ensurePortalEmailInCtxUser\(ctxUser, req\)/);
  assert.doesNotMatch(routeBlock, /collectPortalEmailCandidatesLower\(/);
  assert.doesNotMatch(routeBlock, /let portalEmailCandidatesLower = \[];/);
});
