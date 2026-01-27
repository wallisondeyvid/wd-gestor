import mongoose from 'mongoose';

const arquivoSchema = new mongoose.Schema({
  url: { type: String, trim: true, default: '' },
  nome: { type: String, trim: true, default: '' },
  mime: { type: String, trim: true, default: '' },
  tamanho: { type: Number, default: null }
}, { _id: false });

const veiculoSchema = new mongoose.Schema({
  habitacao_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CondHabitacao', required: true },
  unidade_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Unidade', required: true },
  placa: { type: String, trim: true, uppercase: true, required: true },
  tipo: { type: String, trim: true, default: '' },
  marca: { type: String, trim: true, default: '' },
  marca_extra: { type: String, trim: true, default: '' },
  modelo: { type: String, trim: true, default: '' },
  cor: { type: String, trim: true, default: '' },
  ano: { type: Number, min: 1900, max: 2100, default: null },
  ano_modelo: { type: Number, min: 1900, max: 2105, default: null },
  renavam: { type: String, trim: true, default: '' },
  chassi: { type: String, trim: true, default: '' },
  estado: { type: String, trim: true, uppercase: true, default: '' },
  municipio: { type: String, trim: true, default: '' },
  proprietario_tipo: { type: String, enum: ['morador', 'externo'], default: 'morador' },
  proprietario_nome: { type: String, trim: true, default: '' },
  proprietario_email: { type: String, trim: true, lowercase: true, default: '' },
  proprietario_cpf: { type: String, trim: true, default: '' },
  proprietario_data_nascimento: { type: Date, default: null },
  proprietario_cnh_numero: { type: String, trim: true, default: '' },
  proprietario_cnh_categoria: { type: String, trim: true, uppercase: true, default: '' },
  proprietario_cond_usuario_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CondUsuario', default: null },
  proprietario_morador_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CondMorador', default: null },
  garagem_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CondVagaGaragem', default: null },
  garagem_nome: { type: String, trim: true, default: '' },
  garagem_codigo: { type: String, trim: true, default: '' },
  crlv: { type: arquivoSchema, default: () => ({}) },
  proprietario_cnh: { type: arquivoSchema, default: () => ({}) },
  fotos: {
    type: [arquivoSchema],
    validate: {
      validator: (list) => !Array.isArray(list) || list.length <= 3,
      message: 'É permitido anexar até 3 fotos do veículo.'
    },
    default: () => []
  },
  ativo: { type: Boolean, default: true }
}, { timestamps: true });

veiculoSchema.index({ habitacao_id: 1, placa: 1 }, { unique: true });

const CondVeiculo = mongoose.models.CondVeiculo || mongoose.model('CondVeiculo', veiculoSchema);
export default CondVeiculo;
