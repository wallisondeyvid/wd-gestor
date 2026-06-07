import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const VIEW_PATH = path.join(process.cwd(), 'views/gestor/funcionarios/funcionarios_index.ejs');
const PAGE_JS_PATH = path.join(process.cwd(), 'public/gestor/js/pages/funcionarios_index.js');

const viewSource = fs.readFileSync(VIEW_PATH, 'utf8');
const pageSource = fs.readFileSync(PAGE_JS_PATH, 'utf8');

test('Funcionarios global consulta renderiza seletor inline e botões de ativar e trocar unidade com ObjectId real', () => {
  // Verifica botão 'Trocar unidade' na view (com seletor e label "Trocar unidade")
  assert.match(viewSource, /label for="gestorFuncionariosGlobalUnidadeSelect" class="form-label mb-0">Trocar unidade<\/label>/);
  assert.match(viewSource, /<select id="gestorFuncionariosGlobalUnidadeSelect" class="form-select form-select-sm"/);
  assert.match(viewSource, /<option value="<%= unidade\.id %>" <%= unidade\.id === unidadeAtivaGestao\.id \? 'selected' : '' %>/);
  assert.match(viewSource, /id="gestorFuncionariosGlobalTrocarUnidadeBtn"/);
  assert.match(viewSource, /<span id="gestorFuncionariosUnidadeAtivaNome" data-unidade-ativa-id="<%= unidadeAtivaGestao\.id %>">/);
  // Verifica botão 'Ativar unidade' ainda presente quando não há unidade ativa
  assert.match(viewSource, /id="gestorFuncionariosGlobalAtivarUnidadeBtn"/);
  assert.doesNotMatch(viewSource, /href="<%= _basePath %>\/login\?step=select"/);
});

test('Funcionarios global consulta normaliza lista de unidades usando ObjectId e rotulo separado', () => {
  assert.match(viewSource, /const unidadesGestao = Array\.isArray\(unidadesFiltradas\)/);
  assert.match(viewSource, /id: String\(unidade\?\._id \|\| unidade\?\.id \|\| ''\)\.trim\(\)/);
  assert.match(viewSource, /codigo: String\(unidade\?\.codigo \|\| ''\)\.trim\(\)/);
  assert.match(viewSource, /nome: String\(unidade\?\.nome \|\| ''\)\.trim\(\)/);
});

test('JS da pagina de Funcionarios ativa unidade global via switch-unit sem enviar unidade vazia e bloqueando mesma unidade', () => {
  assert.match(pageSource, /function initGlobalConsultaUnitSwitcher\(\)\{/);
    assert.match(pageSource, /const select = document\.getElementById\('gestorFuncionariosGlobalUnidadeSelect'\);/);
  assert.match(pageSource, /document\.getElementById\('gestorFuncionariosGlobalAtivarUnidadeBtn'\)/);
  assert.match(pageSource, /document\.getElementById\('gestorFuncionariosGlobalTrocarUnidadeBtn'\)/);
  assert.match(pageSource, /\|\|/);
  assert.match(pageSource, /if\(!unidadeId\)\{/);
  assert.match(pageSource, /if\s*\(unidadeId\s*===\s*select\.dataset\.currentUnitId\s*\)\s*\{/);
  assert.match(pageSource, /JSON\.stringify\(\{\s*unidade_id:\s*unidadeId\s*\}\)/);
  assert.match(pageSource, /fetch\(`\$\{basePath\}\/auth\/switch-unit`, \{/);
  assert.match(pageSource, /String\(payload\?\.message \|\| ''\)\.trim\(\) \|\| resolveGlobalSwitchUnitError\(payload\?\.code\)/);
  assert.match(pageSource, /window\.location\.reload\(\);/);
});

test('JS da pagina de Funcionarios traduz erros do fluxo global de ativacao', () => {
  assert.match(pageSource, /function resolveGlobalSwitchUnitError\(code\)\{/);
  assert.match(pageSource, /case 'GESTOR_INVALID_UNIDADE_ID'/);
  assert.match(pageSource, /case 'GESTOR_UNIT_NOT_ALLOWED'/);
  assert.match(pageSource, /case 'GESTOR_AUTH_CONTEXT_SWITCH_DISABLED'/);
});