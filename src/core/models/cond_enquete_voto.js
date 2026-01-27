import mongoose from 'mongoose';

const votoSchema = new mongoose.Schema({
  unidade_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Unidade', required: true, index: true },
  enquete_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CondEnquete', required: true, index: true },

  habitacao_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CondHabitacao', default: null, index: true },
  habitacao_label: { type: String, trim: true, default: '' },

  morador_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CondMorador', default: null, index: true },
  morador_nome: { type: String, trim: true, default: '' },
  morador_email: { type: String, trim: true, lowercase: true, default: '' },
  morador_cpf: { type: String, trim: true, default: '' },

  opcao_id: { type: mongoose.Schema.Types.ObjectId, required: true, index: true }
}, { timestamps: true });

votoSchema.pre('save', function (next) {
  try {
    if (this.morador_cpf) this.morador_cpf = String(this.morador_cpf).replace(/\D/g, '');
  } catch {
    /* noop */
  }
  next();
});

// 1 voto por morador por enquete (quando houver morador_id)
votoSchema.index(
  { enquete_id: 1, morador_id: 1 },
  { unique: true, partialFilterExpression: { morador_id: { $type: 'objectId' } } }
);

votoSchema.index({ enquete_id: 1, createdAt: -1 });

const CondEnqueteVoto = mongoose.models.CondEnqueteVoto || mongoose.model('CondEnqueteVoto', votoSchema);
export default CondEnqueteVoto;
