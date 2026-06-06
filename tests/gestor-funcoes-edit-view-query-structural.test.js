import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const VIEW_PATH = path.join(process.cwd(), 'views/gestor/funcoes.ejs');
const ROUTE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/routes/funcaoApi.js');

const viewSource = fs.readFileSync(VIEW_PATH, 'utf8');
const routeSource = fs.readFileSync(ROUTE_PATH, 'utf8');

test('editar na view envia unidade_id na query do GET /api/funcoes/:id usando unidade_principal_id da linha', () => {
  assert.match(viewSource, /const funcaoUnidadePrincipalId = String\(\(funcao\.unidade_principal_id/);
  assert.match(viewSource, /onclick="editar\('<%= funcao\._id %>', '<%= funcaoUnidadePrincipalId %>'\)"/);
  assert.match(viewSource, /window\.editar = function\(id, unidadePrincipalId\)\{/);
  assert.match(viewSource, /const unidadeId = String\(unidadePrincipalId \|\| ''\)\.trim\(\);/);
  assert.match(viewSource, /const query = unidadeId \? \('\?unidade_id=' \+ encodeURIComponent\(unidadeId\)\) : '';/);
  assert.match(viewSource, /fetch\(BASE \+ '\/api\/funcoes\/' \+ encodeURIComponent\(id\) \+ query\)/);
});

test('submit de edicao envia unidade_id na query do PUT /api/funcoes/:id com fonte em unidade_principal_id real', () => {
  assert.match(viewSource, /const scopedUnidadeId = String\(form\.dataset\.unidadePrincipalId \|\| payload\.unidade_principal_id \|\| ''\)\.trim\(\);/);
  assert.match(viewSource, /const query = \(isUpdate && scopedUnidadeId\) \? \('\?unidade_id=' \+ encodeURIComponent\(scopedUnidadeId\)\) : '';/);
  assert.match(viewSource, /\? \(BASE \+ '\/api\/funcoes\/' \+ encodeURIComponent\(hiddenId\.value\) \+ query\)/);
  assert.match(viewSource, /form\.dataset\.unidadePrincipalId = String\(document\.getElementById\('unidade_principal_id'\)\.value \|\| ''\)\.trim\(\);/);
  assert.match(viewSource, /form\.dataset\.unidadePrincipalId = String\(unidId \|\| ''\)\.trim\(\);/);
});

test('excluir na view envia unidade_id na query do DELETE /api/funcoes/:id com fonte em unidade_principal_id real', () => {
  assert.match(viewSource, /onclick="excluir\('<%= funcao\._id %>', '<%= encodeURIComponent\(funcao\.nome \|\| ''\) %>', '<%= funcaoUnidadePrincipalId %>'\)"/);
  assert.match(viewSource, /window\.excluir = async function\(id, nomeEncoded, unidadePrincipalId\)\{/);
  assert.match(viewSource, /const scopedUnidadeId = String\(unidadePrincipalId \|\| form\.dataset\.unidadePrincipalId \|\| ''\)\.trim\(\);/);
  assert.match(viewSource, /const query = '\?unidade_id=' \+ encodeURIComponent\(scopedUnidadeId\);/);
  assert.match(viewSource, /fetch\(BASE \+ '\/api\/funcoes\/' \+ encodeURIComponent\(id\) \+ query, \{ method:'DELETE'/);
});

test('GET /api/funcoes/:id continua protegido por requireUnitScope no backend', () => {
  assert.match(routeSource, /router\.get\('\/api\/funcoes\/:id', withLoginAndRequiredUnitScope\(getFuncao\)\);/);
  assert.doesNotMatch(routeSource, /router\.get\('\/api\/funcoes\/:id',\s*getFuncao\)/);
});
