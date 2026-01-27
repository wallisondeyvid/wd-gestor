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

const condMsgGroupSchema = new mongoose.Schema({
  // mailboxId pode ser ObjectId (string) ou 'pessoal'
  mailbox_id: { type: String, required: true, trim: true },
  // para mailbox_id === 'pessoal', amarra ao usuário
  owner: { type: String, trim: true, lowercase: true, default: '' },

  name: { type: String, required: true, trim: true, maxlength: 80 },
  members: { type: [memberSchema], default: [] },

  unidade_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Unidade', default: null },
  createdBy: { type: String, trim: true, default: '' },
  ativo: { type: Boolean, default: true }
}, { timestamps: true });

condMsgGroupSchema.index({ mailbox_id: 1, owner: 1, ativo: 1 }, { name: 'scope_active' });
condMsgGroupSchema.index({ mailbox_id: 1, name: 1 }, { name: 'mailbox_name' });

const CondMsgGroup = mongoose.models.CondMsgGroup || mongoose.model('CondMsgGroup', condMsgGroupSchema);
export default CondMsgGroup;
