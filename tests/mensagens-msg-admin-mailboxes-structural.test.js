import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sourcePath = 'src/modules/mensagens/app/mensagens-api.js';

test('admin/mailboxes foi migrado para o módulo Mensagens', () => {
  const src = fs.readFileSync(sourcePath, 'utf8');

  assert.match(src, /router\.get\('\/admin\/mailboxes'/);
  assert.match(src, /router\.patch\('\/admin\/mailboxes\/:id\/status'/);
  assert.match(src, /router\.delete\('\/admin\/mailboxes\/:id'/);

  assert.match(src, /function\s+mailboxAdminToClient\s*\(/);
  assert.match(src, /function\s+mailboxAdminCanHardDelete\s*\(/);

  assert.match(src, /CondMsgMailbox\.find\(\s*\{\s*unidade_id:\s*unidadeObjectId\s*\}/);
  assert.match(src, /CondMsgMailbox\.findByIdAndUpdate\(/);
  assert.match(src, /hardDeleteMailboxWithCleanup\(mailboxId/);

  assert.match(src, /type\s*===\s*'grupo'/);
  assert.match(src, /!linkType\s*&&\s*!linkId/);
});
