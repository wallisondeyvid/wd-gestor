import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const AUTH_ROUTE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/routes/auth.js');
const AUTH_ROUTE_SOURCE = fs.readFileSync(AUTH_ROUTE_PATH, 'utf8');

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

test('auth.js registra apenas um winner local para POST /esqueci-senha e /esquecisenha no sub-app Gestor', () => {
  const source = stripComments(AUTH_ROUTE_SOURCE);
  const dashedMatches = source.match(/router\.post\(\s*['"]\/esqueci-senha['"]/g) || [];
  const plainMatches = source.match(/router\.post\(\s*['"]\/esquecisenha['"]/g) || [];

  assert.equal(dashedMatches.length, 1);
  assert.equal(plainMatches.length, 1);
  assert.doesNotMatch(source, /res\.redirect\(308, '\/gestor\/esqueci-senha'/);
  assert.doesNotMatch(source, /res\.redirect\(308, '\/gestor\/esquecisenha'/);
});