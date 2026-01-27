import mongoose from 'mongoose';

const condMsgSignaturePrefSchema = new mongoose.Schema({
  owner: { type: String, required: true, trim: true, lowercase: true },
  mailbox_id: { type: String, required: true, trim: true },
  enabled: { type: Boolean, default: false },
  text: { type: String, trim: true, default: '' }
}, { timestamps: true });

condMsgSignaturePrefSchema.index({ owner: 1, mailbox_id: 1 }, { unique: true });

const CondMsgSignaturePref = mongoose.models.CondMsgSignaturePref
  || mongoose.model('CondMsgSignaturePref', condMsgSignaturePrefSchema);

export default CondMsgSignaturePref;
