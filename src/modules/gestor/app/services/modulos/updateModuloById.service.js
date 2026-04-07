import {
  findModuloById,
  findModuloByNome,
  saveModulo,
} from '#modules/gestor/app/services/apiDbBridgeService.js';

export async function updateModuloByIdService({ moduloId, changes }) {
  const modulo = await findModuloById(moduloId);
  if (!modulo) {
    return { kind: 'not_found' };
  }

  const { nome, descricao, status, url_base } = changes || {};

  if (nome && nome !== modulo.nome) {
    const duplicado = await findModuloByNome(nome);
    if (duplicado) {
      return { kind: 'duplicate_name' };
    }
    modulo.nome = nome;
  }

  if (descricao !== undefined) modulo.descricao = descricao;
  if (status !== undefined) modulo.status = status;
  if (url_base !== undefined) modulo.url_base = url_base;

  await saveModulo(modulo);
  return { kind: 'updated' };
}

export default updateModuloByIdService;