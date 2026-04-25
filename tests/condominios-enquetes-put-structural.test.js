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

test('PUT de enquete separa escopo, leitura principal, validações de payload e resposta final', async () => {
  const source = await readSource();

  const scopeBlock = extractBlock(
    source,
    'function resolveEnqueteUpdateScope({ req }) {',
    '\nasync function readEnqueteUpdateMainDoc({'
  );
  const mainReadBlock = extractBlock(
    source,
    'async function readEnqueteUpdateMainDoc({ id, unidadeId }) {',
    '\nfunction validateAndNormalizeEnqueteUpdatePayload({'
  );
  const payloadBlock = extractBlock(
    source,
    'function validateAndNormalizeEnqueteUpdatePayload({ body }) {',
    '\nfunction buildEnqueteUpdateResponse() {'
  );
  const responseBlock = extractBlock(
    source,
    'function buildEnqueteUpdateResponse() {',
    "\napp.put('/api/enquetes/:id([0-9a-fA-F]{24})', express.json({ limit: '200kb' }), async (req, res) => {"
  );
  const routeBlock = extractBlock(
    source,
    "app.put('/api/enquetes/:id([0-9a-fA-F]{24})', express.json({ limit: '200kb' }), async (req, res) => {",
    "\n// API: finalizar enquete antecipadamente"
  );

  assert.match(scopeBlock, /getCtxUser\(req\)/);
  assert.match(scopeBlock, /userCanScopeAll\(user\)/);
  assert.match(scopeBlock, /getUserUnidadeId\(user\)/);
  assert.doesNotMatch(scopeBlock, /CondEnquete\.findOne\(/);

  assert.match(mainReadBlock, /CondEnquete\.findOne\(\{ _id: id, unidade_id: unidadeId \}\)/);
  assert.doesNotMatch(mainReadBlock, /parseOpcoes\(/);

  assert.match(payloadBlock, /const ini = new Date\(String\(body\?\.vigencia_inicio \|\| ''\)\);/);
  assert.match(payloadBlock, /const fim = new Date\(String\(body\?\.vigencia_fim \|\| ''\)\);/);
  assert.match(payloadBlock, /const pergunta = String\(body\?\.pergunta \|\| ''\)\.trim\(\);/);
  assert.match(payloadBlock, /const opcoesIn = Array\.isArray\(body\?\.opcoes\) \? body\.opcoes : \[\];/);
  assert.match(payloadBlock, /const opcoes = parseOpcoes\(opcoesIn\);/);
  assert.match(payloadBlock, /foto_pergunta: normalizeFotoUrl\(body\?\.foto_pergunta \|\| body\?\.fotoPergunta\)/);
  assert.match(payloadBlock, /restricoes: parseRestricoes\(body\?\.restricoes\)/);
  assert.doesNotMatch(payloadBlock, /CondEnquete\.findOne\(/);

  assert.match(responseBlock, /return \{ ok: true \};/);

  assert.match(routeBlock, /const scopeResolution = resolveEnqueteUpdateScope\(\{ req \}\);/);
  assert.match(routeBlock, /const doc = await readEnqueteUpdateMainDoc\(\{/);
  assert.match(routeBlock, /const payload = validateAndNormalizeEnqueteUpdatePayload\(\{ body: req\.body \}\);/);
  assert.match(routeBlock, /return res\.json\(buildEnqueteUpdateResponse\(\)\);/);
  assert.doesNotMatch(routeBlock, /const ini = new Date\(/);
  assert.doesNotMatch(routeBlock, /const fim = new Date\(/);
});