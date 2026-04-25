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

test('GET de busca de naturezas separa escopo, filtro, leitura e resposta final', async () => {
  const source = await readSource();

  const scopeBlock = extractBlock(
    source,
    'async function resolveMaterialNatureSearchScope({ req, unidadeParam }) {',
    '\nfunction buildMaterialNatureSearchFilter({'
  );
  const filterBlock = extractBlock(
    source,
    'function buildMaterialNatureSearchFilter({ unidadeFilter, tipo, nome }) {',
    '\nasync function readMaterialNatureSearchList({ req, filter }) {'
  );
  const readBlock = extractBlock(
    source,
    'async function readMaterialNatureSearchList({ req, filter }) {',
    '\nfunction buildMaterialNatureSearchResponse(list) {'
  );
  const responseBlock = extractBlock(
    source,
    'function buildMaterialNatureSearchResponse(list) {',
    "\napp.get('/api/materiais/naturezas/busca', async (req, res) => {"
  );
  const routeBlock = extractBlock(
    source,
    "app.get('/api/materiais/naturezas/busca', async (req, res) => {",
    "\n// Criar natureza"
  );

  assert.match(scopeBlock, /listarUnidadesParaUsuario\(ctxUser\)/);
  assert.match(scopeBlock, /Unidade fora do escopo do usuário/);
  assert.match(scopeBlock, /return \{ empty: true \}|return \{ empty: true \};/);
  assert.doesNotMatch(scopeBlock, /CondNatMaterial\.find\(/);

  assert.match(filterBlock, /if \(unidadeFilter\) filter\.unidade_id = unidadeFilter/);
  assert.match(filterBlock, /if \(tipo\) filter\.tipo = tipo/);
  assert.match(filterBlock, /filter\.nome = \{ \$regex: nome, \$options: 'i' \}/);

  assert.match(readBlock, /CondNatMaterial\.find\(filter\)\.lean\(\)/);
  assert.match(readBlock, /unidadesReadRepoFromReq\(req\)\.find/);
  assert.doesNotMatch(readBlock, /listarUnidadesParaUsuario\(ctxUser\)/);

  assert.match(responseBlock, /const unidadeMap = new Map/);
  assert.match(responseBlock, /unidade: unidadeMap\.get\(String\(n\.unidade_id\)\) \|\| \{ _id: n\.unidade_id \}/);
  assert.match(responseBlock, /return \(list\.list \|\| \[\]\)\.map\(n => \(\{/);

  assert.match(routeBlock, /const scopeResolution = await resolveMaterialNatureSearchScope\(\{ req, unidadeParam: unidade \}\);/);
  assert.match(routeBlock, /const filter = buildMaterialNatureSearchFilter\(\{/);
  assert.match(routeBlock, /const list = await readMaterialNatureSearchList\(\{ req, filter \}\);/);
  assert.match(routeBlock, /return res\.json\(buildMaterialNatureSearchResponse\(list\)\);/);
  assert.doesNotMatch(routeBlock, /CondNatMaterial\.find\(/);
  assert.doesNotMatch(routeBlock, /listarUnidadesParaUsuario\(ctxUser\)/);
});