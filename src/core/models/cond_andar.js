import mongoose from 'mongoose';

// Andares/Pavimentos do condomínio
const andarSchema = new mongoose.Schema({
  unidade_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Unidade', required: true, index: true },
  nome: { type: String, trim: true, required: true }, // Ex: Térreo, 1º, 2º
  numero: { type: Number, default: null }, // opcional para ordenar
  ordem: { type: Number, default: 0 },
  ativo: { type: Boolean, default: true }
}, { timestamps: true });

andarSchema.index({ unidade_id: 1, nome: 1 }, { unique: true });

const CondAndar = mongoose.models.CondAndar || mongoose.model('CondAndar', andarSchema);
export default CondAndar;
