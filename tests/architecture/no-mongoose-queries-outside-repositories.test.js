import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const BASELINE_FILE = path.resolve(ROOT, 'tests/architecture/mongoose-queries-baseline.json');
const TARGET_DIRS = [
  path.resolve(ROOT, 'src/modules/condominios'),
  path.resolve(ROOT, 'src/modules/gestor'),
];
const VALID_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);

const QUERY_TOKENS = [
  '.find(',
  '.findOne(',
  '.findById(',
  '.update',
  '.delete',
  '.aggregate(',
];

function walkSourceFilesSync(dirPath, files) {
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const absPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      walkSourceFilesSync(absPath, files);
      continue;
    }

    if (!entry.isFile()) continue;

    const extension = path.extname(entry.name).toLowerCase();
    if (!VALID_EXTENSIONS.has(extension)) continue;

    files.push(absPath);
  }
}

function isAllowed(relativeFromRoot) {
  if (relativeFromRoot.includes('/repositories/')) return true;
  if (relativeFromRoot.includes('/app/db/')) return true;
  if (relativeFromRoot.includes('/app/data-access/')) return true;
  if (relativeFromRoot.startsWith('src/shared/db/')) return true;
  return false;
}

test('Guardrail estrutural: bloqueia queries Mongoose fora de repositories', () => {
  const files = [];
  for (const targetDir of TARGET_DIRS) {
    walkSourceFilesSync(targetDir, files);
  }

  const violations = [];

  for (const filePath of files) {
    const relativeFromRoot = path.relative(ROOT, filePath).split(path.sep).join('/');
    if (isAllowed(relativeFromRoot)) continue;

    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    const hasQueryToken = QUERY_TOKENS.some((token) => content.includes(token));
    if (!hasQueryToken) continue;

    violations.push(relativeFromRoot);
  }

  const current = violations.sort((a, b) => a.localeCompare(b));

  let baseline;
  try {
    const rawBaseline = fs.readFileSync(BASELINE_FILE, 'utf8').replace(/^\uFEFF/, '').trim();
    baseline = JSON.parse(rawBaseline);
  } catch (error) {
    assert.fail(`Falha ao carregar baseline de mongoose queries: ${error.message}`);
  }

  if (!Array.isArray(baseline)) {
    assert.fail('Baseline inválido de mongoose queries: esperado array JSON.');
  }

  const baselineSet = new Set(baseline);
  const novos = current.filter((file) => !baselineSet.has(file));

  if (novos.length > 0) {
    const details = novos
      .map((file) => `Nova query mongoose fora de repositories: ${file}`)
      .join('\n');

    assert.fail(details);
  }

  assert.ok(true);
});