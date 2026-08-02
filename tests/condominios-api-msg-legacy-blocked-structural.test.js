import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const filePath = path.resolve(process.cwd(), 'src/modules/condominios/app/condominios-app.js');

async function readSource() {
  return fs.readFile(filePath, 'utf8');
}

test('Condominios bloqueia API legada de mensagens e nao registra rotas antigas', async () => {
  const source = await readSource();

  const blockerIndex = source.indexOf("app.use('/api/msg', (req, res) => {");
  assert.notEqual(blockerIndex, -1, 'bloqueio /api/msg nao encontrado');

  const afterBlocker = source.slice(blockerIndex);

  assert.match(afterBlocker, /res\.status\(410\)\.json\(\{/);
  assert.match(afterBlocker, /Caixa de Mensagens migrada para \/mensagens\/api\/msg/);

  const legacyRoutePattern = /app\.(get|post|put|patch|delete)\('\/api\/msg(?:\/|')/;
  assert.doesNotMatch(
    source,
    legacyRoutePattern,
    'nao deve haver rotas HTTP legadas app.get/post/put/patch/delete em /api/msg'
  );

  assert.match(
    source,
    /Rotas HTTP legadas de Caixa de Mensagens removidas\./,
    'comentario de remocao do bloco legado deve existir'
  );
});
