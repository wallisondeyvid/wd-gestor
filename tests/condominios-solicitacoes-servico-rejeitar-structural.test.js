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

test('POST rejeitar separa leitura/autorizacao, aplicacao da rejeicao, push e resposta final', async () => {
  const source = await readSource();

  const rejectionReadBlock = extractBlock(
    source,
    'async function resolveServiceRequestRejectionRead({ req, id }) {',
    '\nasync function applyServiceRequestRejection({'
  );
  const applyRejectionBlock = extractBlock(
    source,
    'async function applyServiceRequestRejection({ id, doc, ctxUser, motivo }) {',
    '\nasync function emitServiceRequestRejectedPush({'
  );
  const pushBlock = extractBlock(
    source,
    'async function emitServiceRequestRejectedPush({ id, doc, motivo }) {',
    '\nfunction buildServiceRequestRejectionResponsePayload() {'
  );
  const responseBlock = extractBlock(
    source,
    'function buildServiceRequestRejectionResponsePayload() {',
    "\napp.get('/api/solicitacoes-servico/:id', async (req, res) => {"
  );
  const routeBlock = extractBlock(
    source,
    "app.post('/api/solicitacoes-servico/:id/rejeitar', express.json(), async (req, res) => {",
    "\n// API: solicitações abertas (Portal do Morador) visíveis no módulo gestor"
  );

  assert.match(rejectionReadBlock, /CondSolicitacaoServico\.findById\(id\)\.lean\(\)/);
  assert.match(rejectionReadBlock, /listarUnidadesParaUsuario\(ctxUser\)/);
  assert.match(rejectionReadBlock, /Solicitação fora do escopo do usuário/);
  assert.doesNotMatch(rejectionReadBlock, /updateOne\(/);
  assert.doesNotMatch(rejectionReadBlock, /notifyServicoStatusPush\(/);

  assert.match(applyRejectionBlock, /CondSolicitacaoServico\.updateOne\(/);
  assert.match(applyRejectionBlock, /status: 'rejeitada'/);
  assert.match(applyRejectionBlock, /rejeicao_motivo: motivo/);
  assert.match(applyRejectionBlock, /rejeitada_em: new Date\(\)/);
  assert.doesNotMatch(applyRejectionBlock, /notifyServicoStatusPush\(/);

  assert.match(pushBlock, /notifyServicoStatusPush\(/);
  assert.match(pushBlock, /status: 'rejeitada'/);
  assert.match(pushBlock, /motivo/);
  assert.match(pushBlock, /push não enviado/);

  assert.match(responseBlock, /return \{ ok: true \};|return \{ ok: true \ };/);

  assert.match(routeBlock, /const motivoRaw = String\(req\.body\?\.motivo \|\| ''\)\.trim\(\);/);
  assert.match(routeBlock, /if\(!motivoRaw\) return res\.status\(400\)\.json\(\{ error: 'Informe a justificativa da rejeição' \}\);/);
  assert.match(routeBlock, /const rejectionRead = await resolveServiceRequestRejectionRead\(\{ req, id \}\);/);
  assert.match(routeBlock, /await applyServiceRequestRejection\(\{/);
  assert.match(routeBlock, /await emitServiceRequestRejectedPush\(\{/);
  assert.match(routeBlock, /return res\.json\(buildServiceRequestRejectionResponsePayload\(\)\);/);
  assert.doesNotMatch(routeBlock, /CondSolicitacaoServico\.findById\(/);
  assert.doesNotMatch(routeBlock, /CondSolicitacaoServico\.updateOne\(/);
  assert.doesNotMatch(routeBlock, /notifyServicoStatusPush\(/);
});