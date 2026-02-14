import mongoose from 'mongoose';

// Cargo (Dirigência): entidade permanente por unidade.
// Observação: usamos _id string composta ("<unidadeId>:<roleId>") para compatibilidade
// com os IDs de cargos já existentes no estado do organograma (state.roles[].id).

const condDirigenciaCargoSchema = new mongoose.Schema({
  _id: { type: String, required: true, trim: true },
  unidadeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Unidade', required: true, index: true },

  nome: { type: String, required: true, trim: true },
  subordinacao: { type: String, trim: true, default: '' },
  tipo: { type: String, trim: true, default: '' }
}, { timestamps: true });

condDirigenciaCargoSchema.index({ unidadeId: 1, nome: 1 }, { name: 'unidade_nome' });
condDirigenciaCargoSchema.index({ unidadeId: 1, _id: 1 }, { unique: true, name: 'unidade_id_composta_unique' });

const CondDirigenciaCargo = mongoose.models.CondDirigenciaCargo || mongoose.model('CondDirigenciaCargo', condDirigenciaCargoSchema);
export default CondDirigenciaCargo;
