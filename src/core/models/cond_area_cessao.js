import mongoose from 'mongoose';

const materiaisSchema = new mongoose.Schema({
  disponiveis: { type: [mongoose.Schema.Types.Mixed], default: [] },
  extraidos: { type: [mongoose.Schema.Types.Mixed], default: [] }
}, { _id: false, strict: false });

const responsabilidadeSchema = new mongoose.Schema({
  id: { type: String, trim: true },
  texto: { type: String, trim: true },
  origem: { type: mongoose.Schema.Types.Mixed, default: null }
}, { _id: false, strict: false });

const foroSchema = new mongoose.Schema({
  estado: { type: String, trim: true, default: '' },
  municipio: { type: String, trim: true, default: '' },
  vara: { type: String, trim: true, default: '' }
}, { _id: false });

const condAreaCessaoSchema = new mongoose.Schema({
  area_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CondAreaComum', required: true, unique: true },
  unidade_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Unidade', required: true },
  cessoes: { type: [mongoose.Schema.Types.Mixed], default: [] },
  contratos: { type: [mongoose.Schema.Types.Mixed], default: [] },
  responsabilidades: { type: [responsabilidadeSchema], default: [] },
  materiais: { type: materiaisSchema, default: () => ({ disponiveis: [], extraidos: [] }) },
  financeiro: { type: mongoose.Schema.Types.Mixed, default: null },
  foro: { type: foroSchema, default: () => ({ estado: '', municipio: '', vara: '' }) },
  updated_by: { type: String, default: null },
  updated_by_nome: { type: String, default: '' }
}, { timestamps: true, strict: false });

condAreaCessaoSchema.index({ area_id: 1 }, { unique: true });

const CondAreaCessao = mongoose.models.CondAreaCessao || mongoose.model('CondAreaCessao', condAreaCessaoSchema);
export default CondAreaCessao;
