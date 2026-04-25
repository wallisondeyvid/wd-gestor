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

test('GET de enquete por id separa escopo, leitura principal e resposta final', async () => {
  const source = await readSource();

  const scopeBlock = extractBlock(
    source,
    'function resolveEnqueteByIdScope({ req }) {',
    '\nasync function readEnqueteByIdMainDoc({'
  );
  const mainReadBlock = extractBlock(
    source,
    'async function readEnqueteByIdMainDoc({ id, unidadeId }) {',
    '\nfunction buildEnqueteByIdResponse({'
  );
  const responseBlock = extractBlock(
    source,
    'function buildEnqueteByIdResponse({ doc }) {',
    "\napp.get('/api/enquetes/:id([0-9a-fA-F]{24})', async (req, res) => {"
  );
  const routeBlock = extractBlock(
    source,
    "app.get('/api/enquetes/:id([0-9a-fA-F]{24})', async (req, res) => {",
    "\n// API: criar enquete"
  );

  assert.match(scopeBlock, /getCtxUser\(req\)/);
  assert.match(scopeBlock, /userCanScopeAll\(user\)/);
  assert.match(scopeBlock, /getUserUnidadeId\(user\)/);
  assert.doesNotMatch(scopeBlock, /CondEnquete\.findOne\(/);

  assert.match(mainReadBlock, /CondEnquete\.findOne\(\{ _id: id, unidade_id: unidadeId \}\)/);
  assert.doesNotMatch(mainReadBlock, /calcStatus\(/);

  assert.match(responseBlock, /statusCalc: calcStatus\(doc\)/);
  assert.match(responseBlock, /return \{ ok: true, data: \{ \.\.\.doc, statusCalc: calcStatus\(doc\) \} \};/);
  assert.doesNotMatch(responseBlock, /CondEnquete\.findOne\(/);

  assert.match(routeBlock, /const scopeResolution = resolveEnqueteByIdScope\(\{ req \}\);/);
  assert.match(routeBlock, /const doc = await readEnqueteByIdMainDoc\(\{/);
  assert.match(routeBlock, /return res\.json\(buildEnqueteByIdResponse\(\{ doc \}\)\);/);
  assert.doesNotMatch(routeBlock, /CondEnquete\.findOne\(/);
});