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

test('GET de restrições de habitações em enquetes separa escopo, leitura principal, leituras auxiliares e resposta final', async () => {
  const source = await readSource();

  const scopeBlock = extractBlock(
    source,
    'function resolveEnqueteRestricaoHabitacoesScope({ req }) {',
    '\nasync function readEnqueteRestricaoHabitacoesMainList({'
  );
  const mainReadBlock = extractBlock(
    source,
    'async function readEnqueteRestricaoHabitacoesMainList({ unidadeId }) {',
    '\nasync function readEnqueteRestricaoHabitacoesSupportData({'
  );
  const supportReadBlock = extractBlock(
    source,
    'async function readEnqueteRestricaoHabitacoesSupportData({ req, unidadeId, habs }) {',
    '\nfunction buildEnqueteRestricaoHabitacoesResponse({'
  );
  const responseBlock = extractBlock(
    source,
    'function buildEnqueteRestricaoHabitacoesResponse({ habs, condominioNome, blocoMap, andarMap }) {',
    "\napp.get('/api/enquetes/restricoes/habitacoes', async (req, res) => {"
  );
  const routeBlock = extractBlock(
    source,
    "app.get('/api/enquetes/restricoes/habitacoes', async (req, res) => {",
    "\napp.get('/api/enquetes/restricoes/moradores', async (req, res) => {"
  );

  assert.match(scopeBlock, /getCtxUser\(req\)/);
  assert.match(scopeBlock, /userCanScopeAll\(user\)/);
  assert.match(scopeBlock, /getUserUnidadeId\(user\)/);
  assert.doesNotMatch(scopeBlock, /CondHabitacao\.find\(/);

  assert.match(mainReadBlock, /CondHabitacao\.find\(\{ unidade_id: unidadeId \}\)/);
  assert.match(mainReadBlock, /select\('_id bloco_id andar_id numero tipo'\)/);
  assert.doesNotMatch(mainReadBlock, /CondBloco\.find\(/);
  assert.doesNotMatch(mainReadBlock, /CondAndar\.find\(/);

  assert.match(supportReadBlock, /unidadesReadRepoFromReq\(req\)\.findById\(unidadeId, \{ select: 'nome' \}\)/);
  assert.match(supportReadBlock, /CondBloco\.find\(\{ _id: \{ \$in: blocoIds \} \}\)/);
  assert.match(supportReadBlock, /CondAndar\.find\(\{ _id: \{ \$in: andarIds \} \}\)/);
  assert.doesNotMatch(supportReadBlock, /CondHabitacao\.find\(/);

  assert.match(responseBlock, /const formatBloco = \(raw\) =>/);
  assert.match(responseBlock, /const formatTipo = \(raw\) =>/);
  assert.match(responseBlock, /const label = parts\.join\(' - '\) \|\| \(num \? `Hab \$\{num\}` : 'Habitação'\)/);
  assert.match(responseBlock, /return \{ ok: true, data \};/);

  assert.match(routeBlock, /const scopeResolution = resolveEnqueteRestricaoHabitacoesScope\(\{ req \}\);/);
  assert.match(routeBlock, /const habs = await readEnqueteRestricaoHabitacoesMainList\(\{ unidadeId: scopeResolution\.unidadeId \}\);/);
  assert.match(routeBlock, /const supportData = await readEnqueteRestricaoHabitacoesSupportData\(\{/);
  assert.match(routeBlock, /return res\.json\(buildEnqueteRestricaoHabitacoesResponse\(\{/);
  assert.doesNotMatch(routeBlock, /CondHabitacao\.find\(/);
  assert.doesNotMatch(routeBlock, /CondBloco\.find\(/);
  assert.doesNotMatch(routeBlock, /CondAndar\.find\(/);
});