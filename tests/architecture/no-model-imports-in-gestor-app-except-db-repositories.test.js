import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const APP_DIR = path.resolve(ROOT, 'src/modules/gestor/app');
const DB_DIR = path.resolve(APP_DIR, 'db');
const REPOSITORIES_DIR = path.resolve(APP_DIR, 'repositories');
const GUARD_SCRIPT = path.resolve(ROOT, 'scripts/guard-grep.js');

function collectFilesRecursively(dirPath, bucket) {
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const absPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      collectFilesRecursively(absPath, bucket);
      continue;
    }

    if (!entry.isFile()) continue;

    const rel = path.relative(ROOT, absPath).split(path.sep).join('/');
    bucket.push(rel);
  }
}

test('Guardrail estrutural: #models/ só é permitido em db/ e repositories/ do Gestor app', () => {
  const allowedFiles = [];
  collectFilesRecursively(DB_DIR, allowedFiles);
  collectFilesRecursively(REPOSITORIES_DIR, allowedFiles);

  const result = spawnSync(
    process.execPath,
    [
      GUARD_SCRIPT,
      '#models/',
      'src/modules/gestor/app',
      'Import de #models/ só é permitido em src/modules/gestor/app/db/** e src/modules/gestor/app/repositories/**',
      ...allowedFiles,
    ],
    { encoding: 'utf8' },
  );

  const output = `${result.stdout || ''}${result.stderr || ''}`;

  assert.equal(
    result.status,
    0,
    `Guardrail falhou (exit ${result.status ?? 'null'}).\n${output}`,
  );
});
