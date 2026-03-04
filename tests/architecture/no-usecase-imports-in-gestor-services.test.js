import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const GUARD_SCRIPT = path.resolve(ROOT, 'scripts/guard-grep.js');
const LEGACY_DIR = path.resolve(ROOT, 'src/modules/gestor/app/services/legacy');
const ERROR_MESSAGE = 'Services do Gestor não podem importar usecases diretamente. Use services/ como fachada e orquestre via ports/adapters.';

const PATTERNS = [
  '#modules/gestor/app/usecases/',
  'src/modules/gestor/app/usecases/',
  '/usecases/',
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
    [GUARD_SCRIPT, pattern, 'src/modules/gestor/app/services', ERROR_MESSAGE, ...allowedFiles],
    { encoding: 'utf8', cwd: ROOT },
  );
}

test('Guardrail estrutural: services do Gestor não podem importar usecases diretamente', () => {
  const allowedFiles = [];
  collectFilesRecursively(LEGACY_DIR, allowedFiles);
  allowedFiles.push('src/modules/gestor/app/services/userService.js');

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
