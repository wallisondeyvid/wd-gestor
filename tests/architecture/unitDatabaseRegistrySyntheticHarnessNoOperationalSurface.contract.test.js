import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const workspaceRoot = process.cwd();
const harnessRelativePath = 'src/shared/db/unitDatabaseRegistrySyntheticBaseConnectionHarness.js';
const harnessAbsolutePath = path.join(workspaceRoot, harnessRelativePath);
const currentTestRelativePath = 'tests/architecture/unitDatabaseRegistrySyntheticHarnessNoOperationalSurface.contract.test.js';
const allowedRuntimeImporters = new Set([
  'tests/architecture/unitDatabaseRegistrySyntheticBaseConnectionHarness.contract.test.js',
  'tests/architecture/unitDatabaseRegistrySyntheticWriteWithHarness.contract.test.js',
  currentTestRelativePath,
]);
const ignoredDirectoryNames = new Set(['node_modules', '.git', 'coverage', 'dist', 'build']);
const rootFilesToScan = ['start.js', 'server.js', 'createServer.js'];
const harnessImportPatterns = [
  'unitDatabaseRegistrySyntheticBaseConnectionHarness',
  'unitDatabaseRegistrySyntheticBaseConnectionHarness.js',
  './src/shared/db/unitDatabaseRegistrySyntheticBaseConnectionHarness',
  './src/shared/db/unitDatabaseRegistrySyntheticBaseConnectionHarness.js',
  '../src/shared/db/unitDatabaseRegistrySyntheticBaseConnectionHarness',
  '../src/shared/db/unitDatabaseRegistrySyntheticBaseConnectionHarness.js',
  '../../src/shared/db/unitDatabaseRegistrySyntheticBaseConnectionHarness',
  '../../src/shared/db/unitDatabaseRegistrySyntheticBaseConnectionHarness.js',
];

function normalizePath(filePath) {
  return filePath.split(path.sep).join('/');
}

function collectJsFiles(relativeDir) {
  const absoluteDir = path.join(workspaceRoot, relativeDir);
  if (!fs.existsSync(absoluteDir)) {
    return [];
  }

  const collected = [];

  function visit(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (ignoredDirectoryNames.has(entry.name)) {
        continue;
      }

      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }

      if (!entry.isFile() || !entry.name.endsWith('.js')) {
        continue;
      }

      collected.push(normalizePath(path.relative(workspaceRoot, absolutePath)));
    }
  }

  visit(absoluteDir);
  return collected.sort();
}

function collectRelevantFiles() {
  const files = new Set([
    ...collectJsFiles('src'),
    ...collectJsFiles('scripts'),
    ...collectJsFiles('tests'),
  ]);

  for (const fileName of rootFilesToScan) {
    const absolutePath = path.join(workspaceRoot, fileName);
    if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile()) {
      files.add(normalizePath(fileName));
    }
  }

  return Array.from(files).sort();
}

function fileContainsHarnessImport(source) {
  return harnessImportPatterns.some((pattern) => source.includes(pattern));
}

test('modulo do harness sintetico existe no caminho esperado', () => {
  assert.equal(fs.existsSync(harnessAbsolutePath), true);
  assert.equal(fs.statSync(harnessAbsolutePath).isFile(), true);
});

test('harness sintetico so pode ser importado por testes arquiteturais autorizados', () => {
  const relevantFiles = collectRelevantFiles();
  const runtimeImporters = [];

  for (const relativePath of relevantFiles) {
    if (relativePath === harnessRelativePath) {
      continue;
    }

    const absolutePath = path.join(workspaceRoot, relativePath);
    const source = fs.readFileSync(absolutePath, 'utf8');
    if (!fileContainsHarnessImport(source)) {
      continue;
    }

    if (!allowedRuntimeImporters.has(relativePath)) {
      runtimeImporters.push(relativePath);
    }
  }

  assert.deepEqual(runtimeImporters, []);
});

test('harness sintetico permanece sem superficie operacional', () => {
  const source = fs.readFileSync(harnessAbsolutePath, 'utf8');
  const forbiddenSnippets = [
    "from 'mongoose'",
    'from "mongoose"',
    ['mongoose', '.connect('].join(''),
    'create' + 'Connection',
    'MONGO' + '_URI',
    'MONGODB' + '_URI',
    ['process', 'argv'].join('.'),
    'express',
    'listen(',
    'route(',
    ['start', '.js'].join(''),
    ['create', 'Server'].join(''),
    ['server', '.js'].join(''),
    'post' + 'gres',
    'post' + 'gresql',
  ];

  for (const snippet of forbiddenSnippets) {
    assert.equal(source.includes(snippet), false);
  }
});