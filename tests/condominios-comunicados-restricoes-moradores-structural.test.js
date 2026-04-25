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

test('GET de restrições de moradores em comunicados separa escopo, leitura principal, leituras auxiliares e resposta final', async () => {
  const source = await readSource();

  const scopeBlock = extractBlock(
    source,
    'function resolveComunicadoRestricaoMoradoresScope({ req }) {',
    '\nasync function readComunicadoRestricaoMoradoresMainList({'
  );
  const mainReadBlock = extractBlock(
    source,
    'async function readComunicadoRestricaoMoradoresMainList({ unidadeId }) {',
    '\nasync function readComunicadoRestricaoMoradoresSupportData({'
  );
  const supportReadBlock = extractBlock(
    source,
    'async function readComunicadoRestricaoMoradoresSupportData({ moradores }) {',
    '\nfunction buildComunicadoRestricaoMoradoresResponse({'
  );
  const responseBlock = extractBlock(
    source,
    'function buildComunicadoRestricaoMoradoresResponse({ moradores, habMap, blocoMap, andarMap }) {',
    "\napp.get('/api/comunicados/restricoes/moradores', async (req, res) => {"
  );
  const routeBlock = extractBlock(
    source,
    "app.get('/api/comunicados/restricoes/moradores', async (req, res) => {",
    "\n// API: listar comunicados"
  );

  assert.match(scopeBlock, /getCtxUser\(req\)/);
  assert.match(scopeBlock, /userCanScopeAll\(user\)/);
  assert.match(scopeBlock, /getUserUnidadeId\(user\)/);
  assert.doesNotMatch(scopeBlock, /CondMorador\.find\(/);

  assert.match(mainReadBlock, /CondMorador\.find\(\{ unidade_id: unidadeId, ativo: \{ \$ne: false \} \}\)/);
  assert.match(mainReadBlock, /select\('_id nome cpf email habitacao_id usuario_id cond_usuario_id'\)/);
  assert.doesNotMatch(mainReadBlock, /CondHabitacao\.find\(/);
  assert.doesNotMatch(mainReadBlock, /CondBloco\.find\(/);
  assert.doesNotMatch(mainReadBlock, /CondAndar\.find\(/);

  assert.match(supportReadBlock, /CondHabitacao\.find\(\{ _id: \{ \$in: habIds \} \}\)/);
  assert.match(supportReadBlock, /CondBloco\.find\(\{ _id: \{ \$in: blocoIds \} \}\)/);
  assert.match(supportReadBlock, /CondAndar\.find\(\{ _id: \{ \$in: andarIds \} \}\)/);
  assert.doesNotMatch(supportReadBlock, /CondMorador\.find\(/);

  assert.match(responseBlock, /const formatBloco = \(raw\) =>/);
  assert.match(responseBlock, /const formatTipo = \(raw\) =>/);
  assert.match(responseBlock, /if \(email\) fotoUrl = `\/api\/usuarios\/foto\?email=\$\{encodeURIComponent\(String\(email\)\.toLowerCase\(\)\.trim\(\)\)\}`;/);
  assert.match(responseBlock, /return \{ ok: true, data \};/);

  assert.match(routeBlock, /const scopeResolution = resolveComunicadoRestricaoMoradoresScope\(\{ req \}\);/);
  assert.match(routeBlock, /const moradores = await readComunicadoRestricaoMoradoresMainList\(\{ unidadeId: scopeResolution\.unidadeId \}\);/);
  assert.match(routeBlock, /const supportData = await readComunicadoRestricaoMoradoresSupportData\(\{ moradores \}\);/);
  assert.match(routeBlock, /return res\.json\(buildComunicadoRestricaoMoradoresResponse\(\{/);
  assert.doesNotMatch(routeBlock, /CondMorador\.find\(/);
  assert.doesNotMatch(routeBlock, /CondHabitacao\.find\(/);
  assert.doesNotMatch(routeBlock, /CondBloco\.find\(/);
  assert.doesNotMatch(routeBlock, /CondAndar\.find\(/);
});