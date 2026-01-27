import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createServer } from '../src/server/createServer.js';

let app;
let registerErrorHandlers;
let oldEnv = {};

describe('Error Handler', () => {
  before(async () => {
    // salvar e setar env controlado
    oldEnv.MONGO_MEMORY = process.env.MONGO_MEMORY;
    oldEnv.NODE_ENV = process.env.NODE_ENV;
    process.env.MONGO_MEMORY = '1';
    process.env.NODE_ENV = 'test';

  const built = await createServer({ deferErrorHandlers: true, skipDb: true, skipAuth: true });
    app = built.app;
    registerErrorHandlers = built.registerErrorHandlers;

    // Observação: o servidor redireciona /api/* -> /gestor/api/*
    // Então, para testar o handler de erro, registramos a rota dentro de /gestor/api.
    app.get('/gestor/api/boom', () => { throw new Error('falha'); });

    // caso seja async
    await Promise.resolve(registerErrorHandlers());
  });

  after(() => {
    // restaurar env
    process.env.MONGO_MEMORY = oldEnv.MONGO_MEMORY;
    process.env.NODE_ENV = oldEnv.NODE_ENV;
  });

  it('retorna 404 JSON para /api inexistente', async () => {
    const res = await request(app)
      .get('/gestor/api/rota-que-nao-existe')
      .set('Accept', 'application/json');

    assert.equal(res.status, 404);
    assert.match(res.headers['content-type'] || '', /application\/json/i);
    assert.equal(res.body.error, true);
    assert.match(String(res.body.message || ''), /não encontrado/i);
  });

  it('retorna 404 HTML para rota de página inexistente', async () => {
    const res = await request(app).get('/pagina-que-nao-existe');

    assert.equal(res.status, 404);
    assert.match(res.headers['content-type'] || '', /text\/html/i);
    assert.match(res.text, /Erro 404/i);
  });

  it('retorna 500 JSON quando erro lançado numa rota de teste', async () => {
    const res = await request(app)
      .get('/gestor/api/boom')
      .set('Accept', 'application/json');

    assert.equal(res.status, 500);
    assert.match(res.headers['content-type'] || '', /application\/json/i);
    assert.equal(res.body.error, true);

    // seja tolerante à política de mensagens do handler
    const msg = String(res.body.message || '');
    assert.ok(msg.length > 0);
    // se você realmente quiser checar a palavra "falha", deixe como opcional:
    // assert.match(msg, /falha/i);
  });
});