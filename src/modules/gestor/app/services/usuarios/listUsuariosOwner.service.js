import { createUnitScope } from '#shared/unitScope.js';
import { findUsersByQueryLeanRepo } from '#modules/gestor/app/repositories/UserRepository.js';
import { findAllUnidadesSelectIdCodigoNomeLeanRepo } from '#modules/gestor/app/repositories/UnidadeReadRepository.js';
import { findAllFuncionariosSelectIdNomeCpfLeanRepo } from '#modules/gestor/app/repositories/FuncionarioRepository.js';

const GLOBAL_SCOPE = createUnitScope({});

export async function listUsuariosOwnerService({ isMaster } = {}) {
  const query = isMaster ? {} : { role: { $ne: 'master' } };

  const [usuarios, unidadesFiltradas, funcionarios] = await Promise.all([
    findUsersByQueryLeanRepo({ unitScope: GLOBAL_SCOPE, query }),
    findAllUnidadesSelectIdCodigoNomeLeanRepo({ unitScope: GLOBAL_SCOPE }),
    findAllFuncionariosSelectIdNomeCpfLeanRepo({ unitScope: GLOBAL_SCOPE }),
  ]);

  return {
    kind: 'ok',
    usuarios,
    unidadesFiltradas,
    funcionarios,
  };
}

export default listUsuariosOwnerService;