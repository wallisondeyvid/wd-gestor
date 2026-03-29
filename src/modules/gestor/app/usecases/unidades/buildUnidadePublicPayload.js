export function buildUnidadePublicPayload({ unidade }) {
  const payload = {
    _id: unidade._id,
    nome: unidade.nome || '',
    razaoSocial: unidade.razaoSocial || '',
    endereco: unidade.endereco || '',
    telefone: unidade.telefoneCelular || unidade.telefoneFixo || '',
    emailPrincipal: unidade.emailPrincipal || '',
    banco: unidade.banco || '',
    agencia: unidade.agencia || '',
    contaCorrente: unidade.contaCorrente || '',
    pixChave: unidade.pixChave || '',
    tipoPix: unidade.tipoPix || '',
    is_principal: !!unidade.is_principal,
    subunidade: !!unidade.subunidade,
  };

  if (typeof unidade.logo === 'string' && unidade.logo) {
    if (/^https?:\/\//i.test(unidade.logo)) {
      payload.logoUrl = unidade.logo;
    } else if (/^data:/i.test(unidade.logo)) {
      payload.logoDataUrl = unidade.logo;
    } else {
      payload.logoUrl = `/api/unidades/${unidade._id}/logo`;
    }
  } else {
    payload.logoUrl = null;
  }

  return payload;
}