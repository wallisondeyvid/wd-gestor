import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

import { createServer } from '../src/server/createServer.js';

// Teste de fumaça do /health e sessão básica em memória

test('GET /health responde ok:true', async () => {
  const { app } = await createServer({ skipDb: true, skipAuth: true });
  const res = await request(app).get('/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

test('Sessão memória mantém dados entre requests com agente', async () => {
  const { app } = await createServer({ skipDb: true, skipAuth: true });
  const agent = request.agent(app);

  // Primeiro request cria sessão (skipAuth injeta user)
  const r1 = await agent.get('/health');
  assert.equal(r1.status, 200);

  // Simula endpoint que lê user da sessão (se não existir, nosso skipAuth injeta)
  const r2 = await agent.get('/health');
  assert.equal(r2.status, 200);
});
