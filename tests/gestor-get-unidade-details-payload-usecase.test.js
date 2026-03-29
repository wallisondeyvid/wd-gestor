import test from 'node:test';
import assert from 'node:assert/strict';

import { getUnidadeDetailsPayload } from '../src/modules/gestor/app/usecases/unidades/getUnidadeDetailsPayload.js';

test('getUnidadeDetailsPayload: aplica fallback de diretor e normaliza apiBancaria no payload final', async () => {
  let fallbackLookupId = null;
  let normalizedApiBancariaInput = null;

  const payload = await getUnidadeDetailsPayload({
    unidade: {
      _id: 'u-matriz',
      codigo: 'UNI-001',
      nome: 'Matriz',
      razaoSocial: 'Matriz LTDA',
      cnpj: '11111111000111',
      cpf: '',
      pessoaTipo: 'J',
      inscricaoEstadual: '',
      inscricaoMunicipal: '',
      cnaePrincipal: '',
      cnaeSecundarios: [],
      regimeTributario: '',
      naturezaJuridica: '',
      is_principal: true,
      subunidade: false,
      unidade_principal_id: null,
      dataAbertura: null,
      telefoneFixo: '',
      telefoneCelular: '',
      emailPrincipal: '',
      emailFiscal: '',
      site: '',
      banco: '',
      agencia: '',
      contaCorrente: '',
      pixChave: '',
      tipoPix: '',
      modulosAcessiveis: [],
      diretor_usuario_id: null,
      endereco: {},
      logo: null,
      apiBancaria: { persisted: true },
    },
    findDiretorAtivoByUnidadeSelectId: async (unidadeId) => {
      fallbackLookupId = unidadeId;
      return { _id: 'dir-fallback' };
    },
    buildApiBancariaForResponse: (value) => {
      normalizedApiBancariaInput = value;
      return { normalized: true, value };
    },
    warn: () => {},
  });

  assert.equal(fallbackLookupId, 'u-matriz');
  assert.deepEqual(normalizedApiBancariaInput, { persisted: true });
  assert.equal(payload._id, 'u-matriz');
  assert.equal(payload.diretor_usuario_id, 'dir-fallback');
  assert.deepEqual(payload.apiBancaria, {
    normalized: true,
    value: { persisted: true },
  });
});