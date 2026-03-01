import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CONTROLLERS_DIR = path.resolve(ROOT, 'src/modules/gestor/app/controllers');
const VALID_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);

const ALLOWLIST = new Set([
  'funcaoController.js',
  'funcionarioController.js',
  'moduloController.js',
  'recursoController.js',
  'setorController.js',
  'unidadeApiController.js',
  'unidadeController.js',
  'userAdminApiController.js',
  'userController.js',
  'userViewController.js',
  'views/pagesController.js',
]);

const MODEL_IMPORT_REGEX = /from\s+["']#models\/|require\(\s*["']#models\//;

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

test('Guardrail estrutural: controllers do gestor não devem importar #models', () => {
  const files = [];
  walkSourceFilesSync(CONTROLLERS_DIR, files);

  const violations = [];

  for (const filePath of files) {
    const relativeToControllers = path.relative(CONTROLLERS_DIR, filePath).split(path.sep).join('/');
    if (ALLOWLIST.has(relativeToControllers)) continue;

    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    if (!MODEL_IMPORT_REGEX.test(content)) continue;

    violations.push(relativeToControllers);
  }

  if (violations.length > 0) {
    const details = violations
      .sort((a, b) => a.localeCompare(b))
      .map((file) => `Import de #models fora da allowlist: ${file}`)
      .join('\n');

    assert.fail(details);
  }

  assert.ok(true);
});