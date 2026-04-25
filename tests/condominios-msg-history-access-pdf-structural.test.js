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

  const end = source.indexOf("\n// API: impressão de mensagem em PDF", start + routeSignature.length);
  if (end === -1) return source.slice(start);
  return source.slice(start, end);
}

test('GET /condominios/api/msg/messages/:id/historico-acessos.pdf usa preparo canônico mínimo do ramo pessoal/Portal', async () => {
  const source = await readSource();
  assert.match(source, /async function preparePortalPersonalReadSideContext\(/);

  const routeBlock = extractRouteBlock(source, "app.get('/api/msg/messages/:id([0-9a-fA-F]{24})/historico-acessos.pdf', async (req, res) => {");
  assert.match(
    routeBlock,
    /const readSideContext = await preparePortalPersonalReadSideContext\([\s\S]*?allowNameFallbackWhenEmailResolved: true,[\s\S]*?includePortalHabitacaoOwnerVariantsInOwnerCandidates: true,[\s\S]*?ctxUser = readSideContext\.ctxUser;[\s\S]*?const \{ fromPortal, admin, scope, ownerCandidatesLower, nameFallback \} = readSideContext;/
  );
  assert.doesNotMatch(routeBlock, /const scope = resolveMailboxScope\(ctxUser, mailboxId, req\)/);
  assert.doesNotMatch(routeBlock, /const ownerCandidatesLower = \(\(\) => \{/);
  assert.doesNotMatch(routeBlock, /const nameFallback = \(\(\) => \{/);
});