// Middleware para normalizar envelopes de resposta
// Converte variantes: { sucesso, dados } -> { success, data }
// e { mensagem } -> { message }
// Mantém compatibilidade sem alterar controllers antigos.
export function envelopeNormalizer(req, res, next){
  const originalJson = res.json.bind(res);
  res.json = function(body){
    try {
      if (body && typeof body === 'object' && !Array.isArray(body)) {
        if (Object.prototype.hasOwnProperty.call(body,'sucesso')) {
          body.success = body.success ?? body.sucesso; delete body.sucesso;
        }
        if (Object.prototype.hasOwnProperty.call(body,'dados')) {
          body.data = body.data ?? body.dados; delete body.dados;
        }
        if (Object.prototype.hasOwnProperty.call(body,'mensagem')) {
          body.message = body.message ?? body.mensagem; delete body.mensagem;
        }
        // Se não existe success mas existe error/message, inferir
        if (typeof body.success === 'undefined') {
          if (body.error) body.success = false;
          else if (body.data) body.success = true;
        }
      }
    } catch(e){ /* silencioso */ }
    return originalJson(body);
  };
  next();
}

export default envelopeNormalizer;