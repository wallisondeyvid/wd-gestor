import mongoose from 'mongoose';

const RememberTokenSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
  token_hash: { type: String, required: true, index: true, unique: true },
  user_agent: { type: String },
  ip: { type: String },
  expiresAt: { type: Date, required: true, index: true },
  revoked: { type: Boolean, default: false },
  lastUsedAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

RememberTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL automático

export default mongoose.model('RememberToken', RememberTokenSchema);
