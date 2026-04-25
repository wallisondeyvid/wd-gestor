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

test('POST de recebimentos de materiais separa validação canônica, decisão de aceite/recusa e montagem de resposta', async () => {
  const source = await readSource();

  const validationBlock = extractBlock(
    source,
    'async function resolvePendingMaterialReceiptRequest({ areaId, transferenciaId, materialId }) {',
    '\nasync function applyPendingMaterialReceiptDecision({'
  );
  const decisionBlock = extractBlock(
    source,
    'async function applyPendingMaterialReceiptDecision({ isApprove, transferenciaId, materialId, transferDoc, destinoAreaDoc, materialDoc, actor }) {',
    '\nasync function buildPendingMaterialReceiptResponsePayload({'
  );
  const responseBlock = extractBlock(
    source,
    'async function buildPendingMaterialReceiptResponsePayload({ req, updatedTransfer, updatedMaterialDoc, origemAreaId, destinoAreaDoc, unidadeId, now }) {',
    "\napp.post('/api/areas-comuns/:id/materiais/recebimentos', express.json({ limit: '1mb' }), async (req, res) => {"
  );
  const routeBlock = extractBlock(
    source,
    "app.post('/api/areas-comuns/:id/materiais/recebimentos', express.json({ limit: '1mb' }), async (req, res) => {"
  );

  assert.match(validationBlock, /CondAreaComum\.findById\(areaId\)\.lean\(\)/);
  assert.match(validationBlock, /CondMaterialTransferencia\.findById\(transferenciaId\)/);
  assert.match(validationBlock, /CondBemMaterial\.findById\(materialId\)\.lean\(\)/);
  assert.match(validationBlock, /Transferência já processada/);

  assert.match(decisionBlock, /CondBemMaterial\.findByIdAndUpdate\(/);
  assert.match(decisionBlock, /status: isApprove \? 'aceito' : 'recusado'/);
  assert.match(decisionBlock, /CondMaterialTransferencia\.findByIdAndUpdate\(/);

  assert.match(responseBlock, /buildAreaContextPayload\(/);
  assert.match(responseBlock, /buildMaterialSnapshot\(/);
  assert.match(responseBlock, /CondNatMaterial\.findById\(naturezaId\)/);
  assert.match(responseBlock, /material: materialPayload/);

  assert.match(routeBlock, /const receiptResolution = await resolvePendingMaterialReceiptRequest\(\{/);
  assert.match(routeBlock, /const receiptDecision = await applyPendingMaterialReceiptDecision\(\{/);
  assert.match(routeBlock, /buildPendingMaterialReceiptResponsePayload\(\{/);
  assert.doesNotMatch(routeBlock, /CondMaterialTransferencia\.findById\(/);
  assert.doesNotMatch(routeBlock, /CondBemMaterial\.findByIdAndUpdate\(/);
  assert.doesNotMatch(routeBlock, /buildMaterialSnapshot\(/);
});