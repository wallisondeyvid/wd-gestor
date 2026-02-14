import mongoose from 'mongoose';

const presenceSchema = new mongoose.Schema({
  presenceId: { type: String, trim: true, default: '' },
  key: { type: String, trim: true, default: '' },
  nome: { type: String, trim: true, default: '' },
  unidadeLabel: { type: String, trim: true, default: '' },
  unidadeRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Unidade', default: null },

  habitacao_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CondHabitacao', default: null },
  pessoa_id: { type: mongoose.Schema.Types.ObjectId, default: null },

  source: { type: String, trim: true, default: '' }, // portal|manual
  status: { type: String, trim: true, default: 'confirmado' }, // pendente|confirmado|ausente
  presence_role: { type: String, trim: true, default: 'REPRESENTANTE' }, // REPRESENTANTE|NAO_REPRESENTANTE
  requested_by: { type: String, trim: true, default: '' }, // MODERATOR|PARTICIPANT
  confirm_method: { type: String, trim: true, default: '' }, // PORTAL|LOCAL_PIN|MODERATOR_CLICK

  // Auditoria mínima do fluxo (quem lançou vs quem confirmou)
  createdAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.Mixed, default: null },
  confirmedBy: { type: mongoose.Schema.Types.Mixed, default: null },
  confirmed_by_participant_at: { type: Date, default: null },
  confirmed_by_moderator_at: { type: Date, default: null },

  fracaoIdeal: { type: Number, default: 0 },
  procuracaoPara: { type: String, trim: true, default: '' },

  confirmedAt: { type: Date, default: null },
  updatedAt: { type: Date, default: null }
}, { _id: false });

const agendaItemSchema = new mongoose.Schema({
  idx: { type: Number, default: 0 },
  tipo: { type: String, trim: true, default: '' },
  descricao: { type: String, trim: true, default: '' },

  state: { type: String, trim: true, default: 'pendente' }, // pendente|discutindo|concluido
  discussionStartedAt: { type: Date, default: null },
  discussionEndedAt: { type: Date, default: null },

  timeMs: { type: Number, default: 0 }
}, { _id: false });

const ballotSchema = new mongoose.Schema({
  presenceKey: { type: String, trim: true, default: '' },
  choice: { type: String, trim: true, default: '' }, // sim|nao|abstencao
  source: { type: String, trim: true, default: '' }, // portal|mesa
  fracaoIdeal: { type: Number, default: 0 },
  castAt: { type: Date, default: null }
}, { _id: false });

const voteSchema = new mongoose.Schema({
  agendaIdx: { type: Number, default: 0 },
  voteType: { type: String, trim: true, default: 'sim_nao_abstencao' },
  ruleType: { type: String, trim: true, default: 'maioria_simples' },

  openedAt: { type: Date, default: null },
  closedAt: { type: Date, default: null },

  ballots: { type: [ballotSchema], default: () => [] }
}, { _id: false });

const eventSchema = new mongoose.Schema({
  at: { type: Date, default: () => new Date() },
  type: { type: String, trim: true, default: '' },
  message: { type: String, trim: true, default: '' },
  actorEmail: { type: String, trim: true, default: '' }
}, { _id: false });

const executionSchema = new mongoose.Schema({
  assembleia_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CondAssembleia', required: true, unique: true, index: true },
  unidade_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Unidade', default: null, index: true },

  sessionStatus: { type: String, trim: true, default: 'aguardando', index: true }, // aguardando|aberta|em_votacao|encerrada
  isPaused: { type: Boolean, default: false },

  openedAt: { type: Date, default: null },
  pausedAt: { type: Date, default: null },
  pausedMs: { type: Number, default: 0 },
  closedAt: { type: Date, default: null },

  virtualLink: { type: String, trim: true, default: '' },

  currentAgendaIdx: { type: Number, default: 0 },

  presences: { type: [presenceSchema], default: () => [] },
  agenda: { type: [agendaItemSchema], default: () => [] },
  votes: { type: [voteSchema], default: () => [] },

  events: { type: [eventSchema], default: () => [] }
}, { timestamps: true });

executionSchema.index({ unidade_id: 1, updatedAt: -1 });

const CondAssembleiaExecution = mongoose.models.CondAssembleiaExecution || mongoose.model('CondAssembleiaExecution', executionSchema);
export default CondAssembleiaExecution;
