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

test('GET de detalhes de enquetes separa escopo, leitura principal, leitura auxiliar de votos e resposta final', async () => {
  const source = await readSource();

  const scopeBlock = extractBlock(
    source,
    'function resolveEnqueteDetalhesScope({ req }) {',
    '\nasync function readEnqueteDetalhesMainDoc({'
  );
  const mainReadBlock = extractBlock(
    source,
    'async function readEnqueteDetalhesMainDoc({ id, unidadeId }) {',
    '\nasync function readEnqueteDetalhesVotes({'
  );
  const supportReadBlock = extractBlock(
    source,
    'async function readEnqueteDetalhesVotes({ id, unidadeId }) {',
    '\nfunction buildEnqueteDetalhesResponse({'
  );
  const responseBlock = extractBlock(
    source,
    'function buildEnqueteDetalhesResponse({ enq, votos }) {',
    "\napp.get('/api/enquetes/:id([0-9a-fA-F]{24})/detalhes', async (req, res) => {"
  );
  const routeBlock = extractBlock(
    source,
    "app.get('/api/enquetes/:id([0-9a-fA-F]{24})/detalhes', async (req, res) => {",
    "\n// API: relatório em PDF"
  );

  assert.match(scopeBlock, /getCtxUser\(req\)/);
  assert.match(scopeBlock, /userCanScopeAll\(user\)/);
  assert.match(scopeBlock, /getUserUnidadeId\(user\)/);
  assert.doesNotMatch(scopeBlock, /CondEnquete\.findOne\(/);
  assert.doesNotMatch(scopeBlock, /CondEnqueteVoto\.find\(/);

  assert.match(mainReadBlock, /CondEnquete\.findOne\(\{ _id: id, unidade_id: unidadeId \}\)/);
  assert.doesNotMatch(mainReadBlock, /CondEnqueteVoto\.find\(/);

  assert.match(supportReadBlock, /CondEnqueteVoto\.find\(\{ enquete_id: id, unidade_id: unidadeId \}\)/);
  assert.match(supportReadBlock, /sort\(\{ createdAt: 1 \}\)/);
  assert.doesNotMatch(supportReadBlock, /CondEnquete\.findOne\(/);

  assert.match(responseBlock, /const totalVotos = Array\.isArray\(votos\) \? votos\.length : 0;/);
  assert.match(responseBlock, /const byOpt = new Map\(\);/);
  assert.match(responseBlock, /statusCalc: calcStatus\(enq\)/);
  assert.match(responseBlock, /return \{/);
  assert.doesNotMatch(responseBlock, /CondEnquete\.findOne\(/);
  assert.doesNotMatch(responseBlock, /CondEnqueteVoto\.find\(/);

  assert.match(routeBlock, /const scopeResolution = resolveEnqueteDetalhesScope\(\{ req \}\);/);
  assert.match(routeBlock, /const enq = await readEnqueteDetalhesMainDoc\(\{/);
  assert.match(routeBlock, /const votos = await readEnqueteDetalhesVotes\(\{/);
  assert.match(routeBlock, /return res\.json\(buildEnqueteDetalhesResponse\(\{ enq, votos \}\)\);/);
  assert.doesNotMatch(routeBlock, /CondEnquete\.findOne\(/);
  assert.doesNotMatch(routeBlock, /CondEnqueteVoto\.find\(/);
});