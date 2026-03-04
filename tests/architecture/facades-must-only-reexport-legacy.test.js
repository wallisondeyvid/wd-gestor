import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const FACADES = [
  {
    file: 'src/modules/gestor/app/services/apiDbBridgeService.js',
    allowedFrom: (p) => p.includes('/services/legacy/'),
  },
  {
    file: 'src/modules/gestor/app/services/authDbBridgeService.js',
    allowedFrom: (p) => p.includes('/services/legacy/'),
  },
  {
    file: 'src/modules/gestor/app/services/userService.js',
    allowedFrom: (p) => p.includes('/usecases/user/'),
  },
];

const FORBIDDEN_PATTERNS = [
  /\bfunction\b/,
  /\basync\b/,
  /\bawait\b/,
  /\bif\s*\(/,
  /\btry\b/,
  /\bcatch\b/,
  /\bnew\b/,
  /\bclass\b/,
  /=>/,
  /require\s*\(/,
];

const REEXPORT_STAR_REGEX = /export\s+\*\s+from\s+(['"])([^'"]+)\1\s*;?\s*/g;
const REEXPORT_NAMED_REGEX = /export\s*{\s*[\s\S]*?\s*}\s*from\s*(['"])([^'"]+)\1\s*;?\s*/g;

function stripComments(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

test('Guardrail estrutural: fachadas do Gestor devem reexportar somente destinos permitidos', () => {
  for (const facade of FACADES) {
    const relativePath = facade.file;
    const absolutePath = path.resolve(ROOT, relativePath);
    const raw = fs.readFileSync(absolutePath, 'utf8');
    const content = stripComments(raw);

    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(content)) {
        assert.fail(`Fachada violou regra reexport-only: ${relativePath}. Padrão proibido encontrado: ${pattern}`);
      }
    }

    const reexports = [
      ...content.matchAll(REEXPORT_STAR_REGEX),
      ...content.matchAll(REEXPORT_NAMED_REGEX),
    ];

    for (const reexportMatch of reexports) {
      const fromPath = reexportMatch[2] || '';
      if (!facade.allowedFrom(fromPath)) {
        assert.fail(`Fachada violou regra de destino permitido: ${relativePath}. Path inválido encontrado: ${fromPath}`);
      }
    }

    let rest = content;
    rest = rest.replace(REEXPORT_STAR_REGEX, '');
    rest = rest.replace(REEXPORT_NAMED_REGEX, '');

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
