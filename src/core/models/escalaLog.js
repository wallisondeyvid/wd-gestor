import mongoose from 'mongoose';

const escalaLogSchema = new mongoose.Schema({
  escala_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Escala', required: true },
  unidade_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Unidade', default: null },
  equipe_id: { type: String, default: null },
  recurso_id: { type: String, default: null },
  recurso_nome: { type: String, default: null },
  funcionario_id: { type: String, required: true },
  funcionario_nome: { type: String, default: null },
  // Ação: inserção, exclusão, mudança
  acao: { type: String, enum: ['INSERCAO','EXCLUSAO','MUDANCA'], required: true },
  // Contexto da alteração: atribuição, alocação de recurso ou alocação de equipe
  contexto: { type: String, enum: ['atribuicao','alocacao_recurso','alocacao_equipe'], required: true },
  dia: { type: String, required: true }, // YYYY-MM-DD
  turnoId: { type: String, required: true }, // HH:MM-HH:MM (normalizado)
  // Usuário que realizou a operação
  usuario_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  usuario_nome: { type: String, default: null },
  usuario_email: { type: String, default: null },
  // Detalhes opcionais
  detalhes: { type: Object, default: {} }
}, { timestamps: { createdAt: 'em', updatedAt: false } });

escalaLogSchema.index({ em: 1 });
escalaLogSchema.index({ dia: 1, turnoId: 1 });
escalaLogSchema.index({ funcionario_id: 1, em: 1 });
escalaLogSchema.index({ unidade_id: 1, em: 1 });

const EscalaLog = mongoose.models.EscalaLog || mongoose.model('EscalaLog', escalaLogSchema);
export default EscalaLog;
