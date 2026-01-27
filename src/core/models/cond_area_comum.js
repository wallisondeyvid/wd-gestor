import mongoose from 'mongoose';

// Áreas comuns cadastradas (salão de festas, piscina, churrasqueira etc)
// Ajustado para suportar campos usados na tela de cadastro (area_m2, obs, foto) e tornar 'tipo' opcional
const areaComumSchema = new mongoose.Schema({
  unidade_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Unidade', required: true },
  tipo: { type: String, trim: true, default: '' }, // salão, piscina, churrasqueira, etc (opcional nesta fase)
  nome: { type: String, trim: true, required: true },
  capacidade: { type: Number, default: null },
  regras_uso: { type: String, trim: true, default: '' },
  taxa_reserva: { type: Number, default: 0 },
  area_m2: { type: Number, default: null }, // área construída (m²)
  obs: { type: String, trim: true, default: '' }, // observações livres
  foto: { type: String, trim: true, default: '' }, // URL pública da foto (blob)
  disponibilidades: {
    type: [
      {
        day: { type: String, trim: true, default: '' },
        label: { type: String, trim: true, default: '' },
        day_index: { type: Number, default: null },
        intervals: [
          {
            start: { type: String, trim: true, default: '' },
            end: { type: String, trim: true, default: '' }
          }
        ]
      }
    ],
    default: []
  },
  restricoes: {
    type: [
      {
        date: { type: String, trim: true, default: '' },
        start: { type: String, trim: true, default: '' },
        end: { type: String, trim: true, default: '' },
        observacao: { type: String, trim: true, default: '' }
      }
    ],
    default: []
  },
  ativa: { type: Boolean, default: true }
}, { timestamps: true });

areaComumSchema.index({ unidade_id: 1, nome: 1 }, { unique: true });

const CondAreaComum = mongoose.models.CondAreaComum || mongoose.model('CondAreaComum', areaComumSchema);
export default CondAreaComum;
