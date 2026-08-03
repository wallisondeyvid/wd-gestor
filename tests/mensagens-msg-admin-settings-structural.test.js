import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sourcePath = 'src/modules/mensagens/app/mensagens-api.js';

test('admin/settings foi migrado para o módulo Mensagens', () => {
  const src = fs.readFileSync(sourcePath, 'utf8');

  assert.match(src, /import\s+CondMsgSettings\s+from\s+'#models\/cond_msg_settings\.js';/);
  assert.match(src, /router\.get\('\/admin\/settings'/);
  assert.match(src, /router\.put\('\/admin\/settings'/);
  assert.match(src, /function\s+requireMsgAdmin\s*\(/);
  assert.match(src, /function\s+settingsToClient\s*\(/);
  assert.match(src, /getOrInitMsgSettingsForUnidade\(unidadeId\)/);
  assert.match(src, /CondMsgSettings\.findOneAndUpdate\(/);
});
