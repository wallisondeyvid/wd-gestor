import {
  findUserById,
  saveUserDoc,
  findFuncionarioById,
  saveFuncionario,
} from '#modules/gestor/app/db/api.db.js';

export async function syncUserFuncionarioFields({ sourceModel, sourceDoc, updatedFields }) {
  try {
    let targetId;
    let syncFields = {};
    let targetDoc;
    let targetModelName = '';

    if (sourceModel === 'User') {
      if (!sourceDoc.funcionario_id) {
        return;
      }
      targetId = sourceDoc.funcionario_id;
      targetModelName = 'Funcionario';
      if (updatedFields.nome) syncFields.nome = sourceDoc.nome;
      if (updatedFields.cpf) syncFields.cpf = sourceDoc.cpf;
      if (Object.keys(syncFields).length === 0) return;
      targetDoc = await findFuncionarioById(targetId);
      if (!targetDoc) return;
      Object.assign(targetDoc, syncFields);
      await saveFuncionario(targetDoc);
    } else if (sourceModel === 'Funcionario') {
      if (!sourceDoc.usuario_id) {
        return;
      }
      targetId = sourceDoc.usuario_id;
      targetModelName = 'User';
      if (updatedFields.nome) syncFields.nome = sourceDoc.nome;
      if (updatedFields.cpf) syncFields.cpf = sourceDoc.cpf;
      if (Object.keys(syncFields).length === 0) return;
      targetDoc = await findUserById(targetId);
      if (!targetDoc) return;
      Object.assign(targetDoc, syncFields);
      await saveUserDoc(targetDoc);
    } else {
      return;
    }

    console.log(`[SYNC] Campos sincronizados de ${sourceModel} para ${targetModelName}:`, syncFields);
  } catch(error) {
    console.error('[SYNC] Erro na sincronização:', error);
  }
}
export function createSyncHook(modelName){ return async function(doc, options){ const modifiedFields = doc.modifiedPaths ? doc.modifiedPaths() : []; const syncFields=['nome','cpf']; const hasSyncFields = modifiedFields.some(f=>syncFields.includes(f)); if(hasSyncFields && !options?.skipSync){ setImmediate(async ()=>{ await syncUserFuncionarioFields({ sourceModel:modelName, sourceDoc:doc, updatedFields: modifiedFields.reduce((acc,f)=>{ if(syncFields.includes(f)) acc[f]=true; return acc; },{}) }); }); } }; }
