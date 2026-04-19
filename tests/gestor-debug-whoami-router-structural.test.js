import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const API_ROUTE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/routes/api.js');
const PAGES_ROUTE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/routes/pagesRouter.js');

const API_ROUTE_SOURCE = fs.readFileSync(API_ROUTE_PATH, 'utf8');
const PAGES_ROUTE_SOURCE = fs.readFileSync(PAGES_ROUTE_PATH, 'utf8');

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

test('GET /api/debug/whoami permanece apenas no winner runtime de pagesRouter', () => {
  const apiSource = stripComments(API_ROUTE_SOURCE);
  const pagesSource = stripComments(PAGES_ROUTE_SOURCE);

  assert.doesNotMatch(apiSource, /router\.get\(\s*['"]\/api\/debug\/whoami['"]/);
  assert.match(apiSource, /router\.get\(\s*['"]\/api\/debug\/session['"]/);
  assert.match(pagesSource, /router\.get\(\s*['"]\/api\/debug\/whoami['"]/);
});