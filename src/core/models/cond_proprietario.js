import mongoose from 'mongoose';

// Proprietários de habitações (podem ser pessoa física ou jurídica)
const proprietarioSchema = new mongoose.Schema({
  unidade_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Unidade', required: true },
  usuario_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // usuário do módulo Gestor (se houver)
  cond_usuario_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CondUsuario', default: null }, // usuário independente do módulo Condomínios
  tipo: { type: String, enum: ['pf','pj'], default: 'pf' },
  nome: { type: String, trim: true, required: true },
  rg: { type: String, trim: true, default: '' },
  cpf: { type: String, trim: true, default: '' },
  cnpj: { type: String, trim: true, default: '' },
  data_nascimento: { type: Date, default: null },
  sexo: { type: String, enum: ['M','F','O','N'], default: 'N' },
  pai: { type: String, trim: true, default: '' },
  mae: { type: String, trim: true, default: '' },
  contato_email: { type: String, trim: true, default: '' },
  contato_telefone: { type: String, trim: true, default: '' },
  whatsapp: { type: Boolean, default: false },
  endereco: { type: String, trim: true, default: '' },
  ativo: { type: Boolean, default: true }
}, { timestamps: true });

proprietarioSchema.pre('save', function(next){
  if(this.cpf) this.cpf = this.cpf.replace(/\D/g,'');
  if(this.cnpj) this.cnpj = this.cnpj.replace(/\D/g,'');
  next();
});

proprietarioSchema.index({ unidade_id: 1, nome: 1 }, { unique: false });

const CondProprietario = mongoose.models.CondProprietario || mongoose.model('CondProprietario', proprietarioSchema);
export default CondProprietario;
