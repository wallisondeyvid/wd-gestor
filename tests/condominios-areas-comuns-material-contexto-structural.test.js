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

test('GET de contexto de materiais separa leitura canônica, leitura de pendências e montagem do payload final', async () => {
  const source = await readSource();

  const canonicalReadBlock = extractBlock(
    source,
    'async function resolveAreaMaterialContextRead({ req, areaId }) {',
    '\nasync function resolveAreaMaterialPendingTransferRead({'
  );
  const pendingReadBlock = extractBlock(
    source,
    'async function resolveAreaMaterialPendingTransferRead({ areaDoc, unidadePayload, materialMap, areaMap }) {',
    '\nasync function buildAreaMaterialContextResponsePayload({'
  );
  const responseBlock = extractBlock(
    source,
    'async function buildAreaMaterialContextResponsePayload({ areaIdParam, areaPayload, unidadePayload, materiaisOrigemDocs, materialMap, areaMap, destinos, transferDocs }) {',
    "\napp.get('/api/areas-comuns/:id/materiais/contexto', async (req, res) => {"
  );
  const routeBlock = extractBlock(
    source,
    "app.get('/api/areas-comuns/:id/materiais/contexto', async (req, res) => {"
  );

  assert.match(canonicalReadBlock, /CondAreaComum\.findById\(areaId\)\.lean\(\)/);
  assert.match(canonicalReadBlock, /CondBemMaterial\.find\(\{ 'vinculo_area\.area_id': areaDoc\._id, ativa: \{ \$ne: false \} \}\)/);
  assert.match(canonicalReadBlock, /buildAreaContextPayload\(areaDoc, unidadePayload\)/);
  assert.match(canonicalReadBlock, /buildDestinoPayload\(doc, unidadePayload\)/);

  assert.match(pendingReadBlock, /CondMaterialTransferencia\.find\(/);
  assert.match(pendingReadBlock, /status: 'pendente'/);
  assert.match(pendingReadBlock, /CondBemMaterial\.find\(\{ _id: \{ \$in: missingMaterialIds \} \}\)/);

  assert.match(responseBlock, /CondNatMaterial\.find\(\{ _id: \{ \$in: naturezaIds \} \}\)/);
  assert.match(responseBlock, /buildMaterialSnapshot\(/);
  assert.match(responseBlock, /buildTransferMaterialSnapshot\(/);
  assert.match(responseBlock, /materiaisReceber/);
  assert.match(responseBlock, /materiaisTransferidos/);

  assert.match(routeBlock, /const areaResolution = await resolveAreaMaterialContextRead\(\{/);
  assert.match(routeBlock, /const pendingTransferRead = await resolveAreaMaterialPendingTransferRead\(\{/);
  assert.match(routeBlock, /buildAreaMaterialContextResponsePayload\(\{/);
  assert.doesNotMatch(routeBlock, /CondBemMaterial\.find\(/);
  assert.doesNotMatch(routeBlock, /CondMaterialTransferencia\.find\(/);
  assert.doesNotMatch(routeBlock, /buildMaterialSnapshot\(/);
});