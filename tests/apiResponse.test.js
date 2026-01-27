import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockRes } from './test-helpers.js';
import {
  ok, created, badRequest, notFound, serverError, missingFields
} from '../src/core/utils/apiResponse.js';

// ok()
test('apiResponse.ok retorna success true e data', () => {
  const res = createMockRes();
  ok(res, { a: 1 });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);
  assert.deepStrictEqual(res.body.data, { a: 1 });
});

// created()
test('apiResponse.created retorna 201 e created true', () => {
  const res = createMockRes();
  // ajuste conforme a assinatura real da sua função:
  created(res, '123'); // ou created(res, { id: '123' })
  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.body.created, true);
  assert.strictEqual(res.body.id, '123');
});

// badRequest()
test('apiResponse.badRequest retorna 400 e code BAD_REQUEST', () => {
  const res = createMockRes();
  badRequest(res, 'Erro X');
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.code, 'BAD_REQUEST');
});

// notFound()
test('apiResponse.notFound retorna 404', () => {
  const res = createMockRes();
  notFound(res, 'Nada');
  assert.strictEqual(res.statusCode, 404);
  assert.strictEqual(res.body.code, 'NOT_FOUND');
});

// missingFields()
test('apiResponse.missingFields retorna 400 com campos', () => {
  const res = createMockRes();
  missingFields(res, ['a', 'b']);
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.code, 'BAD_REQUEST');
  // Se sua implementação usa "fields" em vez de "campos", ajuste aqui:
  assert.deepStrictEqual(res.body.campos, ['a', 'b']);
});

// serverError()
test('apiResponse.serverError retorna 500 code SERVER_ERROR', () => {
  const res = createMockRes();
  serverError(res, new Error('Falhou'));
  assert.strictEqual(res.statusCode, 500);
  assert.strictEqual(res.body.code, 'SERVER_ERROR');
});