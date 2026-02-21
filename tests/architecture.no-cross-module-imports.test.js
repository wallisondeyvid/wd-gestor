import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

test('Guardrail estrutural: sem imports cruzados entre módulos fora da allowlist', () => {
  const scriptPath = path.resolve(process.cwd(), 'scripts', 'guardrails', 'verify-no-cross-module-imports.js');

  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();

  assert.equal(
    result.status,
    0,
    `Guardrail de imports cruzados falhou (exit ${result.status ?? 'null'}).\n${output}`,
  );
});

test('Guardrail inclui regra extra para imports cruzados de controllers via src/modules/*', () => {
  const scriptPath = path.resolve(process.cwd(), 'scripts', 'guardrails', 'verify-no-cross-module-imports.js');
  const source = fs.readFileSync(scriptPath, 'utf8');

  assert.match(source, /extractControllerTargetFromSrcModulesPath/);
  assert.match(source, /src\\\/modules\\\/\(\[\^\/\]\+\)\\\/\.\*\\\/controllers\\\//);
});

test('Guardrail falha em import cross-module de controllers (E2E com arquivo temporário)', () => {
  const root = process.cwd();
  const modulesRoot = path.resolve(root, 'src', 'modules');
  const scriptPath = path.resolve(root, 'scripts', 'guardrails', 'verify-no-cross-module-imports.js');

  const moduleDirs = fs
    .readdirSync(modulesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  assert.ok(moduleDirs.length >= 2, 'Precisa de ao menos 2 módulos para o teste E2E do guardrail');

  const owner = moduleDirs[0];
  const target = moduleDirs.find((name) => name !== owner);
  assert.ok(target, 'Não foi possível encontrar módulo alvo diferente do owner');

  const tempFileRelative = `src/modules/${owner}/tmp_guardrail_test.js`;
  const tempFilePath = path.resolve(root, tempFileRelative);
  const forbiddenImport = `import x from 'src/modules/${target}/app/controllers/userController.js';\n`;

  try {
    fs.writeFileSync(tempFilePath, forbiddenImport, 'utf8');

    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: root,
      encoding: 'utf8',
    });

    const output = `${result.stdout || ''}${result.stderr || ''}`;

    assert.notEqual(result.status, 0, `Guardrail deveria falhar no cenário E2E, mas retornou ${result.status ?? 'null'}.\n${output}`);
    assert.match(output, /controllers/i, 'Saída deve mencionar "controllers"');
    assert.match(output, /src\/modules/i, 'Saída deve mencionar "src/modules"');
    assert.match(output, new RegExp(`${tempFileRelative.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\d+`), 'Saída deve conter caminho do arquivo temporário com linha (:n)');
  } finally {
    try {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    } catch {}
  }
});

test('Guardrail falha em uso de #legacy-services fora de scripts/docs (E2E)', () => {
  const root = process.cwd();
  const modulesRoot = path.resolve(root, 'src', 'modules');
  const scriptPath = path.resolve(root, 'scripts', 'guardrails', 'verify-no-cross-module-imports.js');

  const moduleDirs = fs
    .readdirSync(modulesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  assert.ok(moduleDirs.length >= 1, 'Precisa de ao menos 1 módulo para o teste E2E de legacy-services');

  const owner = moduleDirs[0];
  const tempFileRelative = `src/modules/${owner}/tmp_guardrail_test_legacy.js`;
  const tempFilePath = path.resolve(root, tempFileRelative);
  const legacyPrefix = '#legacy' + '-services/';
  const forbiddenImport = `import x from '${legacyPrefix}qualquer.js';\n`;

  try {
    fs.writeFileSync(tempFilePath, forbiddenImport, 'utf8');

    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: root,
      encoding: 'utf8',
    });

    const output = `${result.stdout || ''}${result.stderr || ''}`;

    assert.notEqual(result.status, 0, `Guardrail deveria falhar no cenário legacy-services, mas retornou ${result.status ?? 'null'}.\n${output}`);
    assert.match(output, /legacy-services/i, 'Saída deve mencionar "legacy-services"');
    assert.match(output, new RegExp(`${tempFileRelative.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\d+`), 'Saída deve conter caminho do arquivo temporário com linha (:n)');
  } finally {
    try {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    } catch {}
  }
});

test('Guardrail falha quando src/shared importa #modules/* (E2E)', () => {
  const root = process.cwd();
  const sharedRoot = path.resolve(root, 'src', 'shared');
  const scriptPath = path.resolve(root, 'scripts', 'guardrails', 'verify-no-cross-module-imports.js');
  const tempFileRelative = 'src/shared/tmp_guardrail_shared_test.js';
  const tempFilePath = path.resolve(root, tempFileRelative);
  const forbiddenImport = "import x from '#modules/gestor/app/routes/userApi.js';\n";

  try {
    if (!fs.existsSync(sharedRoot)) {
      fs.mkdirSync(sharedRoot, { recursive: true });
    }

    fs.writeFileSync(tempFilePath, forbiddenImport, 'utf8');

    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: root,
      encoding: 'utf8',
    });

    const output = `${result.stdout || ''}${result.stderr || ''}`;

    assert.notEqual(result.status, 0, `Guardrail deveria falhar para import proibido em src/shared, mas retornou ${result.status ?? 'null'}.\n${output}`);
    assert.match(output, /src\/shared/i, 'Saída deve mencionar src/shared');
    assert.match(output, /#modules\//i, 'Saída deve mencionar #modules/');
    assert.match(output, new RegExp(`${tempFileRelative.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\d+`), 'Saída deve conter caminho do arquivo temporário com linha (:n)');
  } finally {
    try {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    } catch {}
  }
});
