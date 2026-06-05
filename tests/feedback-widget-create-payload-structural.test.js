import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const FEEDBACK_WIDGET_SOURCE = fs.readFileSync(
  path.join(process.cwd(), 'public/js/feedback-widget.js'),
  'utf8',
);

test('feedback widget canoniza tipos legados para o contrato aceito pela API', () => {
  assert.match(FEEDBACK_WIDGET_SOURCE, /function canonicalizeFeedbackType\(tipo\) \{/);
  assert.match(FEEDBACK_WIDGET_SOURCE, /if \(normalized === 'bug'\) return 'erro';/);
  assert.match(FEEDBACK_WIDGET_SOURCE, /if \(normalized === 'duvida' \|\| normalized === 'critica'\) return 'outro';/);
  assert.match(FEEDBACK_WIDGET_SOURCE, /tipo: canonicalizeFeedbackType\(state\.tipo\),/);
});