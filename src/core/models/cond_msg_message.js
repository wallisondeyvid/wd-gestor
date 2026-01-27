import mongoose from 'mongoose';

const memberSchema = new mongoose.Schema({
  type: { type: String, trim: true, default: 'user' },
  // user
  email: { type: String, trim: true, lowercase: true, default: '' },
  nome: { type: String, trim: true, default: '' },
  fotoUrl: { type: String, trim: true, default: '' },
  // mailbox
  mailboxId: { type: String, trim: true, default: '' },
  name: { type: String, trim: true, default: '' }
}, { _id: false });

const attachmentSchema = new mongoose.Schema({
  nome: { type: String, trim: true, default: '' },
  mime: { type: String, trim: true, default: '' },
  tamanho: { type: Number, default: 0 },
  url: { type: String, trim: true, default: '' },
  caminho: { type: String, trim: true, default: '' }
}, { _id: false });

const mailboxStateSchema = new mongoose.Schema({
  mailbox_id: { type: String, trim: true, default: '' },
  owner: { type: String, trim: true, lowercase: true, default: '' },
  lida_em: { type: Date, default: null },
  arquivada_em: { type: Date, default: null },
  // De qual pasta veio ao arquivar (entrada/saida)
  arquivada_de: { type: String, trim: true, lowercase: true, default: '' },
  lixeira_em: { type: Date, default: null },
  // De qual pasta veio ao ir para a lixeira (entrada/saida/arquivo)
  lixeira_de: { type: String, trim: true, lowercase: true, default: '' },
  // Exclusão definitiva (tombstone por usuário/caixa)
  excluida_em: { type: Date, default: null },
  fixada_em: { type: Date, default: null },
  marcadores: { type: [String], default: [] }
}, { _id: false });

const accessEventSchema = new mongoose.Schema({
  mailbox_id: { type: String, trim: true, default: '' },
  owner: { type: String, trim: true, lowercase: true, default: '' },
  user: { type: String, trim: true, default: '' },
  at: { type: Date, default: null }
}, { _id: false });

const condMsgMessageSchema = new mongoose.Schema({
  protocolo: { type: String, required: true, trim: true },
  ano: { type: Number, default: 0 },

  from_mailbox_id: { type: String, required: true, trim: true },
  from_mailbox_name: { type: String, trim: true, default: '' },
  from_owner: { type: String, trim: true, lowercase: true, default: '' },

  to: { type: [memberSchema], default: [] },
  cc: { type: [memberSchema], default: [] },

  assunto: { type: String, required: true, trim: true, maxlength: 140 },

  body_html: { type: String, trim: true, default: '' },
  body_text: { type: String, trim: true, default: '' },

  assinatura_ativa: { type: Boolean, default: false },
  assinatura_texto: { type: String, trim: true, default: '' },

  // Idempotência do envio (anti duplo-clique / retry de rede)
  client_nonce: { type: String, trim: true, default: null },

  anexos: { type: [attachmentSchema], default: [] },

  // Thread (reply/forward)
  thread_root_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CondMsgMessage', default: null },
  in_reply_to: { type: mongoose.Schema.Types.ObjectId, ref: 'CondMsgMessage', default: null },
  forwarded_from_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CondMsgMessage', default: null },

  // Histórico de acessos (últimos eventos)
  acessos: { type: [accessEventSchema], default: [] },

  // Estado por caixa/usuário (para Entrada/Arquivo/Lixeira/Fixadas)
  states: { type: [mailboxStateSchema], default: [] },

  unidade_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Unidade', default: null },
  createdBy: { type: String, trim: true, default: '' },

  ativo: { type: Boolean, default: true }
}, { timestamps: true });

condMsgMessageSchema.index({ protocolo: 1 }, { unique: true, name: 'protocolo_unique' });
condMsgMessageSchema.index(
  { from_owner: 1, from_mailbox_id: 1, client_nonce: 1 },
  { unique: true, sparse: true, name: 'from_owner_mailbox_client_nonce_unique' }
);
condMsgMessageSchema.index({ unidade_id: 1, createdAt: -1 }, { name: 'unidade_createdAt' });
condMsgMessageSchema.index({ from_mailbox_id: 1, createdAt: -1 }, { name: 'from_mailbox_createdAt' });
condMsgMessageSchema.index({ thread_root_id: 1, createdAt: 1 }, { name: 'thread_root_createdAt' });
condMsgMessageSchema.index({ in_reply_to: 1, createdAt: 1 }, { name: 'in_reply_to_createdAt' });
condMsgMessageSchema.index({ 'states.mailbox_id': 1, 'states.owner': 1, createdAt: -1 }, { name: 'states_mailbox_owner_createdAt' });
condMsgMessageSchema.index({ 'states.mailbox_id': 1, 'states.owner': 1, 'states.fixada_em': -1 }, { name: 'states_pinned' });

const CondMsgMessage = mongoose.models.CondMsgMessage || mongoose.model('CondMsgMessage', condMsgMessageSchema);
export default CondMsgMessage;
