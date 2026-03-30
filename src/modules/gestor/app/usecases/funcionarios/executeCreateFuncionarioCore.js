export async function executeCreateFuncionarioCore({
  unidade_id,
  funcao_id,
  nome,
  nome_social,
  nome_mae,
  nome_pai,
  rg,
  rg_orgao,
  rg_uf,
  rg_data_expedicao,
  cpf,
  pis,
  data_nascimento,
  sexo,
  estado_civil,
  raca_cor,
  escolaridade,
  nacionalidade,
  pais_nascimento,
  data_chegada_brasil,
  naturalidade,
  endereco,
  telefone,
  telefone2,
  email,
  tipo_ctps,
  ctps_numero,
  ctps_serie,
  ctps_uf,
  pcd,
  tipo_deficiencia,
  cid,
  biometrico,
  biometrico_face,
  fp_template_b64,
  fp_template_sha256,
  fp_imagem,
  fp_dedo,
  face_template_b64,
  face_template_sha256,
  face_imagem,
  observacoes,
  data_admissao,
  tipo_admissao,
  categoria_trabalhador,
  tipo_contrato,
  data_termino,
  objeto_determinante,
  clausula_assecuratoria,
  cargo,
  cbo,
  departamento,
  regime_contratacao,
  regime_jornada,
  carga_semanal,
  salario_base,
  tipo_salario,
  forma_pagamento,
  forma_pagamento_desc,
  banco,
  agencia_num,
  agencia_dv,
  conta_num,
  conta_dv,
  tipo_conta,
  sindicato,
  fgts_optante,
  fgts_data,
  regime_previdenciario,
  tipo_especial,
  cert_militar,
  cert_militar_orgao,
  cert_militar_uf,
  cert_militar_data,
  titulo,
  titulo_zona,
  titulo_secao,
  cnh,
  cnh_categoria,
  cnh_validade,
  cnh_uf,
  orgao_prof,
  orgao_prof_uf,
  orgao_prof_numero,
  rawBody,
  anexosFiles,
  mapFiles,
  createFuncionarioDoc,
}) {
  let anexosExistentes = [];
  if (rawBody.anexos_existentes) {
    try {
      anexosExistentes = JSON.parse(rawBody.anexos_existentes);
    } catch {}
  }

  const anexosNovos = mapFiles(anexosFiles || []);
  console.log('[UPLOAD][create] anexosNovos normalizados =', anexosNovos.length);
  const anexosFinais = [...anexosExistentes, ...anexosNovos];
  console.log('[UPLOAD][create] anexosFinais total =', anexosFinais.length);
  delete rawBody.anexos;
  delete rawBody.anexos_existentes;

  let dependentes = [];
  let beneficiosArray = [];
  let extras = {};
  if (rawBody.dependentes_json) {
    try {
      dependentes = JSON.parse(rawBody.dependentes_json);
      if (!Array.isArray(dependentes)) dependentes = [];
    } catch {}
  }

  if (Array.isArray(dependentes)) {
    dependentes = dependentes.map((dependente) => {
      if (dependente && dependente.cpf) dependente.cpf = String(dependente.cpf).replace(/\D/g, '');
      return dependente;
    });
  }

  if (rawBody.beneficios_json) {
    try {
      const parsedBeneficios = JSON.parse(rawBody.beneficios_json);
      if (Array.isArray(parsedBeneficios)) {
        beneficiosArray = parsedBeneficios.map((beneficio) => ({
          tipo: beneficio.tipo,
          nome: beneficio.nome,
          cnpj_plano: beneficio.cnpj_plano,
          tipo_valor: beneficio.tipo_valor,
          valor: beneficio.valor,
          inicio: beneficio.inicio,
          data_inicio: beneficio.data_inicio,
        }));
      }
    } catch {}
  }

  Object.entries(rawBody).forEach(([key, value]) => {
    if (!key.startsWith('extra_')) return;
    const campoBase = key.substring(6);
    const ignorar = [
      'nome_social', 'nome_mae', 'nome_pai', 'rg_orgao', 'rg_uf', 'rg_data_expedicao', 'pis', 'estado_civil',
      'raca_cor', 'escolaridade', 'nacionalidade', 'pais_nascimento', 'data_chegada_brasil', 'telefone2',
      'tipo_ctps', 'ctps_numero', 'ctps_serie', 'ctps_uf', 'pcd', 'tipo_deficiencia', 'cid', 'biometrico',
      'biometrico_face', 'data_admissao', 'tipo_admissao', 'categoria_trabalhador', 'tipo_contrato', 'data_termino',
      'objeto_determinante', 'clausula_assecuratoria', 'cargo', 'cbo', 'departamento', 'regime_contratacao',
      'regime_jornada', 'carga_semanal', 'salario_base', 'tipo_salario', 'forma_pagamento', 'forma_pagamento_desc',
      'banco', 'agencia_num', 'agencia_dv', 'conta_num', 'conta_dv', 'tipo_conta', 'sindicato', 'fgts_optante',
      'fgts_data', 'regime_previdenciario', 'tipo_especial', 'cert_militar', 'cert_militar_orgao', 'cert_militar_uf',
      'cert_militar_data', 'titulo', 'titulo_zona', 'titulo_secao', 'cnh', 'cnh_categoria', 'cnh_validade',
      'cnh_uf', 'orgao_prof', 'orgao_prof_uf', 'orgao_prof_numero', 'observacoes',
    ];
    if (!ignorar.includes(campoBase)) extras[campoBase] = value;
  });

  let biometriasDigitaisArr = undefined;
  let biometriasFacialArr = undefined;

  if (rawBody.fp_capturas_json && rawBody.fp_capturas_json.length > 500000) {
    console.warn('[BIO JSON][create] fp_capturas_json excede limite');
    delete rawBody.fp_capturas_json;
  }
  if (rawBody.face_capturas_json && rawBody.face_capturas_json.length > 500000) {
    console.warn('[BIO JSON][create] face_capturas_json excede limite');
    delete rawBody.face_capturas_json;
  }

  if (rawBody.face_capturas_json) {
    try {
      const parsed = JSON.parse(rawBody.face_capturas_json);
      if (Array.isArray(parsed)) {
        biometriasFacialArr = parsed.filter((item) => item && (item.hash || item.imagem)).map((item) => ({
          hash: (item.hash || '').substring(0, 128),
          imagem: item.imagem && String(item.imagem).length < 500000 ? item.imagem : undefined,
          template_b64: item.template_b64 && String(item.template_b64).length < 500000 ? item.template_b64 : undefined,
          template_sha256: item.template_sha256 || undefined,
          qualidade: item.qualidade && Number.isFinite(Number(item.qualidade)) ? Number(item.qualidade) : undefined,
        }));
      }
    } catch {}
  }

  const doc = {
    unidade_id,
    funcao_id: funcao_id || undefined,
    nome: nome.trim(),
    nome_social: nome_social || undefined,
    nome_mae: nome_mae || undefined,
    nome_pai: nome_pai || undefined,
    rg: rg.trim(),
    rg_orgao: rg_orgao || undefined,
    rg_uf: rg_uf || undefined,
    rg_data_expedicao: rg_data_expedicao || undefined,
    cpf,
    pis: pis ? pis.replace(/[^\d]/g, '') : undefined,
    data_nascimento,
    sexo,
    estado_civil: estado_civil || undefined,
    raca_cor: raca_cor || undefined,
    escolaridade: escolaridade || undefined,
    nacionalidade: nacionalidade || undefined,
    pais_nascimento: pais_nascimento || undefined,
    data_chegada_brasil: data_chegada_brasil || undefined,
    naturalidade: naturalidade || undefined,
    endereco,
    telefone: telefone.trim(),
    telefone2: telefone2 || undefined,
    email,
    tipo_ctps: tipo_ctps || undefined,
    ctps_numero: ctps_numero || undefined,
    ctps_serie: ctps_serie || undefined,
    ctps_uf: ctps_uf || undefined,
    pcd: pcd || undefined,
    tipo_deficiencia: tipo_deficiencia || undefined,
    cid: cid || undefined,
    foto: undefined,
    biometrico: biometrico || undefined,
    biometrico_face: biometrico_face || undefined,
    fp_template_b64: fp_template_b64 || undefined,
    fp_template_sha256: fp_template_sha256 || undefined,
    fp_imagem: fp_imagem || undefined,
    fp_dedo: fp_dedo || undefined,
    face_template_b64: face_template_b64 || undefined,
    face_template_sha256: face_template_sha256 || undefined,
    face_imagem: face_imagem || undefined,
    observacoes: observacoes ? observacoes.trim() : undefined,
    data_admissao: data_admissao || undefined,
    tipo_admissao: tipo_admissao || undefined,
    categoria_trabalhador: categoria_trabalhador || undefined,
    tipo_contrato: tipo_contrato || undefined,
    data_termino: data_termino || undefined,
    objeto_determinante: objeto_determinante || undefined,
    clausula_assecuratoria: clausula_assecuratoria || undefined,
    cargo: cargo || undefined,
    cbo: cbo || undefined,
    departamento: departamento || undefined,
    regime_contratacao: regime_contratacao || undefined,
    regime_jornada: regime_jornada || undefined,
    carga_semanal: carga_semanal || undefined,
    salario_base: salario_base || undefined,
    tipo_salario: tipo_salario || undefined,
    forma_pagamento: forma_pagamento || undefined,
    forma_pagamento_desc: forma_pagamento_desc || undefined,
    banco: banco || undefined,
    agencia_num: agencia_num || undefined,
    agencia_dv: agencia_dv || undefined,
    conta_num: conta_num || undefined,
    conta_dv: conta_dv || undefined,
    tipo_conta: tipo_conta || undefined,
    sindicato: sindicato || undefined,
    fgts_optante: fgts_optante || undefined,
    fgts_data: fgts_data || undefined,
    regime_previdenciario: regime_previdenciario || undefined,
    tipo_especial: tipo_especial || undefined,
    cert_militar: cert_militar || undefined,
    cert_militar_orgao: cert_militar_orgao || undefined,
    cert_militar_uf: cert_militar_uf || undefined,
    cert_militar_data: cert_militar_data || undefined,
    titulo: titulo || undefined,
    titulo_zona: titulo_zona || undefined,
    titulo_secao: titulo_secao || undefined,
    cnh: cnh || undefined,
    cnh_categoria: cnh_categoria || undefined,
    cnh_validade: cnh_validade || undefined,
    cnh_uf: cnh_uf || undefined,
    orgao_prof: orgao_prof || undefined,
    orgao_prof_uf: orgao_prof_uf || undefined,
    orgao_prof_numero: orgao_prof_numero || undefined,
    anexos: anexosFinais,
    extras,
    dependentes,
    beneficios: beneficiosArray,
    biometrias_digitais: biometriasDigitaisArr,
    biometrias_facial: biometriasFacialArr,
  };

  const novo = await createFuncionarioDoc(doc);
  return { novo };
}