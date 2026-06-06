import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROUTE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/routes/funcaoApi.js');
const REQUIRE_UNIT_SCOPE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/middlewares/requireUnitScope.js');

const routeSource = fs.readFileSync(ROUTE_PATH, 'utf8');
const requireUnitScopeSource = fs.readFileSync(REQUIRE_UNIT_SCOPE_PATH, 'utf8');

test('create de funcoes usa derivacao de escopo apenas na rota de create', () => {
  assert.match(routeSource, /function resolveCreateFuncaoScopedUnitIdFromBody\(req\) \{/);
  assert.match(routeSource, /body\.unidade_principal_id/);
  assert.match(routeSource, /body\.unidadePrincipal/);
  assert.match(
    routeSource,
    /function withLoginAndRequiredUnitScopeForCreate\(handler\) \{[\s\S]*?const scopedUnitCandidate = resolveCreateFuncaoScopedUnitIdFromBody\(req\);[\s\S]*?return requireUnitScope\(req, res, \(\) => \{/,
  );
  assert.match(routeSource, /router\.post\('\/api\/funcoes', withLoginAndRequiredUnitScopeForCreate\(createFuncao\)\);/);

  assert.match(routeSource, /router\.get\('\/api\/funcoes', withLoginAndRequiredUnitScope\(listarFuncoesApi\)\);/);
  assert.match(routeSource, /router\.put\('\/api\/funcoes\/:id', withLoginAndRequiredUnitScope\(updateFuncao\)\);/);
  assert.match(routeSource, /router\.delete\('\/api\/funcoes\/:id', withLoginAndRequiredUnitScope\(deleteFuncao\)\);/);
});

test('requireUnitScope global permanece sem aceitar unidadePrincipal ou unidade_principal_id', () => {
  assert.doesNotMatch(requireUnitScopeSource, /body\?\.unidade_principal_id|body\?\.unidadePrincipal|body\?\.unidadePrincipalId/);
  assert.match(requireUnitScopeSource, /req\?\.body\?\.unidadeId/);
  assert.match(requireUnitScopeSource, /req\?\.body\?\.unidade_id/);
});
