import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function toPosix(p) {
  return String(p || '').replace(/\\/g, '/');
}

function listJsFilesRecursively(rootDir) {
  const files = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (entry.isFile() && fullPath.endsWith('.js')) {
        files.push(fullPath);
      }
    }
  }

  walk(rootDir);
  return files.sort((a, b) => a.localeCompare(b));
}

function collectImportLikeSpecifiers(line) {
  const specifiers = [];
  const patterns = [
    /\bimport\s+.+\s+from\s+(['"])([^'"\n]+)\1/g,
    /\bexport\s+.+\s+from\s+(['"])([^'"\n]+)\1/g,
    /\bimport\s*\(\s*(['"])([^'"\n]+)\1\s*\)/g,
    /\bimport\s+(['"])([^'"\n]+)\1/g,
    /\brequire\s*\(\s*(['"])([^'"\n]+)\1\s*\)/g,
  ];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(line)) !== null) {
      specifiers.push({
        raw: String(match[0]).trim(),
        specifier: String(match[2] || '').replace(/\\/g, '/'),
      });
    }
  }

  return specifiers;
}

test('Guardrail estrutural: fronteira Ports/Adapters/Wiring em src/', () => {
  const root = process.cwd();
  const srcRoot = path.resolve(root, 'src');
  const allowedAdapterImporter = 'src/shared/container/ports.js';
  const violations = [];

  const files = listJsFilesRecursively(srcRoot);
  for (const fullPath of files) {
    const fileRelativePath = toPosix(path.relative(root, fullPath));
    const lines = fs.readFileSync(fullPath, 'utf8').split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const importLikes = collectImportLikeSpecifiers(line);

      for (const item of importLikes) {
        const specifier = item.specifier;

        if (specifier.startsWith('#shared/adapters') && fileRelativePath !== allowedAdapterImporter) {
          violations.push(`${fileRelativePath}:${index + 1} | import de #shared/adapters proibido fora de ${allowedAdapterImporter} | ${item.raw}`);
        }

        if (/\.wiring\.js$/i.test(specifier)) {
          violations.push(`${fileRelativePath}:${index + 1} | import/require de wiring proibido (${specifier}) | ${item.raw}`);
        }
      }
    }
  }

  assert.equal(
    violations.length,
    0,
    `Guardrail de fronteira Ports falhou.\n${violations.join('\n')}`,
  );
});
