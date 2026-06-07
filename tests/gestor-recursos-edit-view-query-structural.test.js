import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const VIEW_PATH = path.join(process.cwd(), 'views/gestor/recursos.ejs');
const PAGE_JS_PATH = path.join(process.cwd(), 'public/gestor/js/pages/recursos.js');
const ROUTE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/routes/recursoApi.js');

const viewSource = fs.readFileSync(VIEW_PATH, 'utf8');
const pageJsSource = fs.readFileSync(PAGE_JS_PATH, 'utf8');
const routeSource = fs.readFileSync(ROUTE_PATH, 'utf8');

test('view de Recursos carrega o page script dedicado', () => {
	assert.match(viewSource, /<script src="\/gestor\/js\/pages\/recursos\.js"><\/script>/);
});

test('lista de Recursos preserva o ObjectId real da unidade na linha e nos botoes de acao', () => {
	assert.match(pageJsSource, /function getRecursoUnidadeId\(recurso\)\{/);
	assert.match(pageJsSource, /recurso\?\.unidade_id\?\._id/);
	assert.match(pageJsSource, /recurso\?\.unidade_id\?\.id/);
	assert.match(pageJsSource, /typeof recurso\?\.unidade_id === 'string' \? recurso\.unidade_id : ''/);
	assert.match(pageJsSource, /recurso\?\.unidadeId/);
	assert.match(pageJsSource, /recurso\?\.unidade_principal_id\?\._id/);
	assert.match(pageJsSource, /recurso\?\.unidadePrincipalId/);
	assert.match(pageJsSource, /const recursoUnidadeId = getRecursoUnidadeId\(recurso\);/);
	assert.match(pageJsSource, /<tr data-recurso-id="\$\{recurso\._id\}" data-unidade-id="\$\{recursoUnidadeId\}">/);
	assert.match(pageJsSource, /data-action="editar" data-id="\$\{recurso\._id\}" data-unidade-id="\$\{recursoUnidadeId\}"/);
	assert.match(pageJsSource, /data-action="excluir" data-id="\$\{recurso\._id\}" data-unidade-id="\$\{recursoUnidadeId\}"/);
	assert.doesNotMatch(pageJsSource, /data-unidade-id="\$\{recurso\.unidade_id\?\.nome/);
	assert.doesNotMatch(pageJsSource, /data-unidade-id="\$\{recurso\.codigo/);
});

test('editar recurso usa unidade_id na query do GET e guarda o escopo no formulario', () => {
	assert.match(pageJsSource, /function buildScopedResourceUrl\(id, unidadeId\)\{/);
	assert.match(pageJsSource, /return `\$\{basePath\}\/api\/recursos\/\$\{id\}\?unidade_id=\$\{encodeURIComponent\(scopedUnidadeId\)\}`;/);
	assert.match(pageJsSource, /window\.editarRecurso = async \(id, unidadeId\) => \{/);
	assert.match(pageJsSource, /const scopedUnidadeId = String\(unidadeId \|\| ''\)\.trim\(\);/);
	assert.match(pageJsSource, /if \(!isObjectId\(scopedUnidadeId\)\) \{/);
	assert.match(pageJsSource, /alert\('Falha ao carregar recurso: unidade não informada ou inválida\.'\);/);
	assert.match(pageJsSource, /const response = await fetch\(buildScopedResourceUrl\(id, scopedUnidadeId\)\);/);
	assert.match(pageJsSource, /const recursoUnidadeId = getRecursoUnidadeId\(recurso\) \|\| scopedUnidadeId;/);
	assert.match(pageJsSource, /form\.dataset\.unidadeId = recursoUnidadeId;/);
	assert.match(pageJsSource, /if\(action === 'editar'\) return editarRecurso\(id, unidadeId\);/);
});

test('salvar edicao usa unidade_id na query do PUT e aborta sem ObjectId valido', () => {
	assert.match(pageJsSource, /const scopedUnidadeId = String\(form\.dataset\.unidadeId \|\| processedData\.unidade_id \|\| ''\)\.trim\(\);/);
	assert.match(pageJsSource, /if \(isUpdate\) \{/);
	assert.match(pageJsSource, /alert\('Falha ao salvar recurso: unidade não informada ou inválida\.'\);/);
	assert.match(pageJsSource, /form\.dataset\.unidadeId = scopedUnidadeId;/);
	assert.match(pageJsSource, /const updateUrl = buildScopedResourceUrl\(recursoId, scopedUnidadeId\);/);
	assert.match(pageJsSource, /const response = await fetch\(isUpdate \? updateUrl : `\$\{basePath\}\/api\/recursos`, \{/);
	assert.match(pageJsSource, /delete form\.dataset\.unidadeId;/);
	assert.match(pageJsSource, /form\.reset\(\); delete form\.dataset\.unidadeId; update\(\);/);
});

test('excluir recurso usa unidade_id na query do DELETE e aborta sem ObjectId valido', () => {
	assert.match(pageJsSource, /window\.excluirRecurso = async \(id, label, unidadeId\) => \{/);
	assert.match(pageJsSource, /const scopedUnidadeId = String\(unidadeId \|\| ''\)\.trim\(\);/);
	assert.match(pageJsSource, /alert\('Falha ao excluir recurso: unidade não informada ou inválida\.'\);/);
	assert.match(pageJsSource, /const response = await fetch\(buildScopedResourceUrl\(id, scopedUnidadeId\), \{/);
	assert.match(pageJsSource, /method: 'DELETE'/);
	assert.match(pageJsSource, /const unidadeId = btn\.getAttribute\('data-unidade-id'\) \|\| btn\.closest\('tr'\)\?\.getAttribute\('data-unidade-id'\) \|\| '';/);
	assert.match(pageJsSource, /return excluirRecurso\(id, label, unidadeId\);/);
});

test('rotas por id de Recursos continuam protegidas por requireUnitScope no backend', () => {
	assert.match(routeSource, /router\.get\('\/api\/recursos\/:id', withLoginAndRequiredUnitScope\(getRecurso\)\);/);
	assert.match(routeSource, /router\.put\('\/api\/recursos\/:id', withLoginAndRequiredUnitScope\(updateRecurso\)\);/);
	assert.match(routeSource, /router\.delete\('\/api\/recursos\/:id', withLoginAndRequiredUnitScope\(deleteRecurso\)\);/);
	assert.doesNotMatch(routeSource, /router\.get\('\/api\/recursos\/:id',\s*getRecurso\)/);
	assert.doesNotMatch(routeSource, /router\.put\('\/api\/recursos\/:id',\s*updateRecurso\)/);
	assert.doesNotMatch(routeSource, /router\.delete\('\/api\/recursos\/:id',\s*deleteRecurso\)/);
});