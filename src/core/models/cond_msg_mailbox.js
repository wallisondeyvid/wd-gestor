import mongoose from 'mongoose';

const operatorSchema = new mongoose.Schema({
  user: { type: String, trim: true, default: '' },
  perms: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { _id: false });

const condMsgMailboxSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  type: { type: String, trim: true, default: 'grupo' },
  unidade_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Unidade', required: true },
  unidade_nome: { type: String, trim: true, default: '' },
  // Vínculo opcional de escopo (ex.: caixa pública de uma habitação)
  link_type: { type: String, trim: true, default: '' },
  link_id: { type: mongoose.Schema.Types.ObjectId, default: null },
  // "public" aqui significa visível publicamente no escopo da unidade (não confundir com caixa compartilhada da habitação)
  public: { type: Boolean, default: false },
  createdBy: { type: String, trim: true, default: '' },
  operators: { type: [operatorSchema], default: [] },
  ativo: { type: Boolean, default: true }
}, { timestamps: true });

condMsgMailboxSchema.index({ unidade_id: 1, name: 1 }, { name: 'unidade_nome' });
condMsgMailboxSchema.index({ unidade_id: 1, link_type: 1, link_id: 1 }, { name: 'unidade_link' });
condMsgMailboxSchema.index({ createdBy: 1 }, { name: 'createdBy' });
condMsgMailboxSchema.index({ ativo: 1, unidade_id: 1 }, { name: 'ativo_unidade' });

const CondMsgMailbox = mongoose.models.CondMsgMailbox || mongoose.model('CondMsgMailbox', condMsgMailboxSchema);
export default CondMsgMailbox;
