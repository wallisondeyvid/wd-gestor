import {
  findFuncoesByFiltroLeanRepo,
  findFuncoesByFiltroSelectLeanRepo,
} from '#modules/gestor/app/repositories/FuncaoReadRepository.js';
import { scopeFromFuncaoFiltro } from '#modules/gestor/app/data/funcoes/funcoesScope.js';

export async function findFuncoesByFiltroLeanData(filtro) {
  return findFuncoesByFiltroLeanRepo({
    unitScope: scopeFromFuncaoFiltro(filtro),
    filtro,
  });
}

export async function findFuncoesByFiltroSelectLeanData(filtro) {
  return findFuncoesByFiltroSelectLeanRepo({
    unitScope: scopeFromFuncaoFiltro(filtro),
    filtro,
  });
}
