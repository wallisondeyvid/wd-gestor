// Modelo de Férias
// Caso exista uma camada core como nos outros modelos, adapte export default from '#core/models/ferias.js'
// Por enquanto, implementação direta aqui.
import mongoose from 'mongoose';

const FeriasSchema = new mongoose.Schema({
  funcionarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'Funcionario', required: true, index: true },
  funcionarioNome: { type: String, required: true },
  inicioISO: { type: String, required: true }, // formato yyyy-mm-dd
  fimISO: { type: String, required: true },
  ano: { type: Number, required: true, index: true },
  dias: { type: Number },
  origem: { type: String, enum: ['manual','importacao'], default: 'manual' },
  situacao: { type: String, enum: ['ativo','cancelado'], default: 'ativo' },
  observacoes: { type: String }
}, { timestamps: true, versionKey: false });

FeriasSchema.index({ funcionarioId: 1, ano: 1 });
FeriasSchema.index({ inicioISO: 1 });

export default mongoose.models.Ferias || mongoose.model('Ferias', FeriasSchema);
