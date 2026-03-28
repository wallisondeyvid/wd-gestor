import test from 'node:test';
import assert from 'node:assert/strict';

import { createUnidadeWrite } from '../src/modules/gestor/app/usecases/unidades/createUnidadeWrite.js';

test('createUnidadeWrite: monta doc, persiste, vincula diretor e delega provisioning', async () => {
  const callOrder = [];
  let createDocArg = null;
  let docMontado = null;
  let saveDocArg = null;
  let diretorLinkArgs = null;
  let orchestrateArg = null;

  const unidadeSalva = await createUnidadeWrite({
    input: {
      codigo: 'M0001',
      nomeFantasia: 'Unidade Teste',
      razaoSocial: 'Razao Teste',
      finalCnpj: '12345678000199',
      cpf: null,
      pessoaTipo: 'pj',
      inscricaoEstadual: null,
      inscricaoMunicipal: null,
      cnaePrincipal: null,
      cnaeSecundarios: null,
      regimeTributario: null,
      naturezaJuridica: null,
      isPrincipal: true,
      isSubunidade: false,
      effectivePrincipalUnitId: null,
      dataAbertura: '2026-03-28',
      endereco: null,
      telefoneFixo: null,
      telefoneCelular: null,
      emailPrincipal: 'teste@exemplo.com',
      emailFiscal: null,
      site: null,
      banco: null,
      agencia: null,
      contaCorrente: null,
      pixChave: null,
      tipoPix: null,
      modulosSelecionados: ['mod1', 'mod2'],
      diretor_usuario_id: 'dir-1',
      apiBancariaPayload: { sanitized: true },
    },
    createUnidadeDoc: async (doc) => {
      callOrder.push('createUnidadeDoc');
      createDocArg = doc;
      docMontado = { __docMontado: true, ...doc };
      return docMontado;
    },
    saveUnidadeDoc: async (doc) => {
      callOrder.push('saveUnidadeDoc');
      saveDocArg = doc;
      return {
        ...doc,
        _id: 'id-123',
      };
    },
    updateUserUnidadeById: async (diretorId, unidadeId) => {
      callOrder.push('updateUserUnidadeById');
      diretorLinkArgs = [diretorId, unidadeId];
    },
    orchestrateUnitProvisioning: async (params) => {
      callOrder.push('orchestrateUnitProvisioning');
      orchestrateArg = params;
    },
    resolveTipoUnidadeProvisionada: () => 'principal',
    ensureUnitProvisioned: async () => {},
    parseDateBRorISO: (value) => `parsed:${value}`,
    warn: () => {},
  });

  assert.ok(createDocArg);
  assert.equal(createDocArg.nome, 'Unidade Teste');
  assert.equal(createDocArg.cnpj, '12345678000199');
  assert.deepEqual(createDocArg.modulosAcessiveis, ['mod1', 'mod2']);
  assert.equal(createDocArg.dataAbertura, 'parsed:2026-03-28');
  assert.equal(saveDocArg, docMontado);
  assert.deepEqual(diretorLinkArgs, ['dir-1', 'id-123']);
  assert.equal(unidadeSalva._id, 'id-123');
  assert.deepEqual(orchestrateArg.modulosAcessiveis, ['mod1', 'mod2']);
  assert.equal(orchestrateArg.unidadeId, 'id-123');
  assert.deepEqual(callOrder, [
    'createUnidadeDoc',
    'saveUnidadeDoc',
    'updateUserUnidadeById',
    'orchestrateUnitProvisioning',
  ]);
});