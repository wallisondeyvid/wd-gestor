import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const filePath = path.resolve(process.cwd(), 'src/modules/mensagens/app/mensagens-api.js');

async function readSource() {
  return fs.readFile(filePath, 'utf8');
}

function extractBlock(source, startSignature, endSignature = '\nrouter.') {
  const start = source.indexOf(startSignature);
  assert.notEqual(start, -1, `bloco nao encontrado: ${startSignature}`);

  const end = source.indexOf(endSignature, start + startSignature.length);
  if (end === -1) return source.slice(start);
  return source.slice(start, end);
}

test('modulo mensagens concentra cleanup de blobs em helper usado por actions e hard delete', async () => {
  const source = await readSource();

  assert.match(source, /async function cleanupMsgBlobAttachments\(anexos, token = ''\) \{/);
  assert.match(source, /async function hardDeleteMailboxWithCleanup\(id, opts = \{\}\) \{/);

  const hardDeleteBlock = extractBlock(
    source,
    'async function hardDeleteMailboxWithCleanup(id, opts = {}) {',
    '\nasync function',
  );

  const actionsBlock = extractBlock(
    source,
    "router.post('/messages/actions', express.json({ limit: '128kb' }), async (req, res, next) => {",
  );

  const sendBlock = extractBlock(
    source,
    "router.post('/messages', (req, res, next) => {",
  );

  assert.match(hardDeleteBlock, /await cleanupMsgBlobAttachments\(m\?\.anexos, blobToken\);/);
  assert.match(actionsBlock, /await cleanupMsgBlobAttachments\(doc\.anexos, blobToken\);/);

  assert.match(sendBlock, /const uploaded = await put\(key, buf,/);
  assert.match(sendBlock, /doc\.anexos = saved;/);
  assert.doesNotMatch(sendBlock, /await cleanupMsgBlobAttachments/);
});