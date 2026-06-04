import mongoose from 'mongoose';

const passwordResetSchema = new mongoose.Schema({
	user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
	// Armazena apenas o hash deterministico do token cru enviado por e-mail.
	token: { type: String, required: true, unique: true },
	expiresAt: { type: Date, required: true, default: () => new Date(Date.now() + 24*60*60*1000) },
	used: { type: Boolean, default: false }
}, { timestamps: true });

passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
passwordResetSchema.methods.isValid = function() { return !this.used && this.expiresAt > new Date(); };

const PasswordReset = mongoose.models.PasswordReset || mongoose.model('PasswordReset', passwordResetSchema);
export default PasswordReset;

