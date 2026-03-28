import test from 'node:test';
import assert from 'node:assert/strict';

import { updateUnidadeWrite } from '../src/modules/gestor/app/usecases/unidades/updateUnidadeWrite.js';

test('updateUnidadeWrite: monta updated e persiste com o payload final', async () => {
  let capturedPersist = null;

  const unidade = await updateUnidadeWrite({
    unidadeId: 'u-edit',
    input: {
      nomeFantasia: 'Clinica Renovada',
      razaoSocial: 'Clinica Renovada LTDA',
      cleanedCnpj: '12345678000195',
      cpf: '',
      pessoaTipo: 'pj',
      dataAbertura: '2024-02-03',
      inscricaoEstadual: null,
      inscricaoMunicipal: null,
      cnaePrincipal: null,
      cnaeSecundarios: null,
      regimeTributario: null,
      naturezaJuridica: null,
      tipoLogradouro: null,
      logradouro: null,
      numero: null,
      complemento: null,
      bairro: null,
      cep: null,
      cidade: null,
      estado: null,
      codigoIbgeMunicipio: null,
      telefoneFixo: null,
      telefoneCelular: null,
      emailPrincipal: 'contato@renovada.test',
      emailFiscal: 'fiscal@renovada.test',
      site: null,
      banco: null,
      agencia: null,
      contaCorrente: null,
      pixChave: 'pix@renovada.test',
      tipoPix: 'email',
      modulosAcessiveis: 'financeiro',
      diretor_usuario_id: 'dir-existente',
      subunidade: 'false',
      effectivePrincipalUnitId: null,
      endereco: { cidade: 'Sao Paulo' },
      apiBancariaPayload: { sanitized: true },
      logo: 'https://cdn.example.test/logo-antiga.webp',
    },
    parseDateBRorISO: (value) => `parsed:${value}`,
    updateUnidadeByIdWithValidators: async (id, updated) => {
      capturedPersist = { id, updated };
      return { _id: id, toObject: () => ({ _id: id, ...updated }) };
    },
  });

  assert.deepEqual(capturedPersist, {
    id: 'u-edit',
    updated: {
      nome: 'Clinica Renovada',
      razaoSocial: 'Clinica Renovada LTDA',
      cnpj: '12345678000195',
      cpf: null,
      pessoaTipo: 'pj',
      dataAbertura: 'parsed:2024-02-03',
      inscricaoEstadual: null,
      inscricaoMunicipal: null,
      cnaePrincipal: null,
      cnaeSecundarios: null,
      regimeTributario: null,
      naturezaJuridica: null,
      tipoLogradouro: null,
      logradouro: null,
      numero: null,
      complemento: null,
      bairro: null,
      cep: null,
      cidade: null,
      estado: null,
      codigoIbgeMunicipio: null,
      telefoneFixo: null,
      telefoneCelular: null,
      emailPrincipal: 'contato@renovada.test',
      emailFiscal: 'fiscal@renovada.test',
      site: null,
      banco: null,
      agencia: null,
      contaCorrente: null,
      pixChave: 'pix@renovada.test',
      tipoPix: 'email',
      modulosAcessiveis: ['financeiro'],
      diretor_usuario_id: 'dir-existente',
      is_principal: true,
      subunidade: false,
      unidade_principal_id: null,
      endereco: { cidade: 'Sao Paulo' },
      apiBancaria: { sanitized: true },
      logo: 'https://cdn.example.test/logo-antiga.webp',
    },
  });
  assert.equal(unidade._id, 'u-edit');
});