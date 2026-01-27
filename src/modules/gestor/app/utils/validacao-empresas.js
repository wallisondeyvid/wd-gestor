export function tratarErroDuplicidade(error, tipo = 'Funcionario') {
  if (error?.code === 11000 && error?.keyPattern) {
    const camposDuplicados = Object.keys(error.keyPattern);
    if (camposDuplicados.includes('unidade_id')) {
      if (camposDuplicados.includes('cpf')) return { status:409, erro:'CPF já cadastrado nesta empresa. Cada CPF pode existir apenas uma vez por empresa.', campo:'cpf' };
      if (camposDuplicados.includes('email')) return { status:409, erro:'E-mail já cadastrado nesta empresa. Cada e-mail pode existir apenas uma vez por empresa.', campo:'email' };
    }
    if (camposDuplicados.includes('cpf') && !camposDuplicados.includes('unidade_id')) return { status:409, erro:'CPF já cadastrado no sistema. Use uma empresa diferente para o mesmo CPF.', campo:'cpf' };
    if (camposDuplicados.includes('email') && !camposDuplicados.includes('unidade_id')) return { status:409, erro:'E-mail já cadastrado no sistema. Use uma empresa diferente para o mesmo e-mail.', campo:'email' };
  }
  return { status:500, erro:`Erro ao salvar ${tipo.toLowerCase()}. Tente novamente.`, campo:null };
}
export function normalizarDadosUsuario(data){ const normalized={ ...data }; if(normalized.cpf) normalized.cpf = normalized.cpf.replace(/\D/g,''); if(normalized.email) normalized.email = normalized.email.toLowerCase().trim(); return normalized; }
export function validarUnicidadePorEmpresa(data, empresaId){ const erros=[]; if(!empresaId) erros.push('ID da empresa é obrigatório'); if(!data.cpf || data.cpf.length!==11) erros.push('CPF deve ter 11 dígitos'); if(!data.email || !data.email.includes('@')) erros.push('E-mail deve ser válido'); return { valido: erros.length===0, erros }; }
