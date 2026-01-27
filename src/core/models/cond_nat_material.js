import mongoose from 'mongoose';

// Natureza de Materiais (categoria/nome) por condomínio e tipo (Fixo/Móvel)
const natMaterialSchema = new mongoose.Schema({
  unidade_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Unidade', required: true },
  tipo: { type: String, trim: true, enum: ['Fixo','Móvel'], required: true },
  nome: { type: String, trim: true, required: true }
}, { timestamps: true });

// Unicidade por unidade+tipo+nome
natMaterialSchema.index({ unidade_id: 1, tipo: 1, nome: 1 }, { unique: true });

const CondNatMaterial = mongoose.models.CondNatMaterial || mongoose.model('CondNatMaterial', natMaterialSchema);
export default CondNatMaterial;
