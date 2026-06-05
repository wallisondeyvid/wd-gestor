import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readWorkspaceFile(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

const VIEW_SOURCE = readWorkspaceFile('views/gestor/unidades.ejs');
const DEBUG_HELPER_SOURCE = readWorkspaceFile('public/gestor/js/core/debug-flags.js');
const UNIDADES_SOURCE = readWorkspaceFile('public/gestor/js/pages/unidades.js');
const BANCO_SOURCE = readWorkspaceFile('public/gestor/js/modals/banco.js');
const CNAE_SECUNDARIO_SOURCE = readWorkspaceFile('public/gestor/js/modals/cnae_secundario.js');
const FETCH_JSON_SOURCE = readWorkspaceFile('public/gestor/js/utils/fetch-json.js');
const DATA_URL_SOURCE = readWorkspaceFile('public/gestor/js/utils/data-url.js');
const MASKS_SOURCE = readWorkspaceFile('public/gestor/js/core/masks.js');
const MASKS_GLOBAL_SOURCE = readWorkspaceFile('public/gestor/js/core/masks-global.js');
const DATES_GLOBAL_SOURCE = readWorkspaceFile('public/gestor/js/core/dates-global.js');
const DATEPICKER_INIT_SOURCE = readWorkspaceFile('public/gestor/js/core/datepicker-init.js');
const VALIDATORS_SOURCE = readWorkspaceFile('public/gestor/js/core/validators.js');
const PERFIL_SOURCE = readWorkspaceFile('public/js/perfil-modulo.js');

test('Unidades carrega helper de debug antes dos assets com logs de inicializacao', () => {
  assert.match(
    VIEW_SOURCE,
    /<script src="<%= _basePath %>\/js\/core\/debug-flags\.js\?v=1"><\/script>[\s\S]*<script src="<%= _basePath %>\/js\/core\/masks\.js"><\/script>/,
  );

  assert.match(
    VIEW_SOURCE,
    /WDGDebug\?\.log\?\.\(\['WDG_DEBUG_UNIDADES','WDG_DEBUG_GESTOR_ASSETS'\], 'info', '\[unidades\] build assets v3'/,
  );
});

test('helper de debug suporta flag global e localStorage sem monkey patch de console', () => {
  assert.match(DEBUG_HELPER_SOURCE, /function enabled\(flags\)/);
  assert.match(DEBUG_HELPER_SOURCE, /localStorage\?\.getItem\(flagName\) === '1'/);
  assert.match(DEBUG_HELPER_SOURCE, /global\.WDGDebug = \{ enabled, log \};/);
  assert.doesNotMatch(DEBUG_HELPER_SOURCE, /console\s*=|window\.console\s*=/);
});

test('logs verbosos de unidades e modais ficam protegidos por flag', () => {
  assert.match(UNIDADES_SOURCE, /function debugLog\(message, payload\)/);
  assert.match(UNIDADES_SOURCE, /window\.WDGDebug\?\.log\?\.\('WDG_DEBUG_UNIDADES', 'debug', '\[unidades\.js\] carregado/);
  assert.doesNotMatch(UNIDADES_SOURCE, /console\.log\('\[unidades\.js\] Inicializando máscaras:/);
  assert.doesNotMatch(UNIDADES_SOURCE, /console\.log\('\[EDITAR\] pessoaTipo:/);

  assert.match(BANCO_SOURCE, /const debugLog = .*WDGDebug\?\.log\?\.\('WDG_DEBUG_UNIDADES', 'debug'/);
  assert.doesNotMatch(BANCO_SOURCE, /console\.debug\('\[Modal Banco\] Inicializando handlers/);

  assert.match(CNAE_SECUNDARIO_SOURCE, /const debugLog = .*WDGDebug\?\.log\?\.\('WDG_DEBUG_UNIDADES', 'debug'/);
  assert.doesNotMatch(CNAE_SECUNDARIO_SOURCE, /console\.debug\('\[cnae_secundario\] carregado itens:/);
});

test('helpers globais carregados por Unidades protegem logs de inicializacao por flag de assets', () => {
  assert.match(FETCH_JSON_SOURCE, /const DEBUG_FLAGS = \['WDG_DEBUG_UNIDADES', 'WDG_DEBUG_GESTOR_ASSETS'\];/);
  assert.doesNotMatch(FETCH_JSON_SOURCE, /console\.info\('\[wdgFetchGestorJson\] inicializado/);
  assert.doesNotMatch(DATA_URL_SOURCE, /console\.info\('\[wdgDataUrl\] carregado/);
  assert.doesNotMatch(MASKS_SOURCE, /console\.log\('\[MASKS\] WDMasks/);
  assert.doesNotMatch(MASKS_GLOBAL_SOURCE, /console\.log\(TAG, 'Marcando canonical loaded'/);
  assert.doesNotMatch(VALIDATORS_SOURCE, /console\.debug\('\[validators\] carregado'\)/);
});

test('logs transitórios de datepicker e perfil modular também ficam protegidos por flag', () => {
  assert.match(DATES_GLOBAL_SOURCE, /const DEBUG_FLAGS = \['WDG_DEBUG_UNIDADES', 'WDG_DEBUG_GESTOR_ASSETS'\];/);
  assert.match(DATES_GLOBAL_SOURCE, /log\('flatpickr indisponível no momento do enhance\(\) – execução adiada\.', 'debug'\)/);
  assert.match(DATEPICKER_INIT_SOURCE, /debugLog\('\[datepicker-init\] flatpickr indisponível no momento'\)/);
  assert.doesNotMatch(PERFIL_SOURCE, /console\.log\(logPrefix, 'inicializando com basePath ='/);
  assert.match(PERFIL_SOURCE, /const infoLog = .*WDGDebug\?\.log\?\.\(DEBUG_FLAGS, 'info'/);
});