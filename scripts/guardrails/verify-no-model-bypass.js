#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC_ROOT = path.join(ROOT, 'src');
const CODE_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx']);
const ERROR_MESSAGE = 'Model import architecture violation: #models permitido apenas em src/shared/repositories e src/modules/*/repositories.';
const WARNING_MESSAGE = 'Model import architecture warning: violações fora de controllers/services/middlewares não bloqueiam o processo.';
const MAX_PRINT = 200;

const MODEL_IMPORT_PATTERNS = [
  /\bimport\s+.+\s+from\s+(['"])(#models\/[^'"\n]+)\1/g,
  /\bexport\s+.+\s+from\s+(['"])(#models\/[^'"\n]+)\1/g,
  /\bimport\s*\(\s*(['"])(#models\/[^'"\n]+)\1\s*\)/g,
  /\brequire\s*\(\s*(['"])(#models\/[^'"\n]+)\1\s*\)/g,
  /\bimport\s+(['"])(#models\/[^'"\n]+)\1/g,
];

function toPosix(value) {
  return String(value || '').replace(/\\/g, '/');
}

function stripCommentsWithLineMap(source) {
  const lines = source.split(/\r?\n/);
  const sanitizedLines = [];
  let inBlockComment = false;

  for (const line of lines) {
    let i = 0;
    let out = '';

    while (i < line.length) {
      const nextTwo = line.slice(i, i + 2);

      if (inBlockComment) {
        if (nextTwo === '*/') {
          inBlockComment = false;
          i += 2;
          continue;
        }
        i += 1;
        continue;
      }

      if (nextTwo === '//') {
        break;
      }

      if (nextTwo === '/*') {
        inBlockComment = true;
        i += 2;
        continue;
      }

      out += line[i];
      i += 1;
    }

    sanitizedLines.push(out);
  }

  return sanitizedLines;
}

function isAllowedPath(relativePath) {
  const rel = toPosix(relativePath);

  if (rel === 'src/shared/repositories' || rel.startsWith('src/shared/repositories/')) return true;
  if (/^src\/modules\/[^/]+(?:\/[^/]+)*\/repositories(?:\/|$)/.test(rel)) return true;

  return false;
}

function detectBlockedLayer(relativePath) {
  const rel = toPosix(relativePath);

  if (/\/(controllers)(\/|$)/.test(rel)) return 'controllers';
  if (/\/(services)(\/|$)/.test(rel)) return 'services';
  if (/\/(middlewares)(\/|$)/.test(rel)) return 'middlewares';

  return null;
}

function listSourceFiles() {
  if (!fs.existsSync(SRC_ROOT)) return [];

  const files = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!CODE_EXTENSIONS.has(ext)) continue;

      files.push(fullPath);
    }
  }

  walk(SRC_ROOT);
  return files.sort((a, b) => a.localeCompare(b));
}

function collectViolations() {
  const files = listSourceFiles();
  const violations = [];

  for (const fullPath of files) {
    const relativePath = toPosix(path.relative(ROOT, fullPath));
    if (isAllowedPath(relativePath)) continue;
    const blockedLayer = detectBlockedLayer(relativePath);

    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = stripCommentsWithLineMap(content);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];

      for (const pattern of MODEL_IMPORT_PATTERNS) {
        pattern.lastIndex = 0;

        let match;
        while ((match = pattern.exec(line)) !== null) {
          const specifier = match[2];
          if (!specifier || !String(specifier).startsWith('#models/')) continue;

          violations.push({
            file: relativePath,
            line: index + 1,
            layer: blockedLayer,
            importString: String(match[0]).trim(),
          });
        }
      }
    }
  }

  return violations;
}

function detectWarningArea(relativePath) {
  const rel = toPosix(relativePath);

  if (rel === 'src/routes' || rel.startsWith('src/routes/') || /\/routes(\/|$)/.test(rel)) return 'routes';
  if (rel.startsWith('src/server/') || /(^|\/)(createServer\.js|[^/]+-app\.js)$/.test(rel) || /\/bootstrap(\/|$)/.test(rel)) return 'bootstrap';
  if (/\/legacy(\/|$)/.test(rel) || /\/scripts(\/|$)/.test(rel)) return 'legacy-scripts';

  return 'non-blocking';
}

function printViolations(violations, getReason, logger = console.error) {
  const printable = violations.slice(0, MAX_PRINT);
  for (const violation of printable) {
    const reason = getReason(violation);
    logger(`- ${violation.file}:${violation.line} | ${reason} | ${violation.importString}`);
  }

  if (violations.length > printable.length) {
    logger(`... +${violations.length - printable.length} ocorrências adicionais`);
  }
}

function main() {
  const violations = collectViolations();
  const errorViolations = violations.filter((violation) => Boolean(violation.layer));
  const warningViolations = violations.filter((violation) => !violation.layer);

  if (warningViolations.length > 0) {
    console.warn(WARNING_MESSAGE);
    printViolations(
      warningViolations,
      (violation) => `warning-area:${detectWarningArea(violation.file)}`,
      console.warn,
    );
  }

  if (errorViolations.length > 0) {
    console.error(ERROR_MESSAGE);
    printViolations(
      errorViolations,
      (violation) => `blocked-layer:${violation.layer}`,
      console.error,
    );

    process.exit(1);
  }

  console.log('✅ Guard OK: imports #models restritos a src/shared/repositories e src/modules/*/repositories.');
}

main();
