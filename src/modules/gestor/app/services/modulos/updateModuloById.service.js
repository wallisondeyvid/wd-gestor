import {
  findModuloByIdRepo,
  findModuloByNomeRepo,
} from '#modules/gestor/app/repositories/ModuloReadRepository.js';

const GLOBAL_SCOPE = { type: 'global', unidadeId: null };

export async function updateModuloByIdService({ moduloId, changes }) {
  const modulo = await findModuloByIdRepo({ unitScope: GLOBAL_SCOPE, id: moduloId });
  if (!modulo) {
    return { kind: 'not_found' };
  }

  const { nome, descricao, status, url_base } = changes || {};

  if (nome && nome !== modulo.nome) {
    const duplicado = await findModuloByNomeRepo({ unitScope: GLOBAL_SCOPE, nome });
    if (duplicado) {
      return { kind: 'duplicate_name' };
    }
    modulo.nome = nome;
  }

  if (descricao !== undefined) modulo.descricao = descricao;
  if (status !== undefined) modulo.status = status;
  if (url_base !== undefined) modulo.url_base = url_base;

  await modulo.save();
  return { kind: 'updated' };
}

export default updateModuloByIdService;