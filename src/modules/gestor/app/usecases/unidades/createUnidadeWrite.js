export async function createUnidadeWrite({
  input,
  createUnidadeDoc,
  saveUnidadeDoc,
  updateUserUnidadeById,
  orchestrateUnitProvisioning,
  resolveTipoUnidadeProvisionada,
  ensureUnitProvisioned,
  parseDateBRorISO,
  warn,
}) {
  const novaUnidade = await createUnidadeDoc({
    codigo: input.codigo,
    nome: input.nomeFantasia,
    razaoSocial: input.razaoSocial || null,
    cnpj: input.finalCnpj,
    cpf: input.cpf ? input.cpf.replace(/\D/g, '') : null,
    pessoaTipo: input.pessoaTipo,
    inscricaoEstadual: input.inscricaoEstadual || null,
    inscricaoMunicipal: input.inscricaoMunicipal || null,
    cnaePrincipal: input.cnaePrincipal || null,
    cnaeSecundarios: input.cnaeSecundarios || null,
    regimeTributario: input.regimeTributario || null,
    naturezaJuridica: input.naturezaJuridica || null,
    is_principal: input.isPrincipal,
    subunidade: input.isSubunidade,
    unidade_principal_id: input.isSubunidade ? input.effectivePrincipalUnitId : null,
    dataAbertura: parseDateBRorISO(input.dataAbertura),
    endereco: input.endereco || null,
    telefoneFixo: input.telefoneFixo || null,
    telefoneCelular: input.telefoneCelular || null,
    emailPrincipal: input.emailPrincipal || null,
    emailFiscal: input.emailFiscal || null,
    site: input.site || null,
    banco: input.banco || null,
    agencia: input.agencia || null,
    contaCorrente: input.contaCorrente || null,
    pixChave: input.pixChave || null,
    tipoPix: input.tipoPix,
    modulosAcessiveis: input.modulosSelecionados,
    diretor_usuario_id: input.isPrincipal && input.diretor_usuario_id ? input.diretor_usuario_id : null,
    is_active: true,
    logo: null,
    apiBancaria: input.apiBancariaPayload,
  });

  const unidadeSalva = await saveUnidadeDoc(novaUnidade);
  if (input.isPrincipal && input.diretor_usuario_id) {
    try {
      await updateUserUnidadeById(input.diretor_usuario_id, unidadeSalva._id);
    } catch (error) {
      warn('[API UNIDADES][create] Falha ao vincular diretor a unidade:', error.message);
    }
  }

  await orchestrateUnitProvisioning({
    unidadeId: unidadeSalva._id,
    is_principal: input.isPrincipal,
    subunidade: input.isSubunidade,
    modulosAcessiveis: input.modulosSelecionados,
    resolveTipoUnidadeProvisionada,
    ensureUnitProvisioned,
  });

  return unidadeSalva;
}