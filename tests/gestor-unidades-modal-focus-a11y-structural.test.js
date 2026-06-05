import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const UNIDADES_VIEW_SOURCE = fs.readFileSync(
  path.join(process.cwd(), 'views/gestor/unidades.ejs'),
  'utf8',
);

const HELPER_SOURCE = fs.readFileSync(
  path.join(process.cwd(), 'public/gestor/js/core/modal-focus-safe-close.js'),
  'utf8',
);

const SCRIPT_SOURCES = {
  natureza: fs.readFileSync(path.join(process.cwd(), 'public/gestor/js/modals/natureza_juridica.js'), 'utf8'),
  cnaePrincipal: fs.readFileSync(path.join(process.cwd(), 'public/gestor/js/modals/cnae_principal.js'), 'utf8'),
  cnaeSecundario: fs.readFileSync(path.join(process.cwd(), 'public/gestor/js/modals/cnae_secundario.js'), 'utf8'),
  banco: fs.readFileSync(path.join(process.cwd(), 'public/gestor/js/modals/banco.js'), 'utf8'),
  modulos: fs.readFileSync(path.join(process.cwd(), 'public/gestor/js/modals/selecionar_modulos.js'), 'utf8'),
};

test('Unidades carrega o helper de fechamento foco-seguro antes dos modais', () => {
  assert.match(
    UNIDADES_VIEW_SOURCE,
    /<script src="<%= _basePath %>\/js\/core\/modal-focus-safe-close\.js\?v=1"><\/script>[\s\S]*<script src="<%= _basePath %>\/js\/modals\/banco\.js\?v=5"><\/script>/,
  );
});

test('helper de modal desfoca no hide e devolve foco no hidden', () => {
  assert.match(HELPER_SOURCE, /modalEl\.addEventListener\('hide\.bs\.modal', \(\) => \{[\s\S]*blurActiveWithin\(modalEl\);[\s\S]*\}\);/);
  assert.match(HELPER_SOURCE, /modalEl\.addEventListener\('hidden\.bs\.modal', \(\) => \{[\s\S]*resolveReturnFocus\([\s\S]*focusElement\(target\)[\s\S]*\}\);/);
  assert.match(HELPER_SOURCE, /global\.wdgModalFocusSafe = \{ install \};/);
});

test('modal de Natureza Juridica usa o helper ao abrir e ao fechar', () => {
  assert.match(SCRIPT_SOURCES.natureza, /function focusSafeController\(\)\{[\s\S]*wdgModalFocusSafe\?\.install/);
  assert.match(SCRIPT_SOURCES.natureza, /rememberReturnFocus\(document\.activeElement\)/);
  assert.match(SCRIPT_SOURCES.natureza, /focusSafe\.hide\(inputTarget\)/);
});

test('modal de CNAE Principal usa o helper ao confirmar', () => {
  assert.match(SCRIPT_SOURCES.cnaePrincipal, /wdgModalFocusSafe\?\.install\?\.\(modalEl, \{[\s\S]*campoDestino/);
  assert.match(SCRIPT_SOURCES.cnaePrincipal, /focusSafe\.hide\(campoDestino\)/);
});

test('modal de CNAE Secundario usa o helper ao confirmar e ao lembrar o gatilho', () => {
  assert.match(SCRIPT_SOURCES.cnaeSecundario, /wdgModalFocusSafe\?\.install\?\.\(modalEl, \{[\s\S]*campoDestino \|\| abrirBtn/);
  assert.match(SCRIPT_SOURCES.cnaeSecundario, /focusSafe\.hide\(campoDestino \|\| abrirBtn\)/);
  assert.match(SCRIPT_SOURCES.cnaeSecundario, /focusSafe\?\.rememberReturnFocus\(abrirBtn\)/);
});

test('modal de Banco usa o helper ao confirmar', () => {
  assert.match(SCRIPT_SOURCES.banco, /wdgModalFocusSafe\?\.install\?\.\(modal, \{[\s\S]*getTargetInput\(\)/);
  assert.match(SCRIPT_SOURCES.banco, /focusSafe\.hide\(tgt\)/);
});

test('modal de Modulos usa o helper ao salvar', () => {
  assert.match(SCRIPT_SOURCES.modulos, /wdgModalFocusSafe\?\.install\?\.\(modalEl, \{/);
  assert.match(SCRIPT_SOURCES.modulos, /focusSafe\.hide\(\)/);
});
