import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const SERVICE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/services/UnitProvisioningService.js');
const SOURCE = fs.readFileSync(SERVICE_PATH, 'utf8');

function extractFunctionSource(functionName) {
  const signature = `export async function ${functionName}`;
  const start = SOURCE.indexOf(signature);
  assert.ok(start >= 0, `Nao encontrou ${functionName} em UnitProvisioningService.js`);

  const braceStart = SOURCE.indexOf('{', start);
  assert.ok(braceStart >= 0, `Nao encontrou abertura de bloco de ${functionName}`);

  let depth = 0;
  for (let index = braceStart; index < SOURCE.length; index += 1) {
    const char = SOURCE[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return SOURCE.slice(start, index + 1).replace(/^export\s+/, '');
    }
  }

  throw new Error(`Nao conseguiu extrair o bloco completo de ${functionName}`);
}

function buildFunction(functionName, context = {}) {
  const functionSource = extractFunctionSource(functionName);
  const script = new vm.Script(`(${functionSource})`);
  return script.runInNewContext(context);
}

test('fachada read-only delega inspect e list diretamente ao use case canonico', async () => {
  const inspectCalls = [];
  const listCalls = [];

  const inspectUnitProvisioningBridge = async (input) => {
    inspectCalls.push(input);
    return { kind: 'inspect-result', input };
  };

  const listUnitProvisioningEventsService = async (input) => {
    listCalls.push(input);
    return [{ kind: 'event-result', input }];
  };

  const inspectUnitProvisioning = buildFunction('inspectUnitProvisioning', {
    inspectUnitProvisioningBridge,
  });
  const listUnitProvisioningAuditEvents = buildFunction('listUnitProvisioningAuditEvents', {
    listUnitProvisioningEventsService,
  });

  const inspectInput = { unidadeId: 'u-1' };
  const listInput = { unidadeId: 'u-1', limit: 25 };

  const inspectResult = await inspectUnitProvisioning(inspectInput);
  const listResult = await listUnitProvisioningAuditEvents(listInput);

  assert.deepEqual(inspectCalls, [inspectInput], 'inspectUnitProvisioning deve delegar integralmente a bridge canonica');
  assert.deepEqual(listCalls, [listInput], 'listUnitProvisioningAuditEvents deve delegar integralmente ao service local de eventos');
  assert.deepEqual(inspectResult, { kind: 'inspect-result', input: inspectInput }, 'inspectUnitProvisioning deve repassar o retorno da bridge');
  assert.deepEqual(listResult, [{ kind: 'event-result', input: listInput }], 'listUnitProvisioningAuditEvents deve repassar o retorno do service local');
});

test('fachada hibrida preserva exports read-only locais e exports com efeito externo vindos da bridge', () => {
  assert.match(
    SOURCE,
    /import\s*\{[\s\S]*inspectUnitProvisioning as inspectUnitProvisioningBridge,[\s\S]*\}\s*from\s*'#modules\/gestor\/app\/services\/apiDbBridgeService\.js';/,
    'a fachada deve importar inspect pela bridge canonica',
  );

  assert.match(
    SOURCE,
    /export\s*\{[\s\S]*ensureUnitProvisioned,[\s\S]*isUnitProvisioningValidationError,[\s\S]*retryUnitProvisioning,[\s\S]*\}\s*from\s*'#modules\/gestor\/app\/services\/apiDbBridgeService\.js';/,
    'as operacoes com efeito externo devem continuar vindo da bridge atual',
  );

  assert.match(
    SOURCE,
    /export async function inspectUnitProvisioning\(input\)\s*\{[\s\S]*return inspectUnitProvisioningBridge\(input\);[\s\S]*\}/,
    'inspectUnitProvisioning deve permanecer exportado pela fachada local e delegar a bridge',
  );

  assert.match(
    SOURCE,
    /export async function listUnitProvisioningAuditEvents\(input\)\s*\{[\s\S]*return listUnitProvisioningEventsService\(input\);[\s\S]*\}/,
    'listUnitProvisioningAuditEvents deve permanecer exportado pela fachada local e delegar ao service local',
  );
});