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

test('auth.js registra apenas um winner local para GET /api/recover/emails no sub-app Gestor', () => {
  const source = stripComments(AUTH_ROUTE_SOURCE);
  const getMatches = source.match(/router\.get\(\s*['"]\/api\/recover\/emails['"]/g) || [];

  assert.equal(getMatches.length, 1);
  assert.doesNotMatch(source, /res\.redirect\(302, '\/gestor\/api\/recover\/emails'/);
});