import mongoose from 'mongoose';

// Blocos/Torres do condomínio
const blocoSchema = new mongoose.Schema({
  unidade_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Unidade', required: true, index: true },
  nome: { type: String, trim: true, required: true },
  ordem: { type: Number, default: 0 },
  ativo: { type: Boolean, default: true }
}, { timestamps: true });

blocoSchema.index({ unidade_id: 1, nome: 1 }, { unique: true });

const CondBloco = mongoose.models.CondBloco || mongoose.model('CondBloco', blocoSchema);
export default CondBloco;
