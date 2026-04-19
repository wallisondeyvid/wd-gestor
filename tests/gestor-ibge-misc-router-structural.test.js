import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const ROUTE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/routes/miscApi.js');
const ROUTE_SOURCE = fs.readFileSync(ROUTE_PATH, 'utf8');

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

test('miscApi deixa de registrar a rota sombreada /ibge e preserva apenas o corredor de cluster', () => {
  const source = stripComments(ROUTE_SOURCE);

  assert.doesNotMatch(source, /router\.get\(\s*['"]\/ibge['"]/);
  assert.match(source, /router\.get\(\s*['"]\/unidades\/cluster['"]/);
  assert.match(source, /withLoginAndRequiredUnitScope\(obterClusterUnidades\)/);
});