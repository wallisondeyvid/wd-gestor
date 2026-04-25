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

test('GET de busca de garagens separa escopo, filtro, leitura e resposta final', async () => {
  const source = await readSource();

  const scopeBlock = extractBlock(
    source,
    'async function resolveGarageSearchScope({ req, unidadeParam }) {',
    '\nfunction buildGarageSearchFilter({'
  );
  const filterBlock = extractBlock(
    source,
    'function buildGarageSearchFilter({ unidadeFilter, nome }) {',
    '\nasync function readGarageSearchList({ req, filter }) {'
  );
  const readBlock = extractBlock(
    source,
    'async function readGarageSearchList({ req, filter }) {',
    '\nfunction buildGarageSearchResponse(list) {'
  );
  const responseBlock = extractBlock(
    source,
    'function buildGarageSearchResponse(list) {',
    "\napp.get('/api/garagens/busca', async (req, res) => {"
  );
  const routeBlock = extractBlock(
    source,
    "app.get('/api/garagens/busca', async (req, res) => {",
    "\n// Criar vaga"
  );

  assert.match(scopeBlock, /listarUnidadesParaUsuario\(ctxUser\)/);
  assert.match(scopeBlock, /Unidade fora do escopo do usuário/);
  assert.match(scopeBlock, /return \{ empty: true \}|return \{ empty: true \};/);
  assert.doesNotMatch(scopeBlock, /CondVagaGaragem\.find\(/);

  assert.match(filterBlock, /if \(unidadeFilter\) filter\.unidade_id = unidadeFilter/);
  assert.match(filterBlock, /filter\.nome = \{ \$regex: nome, \$options: 'i' \}/);

  assert.match(readBlock, /CondVagaGaragem\.find\(filter\)\.lean\(\)/);
  assert.match(readBlock, /unidadesReadRepoFromReq\(req\)\.find/);
  assert.doesNotMatch(readBlock, /listarUnidadesParaUsuario\(ctxUser\)/);

  assert.match(responseBlock, /const unidadeMap = new Map/);
  assert.match(responseBlock, /unidade: unidadeMap\.get\(String\(v\.unidade_id\)\) \|\| \{ _id: v\.unidade_id \}/);
  assert.match(responseBlock, /return \(list\.vagas \|\| \[\]\)\.map\(v => \(\{/);

  assert.match(routeBlock, /const scopeResolution = await resolveGarageSearchScope\(\{ req, unidadeParam: unidade \}\);/);
  assert.match(routeBlock, /const filter = buildGarageSearchFilter\(\{/);
  assert.match(routeBlock, /const list = await readGarageSearchList\(\{ req, filter \}\);/);
  assert.match(routeBlock, /return res\.json\(buildGarageSearchResponse\(list\)\);/);
  assert.doesNotMatch(routeBlock, /CondVagaGaragem\.find\(/);
  assert.doesNotMatch(routeBlock, /listarUnidadesParaUsuario\(ctxUser\)/);
});