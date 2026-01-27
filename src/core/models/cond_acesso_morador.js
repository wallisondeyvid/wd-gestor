import mongoose from 'mongoose';

const condAcessoMoradorSchema = new mongoose.Schema(
  {
    unidade_id: { type: String, index: true },

    habitacaoId: { type: String, index: true },
    habitacaoNome: { type: String, trim: true, maxlength: 160 },

    moradorId: { type: String, index: true },
    moradorNome: { type: String, trim: true, maxlength: 160 },

    // MORADOR_ENTRADA | MORADOR_SAIDA
    tipo: { type: String, trim: true, maxlength: 40, index: true },

    ocorridoEm: { type: Date, default: null, index: true },
    registradoEm: { type: Date, default: null, index: true },

    por: {
      type: {
        tipo: { type: String, trim: true, maxlength: 30 }, // COLABORADOR
        id: { type: String, trim: true, maxlength: 64 },
        nome: { type: String, trim: true, maxlength: 160 },
        email: { type: String, trim: true, maxlength: 160 }
      },
      default: null
    }
  },
  { timestamps: true }
);

condAcessoMoradorSchema.index({ habitacaoId: 1, ocorridoEm: -1 });
condAcessoMoradorSchema.index({ moradorId: 1, ocorridoEm: -1 });
condAcessoMoradorSchema.index({ unidade_id: 1, habitacaoId: 1, ocorridoEm: -1 });

const CondAcessoMorador =
  mongoose.models.CondAcessoMorador ||
  mongoose.model('CondAcessoMorador', condAcessoMoradorSchema);

export default CondAcessoMorador;
