import User from '#models/user.js';
import Funcionario from '#models/Funcionario.js';

/**
 * Sincroniza campos comuns entre User e Funcionario
 * @param {Object} params - Parâmetros da sincronização
 * @param {string} params.sourceModel - Modelo de origem ('User' ou 'Funcionario')
 * @param {Object} params.sourceDoc - Documento de origem
 * @param {Object} params.updatedFields - Campos que foram atualizados
 */
export async function syncUserFuncionarioFields({ sourceModel, sourceDoc, updatedFields }) {
  try {
    let targetModel, targetId, syncFields = {};

    // Determinar qual modelo é o alvo da sincronização
    if (sourceModel === 'User') {
      if (!sourceDoc.funcionario_id) {
        console.log('[SYNC] User não tem funcionario_id vinculado, pulando sincronização');
        return;
      }
      targetModel = Funcionario;
      targetId = sourceDoc.funcionario_id;

      // Mapear campos do User para Funcionario
      if (updatedFields.nome) syncFields.nome = sourceDoc.nome;
      if (updatedFields.cpf) syncFields.cpf = sourceDoc.cpf;

    } else if (sourceModel === 'Funcionario') {
      if (!sourceDoc.usuario_id) {
        console.log('[SYNC] Funcionario não tem usuario_id vinculado, pulando sincronização');
        return;
      }
      targetModel = User;
      targetId = sourceDoc.usuario_id;

      // Mapear campos do Funcionario para User
      if (updatedFields.nome) syncFields.nome = sourceDoc.nome;
      if (updatedFields.cpf) syncFields.cpf = sourceDoc.cpf;
    }

    // Se não há campos para sincronizar, sair
    if (Object.keys(syncFields).length === 0) {
      return;
    }

    // Buscar e atualizar o documento alvo
    const targetDoc = await targetModel.findById(targetId);
    if (!targetDoc) {
      console.warn(`[SYNC] Documento alvo não encontrado no modelo ${targetModel.modelName}, ID: ${targetId}`);
      return;
    }

    // Aplicar as atualizações
    Object.assign(targetDoc, syncFields);
    await targetDoc.save();

    console.log(`[SYNC] Campos sincronizados de ${sourceModel} para ${targetModel.modelName}:`, syncFields);

  } catch (error) {
    console.error('[SYNC] Erro na sincronização:', error);
    // Não lançar erro para não quebrar a operação principal
  }
}

/**
 * Hook para ser usado em pre/post save dos modelos
 * @param {string} modelName - Nome do modelo ('User' ou 'Funcionario')
 * @param {Object} doc - Documento sendo salvo
 * @param {Object} options - Opções do hook
 */
export function createSyncHook(modelName) {
  return async function(doc, options) {
    // Verificar se há campos que precisam ser sincronizados
    const modifiedFields = doc.modifiedPaths ? doc.modifiedPaths() : [];
    const syncFields = ['nome', 'cpf'];

    const hasSyncFields = modifiedFields.some(field => syncFields.includes(field));

    if (hasSyncFields && !options.skipSync) {
      // Agendar sincronização para depois do save
      setImmediate(async () => {
        await syncUserFuncionarioFields({
          sourceModel: modelName,
          sourceDoc: doc,
          updatedFields: modifiedFields.reduce((acc, field) => {
            if (syncFields.includes(field)) {
              acc[field] = true;
            }
            return acc;
          }, {})
        });
      });
    }
  };
}