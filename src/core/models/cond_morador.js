import mongoose from 'mongoose';

// Moradores vinculados às habitações (podem ou não ser usuários do sistema)
const moradorSchema = new mongoose.Schema({
  habitacao_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CondHabitacao', required: true, index: true },
  unidade_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Unidade', default: null, index: true },
  usuario_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // usuário do módulo Gestor (se houver)
  cond_usuario_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CondUsuario', default: null }, // usuário independente do módulo Condomínios
  nome: { type: String, trim: true, required: true },
  rg: { type: String, trim: true, default: '' },
  cpf: { type: String, trim: true, default: '' },
  data_nascimento: { type: Date, default: null },
  sexo: { type: String, enum: ['M','F','O','N'], default: 'N' },
  telefone: { type: String, trim: true, default: '' },
  email: { type: String, trim: true, default: '' },
  pai: { type: String, trim: true, default: '' },
  mae: { type: String, trim: true, default: '' },
  whatsapp: { type: Boolean, default: false },
  responsavel_email: { type: String, trim: true, default: '' },
  responsavel_nome: { type: String, trim: true, default: '' },
  inquilino: { type: Boolean, default: false },
  ativo: { type: Boolean, default: true }
}, { timestamps: true });

moradorSchema.pre('save', function(next){
  if(this.cpf) this.cpf = this.cpf.replace(/\D/g,'');
  next();
});

moradorSchema.index({ habitacao_id: 1, cpf: 1 }, { unique: false });
moradorSchema.index({ unidade_id: 1, email: 1 }, { unique: false, sparse: true });

const CondMorador = mongoose.models.CondMorador || mongoose.model('CondMorador', moradorSchema);
export default CondMorador;
