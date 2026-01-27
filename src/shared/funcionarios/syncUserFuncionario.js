// Versão compartilhada para sincronização entre User e Funcionario
import User from '#core/models/user.js';
import Funcionario from '#core/models/Funcionario.js';

export async function syncUserFuncionarioFields({ sourceModel, sourceDoc, updatedFields }) {
  try {
    let targetModel, targetId;
    const syncFields = {};
    if (sourceModel === 'User') {
      if (!sourceDoc.funcionario_id) return;
      targetModel = Funcionario;
      targetId = sourceDoc.funcionario_id;
      if (updatedFields.nome) syncFields.nome = sourceDoc.nome;
      if (updatedFields.cpf) syncFields.cpf = sourceDoc.cpf;
    } else if (sourceModel === 'Funcionario') {
      if (!sourceDoc.usuario_id) return;
      targetModel = User;
      targetId = sourceDoc.usuario_id;
      if (updatedFields.nome) syncFields.nome = sourceDoc.nome;
      if (updatedFields.cpf) syncFields.cpf = sourceDoc.cpf;
    }
    if (Object.keys(syncFields).length === 0) return;
    const targetDoc = await targetModel.findById(targetId);
    if (!targetDoc) return;
    Object.assign(targetDoc, syncFields);
    await targetDoc.save();
    console.log(`[SYNC] Campos sincronizados de ${sourceModel} para ${targetModel.modelName}:`, syncFields);
  } catch (error) {
    console.error('[SYNC] Erro na sincronização:', error.message);
  }
}

export function createSyncHook(modelName) {
  return async function(doc, options) {
    const modifiedFields = doc.modifiedPaths ? doc.modifiedPaths() : [];
    const syncFields = ['nome','cpf'];
    const hasSync = modifiedFields.some(f => syncFields.includes(f));
    if (hasSync && !options?.skipSync) {
      setImmediate(async () => {
        await syncUserFuncionarioFields({
          sourceModel: modelName,
          sourceDoc: doc,
            updatedFields: modifiedFields.reduce((acc,f)=>{ if(syncFields.includes(f)) acc[f]=true; return acc; }, {})
        });
      });
    }
  };
}
