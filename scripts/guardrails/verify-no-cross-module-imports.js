#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MODULES_ROOT = path.join(ROOT, 'src', 'modules');
const SHARED_ROOT = path.join(ROOT, 'src', 'shared');
const LEGACY_SPECIFIER = '#legacy-services/';
const LEGACY_ALLOWED_PREFIXES = ['scripts/', 'docs/', 'src/services/'];
const BANK_CLIENT_SPECIFIER = '#services/bank/bankClient.js';
const BANK_CLIENT_ALLOWED_PREFIX = 'src/shared/adapters/bank/';
const DOCS_SERVICE_SPECIFIER = '#services/documentos.service.js';
const DOCS_SERVICE_ALLOWED_PREFIX = 'src/shared/adapters/documentos/';
const CODE_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.ts', '.tsx']);

const ALLOWLIST = [
  {
    owner: 'clinica',
    target: 'gestor',
    file: 'src/modules/clinica/app/clinica-app.js',
    reason: 'acoplamento legado temporário',
  },
  {
    owner: 'condominios',
    target: 'gestor',
    file: 'src/modules/condominios/app/condominios-app.js',
    reason: 'acoplamento legado temporário',
  },
  {
    owner: 'condominios',
    target: 'portal-morador',
    file: 'src/modules/condominios/app/condominios-app.js',
    reason: 'acoplamento legado temporário',
  },
  {
    owner: 'condominios',
    target: 'portal-morador',
    file: 'src/modules/condominios/assembleias/routes/execution.routes.js',
    reason: 'acoplamento legado temporário',
  },
  {
    owner: 'condominios',
    target: 'portal-morador',
    file: 'src/modules/condominios/assembleias/v2/routes/execution.routes.js',
    reason: 'acoplamento legado temporário',
  },
  {
    owner: 'escalas',
    target: 'gestor',
    file: 'src/modules/escalas/app/escalas-app.js',
    reason: 'acoplamento legado temporário',
  },
  {
    owner: 'portal-morador',
    target: 'gestor',
    file: 'src/modules/portal-morador/app/portal-morador-app.js',
    reason: 'acoplamento legado temporário',
  },
];

const LINE_PATTERNS = [
  /\bimport\s+.+\s+from\s+(['"])(#modules\/[^'"\n]+)\1/g,
  /\bexport\s+.+\s+from\s+(['"])(#modules\/[^'"\n]+)\1/g,
  /\bimport\s*\(\s*(['"])(#modules\/[^'"\n]+)\1\s*\)/g,
  /\bimport\s+(['"])(#modules\/[^'"\n]+)\1/g,
];

const ANY_IMPORT_LINE_PATTERNS = [
  /\bimport\s+.+\s+from\s+(['"])([^'"\n]+)\1/g,
  /\bexport\s+.+\s+from\s+(['"])([^'"\n]+)\1/g,
  /\bimport\s*\(\s*(['"])([^'"\n]+)\1\s*\)/g,
  /\bimport\s+(['"])([^'"\n]+)\1/g,
];

function toPosix(relativePath) {
  return String(relativePath || '').replace(/\\/g, '/');
}

function listModuleNames() {
  if (!fs.existsSync(MODULES_ROOT)) return [];
  return fs
    .readdirSync(MODULES_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function listJsFilesRecursively(dir) {
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

  if (fs.existsSync(dir)) {
    walk(dir);
  }

  return files.sort((a, b) => a.localeCompare(b));
}

function listCodeFilesForLegacyScan() {
  const files = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = toPosix(path.relative(ROOT, fullPath));

      if (entry.isDirectory()) {
        if (relativePath === '.git' || relativePath === 'node_modules') continue;
        walk(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;
      if (LEGACY_ALLOWED_PREFIXES.some((prefix) => relativePath.startsWith(prefix))) continue;

      const ext = path.extname(entry.name).toLowerCase();
      if (CODE_EXTENSIONS.has(ext)) {
        files.push(fullPath);
      }
    }
  }

  walk(ROOT);
  return files.sort((a, b) => a.localeCompare(b));
}

function extractOwnerFromFile(fileRelativePath) {
  const match = /^src\/modules\/([^/]+)\//.exec(fileRelativePath);
  return match ? match[1] : null;
}

function extractTargetFromSpecifier(specifier) {
  if (!specifier.startsWith('#modules/')) return null;
  const rest = specifier.slice('#modules/'.length);
  return rest.split('/')[0] || null;
}

function extractControllerTargetFromSrcModulesPath(specifier) {
  const normalized = String(specifier || '').replace(/\\/g, '/');
  const match = normalized.match(/(?:^|\/)src\/modules\/([^/]+)\/.*\/controllers\//);
  return match ? match[1] : null;
}

function isAllowed(violation) {
  return ALLOWLIST.some((rule) => {
    if (rule.owner !== violation.owner) return false;
    if (rule.target !== violation.target) return false;
    if (!rule.file) return false;
    if (toPosix(rule.file) !== violation.file) return false;
    return true;
  });
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

function collectCrossModuleUsages(moduleNameSet) {
  const violations = [];
  const files = listJsFilesRecursively(MODULES_ROOT);

  for (const fullPath of files) {
    const fileRelativePath = toPosix(path.relative(ROOT, fullPath));
    const owner = extractOwnerFromFile(fileRelativePath);
    if (!owner) continue;

    const source = fs.readFileSync(fullPath, 'utf8');
    const lines = stripCommentsWithLineMap(source);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      for (const pattern of LINE_PATTERNS) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(line)) !== null) {
          const specifier = match[2];
          const target = extractTargetFromSpecifier(specifier);
          if (!target) continue;
          if (!moduleNameSet.has(target)) continue;
          if (target === owner) continue;

          const violation = {
            owner,
            target,
            file: fileRelativePath,
            line: index + 1,
            importString: String(match[0]).trim(),
          };

          if (!isAllowed(violation)) {
            violations.push(violation);
          }
        }
      }

      for (const pattern of ANY_IMPORT_LINE_PATTERNS) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(line)) !== null) {
          const specifier = match[2];
          const controllerTarget = extractControllerTargetFromSrcModulesPath(specifier);
          if (!controllerTarget) continue;
          if (!moduleNameSet.has(controllerTarget)) continue;
          if (controllerTarget === owner) continue;

          violations.push({
            owner,
            target: controllerTarget,
            file: fileRelativePath,
            line: index + 1,
            importString: String(match[0]).trim(),
          });
        }
      }
    }
  }

  return violations.sort((a, b) => {
    if (a.owner !== b.owner) return a.owner.localeCompare(b.owner);
    if (a.target !== b.target) return a.target.localeCompare(b.target);
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    return a.line - b.line;
  });
}

function collectLegacyServiceUsages() {
  const violations = [];
  const files = listCodeFilesForLegacyScan();

  for (const fullPath of files) {
    const fileRelativePath = toPosix(path.relative(ROOT, fullPath));
    const source = fs.readFileSync(fullPath, 'utf8');
    const lines = source.split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line.includes(LEGACY_SPECIFIER)) continue;

      violations.push({
        file: fileRelativePath,
        line: index + 1,
        snippet: line.trim(),
      });
    }
  }

  return violations;
}

function collectSharedModuleDependencyUsages() {
  const violations = [];
  const files = listJsFilesRecursively(SHARED_ROOT);

  for (const fullPath of files) {
    const fileRelativePath = toPosix(path.relative(ROOT, fullPath));
    const source = fs.readFileSync(fullPath, 'utf8');
    const lines = stripCommentsWithLineMap(source);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      for (const pattern of ANY_IMPORT_LINE_PATTERNS) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(line)) !== null) {
          const specifier = String(match[2] || '').replace(/\\/g, '/');
          const isForbidden =
            specifier.startsWith('#modules/')
            || /(?:^|\/)src\/modules\//.test(specifier)
            || /(?:^|\/)\.\.\/modules\//.test(specifier);

          if (!isForbidden) continue;

          violations.push({
            file: fileRelativePath,
            line: index + 1,
            importString: String(match[0]).trim(),
          });
        }
      }
    }
  }

  return violations.sort((a, b) => {
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    return a.line - b.line;
  });
}

function collectDirectBankClientImports() {
  const violations = [];
  const files = listCodeFilesForLegacyScan();

  for (const fullPath of files) {
    const fileRelativePath = toPosix(path.relative(ROOT, fullPath));
    if (fileRelativePath.startsWith(BANK_CLIENT_ALLOWED_PREFIX)) continue;

    const source = fs.readFileSync(fullPath, 'utf8');
    const lines = stripCommentsWithLineMap(source);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      for (const pattern of ANY_IMPORT_LINE_PATTERNS) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(line)) !== null) {
          const specifier = String(match[2] || '').replace(/\\/g, '/');
          if (specifier !== BANK_CLIENT_SPECIFIER) continue;

          violations.push({
            file: fileRelativePath,
            line: index + 1,
            importString: String(match[0]).trim(),
          });
        }
      }
    }
  }

  return violations.sort((a, b) => {
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    return a.line - b.line;
  });
}

function collectDirectDocumentosServiceImports() {
  const violations = [];
  const files = listCodeFilesForLegacyScan();

  for (const fullPath of files) {
    const fileRelativePath = toPosix(path.relative(ROOT, fullPath));
    if (fileRelativePath.startsWith(DOCS_SERVICE_ALLOWED_PREFIX)) continue;

    const source = fs.readFileSync(fullPath, 'utf8');
    const lines = stripCommentsWithLineMap(source);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      for (const pattern of ANY_IMPORT_LINE_PATTERNS) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(line)) !== null) {
          const specifier = String(match[2] || '').replace(/\\/g, '/');
          if (specifier !== DOCS_SERVICE_SPECIFIER) continue;

          violations.push({
            file: fileRelativePath,
            line: index + 1,
            importString: String(match[0]).trim(),
          });
        }
      }
    }
  }

  return violations.sort((a, b) => {
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    return a.line - b.line;
  });
}

function printViolations(violations) {
  console.error('FAIL: imports cruzados entre módulos fora da allowlist.\n');
  for (const violation of violations) {
    console.error(
      `- ${violation.owner} -> ${violation.target} | ${violation.file}:${violation.line} | ${violation.importString}`,
    );
  }

  const suggestionMap = new Map();
  for (const violation of violations) {
    const key = `${violation.owner}|${violation.target}|${violation.file}`;
    if (!suggestionMap.has(key)) {
      suggestionMap.set(key, violation);
    }
  }

  if (suggestionMap.size) {
    console.error('\nSugestões para allowlist temporária (por arquivo):');
    for (const item of suggestionMap.values()) {
      console.error('{');
      console.error(`  owner: '${item.owner}',`);
      console.error(`  target: '${item.target}',`);
      console.error(`  file: '${item.file}',`);
      console.error("  reason: 'acoplamento legado temporário',");
      console.error('}');
    }
  }
}

function printLegacyViolations(violations) {
  console.error('FAIL: uso de #legacy-services/ fora de scripts/ e docs/.\n');
  for (const violation of violations) {
    console.error(`- ${violation.file}:${violation.line} | ${violation.snippet}`);
  }
}

function printSharedDependencyViolations(violations) {
  console.error('FAIL: src/shared/** não pode importar módulos de src/modules/**.\n');
  for (const violation of violations) {
    console.error(`- ${violation.file}:${violation.line} | ${violation.importString}`);
  }
}

function printBankClientDirectImportViolations(violations) {
  console.error('ERRO: Import direto de bankClient proibido. Use BankPort.\n');
  for (const violation of violations) {
    console.error(`- ${violation.file}:${violation.line} | ${violation.importString}`);
  }
}

function printDocumentosServiceDirectImportViolations(violations) {
  console.error('ERRO: Import direto de documentos.service proibido. Use DocumentosPort.\n');
  for (const violation of violations) {
    console.error(`- ${violation.file}:${violation.line} | ${violation.importString}`);
  }
}

function main() {
  const legacyViolations = collectLegacyServiceUsages();
  const sharedDependencyViolations = collectSharedModuleDependencyUsages();
  const bankClientDirectImportViolations = collectDirectBankClientImports();
  const documentosServiceDirectImportViolations = collectDirectDocumentosServiceImports();
  const moduleNames = listModuleNames();
  const moduleNameSet = new Set(moduleNames);

  const violations = moduleNames.length ? collectCrossModuleUsages(moduleNameSet) : [];
  if (violations.length || legacyViolations.length || sharedDependencyViolations.length || bankClientDirectImportViolations.length || documentosServiceDirectImportViolations.length) {
    if (violations.length) {
      printViolations(violations);
    }
    if (legacyViolations.length) {
      if (violations.length) console.error('');
      printLegacyViolations(legacyViolations);
    }
    if (sharedDependencyViolations.length) {
      if (violations.length || legacyViolations.length) console.error('');
      printSharedDependencyViolations(sharedDependencyViolations);
    }
    if (bankClientDirectImportViolations.length) {
      if (violations.length || legacyViolations.length || sharedDependencyViolations.length) console.error('');
      printBankClientDirectImportViolations(bankClientDirectImportViolations);
    }
    if (documentosServiceDirectImportViolations.length) {
      if (violations.length || legacyViolations.length || sharedDependencyViolations.length || bankClientDirectImportViolations.length) console.error('');
      printDocumentosServiceDirectImportViolations(documentosServiceDirectImportViolations);
    }
    process.exit(1);
  }

  console.log('OK: nenhum import cruzado fora da allowlist');
}

main();
