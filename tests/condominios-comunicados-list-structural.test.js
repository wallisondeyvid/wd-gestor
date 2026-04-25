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

test('GET de listagem de comunicados separa escopo, leitura principal e resposta final', async () => {
  const source = await readSource();

  const scopeBlock = extractBlock(
    source,
    'function resolveComunicadoListScope({ req }) {',
    '\nasync function readComunicadoListPage({'
  );
  const mainReadBlock = extractBlock(
    source,
    'async function readComunicadoListPage({ unidadeId, page, pageSize }) {',
    '\nfunction buildComunicadoListResponse({'
  );
  const responseBlock = extractBlock(
    source,
    'function buildComunicadoListResponse({ data, page, pageSize, total, totalPages }) {',
    "\napp.get('/api/comunicados', async (req, res) => {"
  );
  const routeBlock = extractBlock(
    source,
    "app.get('/api/comunicados', async (req, res) => {",
    "\n// API: obter comunicado"
  );

  assert.match(scopeBlock, /getCtxUser\(req\)/);
  assert.match(scopeBlock, /userCanScopeAll\(user\)/);
  assert.match(scopeBlock, /getUserUnidadeId\(user\)/);
  assert.match(scopeBlock, /parseInt\(pageRaw, 10\)/);
  assert.doesNotMatch(scopeBlock, /CondComunicado\.find\(/);
  assert.doesNotMatch(scopeBlock, /CondComunicado\.countDocuments\(/);

  assert.match(mainReadBlock, /const q = \{ unidade_id: unidadeId \};/);
  assert.match(mainReadBlock, /CondComunicado\.countDocuments\(q\)/);
  assert.match(mainReadBlock, /CondComunicado\.find\(q\)/);
  assert.match(mainReadBlock, /sort\(\{ createdAt: -1 \}\)/);
  assert.doesNotMatch(mainReadBlock, /calcComunicadoStatus\(/);

  assert.match(responseBlock, /const now = new Date\(\);/);
  assert.match(responseBlock, /statusCalc: calcComunicadoStatus\(d, now\)/);
  assert.match(responseBlock, /return \{ ok: true, data: out, page, pageSize, total, totalPages \};/);
  assert.doesNotMatch(responseBlock, /CondComunicado\.find\(/);
  assert.doesNotMatch(responseBlock, /CondComunicado\.countDocuments\(/);

  assert.match(routeBlock, /const scopeResolution = resolveComunicadoListScope\(\{ req \}\);/);
  assert.match(routeBlock, /const listData = await readComunicadoListPage\(\{/);
  assert.match(routeBlock, /return res\.json\(buildComunicadoListResponse\(listData\)\);/);
  assert.doesNotMatch(routeBlock, /CondComunicado\.find\(/);
  assert.doesNotMatch(routeBlock, /CondComunicado\.countDocuments\(/);
});