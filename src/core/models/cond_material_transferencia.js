import mongoose from 'mongoose';

const actorSchema = new mongoose.Schema({
  referencia_id: { type: mongoose.Schema.Types.ObjectId, default: null },
  nome: { type: String, trim: true, default: '' },
  email: { type: String, trim: true, default: '' }
}, { _id: false });

const condMaterialTransferenciaSchema = new mongoose.Schema({
  unidade_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Unidade', required: true },
  material_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CondBemMaterial', required: true },
  origem_area_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CondAreaComum', required: true },
  destino_area_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CondAreaComum', required: true },
  status: { type: String, enum: ['pendente', 'aceito', 'recusado', 'cancelado', 'concluido'], default: 'pendente' },
  solicitante: { type: actorSchema, default: () => ({}) },
  aceite: { type: actorSchema, default: null },
  aceite_em: { type: Date, default: null },
  cancelado: { type: actorSchema, default: null },
  cancelado_em: { type: Date, default: null },
  meta: { type: mongoose.Schema.Types.Mixed, default: null }
}, { timestamps: true, strict: false });

condMaterialTransferenciaSchema.index({
  material_id: 1
}, {
  unique: true,
  partialFilterExpression: { status: 'pendente' }
});

const CondMaterialTransferencia = mongoose.models.CondMaterialTransferencia
  || mongoose.model('CondMaterialTransferencia', condMaterialTransferenciaSchema);

export default CondMaterialTransferencia;
