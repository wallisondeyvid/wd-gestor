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

test('DELETE de enquete separa escopo, deleção de votos, deleção principal e resposta final', async () => {
  const source = await readSource();

  const scopeBlock = extractBlock(
    source,
    'function resolveEnqueteDeleteScope({ req }) {',
    '\nasync function deleteEnqueteDependentVotes({'
  );
  const votesDeleteBlock = extractBlock(
    source,
    'async function deleteEnqueteDependentVotes({ id, unidadeId }) {',
    '\nasync function deleteEnqueteMainDoc({'
  );
  const mainDeleteBlock = extractBlock(
    source,
    'async function deleteEnqueteMainDoc({ id, unidadeId }) {',
    '\nfunction buildEnqueteDeleteResponse() {'
  );
  const responseBlock = extractBlock(
    source,
    'function buildEnqueteDeleteResponse() {',
    "\napp.delete('/api/enquetes/:id([0-9a-fA-F]{24})', async (req, res) => {"
  );
  const routeBlock = extractBlock(
    source,
    "app.delete('/api/enquetes/:id([0-9a-fA-F]{24})', async (req, res) => {",
    '\n// API: detalhes + estatísticas e votantes por alternativa'
  );

  assert.match(scopeBlock, /getCtxUser\(req\)/);
  assert.match(scopeBlock, /userCanScopeAll\(user\)/);
  assert.match(scopeBlock, /getUserUnidadeId\(user\)/);
  assert.doesNotMatch(scopeBlock, /CondEnqueteVoto\.deleteMany\(/);

  assert.match(votesDeleteBlock, /CondEnqueteVoto\.deleteMany\(\{ enquete_id: id, unidade_id: unidadeId \}\)/);
  assert.doesNotMatch(votesDeleteBlock, /CondEnquete\.deleteOne\(/);

  assert.match(mainDeleteBlock, /CondEnquete\.deleteOne\(\{ _id: id, unidade_id: unidadeId \}\)/);
  assert.doesNotMatch(mainDeleteBlock, /CondEnqueteVoto\.deleteMany\(/);

  assert.match(responseBlock, /return \{ ok: true \};/);

  assert.match(routeBlock, /const scopeResolution = resolveEnqueteDeleteScope\(\{ req \}\);/);
  assert.match(routeBlock, /await deleteEnqueteDependentVotes\(\{/);
  assert.match(routeBlock, /await deleteEnqueteMainDoc\(\{/);
  assert.match(routeBlock, /return res\.json\(buildEnqueteDeleteResponse\(\)\);/);
  assert.doesNotMatch(routeBlock, /const scopeAll = userCanScopeAll\(user\);/);
  assert.doesNotMatch(routeBlock, /CondEnqueteVoto\.deleteMany\(/);
  assert.doesNotMatch(routeBlock, /CondEnquete\.deleteOne\(/);
});