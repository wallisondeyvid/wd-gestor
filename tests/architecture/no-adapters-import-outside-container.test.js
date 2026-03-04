import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC_DIR = path.resolve(ROOT, 'src');
const ALLOWED_PREFIX = 'shared/container/';
const TARGET = '#shared/adapters';
const VALID_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);

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

test('Guardrail estrutural: proíbe #shared/adapters fora de src/shared/container/**', () => {
  const files = [];
  walkSourceFilesSync(SRC_DIR, files);

  const violations = [];

  for (const filePath of files) {
    const relativeFromSrc = path.relative(SRC_DIR, filePath).split(path.sep).join('/');
    const isAllowed = relativeFromSrc.startsWith(ALLOWED_PREFIX);
    if (isAllowed) continue;

    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    if (!content.includes(TARGET)) continue;
    violations.push(path.relative(ROOT, filePath).split(path.sep).join('/'));
  }

  if (violations.length > 0) {
    const details = violations
      .sort((a, b) => a.localeCompare(b))
      .map((file) => `Uso proibido de #shared/adapters fora do container: ${file}`)
      .join('\n');

    throw new Error(details);
  }

  assert.ok(true);
});