import Modulo from '#models/modulo.js';
import Funcionario from '#models/Funcionario.js';
import Funcao from '#models/funcao.js';
import { resolveModel } from '#shared/db/resolveModel.js';

const GLOBAL_SCOPE = { type: 'global', unidadeId: null };

export async function loadAllModulosBaseRepo() {
  const ModuloModel = resolveModel({
    name: Modulo.modelName || 'Modulo',
    schema: Modulo.schema,
    unitScope: GLOBAL_SCOPE,
  });

  return ModuloModel.find({}).select('_id nome descricao status url_base').lean();
}

export async function findFuncionarioCanonicalByIdRepo(funcionarioId) {
  const FuncionarioModel = resolveModel({
    name: Funcionario.modelName || 'Funcionario',
    schema: Funcionario.schema,
    unitScope: GLOBAL_SCOPE,
  });

  return FuncionarioModel.findById(funcionarioId)
    .select('_id funcao_id unidade_id usuario_id cpf email')
    .lean();
}

export async function findFuncaoCanonicalByIdRepo(funcaoId) {
  const FuncaoModel = resolveModel({
    name: Funcao.modelName || 'Funcao',
    schema: Funcao.schema,
    unitScope: GLOBAL_SCOPE,
  });

  return FuncaoModel.findById(funcaoId)
    .populate('modulos_habilitados')
    .lean();
}