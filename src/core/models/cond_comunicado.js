import mongoose from 'mongoose';

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

const comunicadoSchema = new mongoose.Schema({
  unidade_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Unidade', required: true, index: true },

  vigencia_inicio: { type: Date, required: true, index: true },
  vigencia_fim: { type: Date, required: true, index: true },

  // Remoção automática do banco: 30 dias após o fim da vigência
  expiresAt: { type: Date, default: null },

  assunto: { type: String, trim: true, default: '', maxlength: 140 },
  mensagem: { type: String, trim: true, required: true, maxlength: 4000 },
  foto: { type: String, trim: true, default: '', maxlength: 800 },

  restricoes: { type: restricoesSchema, default: () => ({}) },

  criadaPor: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'CondUsuario', default: null },
    nome: { type: String, trim: true, default: '' }
  }
}, { timestamps: true });

comunicadoSchema.index({ unidade_id: 1, createdAt: -1 });
comunicadoSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

comunicadoSchema.methods.statusCalculado = function (now = new Date()) {
  try {
    const ini = this.vigencia_inicio ? new Date(this.vigencia_inicio) : null;
    const fim = this.vigencia_fim ? new Date(this.vigencia_fim) : null;
    if (ini && now < ini) return 'agendada';
    if (fim && now > fim) return 'encerrada';
    return 'ativa';
  } catch {
    return 'ativa';
  }
};

const CondComunicado = mongoose.models.CondComunicado || mongoose.model('CondComunicado', comunicadoSchema);
export default CondComunicado;
