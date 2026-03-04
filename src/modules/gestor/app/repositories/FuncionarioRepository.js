import Funcionario from '#models/Funcionario.js';
import { resolveModel } from '#shared/db/resolveModel.js';

export async function findFuncionarioByCpfAndUnidadeRepo({ unitScope, cpf, unidadeId }) {
  const FuncionarioModel = resolveModel({
    name: Funcionario.modelName || 'Funcionario',
    schema: Funcionario.schema,
    unitScope,
  });

  return FuncionarioModel.findOne({ cpf, unidade_id: unidadeId });
}

export async function findAllFuncionariosSelectIdNomeCpfLeanRepo({ unitScope }) {
  const FuncionarioModel = resolveModel({
    name: Funcionario.modelName || 'Funcionario',
    schema: Funcionario.schema,
    unitScope,
  });

  return FuncionarioModel.find().select('_id nome cpf').lean();
}

export async function findFuncionarioByIdSelectIdUnidadeUsuarioLeanRepo({ unitScope, funcionarioId }) {
  const FuncionarioModel = resolveModel({
    name: Funcionario.modelName || 'Funcionario',
    schema: Funcionario.schema,
    unitScope,
  });

  return FuncionarioModel.findById(funcionarioId).select('_id unidade_id usuario_id').lean();
}

export async function findFuncionarioByCpfUnidadeSelectIdUnidadeEmailLeanRepo({ unitScope, cleanCpf, unidadeId }) {
  const FuncionarioModel = resolveModel({
    name: Funcionario.modelName || 'Funcionario',
    schema: Funcionario.schema,
    unitScope,
  });

  return FuncionarioModel.findOne({ cpf: cleanCpf, unidade_id: unidadeId }).select('_id unidade_id email').lean();
}

export async function findFuncionarioByEmailSelectIdUnidadeEmailLeanRepo({ unitScope, emailNorm }) {
  const FuncionarioModel = resolveModel({
    name: Funcionario.modelName || 'Funcionario',
    schema: Funcionario.schema,
    unitScope,
  });

  return FuncionarioModel.findOne({ email: emailNorm }).select('_id unidade_id email').lean();
}

export async function findFuncionarioByCpfOrEmailLeanRepo({ unitScope, cleanCpf, unidadeId, emailNorm }) {
  const FuncionarioModel = resolveModel({
    name: Funcionario.modelName || 'Funcionario',
    schema: Funcionario.schema,
    unitScope,
  });

  return FuncionarioModel.findOne({ $or: [{ cpf: cleanCpf, unidade_id: unidadeId }, { email: emailNorm }] }).lean();
}

export async function unsetFuncionarioUsuarioIdByIdRepo({ unitScope, funcionarioId }) {
  const FuncionarioModel = resolveModel({
    name: Funcionario.modelName || 'Funcionario',
    schema: Funcionario.schema,
    unitScope,
  });

  return FuncionarioModel.updateOne({ _id: funcionarioId }, { $unset: { usuario_id: '' } });
}

export async function setFuncionarioUsuarioIdByIdRepo({ unitScope, funcionarioId, userId }) {
  const FuncionarioModel = resolveModel({
    name: Funcionario.modelName || 'Funcionario',
    schema: Funcionario.schema,
    unitScope,
  });

  return FuncionarioModel.updateOne({ _id: funcionarioId }, { $set: { usuario_id: userId } });
}

export async function unsetFuncionarioUsuarioIdIfMatchesUserRepo({ unitScope, funcionarioId, userId }) {
  const FuncionarioModel = resolveModel({
    name: Funcionario.modelName || 'Funcionario',
    schema: Funcionario.schema,
    unitScope,
  });

  return FuncionarioModel.updateOne({ _id: funcionarioId, usuario_id: userId }, { $unset: { usuario_id: '' } });
}

export async function setFuncionarioUsuarioIdIfEmptyRepo({ unitScope, funcionarioId, userId }) {
  const FuncionarioModel = resolveModel({
    name: Funcionario.modelName || 'Funcionario',
    schema: Funcionario.schema,
    unitScope,
  });

  return FuncionarioModel.updateOne(
    { _id: funcionarioId, $or: [{ usuario_id: { $exists: false } }, { usuario_id: null }] },
    { $set: { usuario_id: userId } }
  );
}

export async function findFuncionariosParaListagemComRefsSelectLeanRepo({ unitScope, filtro }) {
  const FuncionarioModel = resolveModel({
    name: Funcionario.modelName || 'Funcionario',
    schema: Funcionario.schema,
    unitScope,
  });

  return FuncionarioModel.find(filtro)
    .select('nome cpf unidade_id funcao_id ativo')
    .populate({ path: 'unidade_id', select: 'nome' })
    .populate({ path: 'funcao_id', select: 'nome' })
    .sort({ nome: 1 })
    .lean();
}

export async function findFuncionariosDisponiveisSemUsuarioPorUnidadeSelectLeanRepo({ unitScope, unidadeId }) {
  const FuncionarioModel = resolveModel({
    name: Funcionario.modelName || 'Funcionario',
    schema: Funcionario.schema,
    unitScope,
  });

  return FuncionarioModel.find({
    unidade_id: unidadeId,
    $or: [{ usuario_id: { $exists: false } }, { usuario_id: null }],
  })
    .select('_id nome cpf')
    .sort({ nome: 1 })
    .lean();
}

export async function findFuncionarioByEmailRepo({ unitScope, email }) {
  const FuncionarioModel = resolveModel({
    name: Funcionario.modelName || 'Funcionario',
    schema: Funcionario.schema,
    unitScope,
  });

  return FuncionarioModel.findOne({ email });
}

export async function findFuncionariosByEmailsSelectEmailNomeLeanRepo({ unitScope, emails }) {
  const FuncionarioModel = resolveModel({
    name: Funcionario.modelName || 'Funcionario',
    schema: Funcionario.schema,
    unitScope,
  });

  return FuncionarioModel.find({ email: { $in: emails } }).select('email nome').lean();
}

export async function createFuncionarioDocRepo({ unitScope, doc }) {
  const FuncionarioModel = resolveModel({
    name: Funcionario.modelName || 'Funcionario',
    schema: Funcionario.schema,
    unitScope,
  });

  return FuncionarioModel.create(doc);
}

export async function findFuncionarioByIdRepo({ unitScope, id }) {
  const FuncionarioModel = resolveModel({
    name: Funcionario.modelName || 'Funcionario',
    schema: Funcionario.schema,
    unitScope,
  });

  return FuncionarioModel.findById(id);
}

export async function updateFuncionarioByIdWithOpsRepo({ unitScope, id, ops }) {
  const FuncionarioModel = resolveModel({
    name: Funcionario.modelName || 'Funcionario',
    schema: Funcionario.schema,
    unitScope,
  });

  return FuncionarioModel.findByIdAndUpdate(id, ops, { new: true, runValidators: true });
}

export async function findFuncionarioByIdPopulateRefsRepo({ unitScope, id }) {
  const FuncionarioModel = resolveModel({
    name: Funcionario.modelName || 'Funcionario',
    schema: Funcionario.schema,
    unitScope,
  });

  return FuncionarioModel.findById(id).populate('unidade_id funcao_id departamento');
}

export async function findFuncionarioByIdLeanRepo({ unitScope, id }) {
  const FuncionarioModel = resolveModel({
    name: Funcionario.modelName || 'Funcionario',
    schema: Funcionario.schema,
    unitScope,
  });

  return FuncionarioModel.findById(id).lean();
}

export async function deleteFuncionarioByIdRepo({ unitScope, id }) {
  const FuncionarioModel = resolveModel({
    name: Funcionario.modelName || 'Funcionario',
    schema: Funcionario.schema,
    unitScope,
  });

  return FuncionarioModel.findByIdAndDelete(id);
}

export async function findFuncionariosDisponiveisByUnidadeLeanRepo({ unitScope, unidadeId }) {
  const FuncionarioModel = resolveModel({
    name: Funcionario.modelName || 'Funcionario',
    schema: Funcionario.schema,
    unitScope,
  });

  return FuncionarioModel.find({
    unidade_id: unidadeId,
    $or: [{ usuario_id: { $exists: false } }, { usuario_id: null }],
  }).select('_id nome cpf').sort({ nome: 1 }).lean();
}

export async function findFuncionarioByIdSelectBasicLeanRepo({ unitScope, id }) {
  const FuncionarioModel = resolveModel({
    name: Funcionario.modelName || 'Funcionario',
    schema: Funcionario.schema,
    unitScope,
  });

  return FuncionarioModel.findById(id).select('_id nome cpf unidade_id').lean();
}

export async function findFuncionarioByCpfAndUnidadeSelectLeanRepo({ unitScope, cpf, unidadeId }) {
  const FuncionarioModel = resolveModel({
    name: Funcionario.modelName || 'Funcionario',
    schema: Funcionario.schema,
    unitScope,
  });

  return FuncionarioModel.findOne({ cpf, unidade_id: unidadeId }).select('_id nome cpf email unidade_id usuario_id').lean();
}

export async function findFuncionarioByEmailSelectLeanRepo({ unitScope, email }) {
  const FuncionarioModel = resolveModel({
    name: Funcionario.modelName || 'Funcionario',
    schema: Funcionario.schema,
    unitScope,
  });

  return FuncionarioModel.findOne({ email }).select('_id nome cpf email unidade_id usuario_id').lean();
}