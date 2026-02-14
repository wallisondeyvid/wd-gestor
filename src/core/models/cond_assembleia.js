import mongoose from 'mongoose';

const pautaItemSchema = new mongoose.Schema({
  tipo: { type: String, trim: true, default: '', maxlength: 80 },
  descricao: { type: String, trim: true, default: '', maxlength: 4000 },
  observacoesInternas: { type: String, trim: true, default: '', maxlength: 4000 },
  anexos: { type: [String], default: () => [] }
}, { _id: false });

const auditSchema = new mongoose.Schema({
  createdBy: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    nome: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, default: '' }
  },
  updatedBy: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    nome: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, default: '' }
  }
}, { _id: false });

const assembleiaSchema = new mongoose.Schema({
  // Contexto (opcional no MVP)
  unidade_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Unidade', default: null, index: true },

  natureza: { type: String, trim: true, default: '' }, // ordinaria|extraordinaria
  titulo: { type: String, trim: true, default: '', maxlength: 240 },
  numero: { type: String, trim: true, default: '', maxlength: 60 },
  data: { type: Date, default: null, index: true },

  modalidade: { type: String, trim: true, default: '' }, // presencial|virtual|hibrida
  local: { type: String, trim: true, default: '', maxlength: 500 },
  link: { type: String, trim: true, default: '', maxlength: 800 },

  responsavel: { type: String, trim: true, default: '' }, // sindico|administradora|conselho
  observacoes: { type: String, trim: true, default: '', maxlength: 4000 },

  regraConvocacao: { type: String, trim: true, default: '' }, // dupla|unica
  hora1: { type: String, trim: true, default: '', maxlength: 10 },
  hora2: { type: String, trim: true, default: '', maxlength: 10 },
  horaUnica: { type: String, trim: true, default: '', maxlength: 10 },
  overrideMotivo: { type: String, trim: true, default: '', maxlength: 240 },

  pauta: { type: [pautaItemSchema], default: () => [] },

  status: { type: String, trim: true, default: 'rascunho', index: true }, // rascunho|convocada|aberta|em_andamento|encerrada|cancelada

  dataPublicacao: { type: Date, default: null, index: true },
  publicarPortal: { type: Boolean, default: true },
  enviarEmail: { type: Boolean, default: false },
  assinaturaDigital: { type: Boolean, default: false },

  // Token do documento validável (edital assinado externamente)
  editalDocumentoToken: { type: String, trim: true, default: '', maxlength: 120 },

  audit: { type: auditSchema, default: () => ({}) }
}, { timestamps: true });

assembleiaSchema.index({ unidade_id: 1, createdAt: -1 });
assembleiaSchema.index({ status: 1, data: -1 });

const CondAssembleia = mongoose.models.CondAssembleia || mongoose.model('CondAssembleia', assembleiaSchema);
export default CondAssembleia;
