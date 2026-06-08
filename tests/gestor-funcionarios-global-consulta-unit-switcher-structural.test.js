import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const VIEW_PATH = path.join(process.cwd(), 'views/gestor/funcionarios/funcionarios_index.ejs');
const PAGE_JS_PATH = path.join(process.cwd(), 'public/gestor/js/pages/funcionarios_index.js');

const viewSource = fs.readFileSync(VIEW_PATH, 'utf8');
const pageSource = fs.readFileSync(PAGE_JS_PATH, 'utf8');

test('Funcionarios não renderiza fluxo manual de modo global de consulta', () => {
  assert.doesNotMatch(viewSource, /Modo global de consulta/);
  assert.doesNotMatch(viewSource, /Funcionários - Consulta Global/);
  assert.doesNotMatch(viewSource, /gestor-funcionarios-global-consulta-switcher/);
  assert.doesNotMatch(viewSource, /gestorFuncionariosGlobalUnidadeSelect/);
  assert.doesNotMatch(viewSource, /gestorFuncionariosGlobalAtivarUnidadeBtn/);
  assert.doesNotMatch(viewSource, /gestorFuncionariosGlobalTrocarUnidadeBtn/);
  assert.doesNotMatch(viewSource, /gestorFuncionariosGlobalSwitchFeedback/);
  assert.doesNotMatch(viewSource, /data-funcionarios-global-consulta/);
});

test('Funcionarios não bloqueia formulário e ações por modo global artificial', () => {
  assert.doesNotMatch(viewSource, /gestor-global-consulta-disabled/);
  assert.doesNotMatch(viewSource, /isGlobalConsultaMode \? 'disabled aria-disabled="true"' : ''/);
  assert.doesNotMatch(viewSource, /data-action="detalhes-bloqueado"/);
  assert.doesNotMatch(viewSource, /data-action="editar-bloqueado"/);
  assert.doesNotMatch(viewSource, /data-action="excluir-bloqueado"/);
});

test('JS da pagina de Funcionarios não ativa unidade via switch-unit', () => {
  assert.doesNotMatch(pageSource, /initGlobalConsultaUnitSwitcher/);
  assert.doesNotMatch(pageSource, /resolveGlobalSwitchUnitError/);
  assert.doesNotMatch(pageSource, /gestorFuncionariosGlobalUnidadeSelect/);
  assert.doesNotMatch(pageSource, /gestorFuncionariosGlobalAtivarUnidadeBtn/);
  assert.doesNotMatch(pageSource, /gestorFuncionariosGlobalTrocarUnidadeBtn/);
  assert.doesNotMatch(pageSource, /gestorFuncionariosGlobalSwitchFeedback/);
  assert.doesNotMatch(pageSource, /\/auth\/switch-unit/);
});
