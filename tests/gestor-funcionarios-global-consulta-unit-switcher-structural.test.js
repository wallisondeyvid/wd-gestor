import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const VIEW_PATH = path.join(process.cwd(), 'views/gestor/funcionarios/funcionarios_index.ejs');
const PAGE_JS_PATH = path.join(process.cwd(), 'public/gestor/js/pages/funcionarios_index.js');

const viewSource = fs.readFileSync(VIEW_PATH, 'utf8');
const pageSource = fs.readFileSync(PAGE_JS_PATH, 'utf8');

test('Funcionarios global consulta renderiza seletor inline de unidade com ObjectId real', () => {
  assert.match(viewSource, /label for="gestorFuncionariosGlobalUnidadeSelect" class="form-label mb-1">Unidade para gerenciamento<\/label>/);
  assert.match(viewSource, /<select id="gestorFuncionariosGlobalUnidadeSelect" class="form-select"/);
  assert.match(viewSource, /<option value="<%= unidade\.id %>">/);
  assert.match(viewSource, /id="gestorFuncionariosGlobalAtivarUnidadeBtn"/);
  assert.match(viewSource, /<span id="gestorFuncionariosUnidadeAtivaNome" data-unidade-ativa-id="<%= unidadeAtivaGestao\.id %>">/);
  assert.doesNotMatch(viewSource, /href="<%= _basePath %>\/login\?step=select"/);
});

test('Funcionarios global consulta normaliza lista de unidades usando ObjectId e rotulo separado', () => {
  assert.match(viewSource, /const unidadesGestao = Array\.isArray\(unidadesFiltradas\)/);
  assert.match(viewSource, /id: String\(unidade\?\._id \|\| unidade\?\.id \|\| ''\)\.trim\(\)/);
  assert.match(viewSource, /codigo: String\(unidade\?\.codigo \|\| ''\)\.trim\(\)/);
  assert.match(viewSource, /nome: String\(unidade\?\.nome \|\| ''\)\.trim\(\)/);
});

test('JS da pagina de Funcionarios ativa unidade global via switch-unit e nao envia unidade vazia', () => {
  assert.match(pageSource, /function initGlobalConsultaUnitSwitcher\(\)\{/);
  assert.match(pageSource, /const select = document\.getElementById\('gestorFuncionariosGlobalUnidadeSelect'\);/);
  assert.match(pageSource, /const button = document\.getElementById\('gestorFuncionariosGlobalAtivarUnidadeBtn'\);/);
  assert.match(pageSource, /if\(!unidadeId\)\{/);
  assert.match(pageSource, /JSON\.stringify\(\{ unidade_id: unidadeId \}\)/);
  assert.match(pageSource, /fetch\(`\$\{basePath\}\/auth\/switch-unit`, \{/);
  assert.match(pageSource, /window\.location\.reload\(\);/);
});

test('JS da pagina de Funcionarios traduz erros do fluxo global de ativacao', () => {
  assert.match(pageSource, /function resolveGlobalSwitchUnitError\(code\)\{/);
  assert.match(pageSource, /case 'GESTOR_INVALID_UNIDADE_ID'/);
  assert.match(pageSource, /case 'GESTOR_UNIT_NOT_ALLOWED'/);
  assert.match(pageSource, /case 'GESTOR_AUTH_CONTEXT_SWITCH_DISABLED'/);
});