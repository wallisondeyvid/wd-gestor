import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const filePath = path.resolve(process.cwd(), 'src/modules/condominios/app/condominios-app.js');

async function readSource() {
  return fs.readFile(filePath, 'utf8');
}

function extractRouteBlock(source, routeSignature) {
  const start = source.indexOf(routeSignature);
  assert.notEqual(start, -1, `rota não encontrada: ${routeSignature}`);

  const end = source.indexOf("\napp.", start + routeSignature.length);
  if (end === -1) return source.slice(start);
  return source.slice(start, end);
}

test('Caixa de Mensagens compartilha cleanup mínimo de blobs de anexos entre POST, actions e hard delete', async () => {
  const source = await readSource();
  assert.match(source, /async function cleanupMsgBlobAttachments\(attachments, blobToken\) \{/);

  const sendRouteBlock = extractRouteBlock(source, "app.post('/api/msg/messages', maybeUploadMsgAttachments, async (req, res) => {");
  const actionsRouteBlock = extractRouteBlock(source, "app.post('/api/msg/messages/actions', express.json(), async (req, res) => {");
  const hardDeleteBlockStart = source.indexOf('async function hardDeleteMailboxWithCleanup(id, opts = {}) {');
  assert.notEqual(hardDeleteBlockStart, -1, 'hardDeleteMailboxWithCleanup não encontrado');
  const hardDeleteBlockEnd = source.indexOf('\napp.', hardDeleteBlockStart);
  const hardDeleteBlock = hardDeleteBlockEnd === -1 ? source.slice(hardDeleteBlockStart) : source.slice(hardDeleteBlockStart, hardDeleteBlockEnd);

  assert.match(sendRouteBlock, /await cleanupMsgBlobAttachments\(saved, blobToken\);/);
  assert.equal((sendRouteBlock.match(/await cleanupMsgBlobAttachments\(saved, blobToken\);/g) || []).length, 2);
  assert.match(actionsRouteBlock, /await cleanupMsgBlobAttachments\(messageDoc\?\.anexos, blobToken\);/);
  assert.match(hardDeleteBlock, /await cleanupMsgBlobAttachments\(m\?\.anexos, blobToken\);/);
});