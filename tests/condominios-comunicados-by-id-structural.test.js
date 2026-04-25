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

test('GET de comunicado por id separa escopo, leitura principal e resposta final', async () => {
  const source = await readSource();

  const scopeBlock = extractBlock(
    source,
    'function resolveComunicadoByIdScope({ req }) {',
    '\nasync function readComunicadoByIdMainDoc({'
  );
  const mainReadBlock = extractBlock(
    source,
    'async function readComunicadoByIdMainDoc({ id, unidadeId }) {',
    '\nfunction buildComunicadoByIdResponse({'
  );
  const responseBlock = extractBlock(
    source,
    'function buildComunicadoByIdResponse({ doc }) {',
    "\napp.get('/api/comunicados/:id([0-9a-fA-F]{24})', async (req, res) => {"
  );
  const routeBlock = extractBlock(
    source,
    "app.get('/api/comunicados/:id([0-9a-fA-F]{24})', async (req, res) => {",
    "\n// API: criar comunicado"
  );

  assert.match(scopeBlock, /getCtxUser\(req\)/);
  assert.match(scopeBlock, /userCanScopeAll\(user\)/);
  assert.match(scopeBlock, /getUserUnidadeId\(user\)/);
  assert.doesNotMatch(scopeBlock, /CondComunicado\.findOne\(/);

  assert.match(mainReadBlock, /CondComunicado\.findOne\(\{ _id: id, unidade_id: unidadeId \}\)/);
  assert.doesNotMatch(mainReadBlock, /calcComunicadoStatus\(/);

  assert.match(responseBlock, /statusCalc: calcComunicadoStatus\(doc\)/);
  assert.match(responseBlock, /return \{ ok: true, data: \{ \.\.\.doc, statusCalc: calcComunicadoStatus\(doc\) \} \};/);
  assert.doesNotMatch(responseBlock, /CondComunicado\.findOne\(/);

  assert.match(routeBlock, /const scopeResolution = resolveComunicadoByIdScope\(\{ req \}\);/);
  assert.match(routeBlock, /const doc = await readComunicadoByIdMainDoc\(\{/);
  assert.match(routeBlock, /return res\.json\(buildComunicadoByIdResponse\(\{ doc \}\)\);/);
  assert.doesNotMatch(routeBlock, /CondComunicado\.findOne\(/);
});