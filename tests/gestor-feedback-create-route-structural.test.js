import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROUTE_SOURCE = fs.readFileSync(
  path.join(process.cwd(), 'src/modules/gestor/app/routes/feedbackApi.js'),
  'utf8',
);

test('feedback create semeia unitScope opcional a partir do auth context ou da sessão', () => {
  assert.match(
    ROUTE_SOURCE,
    /req\.unitScope\?\.unidadeId[\s\S]*req\.session\?\.gestorAuthContext\?\.active_unidade_id[\s\S]*req\.session\?\.user\?\.unidade_id/,
  );
});

test('feedback create expõe uma única rota autenticada com unitScope opcional e sem requireUnitScope', () => {
  const createRouteMatches = ROUTE_SOURCE.match(/router\.post\('\/api\/feedback',[^\n]+createFeedbackHandler\);/g) || [];

  assert.equal(createRouteMatches.length, 1);
  assert.match(
    createRouteMatches[0],
    /router\.post\('\/api\/feedback',\s*requireLogin,\s*seedOptionalFeedbackUnitScope,\s*createFeedbackHandler\);/,
  );
  assert.doesNotMatch(createRouteMatches[0], /requireUnitScope/);
});