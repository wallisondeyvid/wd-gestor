import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const FACADE_FILES = [
  'src/modules/gestor/app/services/apiDbBridgeService.js',
  'src/modules/gestor/app/services/authDbBridgeService.js',
  'src/modules/gestor/app/services/userService.js',
];

const FORBIDDEN_PATTERNS = [
  /\bfunction\b/,
  /\basync\b/,
  /\bawait\b/,
  /\bif\s*\(/,
  /\btry\b/,
  /\bcatch\b/,
  /\bnew\s+/,
  /\bclass\s+/,
  /=>/,
  /require\s*\(/,
];

function stripComments(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

test('Guardrail estrutural: fachadas do Gestor devem ser reexport-only', () => {
  for (const relativePath of FACADE_FILES) {
    const absolutePath = path.resolve(ROOT, relativePath);
    const raw = fs.readFileSync(absolutePath, 'utf8');
    const content = stripComments(raw);

    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(content)) {
        assert.fail(`Fachada violou regra reexport-only: ${relativePath}. Padrão proibido encontrado: ${pattern}`);
      }
    }

    const reexportStarRegex = /export\s+\*\s+from\s+['"][^'"]+['"]\s*;?\s*/g;
    const reexportNamedRegex = /export\s*{\s*[\s\S]*?\s*}\s*from\s*['"][^'"]+['"]\s*;?\s*/g;

    let rest = content;
    rest = rest.replace(reexportStarRegex, '');
    rest = rest.replace(reexportNamedRegex, '');

    const leftover = rest.replace(/[;\s]/g, '');
    const snippet = leftover.slice(0, 200);

    assert.equal(
      leftover.length,
      0,
      `Fachada violou regra reexport-only: ${relativePath}. Trecho inválido detectado: ${snippet}`,
    );
  }

  assert.ok(true);
});
