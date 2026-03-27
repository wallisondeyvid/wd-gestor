import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const GESTOR_APP_URL = pathToFileURL(path.join(ROOT, 'src/modules/gestor/app/gestor-app.js')).href;
const GESTOR_MODULE_URL = pathToFileURL(path.join(ROOT, 'src/modules/gestor/index.js')).href;

function assertExpressLikeApp(app, label) {
  assert.ok(app && (typeof app === 'function' || typeof app === 'object'), `${label} deve retornar app express-like`);
  assert.equal(typeof app.use, 'function', `${label} deve expor app.use`);
  assert.equal(typeof app.handle, 'function', `${label} deve expor app.handle`);
  assert.ok(app.locals && typeof app.locals === 'object', `${label} deve expor app.locals`);
}

test('buildGestorApp cria instancias novas do sub-app Gestor', async () => {
  const loaded = await import(GESTOR_APP_URL);

  assert.equal(typeof loaded.buildGestorApp, 'function', 'gestor-app deve expor buildGestorApp');
  assert.equal(loaded.default, loaded.buildGestorApp, 'export default de gestor-app deve apontar para a factory');

  const firstApp = loaded.buildGestorApp();
  const secondApp = loaded.buildGestorApp();

  assertExpressLikeApp(firstApp, 'buildGestorApp()');
  assertExpressLikeApp(secondApp, 'buildGestorApp()');
  assert.notEqual(firstApp, secondApp, 'buildGestorApp deve criar uma instancia nova a cada chamada');

  firstApp.locals.skipDb = true;
  assert.notEqual(secondApp.locals.skipDb, true, 'estado em app.locals nao deve vazar entre instancias da factory');
});

test('buildModule preserva o contrato de montagem consumido pelo app raiz', async () => {
  const loaded = await import(GESTOR_MODULE_URL);

  assert.equal(typeof loaded.buildModule, 'function', 'modulo Gestor deve expor buildModule');
  assert.equal(loaded.meta?.basePath, '/gestor', 'meta.basePath do modulo Gestor deve permanecer /gestor');

  const firstBuilt = await loaded.buildModule({ config: {} });
  const secondBuilt = await loaded.buildModule({ config: {} });

  assertExpressLikeApp(firstBuilt, 'buildModule()');
  assertExpressLikeApp(secondBuilt, 'buildModule()');
  assert.notEqual(firstBuilt, secondBuilt, 'buildModule deve construir uma nova instancia do sub-app Gestor');

  firstBuilt.locals.skipDb = true;
  assert.notEqual(secondBuilt.locals.skipDb, true, 'estado mutado pelo app raiz em built.locals nao deve vazar entre montagens');
});