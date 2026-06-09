import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const files = [
  'public/js/condominios/cadastrar_areas_comuns.js',
  'public/js/condominios/cadastrar_garagem.js',
  'public/js/condominios/cadastrar_habitacao.js',
  'public/js/condominios/cadastrar_materiais.js',
  'public/js/condominios/cadastrar_morador.js',
  'public/js/condominios/cadastrar_proprietario.js',
  'public/js/condominios/editar_area_comum.js',
  'public/js/condominios/editar_habitacao.js',
];

test('telas de cadastro e edicao do Condominios usam endpoint de logo do proprio modulo', () => {
  for (const relativePath of files) {
    const source = fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');

    assert.doesNotMatch(
      source,
      /raw\.push\('\/gestor\/api\/unidades\/' \+ encodeURIComponent\(uid\) \+ '\/logo'\);/,
      `${relativePath} nao deve chamar /gestor/api/unidades/:id/logo`,
    );

    assert.match(
      source,
      /base\.replace\(\/\\\/\+\$\/,\s*''\) \+ '\/api\/unidades\/' \+ encodeURIComponent\(uid\) \+ '\/logo'/,
      `${relativePath} deve priorizar basePath/api/unidades/:id/logo`,
    );
  }
});
