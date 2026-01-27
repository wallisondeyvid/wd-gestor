import mongoose from 'mongoose';
import { createSyncHook } from '#shared/funcionarios/syncUserFuncionario.js';

const userSchema = new mongoose.Schema({
	email: { type: String, required: true, lowercase: true, trim: true },
	senha: { type: String, required: true },
	nome: { type: String, trim: true },
	cpf: { type: String, trim: true },
	rg: { type: String, trim: true, default: '' },
	data_nascimento: { type: Date, default: null },
	sexo: { type: String, enum: ['M','F','O','N'], default: 'N' },
	pai: { type: String, trim: true, default: '' },
	mae: { type: String, trim: true, default: '' },
	telefone: { type: String, trim: true, default: '' },
	whatsapp: { type: Boolean, default: false },
	unidade_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Unidade', default: null },
	role: { type: String, enum: ['master', 'admin', 'diretor', 'user'], default: 'user' },
	ativo: { type: Boolean, default: true },
	primeiro_acesso: { type: Boolean, default: true },
	senha_provisoria: { type: Boolean, default: true },
	funcionario_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Funcionario', default: null },
	foto: { type: String, default: null },
	failed_login_attempts: { type: Number, default: 0 },
	lock_until: { type: Date, default: null }
}, { timestamps: true });

userSchema.index({ unidade_id: 1, cpf: 1 }, { unique: true, sparse: true });
userSchema.index({ email: 1 }, { unique: true });
// Índice auxiliar para auditorias de bloqueio / relatórios (consultas por lock_until e tentativas)
userSchema.index({ lock_until: 1, failed_login_attempts: 1 });

userSchema.pre('save', function(next) {
	if (this.cpf) this.cpf = this.cpf.replace(/\D/g, '');
	if (this.telefone) this.telefone = this.telefone.replace(/\D/g, '');
	if (this.email) this.email = this.email.toLowerCase().trim();
	next();
});

const User = mongoose.models.User || mongoose.model('User', userSchema);
export default User;

