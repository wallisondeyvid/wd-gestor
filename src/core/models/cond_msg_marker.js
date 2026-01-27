import mongoose from 'mongoose';

const condMsgMarkerSchema = new mongoose.Schema({
  mailbox_id: { type: String, required: true, trim: true },
  owner: { type: String, trim: true, lowercase: true, default: '' },
  nome: { type: String, required: true, trim: true, maxlength: 60 },
  cor: { type: String, trim: true, maxlength: 30, default: '' },
  unidade_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Unidade', default: null },
  createdBy: { type: String, trim: true, default: '' },
  ativo: { type: Boolean, default: true }
}, { timestamps: true });

condMsgMarkerSchema.index({ mailbox_id: 1, owner: 1, nome: 1 }, { unique: true, name: 'mailbox_owner_nome_unique' });
condMsgMarkerSchema.index({ mailbox_id: 1, owner: 1, ativo: 1, nome: 1 }, { name: 'mailbox_owner_ativo_nome' });

const CondMsgMarker = mongoose.models.CondMsgMarker || mongoose.model('CondMsgMarker', condMsgMarkerSchema);
export default CondMsgMarker;
