import mongoose from 'mongoose';

const portalUserPermSchema = new mongoose.Schema({
  email: { type: String, trim: true, lowercase: true, default: '' },
  permitir_pessoal_para_pessoal: { type: Boolean, default: true },
  permitir_pessoal_para_habitacao: { type: Boolean, default: true },
  permitir_pessoal_para_colaborador: { type: Boolean, default: true }
}, { _id: false });

const condMsgSettingsSchema = new mongoose.Schema({
  unidade_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Unidade', required: true, unique: true, index: true },

  // Regras globais (por unidade)
  suspender_caixas_pessoais: { type: Boolean, default: false },
  suspender_caixas_grupo: { type: Boolean, default: false },
  permitir_pessoal_para_pessoal: { type: Boolean, default: true },

  // Suspensão individual (caixa pessoal é identificada por e-mail)
  // Legado: lista única por e-mail (afetava Portal e Colaborador). Mantido por compatibilidade.
  pessoais_suspensas: { type: [String], default: [] },

  // Novo: separa suspensão por origem
  pessoais_suspensas_portal: { type: [String], default: () => [] },
  pessoais_suspensas_colaborador: { type: [String], default: () => [] },

  // Permissões por usuário (Portal do Morador). Chave: e-mail.
  // Observação: estas regras NÃO afetam o Gestor; servem para governança do Portal.
  portal_user_perms: { type: [portalUserPermSchema], default: () => [] },

  updatedBy: { type: String, trim: true, default: '' }
}, { timestamps: true });

condMsgSettingsSchema.index({ unidade_id: 1 }, { unique: true, name: 'unidade_unique' });

const CondMsgSettings = mongoose.models.CondMsgSettings || mongoose.model('CondMsgSettings', condMsgSettingsSchema);
export default CondMsgSettings;
