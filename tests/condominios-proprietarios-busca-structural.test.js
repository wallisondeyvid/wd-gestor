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

test('GET de busca de proprietarios separa escopo, filtro, leitura e resposta final', async () => {
  const source = await readSource();

  const scopeBlock = extractBlock(
    source,
    'async function resolveProprietarioSearchScope({ req }) {',
    '\nfunction buildProprietarioSearchFilter({'
  );
  const filterBlock = extractBlock(
    source,
    'function buildProprietarioSearchFilter({ scope, unidadeParam }) {',
    '\nasync function readProprietarioSearchList({ filter }) {'
  );
  const readBlock = extractBlock(
    source,
    'async function readProprietarioSearchList({ filter }) {',
    '\nfunction buildProprietarioSearchResponse(list) {'
  );
  const responseBlock = extractBlock(
    source,
    'function buildProprietarioSearchResponse(list) {',
    "\napp.get('/api/proprietarios/busca', async (req, res) => {"
  );
  const routeBlock = extractBlock(
    source,
    "app.get('/api/proprietarios/busca', async (req, res) => {",
    '\n// Criar/atualizar proprietários e vincular às habitações'
  );

  assert.match(scopeBlock, /listarUnidadesParaUsuario\(ctxUser\)/);
  assert.match(scopeBlock, /const isAdmin = ctxUser && \(ctxUser\.isMaster \|\| ctxUser\.role === 'master' \|\| ctxUser\.role === 'admin'\)/);
  assert.match(scopeBlock, /const unitIds = \(unidadesOptions \|\| \[\]\)\.map\(u => u\._id\)/);
  assert.doesNotMatch(scopeBlock, /CondProprietario\.find\(/);

  assert.match(filterBlock, /const filter = \{ ativo: \{ \$ne: false \} \ }|const filter = \{ ativo: \{ \$ne: false \} \};/);
  assert.match(filterBlock, /if \(unidadeParam\) filter\.unidade_id = unidadeParam/);
  assert.match(filterBlock, /if \(!scope\.unitIds\.length\) filter\._id = \{ \$exists: false \};/);
  assert.match(filterBlock, /else filter\.unidade_id = \{ \$in: scope\.unitIds \};/);

  assert.match(readBlock, /CondProprietario\.find\(filter\)\.select\('_id unidade_id cond_usuario_id usuario_id nome tipo rg cpf cnpj data_nascimento sexo pai mae contato_email contato_telefone whatsapp ativo'\)\.lean\(\)/);
  assert.match(readBlock, /CondUsuario\.find\(\{ _id: \{ \$in: cUserIds \} \}\)/);
  assert.match(readBlock, /CondHabitacao\.find\(\{ proprietario_id: \{ \$in: propIds \} \}\)/);
  assert.match(readBlock, /CondMorador\.find\(\{ habitacao_id: \{ \$in: habIds \}, ativo: \{ \$ne: false \} \}\)/);
  assert.doesNotMatch(readBlock, /listarUnidadesParaUsuario\(ctxUser\)/);

  assert.match(responseBlock, /const propById = new Map/);
  assert.match(responseBlock, /const cUserById = new Map/);
  assert.match(responseBlock, /const morByHab = new Map\(\)/);
  assert.match(responseBlock, /const normalizeEmail = value => String\(value \|\| ''\)\.trim\(\)\.toLowerCase\(\)/);
  assert.match(responseBlock, /const ownerIsMorador = moradoresHab\.some\(mor => \{/);
  assert.match(responseBlock, /vinculos: habsPorProp\.get\(String\(p\._id\)\) \|\| \[\]/);

  assert.match(routeBlock, /const scopeResolution = await resolveProprietarioSearchScope\(\{ req \}\);/);
  assert.match(routeBlock, /const filter = buildProprietarioSearchFilter\(\{/);
  assert.match(routeBlock, /const list = await readProprietarioSearchList\(\{ filter \}\);/);
  assert.match(routeBlock, /return res\.json\(buildProprietarioSearchResponse\(list\)\);/);
  assert.doesNotMatch(routeBlock, /CondProprietario\.find\(/);
  assert.doesNotMatch(routeBlock, /CondHabitacao\.find\(/);
  assert.doesNotMatch(routeBlock, /CondMorador\.find\(/);
});