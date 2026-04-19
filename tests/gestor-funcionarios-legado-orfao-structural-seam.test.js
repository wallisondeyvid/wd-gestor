import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CONTROLLER_PATH = path.join(ROOT, 'src/modules/gestor/app/controllers/funcionarioController.js');
const ROUTER_PATH = path.join(ROOT, 'src/modules/gestor/app/routes/funcionario.js');

test('funcionarioController fica classificado como legado orfao sem ponto de entrada real no router dedicado', () => {
  const controllerSource = fs.readFileSync(CONTROLLER_PATH, 'utf8');
  const routerSource = fs.readFileSync(ROUTER_PATH, 'utf8');

  assert.match(controllerSource, /export async function listarFuncionarios\(req, res\) \{/);
  assert.match(controllerSource, /export async function funcionariosDisponiveis\(req, res\) \{/);
  assert.match(controllerSource, /export const funcionarioControllerLive = \{\};/);
  assert.match(controllerSource, /export const funcionarioControllerOrphan = \{ listarFuncionarios, funcionariosDisponiveis \};/);
  assert.match(controllerSource, /export default funcionarioControllerOrphan;/);

  assert.doesNotMatch(routerSource, /funcionarioController/);
  assert.doesNotMatch(routerSource, /router\.(get|post|put|delete|patch)\(/);
});