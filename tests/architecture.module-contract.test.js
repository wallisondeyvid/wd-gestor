import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MODULES_ROOT = path.resolve(process.cwd(), 'src', 'modules');
const LISTEN_REGEX = /\b(?:app|server)?\.listen\s*\(/;

function listModuleDirs(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  return fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(rootDir, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

function collectJsFiles(dir) {
  const collected = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (entry.isFile() && fullPath.endsWith('.js')) {
        collected.push(fullPath);
      }
    }
  }

  if (fs.existsSync(dir)) {
    walk(dir);
  }

  return collected.sort((a, b) => a.localeCompare(b));
}

function resolveContractExports(loadedModule) {
  const meta = loadedModule?.meta ?? loadedModule?.default?.meta;
  const buildModule =
    loadedModule?.buildModule ??
    loadedModule?.default?.buildModule ??
    (typeof loadedModule?.default === 'function' ? loadedModule.default : undefined);

  return { meta, buildModule };
}

function assertExpressLikeApp(app, moduleName) {
  assert.ok(
    app && (typeof app === 'function' || typeof app === 'object'),
    `[${moduleName}] retorno de buildModule deve ser função ou objeto express-like`,
  );
  assert.equal(typeof app.use, 'function', `[${moduleName}] app.use deve existir`);
  assert.equal(typeof app.handle, 'function', `[${moduleName}] app.handle deve existir`);
}

test('Contrato estrutural: módulos expõem meta/buildModule válidos', async () => {
  const moduleDirs = listModuleDirs(MODULES_ROOT);
  assert.ok(moduleDirs.length > 0, 'Nenhum módulo encontrado em src/modules');

  for (const moduleDir of moduleDirs) {
    const moduleName = path.basename(moduleDir);
    const indexPath = path.join(moduleDir, 'index.js');

    assert.ok(fs.existsSync(indexPath), `[${moduleName}] index.js não encontrado`);

    const loadedModule = await import(pathToFileURL(indexPath).href);
    const { meta, buildModule } = resolveContractExports(loadedModule);

    assert.ok(meta && typeof meta === 'object', `[${moduleName}] meta deve ser objeto`);
    assert.equal(typeof buildModule, 'function', `[${moduleName}] buildModule deve ser função`);

    assert.equal(typeof meta.name, 'string', `[${moduleName}] meta.name deve ser string`);
    assert.ok(meta.name.trim().length > 0, `[${moduleName}] meta.name não pode ser vazio`);

    assert.equal(typeof meta.basePath, 'string', `[${moduleName}] meta.basePath deve ser string`);
    assert.ok(meta.basePath.startsWith('/'), `[${moduleName}] meta.basePath deve iniciar com "/"`);

    let built;
    try {
      built = await buildModule({ skipDb: true, skipAuth: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `[${moduleName}] buildModule(context) falhou. Contrato deve aceitar contexto mínimo. Erro: ${message}`,
      );
    }
    const app = built?.app ?? built;

    assertExpressLikeApp(app, moduleName);
  }
});

test('Guardrail estrutural: src/modules não pode chamar .listen(', () => {
  const jsFiles = collectJsFiles(MODULES_ROOT);
  const offenders = [];

  for (const filePath of jsFiles) {
    const source = fs.readFileSync(filePath, 'utf8');
    if (LISTEN_REGEX.test(source)) {
      offenders.push(path.relative(process.cwd(), filePath));
    }
  }

  assert.equal(
    offenders.length,
    0,
    `Encontrado uso proibido de .listen( em:\n${offenders.map((item) => `- ${item}`).join('\n')}`,
  );
});
