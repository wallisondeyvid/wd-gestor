import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const FORBIDDEN = '#core/models';
const ROOT = process.cwd();
const SRC_DIR = path.resolve(ROOT, 'src');
const IGNORE_DIRS = new Set(['node_modules', 'dist', 'models', 'scripts', 'docs']);

function walkFilesSync(dirPath, files) {
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
      walkFilesSync(absPath, files);
      continue;
    }

    if (!entry.isFile()) continue;
    files.push(absPath);
  }
}

test('Guardrail estrutural: proíbe uso de #core/models fora de models/', () => {
  const files = [];
  walkFilesSync(SRC_DIR, files);

  const violations = [];

  for (const filePath of files) {
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    if (content.includes(FORBIDDEN)) {
      violations.push(path.relative(ROOT, filePath));
    }
  }

  if (violations.length > 0) {
    const details = violations
      .sort((a, b) => a.localeCompare(b))
      .map((file) => `Uso proibido de #core/models detectado em ${file}`)
      .join('\n');

    throw new Error(details);
  }

  assert.ok(true);
});
