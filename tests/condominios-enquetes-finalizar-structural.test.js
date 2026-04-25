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

test('POST de finalização de enquete separa escopo, leitura principal, mutação e resposta final', async () => {
  const source = await readSource();

  const scopeBlock = extractBlock(
    source,
    'function resolveEnqueteFinalizeScope({ req }) {',
    '\nasync function readEnqueteFinalizeMainDoc({'
  );
  const mainReadBlock = extractBlock(
    source,
    'async function readEnqueteFinalizeMainDoc({ id, unidadeId }) {',
    '\nfunction applyEnqueteFinalizeMutation({'
  );
  const mutationBlock = extractBlock(
    source,
    'function applyEnqueteFinalizeMutation({ doc, user }) {',
    '\nfunction buildEnqueteFinalizeResponse() {'
  );
  const responseBlock = extractBlock(
    source,
    'function buildEnqueteFinalizeResponse() {',
    "\napp.post('/api/enquetes/:id([0-9a-fA-F]{24})/finalizar', async (req, res) => {"
  );
  const routeBlock = extractBlock(
    source,
    "app.post('/api/enquetes/:id([0-9a-fA-F]{24})/finalizar', async (req, res) => {",
    '\n// API: excluir enquete (remove também votos)'
  );

  assert.match(scopeBlock, /getCtxUser\(req\)/);
  assert.match(scopeBlock, /userCanScopeAll\(user\)/);
  assert.match(scopeBlock, /getUserUnidadeId\(user\)/);
  assert.doesNotMatch(scopeBlock, /CondEnquete\.findOne\(/);

  assert.match(mainReadBlock, /CondEnquete\.findOne\(\{ _id: id, unidade_id: unidadeId \}\)/);
  assert.doesNotMatch(mainReadBlock, /finalizadaEm = new Date\(/);

  assert.match(mutationBlock, /doc\.finalizadaEm = new Date\(\);/);
  assert.match(mutationBlock, /doc\.finalizadaPor = \{/);
  assert.match(mutationBlock, /userId: user\?\.id \|\| user\?\._id \|\| user\?\.cond_usuario_id \|\| null,/);
  assert.doesNotMatch(mutationBlock, /CondEnquete\.findOne\(/);

  assert.match(responseBlock, /return \{ ok: true \};/);

  assert.match(routeBlock, /const scopeResolution = resolveEnqueteFinalizeScope\(\{ req \}\);/);
  assert.match(routeBlock, /const doc = await readEnqueteFinalizeMainDoc\(\{/);
  assert.match(routeBlock, /applyEnqueteFinalizeMutation\(\{ doc, user: scopeResolution\.user \}\);/);
  assert.match(routeBlock, /return res\.json\(buildEnqueteFinalizeResponse\(\)\);/);
  assert.doesNotMatch(routeBlock, /const scopeAll = userCanScopeAll\(user\);/);
  assert.doesNotMatch(routeBlock, /doc\.finalizadaEm = new Date\(\);/);
});