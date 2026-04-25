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

test('POST aceitar separa leitura/autorizacao, aplicacao do aceite, push e resposta final', async () => {
  const source = await readSource();

  const acceptanceReadBlock = extractBlock(
    source,
    'async function resolveServiceRequestAcceptanceRead({ req, id }) {',
    '\nasync function applyServiceRequestAcceptance({'
  );
  const applyAcceptanceBlock = extractBlock(
    source,
    'async function applyServiceRequestAcceptance({ id, doc, ctxUser }) {',
    '\nasync function emitServiceRequestAcceptedPush({'
  );
  const pushBlock = extractBlock(
    source,
    'async function emitServiceRequestAcceptedPush({ id, doc }) {',
    '\nfunction buildServiceRequestAcceptanceResponsePayload() {'
  );
  const responseBlock = extractBlock(
    source,
    'function buildServiceRequestAcceptanceResponsePayload() {',
    "\napp.get('/api/solicitacoes-servico/:id', async (req, res) => {"
  );
  const routeBlock = extractBlock(
    source,
    "app.post('/api/solicitacoes-servico/:id/aceitar', express.json(), async (req, res) => {",
    "\napp.post('/api/solicitacoes-servico/:id/rejeitar', express.json(), async (req, res) => {"
  );

  assert.match(acceptanceReadBlock, /CondSolicitacaoServico\.findById\(id\)\.lean\(\)/);
  assert.match(acceptanceReadBlock, /listarUnidadesParaUsuario\(ctxUser\)/);
  assert.match(acceptanceReadBlock, /Solicitação fora do escopo do usuário/);
  assert.doesNotMatch(acceptanceReadBlock, /updateOne\(/);
  assert.doesNotMatch(acceptanceReadBlock, /notifyServicoStatusPush\(/);

  assert.match(applyAcceptanceBlock, /CondSolicitacaoServico\.updateOne\(/);
  assert.match(applyAcceptanceBlock, /status: 'aceita'/);
  assert.match(applyAcceptanceBlock, /nova: false/);
  assert.match(applyAcceptanceBlock, /aceita_em: new Date\(\)/);
  assert.doesNotMatch(applyAcceptanceBlock, /notifyServicoStatusPush\(/);

  assert.match(pushBlock, /notifyServicoStatusPush\(/);
  assert.match(pushBlock, /status: 'aceita'/);
  assert.match(pushBlock, /push não enviado/);

  assert.match(responseBlock, /return \{ ok: true \};|return \{ ok: true \ };/);

  assert.match(routeBlock, /const acceptanceRead = await resolveServiceRequestAcceptanceRead\(\{ req, id \}\);/);
  assert.match(routeBlock, /await applyServiceRequestAcceptance\(\{/);
  assert.match(routeBlock, /await emitServiceRequestAcceptedPush\(\{/);
  assert.match(routeBlock, /return res\.json\(buildServiceRequestAcceptanceResponsePayload\(\)\);/);
  assert.doesNotMatch(routeBlock, /CondSolicitacaoServico\.findById\(/);
  assert.doesNotMatch(routeBlock, /CondSolicitacaoServico\.updateOne\(/);
  assert.doesNotMatch(routeBlock, /notifyServicoStatusPush\(/);
});