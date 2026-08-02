import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const moduleDir = path.resolve(process.cwd(), 'src/modules/mensagens/app');

async function readMensagemSources() {
  const files = [
    'mensagens-api.js',
    'mensagens-api-helpers.js',
    'mensagens-app.js',
    'mensagens-settings.js',
  ];

  const chunks = await Promise.all(
    files.map(async (file) => fs.readFile(path.join(moduleDir, file), 'utf8')),
  );

  return chunks.join('\n');
}

test('modulo mensagens nao registra rotas admin mailboxes legadas', async () => {
  const source = await readMensagemSources();

  assert.doesNotMatch(source, /admin\/mailboxes/);
  assert.doesNotMatch(source, /api\/msg\/admin\/mailboxes/);
});
