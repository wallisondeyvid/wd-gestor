import mongoose from 'mongoose';

const ORIGENS = ['assembleia', 'provisorio', 'judicial'];

const condDirigenciaMandatoSchema = new mongoose.Schema({
  cargoId: { type: String, required: true, trim: true, index: true },
  unidadeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Unidade', required: true, index: true },

  usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'CondUsuario', required: true, index: true },

  inicio: { type: Date, required: true, index: true },
  fim: { type: Date, default: null, index: true },
  origem: { type: String, enum: ORIGENS, required: true },
  observacao: { type: String, trim: true, default: '' },

  documento: {
    url: { type: String, trim: true, default: '' },
    originalName: { type: String, trim: true, default: '' },
    mime: { type: String, trim: true, default: '' },
    size: { type: Number, default: 0 },
    uploadedAt: { type: Date, default: null },
    uploadedBy: { type: String, trim: true, default: '' }
  },

  ativo: { type: Boolean, default: true, index: true },

  criadoEm: { type: Date, default: Date.now },
  criadoPor: { type: String, trim: true, default: '' },
  encerradoEm: { type: Date, default: null },
  encerradoPor: { type: String, trim: true, default: '' }
}, { timestamps: true });

// Um cargo só pode ter 1 mandato ativo por vez.
condDirigenciaMandatoSchema.index(
  { cargoId: 1, ativo: 1 },
  { unique: true, partialFilterExpression: { ativo: true }, name: 'cargo_ativo_unique' }
);

condDirigenciaMandatoSchema.index({ unidadeId: 1, cargoId: 1, inicio: -1 }, { name: 'unidade_cargo_inicio' });

const CondDirigenciaMandato = mongoose.models.CondDirigenciaMandato || mongoose.model('CondDirigenciaMandato', condDirigenciaMandatoSchema);
export default CondDirigenciaMandato;
