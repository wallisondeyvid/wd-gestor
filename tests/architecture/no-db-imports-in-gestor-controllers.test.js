import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const GUARD_SCRIPT = path.resolve(ROOT, 'scripts/guard-grep.js');
const ERROR_MESSAGE = 'Controllers do Gestor não podem importar db diretamente. Use services/repositories.';

const PATTERNS = [
  '#modules/gestor/app/db/',
  'src/modules/gestor/app/db/',
  '/app/db/',
];

function runGuard(pattern) {
  return spawnSync(
    process.execPath,
    [GUARD_SCRIPT, pattern, 'src/modules/gestor/app/controllers', ERROR_MESSAGE],
    { encoding: 'utf8', cwd: ROOT },
  );
}

test('Guardrail estrutural: controllers do Gestor não podem importar db diretamente', () => {
  for (const pattern of PATTERNS) {
    const result = runGuard(pattern);
    const output = `${result.stdout || ''}${result.stderr || ''}`;

    assert.equal(
      result.status,
      0,
      `Guardrail falhou para pattern "${pattern}" (exit ${result.status ?? 'null'}).\n${output}`,
    );
  }

  assert.ok(true);
});
