export async function getUnidadeDetailsPayload({
  unidade,
  findDiretorAtivoByUnidadeSelectId,
  buildApiBancariaForResponse,
  warn,
}) {
  let diretorId = unidade.diretor_usuario_id;
  if (unidade.is_principal && !diretorId) {
    try {
      const diretor = await findDiretorAtivoByUnidadeSelectId(unidade._id);
      if (diretor) diretorId = diretor._id;
    } catch (error) {
      warn('[API UNIDADES][getById] Fallback diretor falhou:', error.message);
    }
  }

  return {
    _id: unidade._id,
    codigo: unidade.codigo,
    nome: unidade.nome,
    razaoSocial: unidade.razaoSocial,
    cnpj: unidade.cnpj,
    cpf: unidade.cpf,
    pessoaTipo: unidade.pessoaTipo,
    inscricaoEstadual: unidade.inscricaoEstadual,
    inscricaoMunicipal: unidade.inscricaoMunicipal,
    cnaePrincipal: unidade.cnaePrincipal,
    cnaeSecundarios: unidade.cnaeSecundarios,
    regimeTributario: unidade.regimeTributario,
    naturezaJuridica: unidade.naturezaJuridica,
    is_principal: unidade.is_principal,
    subunidade: unidade.subunidade,
    unidade_principal_id: unidade.unidade_principal_id,
    dataAbertura: unidade.dataAbertura,
    telefoneFixo: unidade.telefoneFixo,
    telefoneCelular: unidade.telefoneCelular,
    emailPrincipal: unidade.emailPrincipal,
    emailFiscal: unidade.emailFiscal,
    site: unidade.site,
    banco: unidade.banco,
    agencia: unidade.agencia,
    contaCorrente: unidade.contaCorrente,
    pixChave: unidade.pixChave,
    tipoPix: unidade.tipoPix,
    modulosAcessiveis: unidade.modulosAcessiveis,
    diretor_usuario_id: diretorId || null,
    endereco: unidade.endereco,
    logo: unidade.logo || null,
    apiBancaria: buildApiBancariaForResponse(unidade.apiBancaria),
  };
}