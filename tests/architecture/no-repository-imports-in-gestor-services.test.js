import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const GUARD_SCRIPT = path.resolve(ROOT, 'scripts/guard-grep.js');
const ERROR_MESSAGE = 'Services do Gestor não podem importar repositories diretamente. Use usecases/ (ou legacy quando aplicável).';

const PATTERNS = [
  '#modules/gestor/app/repositories/',
  'src/modules/gestor/app/repositories/',
  '/repositories/',
];

function runGuard(pattern) {
  return spawnSync(
    process.execPath,
    [GUARD_SCRIPT, pattern, 'src/modules/gestor/app/services', ERROR_MESSAGE],
    { encoding: 'utf8', cwd: ROOT },
  );
}

test('Guardrail estrutural: services do Gestor não podem importar repositories diretamente', () => {
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
