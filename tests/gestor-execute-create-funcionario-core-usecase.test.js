import test from 'node:test';
import assert from 'node:assert/strict';

import { executeCreateFuncionarioCore } from '../src/modules/gestor/app/usecases/funcionarios/executeCreateFuncionarioCore.js';

test('executeCreateFuncionarioCore: monta o doc persistivel minimo e retorna o funcionario criado', async () => {
  let createDocArg = null;
  const rawBody = {
    anexos_existentes: JSON.stringify([{ nome: 'existente.pdf' }]),
    dependentes_json: JSON.stringify([{ nome: 'Filho', cpf: '123.456.789-00' }]),
    beneficios_json: JSON.stringify([{ tipo: 'saude', nome: 'Plano X', cnpj_plano: '123', tipo_valor: 'fixo', valor: 100 }]),
    extra_apelido: 'Mari',
    extra_observacoes: 'ignorar',
    face_capturas_json: JSON.stringify([
      {
        hash: 'hash-face-1',
        imagem: 'data:image/png;base64,face-inline',
        template_b64: 'template-face-1',
        template_sha256: 'sha-face-1',
        qualidade: 87,
      },
    ]),
    anexos: ['ignorar'],
  };

  const result = await executeCreateFuncionarioCore({
    unidade_id: 'unit-001',
    funcao_id: 'funcao-001',
    nome: '  Maria Core  ',
    nome_social: '  Maria Social  ',
    nome_mae: '',
    nome_pai: '',
    rg: 'RG-123',
    rg_orgao: 'SSP',
    rg_uf: 'SP',
    rg_data_expedicao: '2020-01-01',
    cpf: '12345678901',
    pis: '123.45678.90-1',
    data_nascimento: '1991-04-02',
    sexo: 'F',
    estado_civil: '',
    raca_cor: '',
    escolaridade: '',
    nacionalidade: '',
    pais_nascimento: '',
    data_chegada_brasil: '',
    naturalidade: '',
    endereco: { cep: '01001000' },
    telefone: '11999990000',
    telefone2: '1133334444',
    email: '  maria.core@example.com  ',
    tipo_ctps: '',
    ctps_numero: '',
    ctps_serie: '',
    ctps_uf: '',
    pcd: '',
    tipo_deficiencia: '',
    cid: '',
    biometrico: '',
    biometrico_face: '',
    fp_template_b64: '',
    fp_template_sha256: '',
    fp_imagem: '',
    fp_dedo: '',
    face_template_b64: '',
    face_template_sha256: '',
    face_imagem: 'data:image/png;base64,face-inline',
    observacoes: '  observacao core  ',
    data_admissao: '',
    tipo_admissao: '',
    categoria_trabalhador: '',
    tipo_contrato: '',
    data_termino: '',
    objeto_determinante: '',
    clausula_assecuratoria: '',
    cargo: 'Analista',
    cbo: '',
    departamento: 'Operacoes',
    regime_contratacao: 'CLT',
    regime_jornada: '44H',
    carga_semanal: 44,
    salario_base: 1234.56,
    tipo_salario: '',
    forma_pagamento: 'pix',
    forma_pagamento_desc: '',
    banco: '',
    agencia_num: '',
    agencia_dv: '',
    conta_num: '',
    conta_dv: '',
    tipo_conta: '',
    sindicato: '',
    fgts_optante: '',
    fgts_data: '',
    regime_previdenciario: '',
    tipo_especial: '',
    cert_militar: '',
    cert_militar_orgao: '',
    cert_militar_uf: '',
    cert_militar_data: '',
    titulo: '',
    titulo_zona: '',
    titulo_secao: '',
    cnh: '',
    cnh_categoria: '',
    cnh_validade: '',
    cnh_uf: '',
    orgao_prof: '',
    orgao_prof_uf: '',
    orgao_prof_numero: '',
    rawBody,
    anexosFiles: [{ originalname: 'novo-anexo.pdf' }],
    mapFiles: (files) => files.map((file) => ({ originalname: file.originalname })),
    createFuncionarioDoc: async (doc) => {
      createDocArg = doc;
      return { _id: 'func-001', ...doc };
    },
  });

  assert.equal(result.novo._id, 'func-001');
  assert.equal(createDocArg.nome, 'Maria Core');
  assert.equal(createDocArg.rg, 'RG-123');
  assert.equal(createDocArg.pis, '12345678901');
  assert.equal(createDocArg.observacoes, 'observacao core');
  assert.equal(JSON.stringify(createDocArg.anexos), JSON.stringify([{ nome: 'existente.pdf' }, { originalname: 'novo-anexo.pdf' }]));
  assert.equal(JSON.stringify(createDocArg.dependentes), JSON.stringify([{ nome: 'Filho', cpf: '12345678900' }]));
  assert.equal(JSON.stringify(createDocArg.beneficios), JSON.stringify([{ tipo: 'saude', nome: 'Plano X', cnpj_plano: '123', tipo_valor: 'fixo', valor: 100, inicio: undefined, data_inicio: undefined }]));
  assert.equal(JSON.stringify(createDocArg.extras), JSON.stringify({ apelido: 'Mari' }));
  assert.equal(JSON.stringify(createDocArg.biometrias_facial), JSON.stringify([
    {
      hash: 'hash-face-1',
      imagem: 'data:image/png;base64,face-inline',
      template_b64: 'template-face-1',
      template_sha256: 'sha-face-1',
      qualidade: 87,
    },
  ]));
  assert.equal(Object.prototype.hasOwnProperty.call(rawBody, 'anexos'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(rawBody, 'anexos_existentes'), false);
});