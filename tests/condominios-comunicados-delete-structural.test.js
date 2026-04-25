import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const filePath = path.resolve(process.cwd(), 'src/modules/condominios/app/condominios-app.js');

async function readSource() {
  return fs.readFile(filePath, 'utf8');
}

function extractBlock(source, signature, nextSignature = '\napp.') {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `bloco não encontrado: ${signature}`);

  const end = source.indexOf(nextSignature, start + signature.length);
  if (end === -1) return source.slice(start);
  return source.slice(start, end);
}

test('DELETE de comunicado separa escopo, deleção principal, não encontrado e resposta final', async () => {
  const source = await readSource();

  const scopeBlock = extractBlock(
    source,
    'function resolveComunicadoDeleteScope({ req }) {',
    '\nasync function deleteComunicadoMainDoc({'
  );
  const mainDeleteBlock = extractBlock(
    source,
    'async function deleteComunicadoMainDoc({ id, unidadeId }) {',
    '\nfunction buildComunicadoDeleteNotFoundResponse() {'
  );
  const notFoundBlock = extractBlock(
    source,
    'function buildComunicadoDeleteNotFoundResponse() {',
    '\nfunction buildComunicadoDeleteResponse() {'
  );
  const responseBlock = extractBlock(
    source,
    'function buildComunicadoDeleteResponse() {',
    "\napp.delete('/api/comunicados/:id([0-9a-fA-F]{24})', async (req, res) => {"
  );
  const routeBlock = extractBlock(
    source,
    "app.delete('/api/comunicados/:id([0-9a-fA-F]{24})', async (req, res) => {",
    '\n// API: listas para restrições (UI de enquetes)'
  );

  assert.match(scopeBlock, /getCtxUser\(req\)/);
  assert.match(scopeBlock, /userCanScopeAll\(user\)/);
  assert.match(scopeBlock, /getUserUnidadeId\(user\)/);
  assert.doesNotMatch(scopeBlock, /CondComunicado\.deleteOne\(/);

  assert.match(mainDeleteBlock, /CondComunicado\.deleteOne\(\{ _id: id, unidade_id: unidadeId \}\)/);

  assert.match(notFoundBlock, /return \{ error: 'Comunicado não encontrado' \};/);
  assert.match(responseBlock, /return \{ ok: true \};/);

  assert.match(routeBlock, /const scopeResolution = resolveComunicadoDeleteScope\(\{ req \}\);/);
  assert.match(routeBlock, /const deletionResult = await deleteComunicadoMainDoc\(\{/);
  assert.match(routeBlock, /return res\.status\(404\)\.json\(buildComunicadoDeleteNotFoundResponse\(\)\);/);
  assert.match(routeBlock, /return res\.json\(buildComunicadoDeleteResponse\(\)\);/);
  assert.doesNotMatch(routeBlock, /const scopeAll = userCanScopeAll\(user\);/);
  assert.doesNotMatch(routeBlock, /CondComunicado\.deleteOne\(/);
  assert.doesNotMatch(routeBlock, /Comunicado não encontrado/);
  assert.doesNotMatch(routeBlock, /return res\.json\(\{ ok: true \}\);/);
});