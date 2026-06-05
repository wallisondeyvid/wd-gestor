import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { dispatchModuleBootstraps } from '../src/modules/gestor/app/services/unit-provisioning/module-bootstrap/dispatchModuleBootstraps.js';

const MODAL_SOURCE_PATH = path.join(
  process.cwd(),
  'public/gestor/js/modals/detalhes_unidades.js',
);
const MODAL_SOURCE = fs.readFileSync(MODAL_SOURCE_PATH, 'utf8');

function extractSourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0, `Nao encontrou marcador inicial: ${startMarker}`);
  assert.ok(end > start, `Nao encontrou marcador final: ${endMarker}`);
  return source.slice(start, end);
}

function loadHistoricoRenderer() {
  const snippet = extractSourceBetween(
    MODAL_SOURCE,
    'function renderizarBadgeHistoricoScope(scope){',
    'function ensureProvisioningRetryDelegation(modalRoot){',
  );

  const context = {
    escaparHtml: (value) => String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;'),
    formatarDataHora: (value) => String(value || '--'),
    formatarDataHoraTexto: (value) => String(value || '--'),
    formatarNomeModuloProvisioning: (value) => {
      const normalized = String(value || '').trim().toLowerCase();
      if (!normalized) return '';
      if (normalized.includes('portal')) return 'Portal do Morador';
      return String(value || '').trim();
    },
    result: null,
  };

  const script = new vm.Script(`${snippet}\nresult = { renderizarSecaoHistoricoProvisionamento };`);
  script.runInNewContext(context);
  return context.result.renderizarSecaoHistoricoProvisionamento;
}

test('dispatchModuleBootstraps trata Gestor e Portal do Morador como modulos conhecidos sem bootstrap obrigatorio', async () => {
  const result = await dispatchModuleBootstraps({
    unidadeId: 'u-1',
    dbName: 'wdgestor_unit_u-1',
    modulosHabilitados: ['Gestor', 'Portal do Morador'],
    repository: {
      findGlobalModulosByIds: async () => [],
    },
  });

  assert.deepEqual(result.resolvedModuleKeys, ['gestor', 'portal-morador']);
  assert.deepEqual(result.unknownModules, []);
  assert.deepEqual(result.noBootstrapRequiredModuleKeys, ['gestor', 'portal-morador']);
  assert.deepEqual(result.executedModuleKeys, []);
});

test('historico do modal usa requestedModule legado quando moduleKey esta ausente', () => {
  const renderizarSecaoHistoricoProvisionamento = loadHistoricoRenderer();
  const container = { innerHTML: '' };

  renderizarSecaoHistoricoProvisionamento(container, {
    loaded: true,
    events: [
      {
        createdAt: '2026-03-24T10:00:00.000Z',
        scope: 'module',
        moduleKey: null,
        metadata: { requestedModule: 'Portal do Morador' },
        eventType: 'module_bootstrap_unmapped',
        operation: 'ensure',
        status: 'error',
        message: 'Modulo sem bootstrap registrado: Portal do Morador',
      },
      {
        createdAt: '2026-03-24T09:00:00.000Z',
        scope: 'unit',
        moduleKey: null,
        eventType: 'unit_provisioning_started',
        operation: 'ensure',
        status: 'started',
        message: 'Provisioning iniciado',
      },
    ],
    lastUpdatedAt: '2026-03-24T10:05:00.000Z',
  });

  assert.match(container.innerHTML, /Portal do Morador/);
  assert.match(container.innerHTML, /--/);
});