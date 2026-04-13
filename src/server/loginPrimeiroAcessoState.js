const PRIMEIRO_ACESSO_ERROR_MESSAGES = Object.freeze({
  campos: 'Preencha todos os campos.',
  confirmacao: 'Confirmação de senha não confere.',
  tamanho: 'A nova senha deve ter pelo menos 8 caracteres.',
  forca: 'A senha precisa conter maiúscula, minúscula e número.',
  servidor: 'Falha ao atualizar senha. Tente novamente.',
});

export function extractAuthQueryString(url) {
  const sourceUrl = String(url || '');
  const queryIndex = sourceUrl.indexOf('?');
  return queryIndex >= 0 ? sourceUrl.slice(queryIndex + 1) : '';
}

export function resolvePrimeiroAcessoMensagem(erro) {
  return PRIMEIRO_ACESSO_ERROR_MESSAGES[String(erro || '')] || null;
}

export function resolveLoginPrimeiroAcessoState(url, { isLogin = false, isPA = false, includeRaw = false } = {}) {
  const queryStr = extractAuthQueryString(url);
  const params = new URLSearchParams(queryStr);
  const erro = params.get('erro') || null;
  const raw = includeRaw ? (params.get('raw') || null) : null;
  const mensagem = (!isLogin && isPA && erro) ? resolvePrimeiroAcessoMensagem(erro) : null;

  return {
    queryStr,
    raw,
    erro,
    mensagem,
  };
}