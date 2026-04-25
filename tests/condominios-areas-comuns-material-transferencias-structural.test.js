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

test('POST de transferências de materiais separa validação canônica da criação/resposta e recusa destino igual à origem', async () => {
  const source = await readSource();

  const validationBlock = extractBlock(
    source,
    'async function resolvePendingMaterialTransferRequest({ areaId, materialId, destinoId }) {',
    '\nfunction buildPendingMaterialTransferResponse(transferDoc) {'
  );
  const responseBlock = extractBlock(
    source,
    'function buildPendingMaterialTransferResponse(transferDoc) {',
    "\napp.post('/api/areas-comuns/:id/materiais/transferencias', express.json({ limit: '1mb' }), async (req, res) => {"
  );
  const routeBlock = extractBlock(
    source,
    "app.post('/api/areas-comuns/:id/materiais/transferencias', express.json({ limit: '1mb' }), async (req, res) => {"
  );

  assert.match(validationBlock, /CondAreaComum\.findById\(areaId\)\.lean\(\)/);
  assert.match(validationBlock, /CondAreaComum\.findById\(destinoId\)\.lean\(\)/);
  assert.match(validationBlock, /CondBemMaterial\.findById\(materialId\)\.lean\(\)/);
  assert.match(validationBlock, /String\(destinoDoc\._id\) === String\(areaDoc\._id\)/);
  assert.match(validationBlock, /Área de destino deve ser diferente da área de origem/);
  assert.match(validationBlock, /CondMaterialTransferencia\.findOne\(\{/);

  assert.match(responseBlock, /transferencia: \{/);
  assert.match(responseBlock, /criadoEm: toIsoString\(transferDoc\.createdAt\)/);

  assert.match(routeBlock, /const transferResolution = await resolvePendingMaterialTransferRequest\(\{/);
  assert.match(routeBlock, /if\(transferResolution\.error\)\{/);
  assert.match(routeBlock, /buildPendingMaterialTransferResponse\(transferDoc\)/);
  assert.doesNotMatch(routeBlock, /CondAreaComum\.findById\(/);
  assert.doesNotMatch(routeBlock, /CondBemMaterial\.findById\(/);
  assert.doesNotMatch(routeBlock, /CondMaterialTransferencia\.findOne\(/);
});