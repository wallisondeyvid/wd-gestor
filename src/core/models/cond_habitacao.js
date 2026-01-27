import mongoose from 'mongoose';

const arquivoSchema = new mongoose.Schema({
  url: { type: String, trim: true, default: '' },
  nome: { type: String, trim: true, default: '' },
  mime: { type: String, trim: true, default: '' },
  tamanho: { type: Number, default: null }
}, { _id: false });

const veiculoSchema = new mongoose.Schema({
  placa: { type: String, trim: true, uppercase: true, default: '' },
  tipo: { type: String, trim: true, default: '' },
  marca: { type: String, trim: true, default: '' },
  marca_extra: { type: String, trim: true, default: '' },
  modelo: { type: String, trim: true, uppercase: true, default: '' },
  cor: { type: String, trim: true, uppercase: true, default: '' },
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

const petSchema = new mongoose.Schema({
  especie: { type: String, trim: true, default: '' },
  especie_outro: { type: String, trim: true, default: '' },
  raca: { type: String, trim: true, default: '' },
  nome: { type: String, trim: true, default: '' },
  peso: { type: String, trim: true, default: '' },
  cor: { type: String, trim: true, default: '' },
  aux_needs: { type: Boolean, default: false },
  foto: { type: arquivoSchema, default: () => ({}) }
}, { timestamps: true });

// Habitação (unidade habitacional dentro de um condomínio)
// Campos principais permitem compor a etiqueta mostrada no front:
// Bloco/Torre, Andar, Número/Identificação. Também vínculos com proprietário, moradores e contrato.
const habSchema = new mongoose.Schema({
  unidade_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Unidade', required: true }, // condomínio
  bloco_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CondBloco', default: null },
  andar_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CondAndar', default: null },
  numero: { type: String, trim: true }, // número ou identificação (apto, casa, sala, etc)
  // Tipo livre para alinhar com lista extensa do front (Casa, Apartamento, Loja, ...)
  tipo: { type: String, trim: true, default: '' },
  area_m2: { type: Number, default: null },
  fracao_ideal: { type: Number, default: null }, // percentual
  vencimento_contribuicao_dia: { type: Number, min: 1, max: 31, default: null },
  descricao: { type: String, trim: true, default: '' },
  foto: { type: String, trim: true, default: '' }, // caminho/URL (upload ficará para etapa futura)
  proprietario_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CondProprietario', default: null },
  alugado: { type: Boolean, default: false },
  // Contrato atual de locação (compat mantém vigencia_*; novo formato usa periodo.{inicio,fim})
  contrato_locacao: {
    url: { type: String, trim: true, default: '' }, // link ou caminho do arquivo
    nome: { type: String, trim: true, default: '' },
    mime: { type: String, trim: true, default: '' },
    // Novo formato preferencial
    periodo: {
      inicio: { type: Date, default: null },
      fim: { type: Date, default: null }
    },
    // Legado (mantido por compatibilidade; não usar em novas gravações)
    vigencia_inicio: { type: Date, default: null },
    vigencia_fim: { type: Date, default: null },
    responsavel_morador_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CondMorador', default: null }
  },
  // Histórico/lista de contratos de locação
  contratos_locacao: [{
    url: { type: String, trim: true, default: '' },
    nome: { type: String, trim: true, default: '' },
    mime: { type: String, trim: true, default: '' },
    periodo: {
      inicio: { type: Date, default: null },
      fim: { type: Date, default: null }
    },
    responsavel_morador_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CondMorador', default: null },
    createdAt: { type: Date, default: Date.now }
  }],
  moradores_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CondMorador' }],
  veiculos: [veiculoSchema],
  pets: [petSchema],
  ativa: { type: Boolean, default: true }
}, { timestamps: true });

habSchema.index({ unidade_id: 1, bloco_id: 1, andar_id: 1, numero: 1 }, { unique: false });

const CondHabitacao = mongoose.models.CondHabitacao || mongoose.model('CondHabitacao', habSchema);
export default CondHabitacao;
