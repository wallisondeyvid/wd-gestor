import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sourcePath = 'src/modules/mensagens/app/mensagens-api.js';

test('admin/metrics foi migrado para o módulo Mensagens', () => {
  const src = fs.readFileSync(sourcePath, 'utf8');

  assert.match(src, /router\.get\('\/admin\/metrics\/users'/);
  assert.match(src, /router\.get\('\/admin\/metrics\/mailboxes'/);
  assert.match(src, /router\.get\('\/admin\/metrics\/timeseries\/users'/);
  assert.match(src, /router\.get\('\/admin\/metrics\/timeseries\/mailboxes'/);

  assert.match(src, /function\s+adminBytesToHuman\s*\(/);
  assert.match(src, /function\s+parseAdminMetricsRange\s*\(/);
  assert.match(src, /function\s+buildAdminMsgBytesAddFields\s*\(/);
  assert.match(src, /function\s+sumAdminMetricTotals\s*\(/);

  assert.match(src, /CondMsgMessage\.aggregate\(/);
  assert.match(src, /from_owner/);
  assert.match(src, /from_mailbox_id/);
  assert.match(src, /states\.mailbox_id/);
  assert.match(src, /interval:\s*'day'/);
});
