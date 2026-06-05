import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const PRINCIPAL_SOURCE = fs.readFileSync(
  path.join(process.cwd(), 'public/gestor/js/modals/cnae_principal.js'),
  'utf8',
);

const SECUNDARIO_SOURCE = fs.readFileSync(
  path.join(process.cwd(), 'public/gestor/js/modals/cnae_secundario.js'),
  'utf8',
);

function assertUsesGestorBasePath(source, label) {
  assert.match(
    source,
    /function getBasePath\(\)\{[\s\S]*document\.body\?\.getAttribute\('data-base-path'\)[\s\S]*window\.__APP_BASE_PATH__[\s\S]*window\.basePathGlobal[\s\S]*pathname\.startsWith\('\/gestor'\) \? '\/gestor' : ''[\s\S]*return value\.endsWith\('\/'\) \? value\.slice\(0, -1\) : value;/,
    `${label} deve resolver o basePath do Gestor antes de chamar a API`,
  );

  assert.match(
    source,
    /function buildCnaesUrl\(params\)\{[\s\S]*return `\$\{getBasePath\(\)\}\/cnaes\$\{query \? `\?\$\{query\}` : ''\}`;/,
    `${label} deve construir a URL da API de CNAE com o prefixo do Gestor`,
  );

  assert.doesNotMatch(
    source,
    /const url = `?\/cnaes\?/,
    `${label} nao deve mais chamar /cnaes na raiz do host`,
  );
}

test('modal de CNAE principal usa basePath do Gestor para buscar a API', () => {
  assertUsesGestorBasePath(PRINCIPAL_SOURCE, 'cnae_principal');
});

test('modal de CNAE secundario usa basePath do Gestor para buscar a API', () => {
  assertUsesGestorBasePath(SECUNDARIO_SOURCE, 'cnae_secundario');
});