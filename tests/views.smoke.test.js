import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createServer } from '../src/server/createServer.js';

const pages = [
  '/dashboard',
  '/usuarios',
  '/unidades',
  '/modulos',
  '/funcoes',
  '/funcionarios',
  '/recursos',
  '/setores'
];

let app; let registerErrorHandlers;
test('setup views server (skipDb, skipAuth)', async () => {
  const built = await createServer({ skipDb: true, skipAuth: true, deferErrorHandlers: true });
  app = built.app; registerErrorHandlers = built.registerErrorHandlers; await Promise.resolve(registerErrorHandlers());
});

for (const page of pages) {
  test(`GET ${page} deve responder HTML (skipAuth)`, async () => {
    const res = await request(app).get(page).set('Accept', 'text/html');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'] || '', /text\/html/i);
  });
}
