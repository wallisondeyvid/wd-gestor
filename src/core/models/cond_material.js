import mongoose from 'mongoose';

// Materiais (consumo/estoque) associados ao condomínio
const materialSchema = new mongoose.Schema({
  unidade_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Unidade', required: true },
  codigo: { type: String, trim: true, default: '' },
  descricao: { type: String, trim: true, required: true },
  categoria: { type: String, trim: true, default: '' },
  unidade_medida: { type: String, trim: true, default: '' }, // ex: un, kg, l
  estoque_minimo: { type: Number, default: 0 },
  estoque_atual: { type: Number, default: 0 },
  custo_medio: { type: Number, default: 0 },
  ativa: { type: Boolean, default: true }
}, { timestamps: true });

materialSchema.index({ unidade_id: 1, descricao: 1 }, { unique: false });

const CondMaterial = mongoose.models.CondMaterial || mongoose.model('CondMaterial', materialSchema);
export default CondMaterial;
