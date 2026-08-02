import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const filePath = path.resolve(process.cwd(), 'src/modules/condominios/app/condominios-app.js');

async function readSource() {
  return fs.readFile(filePath, 'utf8');
}

test('Condominios bloqueia API legada de mensagens antes das rotas antigas', async () => {
  const source = await readSource();

  const blockerIndex = source.indexOf("app.use('/api/msg', (req, res) => {");
  const firstLegacyRouteIndex = source.indexOf("app.get('/api/msg/messages/:id', async (req, res) => {");

  assert.notEqual(blockerIndex, -1, 'bloqueio /api/msg nao encontrado');
  assert.notEqual(firstLegacyRouteIndex, -1, 'primeira rota legada /api/msg nao encontrada');
  assert.ok(
    blockerIndex < firstLegacyRouteIndex,
    'bloqueio /api/msg deve vir antes das rotas legadas'
  );

  const blockerBlock = source.slice(blockerIndex, firstLegacyRouteIndex);

  assert.match(blockerBlock, /res\.status\(410\)\.json\(\{/);
  assert.match(blockerBlock, /Caixa de Mensagens migrada para \/mensagens\/api\/msg/);
});
