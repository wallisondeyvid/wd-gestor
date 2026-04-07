import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const APP_DIR = path.resolve(ROOT, 'src/modules/gestor/app');

const TARGET_SNIPPETS = [
  "export * from '#modules/gestor/app/db/",
  "export * from \"#modules/gestor/app/db/",
];

const FIXED_ALLOWED_FILES = new Set([
  'src/modules/gestor/app/services/authContextDbBridgeService.js',
]);

function walkJsFiles(dirPath, files) {
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const absPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkJsFiles(absPath, files);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!absPath.endsWith('.js')) continue;
    files.push(absPath);
  }
}

test('Guardrail estrutural: reexport de db só pode existir em services/legacy', () => {
  const files = [];
  walkJsFiles(APP_DIR, files);

  const violations = [];
  const legacyMatches = [];

  for (const absPath of files) {
    const relPath = path.relative(ROOT, absPath).split(path.sep).join('/');
    let content;
    try {
      content = fs.readFileSync(absPath, 'utf8');
    } catch {
      continue;
    }

    const hasMatch = TARGET_SNIPPETS.some((snippet) => content.includes(snippet));
    if (!hasMatch) continue;

    if (relPath.includes('src/modules/gestor/app/services/legacy/')) {
      legacyMatches.push(relPath);
    } else if (FIXED_ALLOWED_FILES.has(relPath)) {
      continue;
    } else {
      violations.push(relPath);
    }
  }

  if (violations.length > 0) {
    assert.fail(
      `Reexport de db fora de services/legacy detectado em:\n${violations.sort().join('\n')}`,
    );
  }

  if (legacyMatches.length === 0) {
    assert.fail('Nenhum bridge db encontrado em src/modules/gestor/app/services/legacy/');
  }

  assert.ok(true);
});
