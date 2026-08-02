import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const filePath = path.resolve(process.cwd(), 'src/modules/mensagens/app/mensagens-api.js');

async function readSource() {
  return fs.readFile(filePath, 'utf8');
}

function extractBlock(source, startSignature, endSignature = '\nrouter.') {
  const start = source.indexOf(startSignature);
  assert.notEqual(start, -1, `bloco nao encontrado: ${startSignature}`);

  const end = source.indexOf(endSignature, start + startSignature.length);
  if (end === -1) return source.slice(start);
  return source.slice(start, end);
}

function extractRouteBlock(source, routeSignature) {
  return extractBlock(source, routeSignature, '\nrouter.');
}

test('GET /mensagens/api/msg/messages e /messages/:id usam escopo canonico de leitura', async () => {
  const source = await readSource();

  assert.match(source, /async function loadMessageDetailContextForRequest\(req, res\) \{/);
  assert.match(source, /function resolvePersonalMessageScope\(ctxUser, req\)/);
  assert.match(source, /function buildPersonalOwnerCandidates\(ctxUser, req, scope\)/);
  assert.match(source, /function buildPersonalOwnerMatcher\(scope, ownerCandidatesLower = \[]\)/);

  const detailContextBlock = extractBlock(
    source,
    'async function loadMessageDetailContextForRequest(req, res) {',
    "\nrouter.get('/messages/:id/historico-acessos.pdf'",
  );

  assert.match(detailContextBlock, /scope = resolvePersonalMessageScope\(ctxUser, req\);/);
  assert.match(detailContextBlock, /const ownerCandidatesLower = buildPersonalOwnerCandidates\(ctxUser, req, scope\);/);
  assert.match(detailContextBlock, /ownerMatcher = buildPersonalOwnerMatcher\(scope, ownerCandidatesLower\);/);
  assert.match(detailContextBlock, /messageDeletedForScope\(doc, scope, ownerMatcher\)/);
  assert.match(detailContextBlock, /canAccessMessageForScope\(doc, ctxUser, scope, ownerMatcher\)/);
  assert.match(detailContextBlock, /const item = toMessageDetailItemScoped\(doc, scope, ownerMatcher\);/);
  assert.match(detailContextBlock, /\.map\(d => toMessageDetailItemScoped\(d, scope, ownerMatcher\)\)/);

  const detailRoute = extractRouteBlock(source, "router.get('/messages/:id', async (req, res, next) => {");
  assert.match(detailRoute, /const ctx = await loadMessageDetailContextForRequest\(req, res\);/);
  assert.match(detailRoute, /item: ctx\.item,/);
  assert.match(detailRoute, /thread: ctx\.thread/);

  const listRoute = extractRouteBlock(source, "router.get('/messages', async (req, res, next) => {");
  assert.match(listRoute, /scope = resolvePersonalMessageScope\(ctxUser, req\);/);
  assert.match(listRoute, /ownerCandidatesLower = buildPersonalOwnerCandidates\(ctxUser, req, scope\);/);

  assert.doesNotMatch(detailContextBlock, /ensurePortalEmailInCtxUser\(ctxUser, req\)/);
  assert.doesNotMatch(listRoute, /ensurePortalEmailInCtxUser\(ctxUser, req\)/);
});
