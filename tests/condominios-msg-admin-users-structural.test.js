import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const filePath = path.resolve(process.cwd(), 'src/modules/condominios/app/condominios-app.js');

async function readSource() {
  return fs.readFile(filePath, 'utf8');
}

function extractRouteBlock(source, routeSignature) {
  const start = source.indexOf(routeSignature);
  assert.notEqual(start, -1, `rota não encontrada: ${routeSignature}`);

  const end = source.indexOf("\napp.", start + routeSignature.length);
  if (end === -1) return source.slice(start);
  return source.slice(start, end);
}

test('GET /condominios/api/msg/admin/users usa helper canônico mínimo de unidade e autorização', async () => {
  const source = await readSource();
  assert.match(source, /function prepareMsgAdminSettingsContext\(/);

  const routeBlock = extractRouteBlock(source, "app.get('/api/msg/admin/users', async (req, res) => {");
  assert.match(
    routeBlock,
    /const adminSettingsContext = prepareMsgAdminSettingsContext\([\s\S]*?unidadeId: String\(req\.query\?\.unidade_id \|\| req\.query\?\.unidadeId \|\| req\.query\?\.unidade \|\| ''\)\.trim\(\),[\s\S]*?const \{ unidadeId \} = adminSettingsContext;/
  );
  assert.doesNotMatch(routeBlock, /if \(!unidadeId \|\| !mongoose\.isValidObjectId\(unidadeId\)\)/);
  assert.doesNotMatch(routeBlock, /userCanMsgAdminForUnidade\(ctxUser, unidadeId\)/);
});