// Testes do util CNPJ
import test from 'node:test';
import assert from 'node:assert/strict';
import { validarCnpj, formatarCnpj } from '../src/modules/gestor/app/utils/cnpj.js';

// CNPJs válidos conhecidos (formatados e não formatados)
const valid = [
  '11222333000181', // exemplo genérico válido
  '11.222.333/0001-81'
];

const invalid = [
  '11222333000180', // dv errado
  '00000000000000', // repetidos
  '111', // curto
  '11.222.333/0001-80' // formatado dv errado
];

test('validarCnpj deve aceitar válidos', () => {
  for (const c of valid) {
    assert.equal(validarCnpj(c), true, `Deveria ser válido: ${c}`);
  }
});

test('validarCnpj deve rejeitar inválidos', () => {
  for (const c of invalid) {
    assert.equal(validarCnpj(c), false, `Deveria ser inválido: ${c}`);
  }
});

test('formatarCnpj deve formatar corretamente', () => {
  assert.equal(formatarCnpj('11222333000181'), '11.222.333/0001-81');
});
