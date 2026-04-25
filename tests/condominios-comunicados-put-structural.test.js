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

test('PUT de comunicado separa escopo, leitura principal, validações de payload e resposta final', async () => {
  const source = await readSource();

  const scopeBlock = extractBlock(
    source,
    'function resolveComunicadoUpdateScope({ req }) {',
    '\nasync function readComunicadoUpdateMainDoc({'
  );
  const mainReadBlock = extractBlock(
    source,
    'async function readComunicadoUpdateMainDoc({ id, unidadeId }) {',
    '\nfunction validateAndNormalizeComunicadoUpdatePayload({'
  );
  const payloadBlock = extractBlock(
    source,
    'function validateAndNormalizeComunicadoUpdatePayload({ body }) {',
    '\nfunction buildComunicadoUpdateResponse() {'
  );
  const responseBlock = extractBlock(
    source,
    'function buildComunicadoUpdateResponse() {',
    "\napp.put('/api/comunicados/:id([0-9a-fA-F]{24})', express.json({ limit: '220kb' }), async (req, res) => {"
  );
  const routeBlock = extractBlock(
    source,
    "app.put('/api/comunicados/:id([0-9a-fA-F]{24})', express.json({ limit: '220kb' }), async (req, res) => {",
    "\n// API: excluir comunicado"
  );

  assert.match(scopeBlock, /getCtxUser\(req\)/);
  assert.match(scopeBlock, /userCanScopeAll\(user\)/);
  assert.match(scopeBlock, /getUserUnidadeId\(user\)/);
  assert.doesNotMatch(scopeBlock, /CondComunicado\.findOne\(/);

  assert.match(mainReadBlock, /CondComunicado\.findOne\(\{ _id: id, unidade_id: unidadeId \}\)/);
  assert.doesNotMatch(mainReadBlock, /parseRestricoes\(/);

  assert.match(payloadBlock, /const ini = new Date\(String\(body\?\.vigencia_inicio \|\| ''\)\);/);
  assert.match(payloadBlock, /const fim = new Date\(String\(body\?\.vigencia_fim \|\| ''\)\);/);
  assert.match(payloadBlock, /const maxEnd = new Date\(/);
  assert.match(payloadBlock, /foto: normalizeFotoUrl\(body\?\.foto\)/);
  assert.match(payloadBlock, /restricoes: parseRestricoes\(body\?\.restricoes\)/);
  assert.doesNotMatch(payloadBlock, /CondComunicado\.findOne\(/);

  assert.match(responseBlock, /return \{ ok: true \};/);

  assert.match(routeBlock, /const scopeResolution = resolveComunicadoUpdateScope\(\{ req \}\);/);
  assert.match(routeBlock, /const doc = await readComunicadoUpdateMainDoc\(\{/);
  assert.match(routeBlock, /const payload = validateAndNormalizeComunicadoUpdatePayload\(\{ body: req\.body \}\);/);
  assert.match(routeBlock, /return res\.json\(buildComunicadoUpdateResponse\(\)\);/);
  assert.doesNotMatch(routeBlock, /const ini = new Date\(/);
  assert.doesNotMatch(routeBlock, /const fim = new Date\(/);
});