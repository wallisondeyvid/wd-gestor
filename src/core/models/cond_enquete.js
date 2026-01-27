import mongoose from 'mongoose';

const opcaoSchema = new mongoose.Schema({
  texto: { type: String, trim: true, required: true, maxlength: 180 },
  foto: { type: String, trim: true, default: '', maxlength: 800 }
}, { timestamps: false });

const restricoesSchema = new mongoose.Schema({
  // Listas de exclusão explícitas
  excluirHabitacaoIds: { type: [String], default: () => [] },
  excluirMoradorIds: { type: [String], default: () => [] },
  excluirMoradorCpfs: { type: [String], default: () => [] },
  excluirMoradorEmails: { type: [String], default: () => [] },

  // Regras
  naoExibirHabDesabitadas: { type: Boolean, default: false },
  apenasResponsavelHabitacao: { type: Boolean, default: false },
  apenasProprietario: { type: Boolean, default: false }
}, { _id: false });

const enqueteSchema = new mongoose.Schema({
  unidade_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Unidade', required: true, index: true },

  vigencia_inicio: { type: Date, required: true, index: true },
  vigencia_fim: { type: Date, required: true, index: true },

  pergunta: { type: String, trim: true, required: true, maxlength: 500 },
  foto_pergunta: { type: String, trim: true, default: '', maxlength: 800 },
  opcoes: {
    type: [opcaoSchema],
    validate: {
      validator: (list) => Array.isArray(list) && list.length >= 2 && list.length <= 12,
      message: 'A enquete deve ter entre 2 e 12 opções.'
    },
    default: () => []
  },

  restricoes: { type: restricoesSchema, default: () => ({}) },

  criadaPor: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'CondUsuario', default: null },
    nome: { type: String, trim: true, default: '' }
  },

  finalizadaEm: { type: Date, default: null, index: true },
  finalizadaPor: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'CondUsuario', default: null },
    nome: { type: String, trim: true, default: '' }
  }
}, { timestamps: true });

enqueteSchema.index({ unidade_id: 1, createdAt: -1 });

enqueteSchema.methods.isFinalizada = function () {
  return !!this.finalizadaEm;
};

enqueteSchema.methods.statusCalculado = function (now = new Date()) {
  if (this.finalizadaEm) return 'finalizada';
  const ini = this.vigencia_inicio ? new Date(this.vigencia_inicio) : null;
  const fim = this.vigencia_fim ? new Date(this.vigencia_fim) : null;
  if (ini && now < ini) return 'agendada';
  if (fim && now > fim) return 'encerrada';
  return 'ativa';
};

const CondEnquete = mongoose.models.CondEnquete || mongoose.model('CondEnquete', enqueteSchema);
export default CondEnquete;
