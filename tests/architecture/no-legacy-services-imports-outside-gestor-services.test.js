import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const GUARD_SCRIPT = path.resolve(ROOT, 'scripts/guard-grep.js');
const TARGET = 'src/modules/gestor/app';
const SERVICES_DIR = path.resolve(ROOT, 'src/modules/gestor/app/services');
const ERROR_MESSAGE = 'É proibido importar services/legacy fora de src/modules/gestor/app/services/**.';

const PATTERNS = [
  '#modules/gestor/app/services/legacy/',
  'src/modules/gestor/app/services/legacy/',
  '/services/legacy/',
];

function collectFilesRecursively(dirPath, files) {
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const absPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectFilesRecursively(absPath, files);
      continue;
    }
    if (!entry.isFile()) continue;
    files.push(path.relative(ROOT, absPath).split(path.sep).join('/'));
  }
}

function runGuard(pattern, allowedFiles) {
  return spawnSync(
    process.execPath,
    [GUARD_SCRIPT, pattern, TARGET, ERROR_MESSAGE, ...allowedFiles],
    { encoding: 'utf8', cwd: ROOT },
  );
}

test('Guardrail estrutural: imports de services/legacy só podem existir em src/modules/gestor/app/services/**', () => {
  const allowedFiles = [];
  collectFilesRecursively(SERVICES_DIR, allowedFiles);

  for (const pattern of PATTERNS) {
    const result = runGuard(pattern, allowedFiles);
    const output = `${result.stdout || ''}${result.stderr || ''}`;

    assert.equal(
      result.status,
      0,
      `Guardrail falhou para pattern "${pattern}" (exit ${result.status ?? 'null'}).\n${output}`,
    );
  }

  assert.ok(true);
});
