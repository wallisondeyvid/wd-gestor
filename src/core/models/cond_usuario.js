import mongoose from 'mongoose';

// Usuário independente do módulo Gestão de Condomínios
const condUsuarioSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  nome: { type: String, trim: true, default: '' },
  cpf: { type: String, trim: true, default: '' },
  rg: { type: String, trim: true, default: '' },
  data_nascimento: { type: Date, default: null },
  sexo: { type: String, enum: ['M','F','O','N'], default: 'N' },
  pai: { type: String, trim: true, default: '' },
  mae: { type: String, trim: true, default: '' },
  telefone: { type: String, trim: true, default: '' },
  whatsapp: { type: Boolean, default: false },
  foto: { type: String, trim: true, default: '' },
  unidade_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Unidade', default: null },
  ativo: { type: Boolean, default: true },
  perfis: [{ type: String, trim: true }], // ex: sindico, zelador, porteiro
  permissoes: [{ type: String, trim: true }],
  favoritos: {
    habitacoes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CondHabitacao' }],
    areas: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CondAreaComum' }]
  },
  portal_password_hash: { type: String, default: '' },
  portal_primeiro_acesso_token: { type: String, default: '' },
  portal_primeiro_acesso_expires: { type: Date, default: null },
  portal_primeiro_acesso_em: { type: Date, default: null },
  portal_primeiro_acesso_obrigatorio: { type: Boolean, default: true },
  portal_convite_unidade_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Unidade', default: null },
  portal_convite_enviado_em: { type: Date, default: null },
  portal_senha_atualizada_em: { type: Date, default: null },
  portal_ultimo_login_em: { type: Date, default: null },
  portal_login_tentativas: { type: Number, default: 0 },
  portal_bloqueado_ate: { type: Date, default: null },
  portal_reset_token: { type: String, default: '' },
  portal_reset_expires: { type: Date, default: null },
  portal_acesso_ativo: { type: Boolean, default: true }
}, { timestamps: true });

condUsuarioSchema.index({ email: 1 }, { unique: true });
condUsuarioSchema.index({ unidade_id: 1, cpf: 1 }, { unique: true, sparse: true });

condUsuarioSchema.pre('save', function(next){
  if(this.cpf) this.cpf = this.cpf.replace(/\D/g,'');
  if(this.telefone) this.telefone = this.telefone.replace(/\D/g,'');
  if(this.email) this.email = this.email.toLowerCase().trim();
  next();
});

const CondUsuario = mongoose.models.CondUsuario || mongoose.model('CondUsuario', condUsuarioSchema);
export default CondUsuario;
