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

test('GET de busca de moradores separa escopo, filtro, leitura e resposta final', async () => {
  const source = await readSource();

  const scopeBlock = extractBlock(
    source,
    'async function resolveMoradorSearchScope({ req }) {',
    '\nfunction buildMoradorSearchHabitacaoFilter({'
  );
  const filterBlock = extractBlock(
    source,
    'function buildMoradorSearchHabitacaoFilter({ scope, unidadeParam }) {',
    '\nasync function readMoradorSearchList({ filterHab }) {'
  );
  const readBlock = extractBlock(
    source,
    'async function readMoradorSearchList({ filterHab }) {',
    '\nfunction buildMoradorSearchResponse(list) {'
  );
  const responseBlock = extractBlock(
    source,
    'function buildMoradorSearchResponse(list) {',
    "\napp.get('/api/moradores/busca', async (req, res) => {"
  );
  const routeBlock = extractBlock(
    source,
    "app.get('/api/moradores/busca', async (req, res) => {",
    '\n// Criar/atualizar moradores'
  );

  assert.match(scopeBlock, /listarUnidadesParaUsuario\(ctxUser\)/);
  assert.match(scopeBlock, /const isAdmin = ctxUser && \(ctxUser\.isMaster \|\| ctxUser\.role === 'master' \|\| ctxUser\.role === 'admin'\)/);
  assert.match(scopeBlock, /const unitIds = \(unidadesOptions \|\| \[\]\)\.map\(u => u\._id\)/);
  assert.doesNotMatch(scopeBlock, /CondHabitacao\.find\(/);

  assert.match(filterBlock, /if \(unidadeParam\) filter\.unidade_id = unidadeParam/);
  assert.match(filterBlock, /if \(!scope\.unitIds\.length\) filter\._id = \{ \$exists: false \};/);
  assert.match(filterBlock, /else filter\.unidade_id = \{ \$in: scope\.unitIds \};/);

  assert.match(readBlock, /CondHabitacao\.find\(filterHab\)\.select\('_id unidade_id bloco_id andar_id numero tipo'\)\.lean\(\)/);
  assert.match(readBlock, /CondMorador\.find\(\{ habitacao_id: \{ \$in: habIds \}, ativo: \{ \$ne: false \} \}\)/);
  assert.match(readBlock, /CondUsuario\.find\(\{ _id: \{ \$in: cUserIds \} \}\)/);
  assert.doesNotMatch(readBlock, /listarUnidadesParaUsuario\(ctxUser\)/);

  assert.match(responseBlock, /const blocoMap = new Map/);
  assert.match(responseBlock, /const unidadePorHab = new Map/);
  assert.match(responseBlock, /const u = m\.cond_usuario_id \? cUserById\.get\(String\(m\.cond_usuario_id\)\) : null/);
  assert.match(responseBlock, /vinculos: \[\{ unidade_id: uid, habitacao_id: m\.habitacao_id, morador: true, inquilino: !!m\.inquilino, hab_label \}\]/);

  assert.match(routeBlock, /const scopeResolution = await resolveMoradorSearchScope\(\{ req \}\);/);
  assert.match(routeBlock, /const filterHab = buildMoradorSearchHabitacaoFilter\(\{/);
  assert.match(routeBlock, /const list = await readMoradorSearchList\(\{ filterHab \}\);/);
  assert.match(routeBlock, /return res\.json\(buildMoradorSearchResponse\(list\)\);/);
  assert.doesNotMatch(routeBlock, /CondHabitacao\.find\(/);
  assert.doesNotMatch(routeBlock, /CondMorador\.find\(/);
});