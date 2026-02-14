import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SCRIPTS_DIR = path.join(ROOT, 'scripts');

const REPLACEMENTS = [
  ['../services/', '#legacy-services/'],
  ['../src/core/', '#core/'],
  ['../src/services/', '#services/'],
  ['../src/modules/', '#modules/'],
  ['../src/shared/', '#shared/'],
  ['../models/', '#models/'],
  ['..\\services\\', '#legacy-services/'],
  ['..\\src\\core\\', '#core/'],
  ['..\\src\\services\\', '#services/'],
  ['..\\src\\modules\\', '#modules/'],
  ['..\\src\\shared\\', '#shared/'],
  ['..\\models\\', '#models/'],
];

const IMPORT_SPECIFIER_REGEX = /\bimport\s+(?:[^'"\n;]*?\sfrom\s*)?['"](?<spec1>[^'"\n]+)['"]|\bexport\s+[^'"\n;]*?\sfrom\s*['"](?<spec2>[^'"\n]+)['"]|\brequire\s*\(\s*['"](?<spec3>[^'"\n]+)['"]\s*\)|\bimport\s*\(\s*['"](?<spec4>[^'"\n]+)['"]\s*\)/g;

function listJsFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listJsFiles(fullPath, out);
      continue;
    }
    if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.js') {
      out.push(fullPath);
    }
  }
  return out;
}

function mapSpecifier(specifier) {
  for (const [from, to] of REPLACEMENTS) {
    if (specifier.startsWith(from)) {
      return to + specifier.slice(from.length).replace(/\\/g, '/');
    }
  }
  return specifier;
}

function rewriteCode(code) {
  IMPORT_SPECIFIER_REGEX.lastIndex = 0;
  return code.replace(IMPORT_SPECIFIER_REGEX, (full, ...args) => {
    const groups = args.at(-1) || {};
    const specifier = groups.spec1 || groups.spec2 || groups.spec3 || groups.spec4;
    if (!specifier) return full;
    const mapped = mapSpecifier(specifier);
    if (mapped === specifier) return full;
    return full.replace(specifier, mapped);
  });
}

const files = listJsFiles(SCRIPTS_DIR);

for (const filePath of files) {
  const original = fs.readFileSync(filePath, 'utf8');
  const updated = rewriteCode(original);
  if (updated !== original) {
    fs.writeFileSync(filePath, updated, 'utf8');
    console.log(`FIXED: ${path.relative(ROOT, filePath).replace(/\\/g, '/')}`);
  }
}

console.log('✔ Correção automática concluída');
