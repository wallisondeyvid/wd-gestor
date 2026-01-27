// Modelo de Ausência
import mongoose from 'mongoose';

const AusenciaSchema = new mongoose.Schema({
  funcionarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'Funcionario', required: true, index: true },
  funcionarioNome: { type: String, required: true },
  tipo: { type: String, required: true },
  inicioISO: { type: String, required: true },
  fimISO: { type: String, required: true },
  motivo: { type: String },
  autorizadorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Funcionario' },
  autorizadorNome: { type: String },
  origem: { type: String, enum: ['manual','importacao'], default: 'manual' },
  situacao: { type: String, enum: ['ativo','cancelado'], default: 'ativo' }
}, { timestamps: true, versionKey: false });

AusenciaSchema.index({ funcionarioId: 1, inicioISO: 1 });
AusenciaSchema.index({ inicioISO: 1, fimISO: 1 });

export default mongoose.models.Ausencia || mongoose.model('Ausencia', AusenciaSchema);
