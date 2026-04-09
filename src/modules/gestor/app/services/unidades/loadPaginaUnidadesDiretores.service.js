import {
  findFuncionariosByEmailsSelectEmailNomeLean,
  findUsuariosDiretorAtivosPopulatedLean,
} from '#modules/gestor/app/services/apiDbBridgeService.js';

async function applyDiretoresEmailFallback(usuariosDiretor) {
  const faltando = usuariosDiretor.filter((usuario) => (
    !((usuario.nome && usuario.nome.trim()) || (usuario.funcionario_id && usuario.funcionario_id.nome))
    && usuario.email
  ));

  if (!faltando.length) return usuariosDiretor;

  const emails = [...new Set(faltando.map((usuario) => usuario.email.toLowerCase()))];

  try {
    const funcs = await findFuncionariosByEmailsSelectEmailNomeLean(emails);
    const mapa = {};
    funcs.forEach((funcionario) => {
      if (funcionario.email) mapa[funcionario.email.toLowerCase()] = funcionario.nome;
    });
    return usuariosDiretor.map((usuario) => {
      if (!usuario.nome && usuario.email) {
        const via = mapa[usuario.email.toLowerCase()];
        if (via) usuario.nome = via;
      }
      return usuario;
    });
  } catch {
    // Preserva o comportamento observável atual: falha no fallback não impede o render.
    return usuariosDiretor;
  }
}

export async function loadPaginaUnidadesDiretores({ user } = {}) {
  if (!(user?.isMaster || user?.role === 'admin')) return [];

  let usuariosDiretor = await findUsuariosDiretorAtivosPopulatedLean();
  usuariosDiretor = await applyDiretoresEmailFallback(usuariosDiretor);

  return usuariosDiretor;
}