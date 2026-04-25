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

test('GET e PUT /condominios/api/msg/admin/settings usam helper canônico mínimo de unidade e autorização', async () => {
  const source = await readSource();
  assert.match(source, /function prepareMsgAdminSettingsContext\(/);

  const getBlock = extractRouteBlock(source, "app.get('/api/msg/admin/settings', async (req, res) => {");
  assert.match(
    getBlock,
    /const adminSettingsContext = prepareMsgAdminSettingsContext\([\s\S]*?unidadeId: String\(req\.query\?\.unidade_id \|\| req\.query\?\.unidadeId \|\| req\.query\?\.unidade \|\| ''\)\.trim\(\),[\s\S]*?const \{ unidadeId \} = adminSettingsContext;/
  );
  assert.doesNotMatch(getBlock, /if \(!unidadeId \|\| !mongoose\.isValidObjectId\(unidadeId\)\)/);
  assert.doesNotMatch(getBlock, /userCanMsgAdminForUnidade\(ctxUser, unidadeId\)/);

  const putBlock = extractRouteBlock(source, "app.put('/api/msg/admin/settings', express.json({ limit: '200kb' }), async (req, res) => {");
  assert.match(
    putBlock,
    /const adminSettingsContext = prepareMsgAdminSettingsContext\([\s\S]*?unidadeId: String\(req\.body\?\.unidade_id \|\| req\.body\?\.unidadeId \|\| req\.query\?\.unidade_id \|\| ''\)\.trim\(\),[\s\S]*?const \{ unidadeId \} = adminSettingsContext;/
  );
  assert.doesNotMatch(putBlock, /if \(!unidadeId \|\| !mongoose\.isValidObjectId\(unidadeId\)\)/);
  assert.doesNotMatch(putBlock, /userCanMsgAdminForUnidade\(ctxUser, unidadeId\)/);
});