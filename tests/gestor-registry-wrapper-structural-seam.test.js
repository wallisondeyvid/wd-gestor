import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const GESTOR_MODULE_URL = pathToFileURL(path.join(ROOT, 'src/modules/gestor/index.js')).href;
const CREATE_SERVER_PATH = path.join(ROOT, 'src/server/createServer.js');

test('buildRegistryWrapper preserva o contrato estrutural do modulo Gestor', async () => {
  const loaded = await import(GESTOR_MODULE_URL);

  assert.equal(typeof loaded.buildRegistryWrapper, 'function', 'modulo Gestor deve expor buildRegistryWrapper');

  const wrapped = loaded.buildRegistryWrapper();

  assert.ok(wrapped && typeof wrapped === 'object', 'buildRegistryWrapper deve retornar objeto');
  assert.equal(wrapped.meta, loaded.meta, 'wrapper deve reaproveitar o mesmo meta do modulo Gestor');
  assert.equal(wrapped.buildModule, loaded.buildModule, 'wrapper deve reaproveitar o mesmo buildModule do modulo Gestor');
  assert.equal(wrapped.meta?.basePath, '/gestor', 'wrapper deve preservar basePath /gestor');
});

test('createServer expõe selecao OFF/ON do wrapper do Gestor no registry sem alterar o contrato base', () => {
  const source = fs.readFileSync(CREATE_SERVER_PATH, 'utf8');

  assert.match(
    source,
    /const BASE_REGISTRY = Object\.freeze\(\[clinicaModule, condominiosModule, portalMoradorModule\]\);/,
    'BASE_REGISTRY deve manter apenas os modulos base sem embutir o Gestor diretamente',
  );

  assert.match(
    source,
    /function resolveGestorRegistryModule\(\) \{[\s\S]*ENABLE_GESTOR_WRAPPER[\s\S]*buildRegistryWrapper[\s\S]*return gestorModule;[\s\S]*\}/,
    'createServer deve resolver explicitamente OFF/ON do wrapper do Gestor no registry',
  );

  assert.match(
    source,
    /const registry = \[resolveGestorRegistryModule\(\), \.\.\.BASE_REGISTRY\];/,
    'registry deve inserir o Gestor pelo resolvedor explicito no primeiro slot',
  );
});