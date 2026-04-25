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

test('GET de listagem de enquetes separa escopo, leitura principal e resposta final', async () => {
  const source = await readSource();

  const scopeBlock = extractBlock(
    source,
    'function resolveEnqueteListScope({ req }) {',
    '\nasync function readEnqueteListPage({'
  );
  const mainReadBlock = extractBlock(
    source,
    'async function readEnqueteListPage({ unidadeId, page, pageSize }) {',
    '\nfunction buildEnqueteListResponse({'
  );
  const responseBlock = extractBlock(
    source,
    'function buildEnqueteListResponse({ data, page, pageSize, total, totalPages }) {',
    "\napp.get('/api/enquetes', async (req, res) => {"
  );
  const routeBlock = extractBlock(
    source,
    "app.get('/api/enquetes', async (req, res) => {",
    "\n// API: obter enquete"
  );

  assert.match(scopeBlock, /getCtxUser\(req\)/);
  assert.match(scopeBlock, /userCanScopeAll\(user\)/);
  assert.match(scopeBlock, /getUserUnidadeId\(user\)/);
  assert.match(scopeBlock, /parseInt\(pageRaw, 10\)/);
  assert.doesNotMatch(scopeBlock, /CondEnquete\.find\(/);
  assert.doesNotMatch(scopeBlock, /CondEnquete\.countDocuments\(/);

  assert.match(mainReadBlock, /const q = \{ unidade_id: unidadeId \};/);
  assert.match(mainReadBlock, /CondEnquete\.countDocuments\(q\)/);
  assert.match(mainReadBlock, /CondEnquete\.find\(q\)/);
  assert.match(mainReadBlock, /sort\(\{ createdAt: -1 \}\)/);
  assert.doesNotMatch(mainReadBlock, /calcStatus\(/);

  assert.match(responseBlock, /const now = new Date\(\);/);
  assert.match(responseBlock, /statusCalc: calcStatus\(d, now\)/);
  assert.match(responseBlock, /return \{ ok: true, data: out, page, pageSize, total, totalPages \};/);
  assert.doesNotMatch(responseBlock, /CondEnquete\.find\(/);
  assert.doesNotMatch(responseBlock, /CondEnquete\.countDocuments\(/);

  assert.match(routeBlock, /const scopeResolution = resolveEnqueteListScope\(\{ req \}\);/);
  assert.match(routeBlock, /const listData = await readEnqueteListPage\(\{/);
  assert.match(routeBlock, /return res\.json\(buildEnqueteListResponse\(listData\)\);/);
  assert.doesNotMatch(routeBlock, /CondEnquete\.find\(/);
  assert.doesNotMatch(routeBlock, /CondEnquete\.countDocuments\(/);
});