import mongoose from 'mongoose';

const condSolicitacaoServicoSchema = new mongoose.Schema(
  {
    unidade_id: { type: String, index: true },
    habitacao_id: { type: String, index: true },
    habitacao_label: { type: String, trim: true, maxlength: 160 },
    morador_email: { type: String, index: true },
    protocolo: { type: String, index: true },
    titulo: { type: String, required: true, trim: true, maxlength: 120 },
    descricao: { type: String, required: true, trim: true, maxlength: 2000 },
    fotos: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length <= 5,
        message: 'Máximo de 5 fotos.'
      }
    },
    status: { type: String, default: 'aberto', index: true },
    nova: { type: Boolean, default: true, index: true },
    aceita_em: { type: Date, default: null },
    aceita_por: { type: String, default: null },
    aceita_por_nome: { type: String, default: null },
    rejeitada_em: { type: Date, default: null },
    rejeitada_por: { type: String, default: null },
    rejeitada_por_nome: { type: String, default: null },
    rejeicao_motivo: { type: String, trim: true, default: null, maxlength: 500 }
  },
  { timestamps: true }
);

condSolicitacaoServicoSchema.index({ unidade_id: 1, morador_email: 1, createdAt: -1 });
condSolicitacaoServicoSchema.index({ habitacao_id: 1, createdAt: -1 });

const CondSolicitacaoServico =
  mongoose.models.CondSolicitacaoServico ||
  mongoose.model('CondSolicitacaoServico', condSolicitacaoServicoSchema);

export default CondSolicitacaoServico;
