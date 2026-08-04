import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sourcePath = 'src/modules/mensagens/app/mensagens-api.js';

test('modulo mensagens registra rotas admin mailboxes write migradas', () => {
  const src = fs.readFileSync(sourcePath, 'utf8');

  assert.match(src, /router\.patch\('\/admin\/mailboxes\/:id\/status'/);
  assert.match(src, /router\.delete\('\/admin\/mailboxes\/:id'/);

  assert.match(src, /requireMsgAdmin\(req,\s*res\)/);
  assert.match(src, /CondMsgMailbox\.findByIdAndUpdate\(/);
  assert.match(src, /CondMsgMailbox\.findById\(mailboxId\)/);
  assert.match(src, /hardDeleteMailboxWithCleanup\(mailboxId/);

  assert.match(src, /mailboxAdminCanHardDelete\(mailbox\)/);
  assert.match(src, /type\s*===\s*'grupo'/);
  assert.match(src, /!linkType\s*&&\s*!linkId/);
});
