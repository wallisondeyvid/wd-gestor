import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CONTROLLER_PATH = path.join(ROOT, 'src/modules/gestor/app/controllers/funcaoController.js');
const ROUTER_PATH = path.join(ROOT, 'src/modules/gestor/app/routes/funcao.js');

test('funcaoController fica classificado como legado orfao sem ponto de entrada real no router dedicado', () => {
  const controllerSource = fs.readFileSync(CONTROLLER_PATH, 'utf8');
  const routerSource = fs.readFileSync(ROUTER_PATH, 'utf8');

  assert.match(controllerSource, /export async function listarFuncoes\(req, res\) \{/);
  assert.match(controllerSource, /export const funcaoControllerLive = \{\};/);
  assert.match(controllerSource, /export const funcaoControllerOrphan = \{ listarFuncoes \};/);
  assert.match(controllerSource, /export default funcaoControllerOrphan;/);

  assert.doesNotMatch(routerSource, /funcaoController/);
  assert.doesNotMatch(routerSource, /router\.(get|post|put|delete|patch)\(/);
});