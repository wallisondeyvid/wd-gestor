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

test('GET /mensagens/api/msg/messages/:id/historico-acessos.pdf usa contexto canonico de detalhe', async () => {
  const source = await readSource();

  const routeBlock = extractRouteBlock(
    source,
    "router.get('/messages/:id/historico-acessos.pdf', async (req, res) => {",
  );

  assert.match(routeBlock, /const ctx = await loadMessageDetailContextForRequest\(req, res\);/);
  assert.match(routeBlock, /if \(ctx\.handled\) \{/);
  assert.match(routeBlock, /return res\.status\(ctx\.status\)\.end\(ctx\.error\);/);
  assert.match(routeBlock, /res\.setHeader\('Content-Type', 'application\/pdf'\);/);
  assert.match(routeBlock, /inline; filename="historico-acessos-\$\{filenameBase\}\.pdf"/);
  assert.match(routeBlock, /const accessEvents = Array\.isArray\(ctx\.item\?\.acessos\)/);
  assert.match(routeBlock, /const grouped = new Map\(\);/);

  assert.doesNotMatch(routeBlock, /resolvePersonalMessageScope\(ctxUser, req\)/);
  assert.doesNotMatch(routeBlock, /buildPersonalOwnerCandidates\(ctxUser, req, scope\)/);
});
