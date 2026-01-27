import mongoose from 'mongoose';

// Bens Materiais (patrimônio) associados ao condomínio
const bemMaterialSchema = new mongoose.Schema({
  unidade_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Unidade', required: true },
  tipo: { type: String, trim: true, enum: ['Fixo','Móvel'], required: true },
  natureza_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CondNatMaterial', required: true },

  // Identificação do bem
  serie: { type: String, trim: true, maxlength: 15, default: '' }, // Nº de patrimônio (alfanumérico)
  data_aquisicao: { type: Date, default: null },

  // Atributos adicionais
  marca: { type: String, trim: true, default: '' },
  modelo: { type: String, trim: true, default: '' },
  num_serie: { type: String, trim: true, default: '' },
  peso: { type: String, trim: true, default: '' },
  cor: { type: String, trim: true, default: '' },
  descricao: { type: String, trim: true, default: '' },

  // Arquivos
  foto: { type: String, trim: true, default: '' }, // URL pública
  anexo: { type: String, trim: true, default: '' }, // URL pública (PDF, ex.: nota fiscal)

  // Vinculação opcional à área comum
  vinculo_area: {
    unidade_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Unidade', default: null },
    area_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CondAreaComum', default: null }
  },

  ativa: { type: Boolean, default: true }
}, { timestamps: true });

// Série única por unidade (quando informada)
bemMaterialSchema.index({ unidade_id: 1, serie: 1 }, { unique: true, partialFilterExpression: { serie: { $type: 'string', $ne: '' } } });

const CondBemMaterial = mongoose.models.CondBemMaterial || mongoose.model('CondBemMaterial', bemMaterialSchema);
export default CondBemMaterial;
