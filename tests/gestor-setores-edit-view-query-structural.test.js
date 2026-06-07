import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const VIEW_PATH = path.join(process.cwd(), 'views/gestor/setor.ejs');
const PAGE_JS_PATH = path.join(process.cwd(), 'public/gestor/js/pages/setor.js');
const ROUTE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/routes/setorApi.js');

const viewSource = fs.readFileSync(VIEW_PATH, 'utf8');
const pageJsSource = fs.readFileSync(PAGE_JS_PATH, 'utf8');
const routeSource = fs.readFileSync(ROUTE_PATH, 'utf8');

test('editar na tela de Setores preserva o ObjectId real da unidade na linha', () => {
  assert.match(viewSource, /const setorUnidadeId = String\(\(setor\.unidade_id && \(setor\.unidade_id\._id \|\| setor\.unidade_id\.id\)\) \|\| setor\.unidade_id \|\| setor\.unidadeId \|\| ''\)\.trim\(\);/);
  assert.match(viewSource, /data-action="editar" data-id="<%= setor\._id %>" data-unidade-id="<%= setorUnidadeId %>"/);
  assert.match(viewSource, /data-action="excluir" data-id="<%= setor\._id %>" data-unidade-id="<%= setorUnidadeId %>" data-nome=/);
  assert.match(pageJsSource, /function getSetorUnidadeId\(setor\)\{/);
  assert.match(pageJsSource, /const setorUnidadeId = getSetorUnidadeId\(setor\);/);
  assert.match(pageJsSource, /data-action="editar" data-id="\$\{setor\._id\}" data-unidade-id="\$\{setorUnidadeId\}"/);
  assert.match(pageJsSource, /data-action="excluir" data-id="\$\{setor\._id\}" data-unidade-id="\$\{setorUnidadeId\}" data-nome="\$\{nomeEsc\}"/);
});

test('editarHandler monta GET de detalhe com unidade_id na query e aborta sem unidade válida', () => {
  assert.match(pageJsSource, /function editarHandler\(id, unidadeId\)\{/);
  assert.match(pageJsSource, /const scopedUnidadeId = String\(unidadeId \|\| ''\)\.trim\(\);/);
  assert.match(pageJsSource, /if\(!scopedUnidadeId\)\{\s*toastError\('Falha ao carregar setor: unidade não informada\.'\);\s*return;\s*\}/);
  assert.match(pageJsSource, /const query = '\?unidade_id=' \+ encodeURIComponent\(scopedUnidadeId\);/);
  assert.match(pageJsSource, /fetchJson\(basePath \+ '\/api\/setores\/' \+ id \+ query\)/);
  assert.match(pageJsSource, /if\(action === 'editar' && id\)\{ editarHandler\(id, btn\.getAttribute\('data-unidade-id'\) \|\| ''\); \}/);
});

test('excluirHandler monta DELETE com unidade_id na query e aborta sem unidade válida', () => {
  assert.match(pageJsSource, /let deleteTargetUnidadeId = null;/);
  assert.match(pageJsSource, /function excluirHandler\(id, nome, unidadeId\)\{/);
  assert.match(pageJsSource, /const scopedUnidadeId = String\(unidadeId \|\| ''\)\.trim\(\);/);
  assert.match(pageJsSource, /if\(!scopedUnidadeId\)\{\s*toastError\('Falha ao excluir setor: unidade não informada\.'\);\s*return;\s*\}/);
  assert.match(pageJsSource, /deleteTargetUnidadeId = scopedUnidadeId;/);
  assert.match(pageJsSource, /const query = '\?unidade_id=' \+ encodeURIComponent\(scopedUnidadeId\);/);
  assert.match(pageJsSource, /fetchJson\(basePath \+ '\/api\/setores\/' \+ deleteTargetId \+ query, \{ method:'DELETE' \}\)/);
  assert.match(pageJsSource, /fetchJson\(basePath \+ '\/api\/setores\/' \+ id \+ query, \{ method:'DELETE' \}\)/);
  assert.match(pageJsSource, /if\(action === 'excluir' && id\)\{ excluirHandler\(id, btn\.getAttribute\('data-nome'\)\|\|'', btn\.getAttribute\('data-unidade-id'\) \|\| ''\); \}/);
});

test('DELETE /api/setores/:id continua protegido por requireUnitScope no backend', () => {
  assert.match(routeSource, /router\.delete\('\/api\/setores\/:id', withLoginAndRequiredUnitScope\(deleteSetor\)\);/);
  assert.doesNotMatch(routeSource, /router\.delete\('\/api\/setores\/:id',\s*deleteSetor\)/);
});

test('GET /api/setores/:id continua protegido por requireUnitScope no backend', () => {
  assert.match(routeSource, /router\.get\('\/api\/setores\/:id', withLoginAndRequiredUnitScope\(getSetor\)\);/);
  assert.doesNotMatch(routeSource, /router\.get\('\/api\/setores\/:id',\s*getSetor\)/);
});