#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT = process.cwd();
const JS_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx']);

function norm(p) {
  return String(p || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function exists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

function envList(name) {
  return String(process.env[name] || '')
    .split(',')
    .map((item) => norm(item.trim()))
    .filter(Boolean);
}

function hasPrefixMatch(filePath, prefixes) {
  const normalized = norm(filePath);
  return prefixes.some((prefix) => normalized === prefix || normalized.startsWith(prefix.endsWith('/') ? prefix : prefix + '/'));
}

function sh(command) {
  try {
    return String(execSync(command, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }))
      .split(/\r?\n/)
      .map((line) => norm(line.trim()))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function gitChangedFiles() {
  const staged = sh('git diff --name-only --diff-filter=ACMRTUXB --cached');
  if (staged.length) return staged;

  if (process.env.CI === 'true' && process.env.GITHUB_BASE_REF) {
    const baseRef = process.env.GITHUB_BASE_REF;
    const mergeBaseArr = sh(`git merge-base HEAD origin/${baseRef}`);
    const mergeBase = mergeBaseArr[0] || '';
    if (mergeBase) {
      const ciDiff = sh(`git diff --name-only --diff-filter=ACMRTUXB ${mergeBase}...HEAD`);
      if (ciDiff.length) return ciDiff;
    }
  }

  const working = sh('git diff --name-only --diff-filter=ACMRTUXB');
  if (working.length) return working;

  const lastCommit = sh('git diff --name-only --diff-filter=ACMRTUXB HEAD~1...HEAD');
  return lastCommit;
}

function isCodeFile(filePath) {
  return JS_EXT.has(path.extname(filePath).toLowerCase());
}

function collectFiles(relDir) {
  const fullDir = path.join(ROOT, relDir);
  if (!fs.existsSync(fullDir)) return [];
  const out = [];

  function walk(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      const rel = norm(path.relative(ROOT, full));
      if (entry.isDirectory()) {
        walk(full);
      } else {
        out.push(rel);
      }
    }
  }

  walk(fullDir);
  return out;
}

function checkNewLogicOutsideSrc(changedFiles) {
  const allowPrefixes = [
    'public/js/gestor-app.js',
    'public/js/perfil-modulo.js',
    'public/js/unidades.js',
    'routes/verificacao.routes.js',
    ...envList('WD_GUARD_ALLOW_ROOT_WRITE'),
  ];
  const blockers = [];
  for (const rel of changedFiles) {
    if (!isCodeFile(rel)) continue;
    if (rel.startsWith('src/')) continue;
    if (rel.startsWith('scripts/')) continue;
    if (rel.startsWith('tests/')) continue;
    if (hasPrefixMatch(rel, allowPrefixes)) continue;

    const isRootLegacyArea = rel.startsWith('routes/') || rel.startsWith('services/') || rel.startsWith('public/');
    if (isRootLegacyArea) blockers.push(rel);
  }
  return blockers;
}

function checkLegacyFrozen(changedFiles) {
  return changedFiles.filter((rel) => rel.startsWith('src/legacy/'));
}

function checkLegacyImports() {
  const whitelist = [
    'src/modules/gestor/app/services/apiDbBridgeService.js',
    'src/modules/gestor/app/services/authDbBridgeService.js',
    ...envList('WD_LEGACY_IMPORT_WHITELIST'),
  ];
  const srcFiles = collectFiles('src').filter((rel) => isCodeFile(rel));
  const offenders = [];

  const legacyImportPattern = /(from\s+['\"][^'\"]*legacy[^'\"]*['\"])|(import\(\s*['\"][^'\"]*legacy[^'\"]*['\"]\s*\))/g;

  for (const rel of srcFiles) {
    if (hasPrefixMatch(rel, whitelist)) continue;
    const full = path.join(ROOT, rel);
    const text = fs.readFileSync(full, 'utf8');
    if (!legacyImportPattern.test(text)) continue;

    const explicitLegacyPath = /src\/legacy\/|#legacy\/|['\"][^'\"]*\/legacy\//.test(text);
    if (explicitLegacyPath) offenders.push(rel);
  }

  return offenders;
}

function duplicationAlert() {
  const duplicationAllowlist = new Set([
    'bankclient.js',
    'documentos.service.js',
    'cnaes_lista.json',
    ...envList('WD_DUPLICATION_ALLOWLIST').map((item) => path.basename(item).toLowerCase()),
  ]);

  const pairs = [
    { root: 'routes', src: 'src/routes' },
    { root: 'services', src: 'src/services' },
    { root: 'public', src: 'src/public' },
  ];

  const alerts = [];
  for (const pair of pairs) {
    if (!exists(pair.root) || !exists(pair.src)) continue;

    const rootFiles = collectFiles(pair.root);
    const srcFiles = collectFiles(pair.src);

    const rootNames = new Map();
    for (const rel of rootFiles) {
      const base = path.basename(rel).toLowerCase();
      if (!rootNames.has(base)) rootNames.set(base, []);
      rootNames.get(base).push(rel);
    }

    const duplicated = [];
    for (const rel of srcFiles) {
      const base = path.basename(rel).toLowerCase();
      if (duplicationAllowlist.has(base)) continue;
      if (rootNames.has(base)) {
        duplicated.push({
          name: base,
          root: rootNames.get(base),
          src: rel,
        });
      }
    }

    if (duplicated.length) {
      alerts.push({ pair, duplicated });
    }
  }

  return alerts;
}

function printHeader(title) {
  console.log(`\n=== ${title} ===`);
}

function main() {
  const changedFiles = gitChangedFiles();

  printHeader('WD Migration Safety Guard');
  console.log('changedFiles:', changedFiles.length ? changedFiles.length : 0);

  const outsideSrc = checkNewLogicOutsideSrc(changedFiles);
  const legacyChanged = checkLegacyFrozen(changedFiles);
  const legacyImports = checkLegacyImports();
  const duplication = duplicationAlert();

  let failed = false;

  if (outsideSrc.length) {
    failed = true;
    printHeader('BLOCKER: lógica nova fora de /src');
    outsideSrc.forEach((file) => console.error(' -', file));
    console.error('Dica: use WD_GUARD_ALLOW_ROOT_WRITE para exceções temporárias (csv de prefixos).');
  }

  if (legacyChanged.length) {
    failed = true;
    printHeader('BLOCKER: src/legacy está congelado');
    legacyChanged.forEach((file) => console.error(' -', file));
  }

  if (legacyImports.length) {
    failed = true;
    printHeader('BLOCKER: import direto de legacy detectado');
    legacyImports.forEach((file) => console.error(' -', file));
    console.error('Dica: use WD_LEGACY_IMPORT_WHITELIST para whitelist temporária (csv de prefixos).');
  }

  if (duplication.length) {
    printHeader('ALERTA: duplicidade raiz vs src (routes/services/public)');
    for (const item of duplication) {
      console.warn(`* ${item.pair.root} <-> ${item.pair.src}: ${item.duplicated.length} nomes duplicados`);
      item.duplicated.slice(0, 20).forEach((dup) => {
        console.warn(`  - ${dup.name}`);
      });
      if (item.duplicated.length > 20) {
        console.warn(`  ... +${item.duplicated.length - 20} itens`);
      }
    }
  } else {
    printHeader('ALERTA: duplicidade raiz vs src');
    console.log('nenhuma duplicidade detectada para routes/services/public');
  }

  if (failed) {
    printHeader('RESULT');
    console.error('FAIL: guardas de migração acionadas.');
    process.exit(2);
  }

  printHeader('RESULT');
  console.log('OK: guardas passaram.');
}

main();
