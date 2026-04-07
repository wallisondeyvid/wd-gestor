import {
  findUsersByQueryLean,
  findAllUnidadesSelectIdCodigoNomeLean,
  findAllFuncionariosSelectIdNomeCpfLean,
} from '#modules/gestor/app/services/apiDbBridgeService.js';

export async function listUsuariosOwnerService({ isMaster } = {}) {
  const query = isMaster ? {} : { role: { $ne: 'master' } };

  const [usuarios, unidadesFiltradas, funcionarios] = await Promise.all([
    findUsersByQueryLean(query),
    findAllUnidadesSelectIdCodigoNomeLean(),
    findAllFuncionariosSelectIdNomeCpfLean(),
  ]);

  return {
    kind: 'ok',
    usuarios,
    unidadesFiltradas,
    funcionarios,
  };
}

export default listUsuariosOwnerService;