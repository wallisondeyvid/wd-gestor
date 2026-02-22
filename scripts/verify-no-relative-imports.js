import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TARGET_DIRS = ['src', 'routes', 'services', 'models', 'scripts'];
const VALID_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage']);

const IMPORT_SPECIFIER_REGEX = /\bimport\s+(?:[^'"\n;]*?\sfrom\s*)?['"](?<spec1>[^'"\n]+)['"]|\bexport\s+[^'"\n;]*?\sfrom\s*['"](?<spec2>[^'"\n]+)['"]|\brequire\s*\(\s*['"](?<spec3>[^'"\n]+)['"]\s*\)|\bimport\s*\(\s*['"](?<spec4>[^'"\n]+)['"]\s*\)/g;
const SERVICE_DIRECT_QUERY_REGEX =
  /\b[A-Z][A-Za-z0-9_$]*\s*\.\s*(?:find|findOne|findById|aggregate|updateOne|deleteOne|create|findByIdAndUpdate|findByIdAndDelete)\s*\(/;

function collectFiles(directoryPath, files = []) {
  if (!fs.existsSync(directoryPath)) return files;

  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      collectFiles(path.join(directoryPath, entry.name), files);
      continue;
    }

    if (!entry.isFile()) continue;
    const extension = path.extname(entry.name).toLowerCase();
    if (!VALID_EXTENSIONS.has(extension)) continue;
    files.push(path.join(directoryPath, entry.name));
  }

  return files;
}

function isForbiddenSpecifier(specifier) {
  if (/^\.\.([/\\])/.test(specifier)) return true;
  if (/^[A-Za-z]:[\\/]/.test(specifier)) return true;
  if (/^file:\/\//i.test(specifier)) return true;
  return false;
}

function findFirstViolation(sourceCode) {
  IMPORT_SPECIFIER_REGEX.lastIndex = 0;
  let match;
  while ((match = IMPORT_SPECIFIER_REGEX.exec(sourceCode)) !== null) {
    const specifier = match.groups?.spec1 || match.groups?.spec2 || match.groups?.spec3 || match.groups?.spec4 || '';
    if (!specifier) continue;
    if (isForbiddenSpecifier(specifier)) {
      const line = sourceCode.slice(0, match.index).split(/\r?\n/).length;
      return { specifier, line };
    }
  }
  return null;
}

function collectServiceGuardrailViolations(relativePath, sourceCode) {
  if (!/^src\/modules\/.*\/app\/services\/[^/]+\.js$/.test(relativePath)) return [];

  const lines = sourceCode.split(/\r?\n/);
  const violations = [];

  IMPORT_SPECIFIER_REGEX.lastIndex = 0;
  let match;
  while ((match = IMPORT_SPECIFIER_REGEX.exec(sourceCode)) !== null) {
    const specifier = match.groups?.spec1 || match.groups?.spec2 || match.groups?.spec3 || match.groups?.spec4 || '';
    if (!specifier) continue;
    if (specifier.startsWith('#core/models/') || specifier.startsWith('#models/')) {
      const line = sourceCode.slice(0, match.index).split(/\r?\n/).length;
      const snippet = (lines[line - 1] || '').trim();
      violations.push({ line, snippet });
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const lineText = lines[index] || '';
    if (SERVICE_DIRECT_QUERY_REGEX.test(lineText)) {
      violations.push({ line: index + 1, snippet: lineText.trim() });
    }
  }

  return violations;
}

const scannedFiles = TARGET_DIRS.flatMap((relativeDir) => collectFiles(path.join(ROOT, relativeDir)));

for (const absoluteFilePath of scannedFiles) {
  const sourceCode = fs.readFileSync(absoluteFilePath, 'utf8');
  const relativePath = path.relative(ROOT, absoluteFilePath).replace(/\\/g, '/');
  const firstViolation = findFirstViolation(sourceCode);
  if (firstViolation) {
    console.error(`IMPORT RELATIVO PROIBIDO: ${path.relative(ROOT, absoluteFilePath)} | spec=${firstViolation.specifier} | line=${firstViolation.line}`);
    process.exit(1);
  }

  const serviceViolations = collectServiceGuardrailViolations(relativePath, sourceCode);
  if (serviceViolations.length) {
    console.error('❌ Arquitetura inválida: services não podem importar models nem executar queries diretas.');
    for (const violation of serviceViolations) {
      console.error(`${relativePath}:${violation.line}: ${violation.snippet}`);
    }
    process.exit(1);
  }
}

console.log('✔ Arquitetura limpa');