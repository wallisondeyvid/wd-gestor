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

test('GET de detalhe de solicitacao separa leitura/autorizacao, marcacao de nova e resposta final', async () => {
  const source = await readSource();

  const detailReadBlock = extractBlock(
    source,
    'async function resolveServiceRequestDetailRead({ req, id }) {',
    '\nasync function markServiceRequestDetailAsSeen({'
  );
  const markSeenBlock = extractBlock(
    source,
    'async function markServiceRequestDetailAsSeen({ id, doc }) {',
    '\nasync function buildServiceRequestDetailResponsePayload({'
  );
  const responseBlock = extractBlock(
    source,
    'async function buildServiceRequestDetailResponsePayload({ doc }) {',
    "\napp.get('/api/solicitacoes-servico/:id', async (req, res) => {"
  );
  const routeBlock = extractBlock(
    source,
    "app.get('/api/solicitacoes-servico/:id', async (req, res) => {"
  );

  assert.match(detailReadBlock, /CondSolicitacaoServico\.findById\(id\)\.lean\(\)/);
  assert.match(detailReadBlock, /listarUnidadesParaUsuario\(ctxUser\)/);
  assert.match(detailReadBlock, /Solicitação fora do escopo do usuário/);
  assert.doesNotMatch(detailReadBlock, /findByIdAndUpdate/);

  assert.match(markSeenBlock, /doc\.nova === false/);
  assert.match(markSeenBlock, /CondSolicitacaoServico\.findByIdAndUpdate\(/);
  assert.match(markSeenBlock, /\{ \$set: \{ nova: false \} \}/);

  assert.match(responseBlock, /return \{ data: doc \};|return \{ data: doc \ };/);

  assert.match(routeBlock, /const detailRead = await resolveServiceRequestDetailRead\(\{ req, id \}\);/);
  assert.match(routeBlock, /const detailDoc = await markServiceRequestDetailAsSeen\(\{/);
  assert.match(routeBlock, /buildServiceRequestDetailResponsePayload\(\{ doc: detailDoc \}\)/);
  assert.doesNotMatch(routeBlock, /CondSolicitacaoServico\.findById\(/);
  assert.doesNotMatch(routeBlock, /CondSolicitacaoServico\.findByIdAndUpdate\(/);
});