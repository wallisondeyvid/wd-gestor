import { findFuncionariosByEmailsSelectEmailNomeLeanRepo } from '#modules/gestor/app/repositories/FuncionarioRepository.js';
import { findUsuariosDiretorAtivosPopulatedLeanRepo } from '#modules/gestor/app/repositories/UserRepository.js';
import { GLOBAL_SCOPE } from '#modules/gestor/app/data/funcoes/funcoesScope.js';

export async function findUsuariosDiretorAtivosForPaginaUnidadesData() {
  return findUsuariosDiretorAtivosPopulatedLeanRepo({ unitScope: GLOBAL_SCOPE });
}

export async function findFuncionariosByEmailsForPaginaUnidadesData(emails) {
  return findFuncionariosByEmailsSelectEmailNomeLeanRepo({ unitScope: GLOBAL_SCOPE, emails });
}

export default {
  findUsuariosDiretorAtivosForPaginaUnidadesData,
  findFuncionariosByEmailsForPaginaUnidadesData,
};