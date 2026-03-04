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

const MONGOOSE_PATTERNS = [
  'User\\.find(',
  'User\\.findOne(',
  'User\\.findById(',
  'User\\.updateOne(',
  'User\\.deleteOne(',
  'User\\.aggregate(',
  'User\\.countDocuments(',
  'User\\.distinct(',
  'Unidade\\.find(',
  'Unidade\\.findOne(',
  'Unidade\\.findById(',
  'Unidade\\.updateOne(',
  'Unidade\\.deleteOne(',
  'Unidade\\.aggregate(',
  'Unidade\\.countDocuments(',
  'Unidade\\.distinct(',
  'Funcionario\\.find(',
  'Funcionario\\.findOne(',
  'Funcionario\\.findById(',
  'Funcionario\\.updateOne(',
  'Funcionario\\.deleteOne(',
  'Funcionario\\.aggregate(',
  'Funcionario\\.countDocuments(',
  'Funcionario\\.distinct(',
  'Modulo\\.find(',
  'Modulo\\.findOne(',
  'Modulo\\.findById(',
  'Modulo\\.updateOne(',
  'Modulo\\.deleteOne(',
  'Modulo\\.aggregate(',
  'Modulo\\.countDocuments(',
  'Modulo\\.distinct(',
  'Setor\\.find(',
  'Setor\\.findOne(',
  'Setor\\.findById(',
  'Setor\\.updateOne(',
  'Setor\\.deleteOne(',
  'Setor\\.aggregate(',
  'Setor\\.countDocuments(',
  'Setor\\.distinct(',
  'Funcao\\.find(',
  'Funcao\\.findOne(',
  'Funcao\\.findById(',
  'Funcao\\.updateOne(',
  'Funcao\\.deleteOne(',
  'Funcao\\.aggregate(',
  'Funcao\\.countDocuments(',
  'Funcao\\.distinct(',
  'Recurso\\.find(',
  'Recurso\\.findOne(',
  'Recurso\\.findById(',
  'Recurso\\.updateOne(',
  'Recurso\\.deleteOne(',
  'Recurso\\.aggregate(',
  'Recurso\\.countDocuments(',
  'Recurso\\.distinct(',
  '\\.populate(',
  '\\.lean(',
  '\\.save()',
];

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

function runGuard(pattern, allowedFiles) {
  return spawnSync(
    process.execPath,
    [
      GUARD_SCRIPT,
      pattern,
      'src/modules/gestor/app',
      'Uso de chain Mongoose no Gestor app só é permitido em src/modules/gestor/app/db/** e src/modules/gestor/app/repositories/**',
      ...allowedFiles,
    ],
    { encoding: 'utf8' },
  );
}

test('Guardrail estrutural: chains Mongoose no Gestor app só em db/ e repositories/', () => {
  const allowedFiles = [];
  collectFilesRecursively(DB_DIR, allowedFiles);
  collectFilesRecursively(REPOSITORIES_DIR, allowedFiles);

  for (const pattern of MONGOOSE_PATTERNS) {
    const result = runGuard(pattern, allowedFiles);
    const output = `${result.stdout || ''}${result.stderr || ''}`;

    assert.equal(
      result.status,
      0,
      `Guardrail falhou para pattern "${pattern}" (exit ${result.status ?? 'null'}).\n${output}`,
    );
  }
});
