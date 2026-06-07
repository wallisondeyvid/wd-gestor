import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const VIEW_PATH = path.join(process.cwd(), 'views/gestor/slots-modulos.ejs');
const ROUTE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/routes/moduloApi.js');

const viewSource = fs.readFileSync(VIEW_PATH, 'utf8');
const routeSource = fs.readFileSync(ROUTE_PATH, 'utf8');

test('view de Módulos renderiza botões Editar e Excluir com id real do módulo', () => {
  assert.match(viewSource, /const moduloRowId = String\(modulo\._id \|\| modulo\.id \|\| ''\)\.trim\(\);/);
  assert.match(viewSource, /<td><%= moduloRowId %><\/td>/);
  assert.match(viewSource, /data-action="editar" data-id="<%= moduloRowId %>"/);
  assert.match(viewSource, /data-action="excluir" data-id="<%= moduloRowId %>" data-nome=/);
  assert.doesNotMatch(viewSource, /data-action="editar" data-id="<%= modulo\.id %>"/);
  assert.doesNotMatch(viewSource, /data-action="excluir" data-id="<%= modulo\.id %>"/);
});

test('view de Módulos registra handler delegado válido para editar e excluir', () => {
  assert.match(viewSource, /document\.addEventListener\('click', async function\(e\)\{/);
  assert.match(viewSource, /const btn = e\.target\.closest\('button\[data-action\]'\);/);
  assert.match(viewSource, /const action = btn\.getAttribute\('data-action'\);/);
  assert.match(viewSource, /const id = btn\.getAttribute\('data-id'\);/);
  assert.match(viewSource, /if\(!action \|\| !id\) return;/);
  assert.match(viewSource, /if\(action === 'editar'\)\{/);
  assert.match(viewSource, /fetch\('<%= _basePath %>\/api\/modulos\/' \+ encodeURIComponent\(id\), \{ credentials: 'same-origin' \}\)/);
  assert.match(viewSource, /if\(action === 'excluir'\)\{/);
  assert.match(viewSource, /fetch\('<%= _basePath %>\/api\/modulos\/' \+ encodeURIComponent\(id\), \{/);
  assert.match(viewSource, /method: 'DELETE'/);
});

test('view de Módulos salva edição por PUT no id atual e alterna modo edição', () => {
  assert.match(viewSource, /function entrarModoEdicaoModulo\(\)\{/);
  assert.match(viewSource, /hiddenModuloId\.value = data\._id \|\| data\.id \|\| id;/);
  assert.match(viewSource, /const isEdit = !!hiddenModuloId\.value;/);
  assert.match(viewSource, /const url = isEdit \? '<%= _basePath %>\/api\/modulos\/' \+ encodeURIComponent\(id\) : '<%= _basePath %>\/api\/modulos';/);
  assert.match(viewSource, /const method = isEdit \? 'PUT' : 'POST';/);
});

test('rota de Módulos por id é global master-admin e não usa requireUnitScope', () => {
  assert.match(routeSource, /router\.use\('\/api\/modulos', requireGestorMasterOrAdmin\);/);
  assert.match(routeSource, /router\.use\('\/api\/modulos\/:id', requireGestorMasterOrAdmin\);/);
  assert.match(routeSource, /router\.get\('\/api\/modulos\/:id', obterModulo\);/);
  assert.match(routeSource, /router\.put\('\/api\/modulos\/:id', atualizarModulo\);/);
  assert.match(routeSource, /router\.delete\('\/api\/modulos\/:id', excluirModulo\);/);
  assert.doesNotMatch(routeSource, /router\.(get|post|put|delete|use)\([^\n]*requireUnitScope/);
});