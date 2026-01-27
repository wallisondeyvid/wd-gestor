import mongoose from 'mongoose';

// Vaga de Garagem em Condomínio
const vagaSchema = new mongoose.Schema({
  unidade_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Unidade', required: true },
  nome: { type: String, trim: true, required: true }, // Identificação: Vaga 01, A001...
  // Vínculo opcional com Habitação ou Área Comum
  link_type: { type: String, enum: ['', 'hab', 'area'], default: '' },
  link_id: { type: mongoose.Schema.Types.ObjectId, default: null },
  // Anotações e foto
  obs: { type: String, trim: true, default: '' },
  foto: { type: String, trim: true, default: '' },
  ativa: { type: Boolean, default: true }
}, { timestamps: true });

vagaSchema.index({ unidade_id: 1, nome: 1 }, { unique: false });

const CondVagaGaragem = mongoose.models.CondVagaGaragem || mongoose.model('CondVagaGaragem', vagaSchema);
export default CondVagaGaragem;
