import mongoose from 'mongoose';

const condVisitanteSchema = new mongoose.Schema(
  {
    unidade_id: { type: String, index: true },
    morador_email: { type: String, index: true },

    habitacaoId: { type: String, index: true },
    habitacaoNome: { type: String, trim: true, maxlength: 160 },

    finalidade: { type: String, trim: true, maxlength: 120 },
    finalidadeLabel: { type: String, trim: true, maxlength: 120 },

    visitanteNome: { type: String, required: true, trim: true, maxlength: 120 },
    visitanteRg: { type: String, trim: true, maxlength: 40 },
    visitanteCpf: { type: String, trim: true, maxlength: 40 },
    visitanteTel: { type: String, trim: true, maxlength: 40 },

    observacoes: { type: String, trim: true, maxlength: 2000 },

    // Mantido como ISO string para compatibilidade com o front atual.
    periodoInicio: { type: String, trim: true, maxlength: 40 },
    periodoFim: { type: String, trim: true, maxlength: 40 },

    veiculo: {
      type: {
        tipo: { type: String, trim: true, maxlength: 40 },
        placa: { type: String, trim: true, maxlength: 16 },
        marca: { type: String, trim: true, maxlength: 60 },
        modelo: { type: String, trim: true, maxlength: 80 },
        cor: { type: String, trim: true, maxlength: 40 },
        ano: { type: String, trim: true, maxlength: 8 }
      },
      default: null
    },

    chegadaEm: { type: Date, default: null },

    // Histórico de comunicações de acesso (entrada/saída) desta visita.
    // Usado para exibir “Comunicações de entradas e saídas” no Condomínios e
    // para confirmação de entrada no Portal do Morador.
    comunicacoesAcesso: {
      type: [
        {
          tipo: { type: String, trim: true, maxlength: 60 },
          status: { type: String, trim: true, maxlength: 60 },
          em: { type: Date, default: Date.now },
          // Hora informada/ocorrida (entrada/saída). Pode divergir de `em`.
          ocorridoEm: { type: Date, default: null },
          // Hora de registro no sistema (auditoria). Preferida para ordenar no front.
          registradoEm: { type: Date, default: null },
          visitanteKey: { type: String, trim: true, maxlength: 220 },
          visitante: {
            type: {
              nome: { type: String, trim: true, maxlength: 120 },
              rg: { type: String, trim: true, maxlength: 40 },
              cpf: { type: String, trim: true, maxlength: 40 },
              tel: { type: String, trim: true, maxlength: 40 },
              principal: { type: Boolean, default: false }
            },
            default: null
          },
          por: {
            type: {
              tipo: { type: String, trim: true, maxlength: 30 }, // MORADOR | COLABORADOR
              id: { type: String, trim: true, maxlength: 64 },
              nome: { type: String, trim: true, maxlength: 160 },
              email: { type: String, trim: true, maxlength: 160 }
            },
            default: null
          },
          justificativa: { type: String, trim: true, maxlength: 600 }
        }
      ],
      default: []
    },
    chegadaVisitantes: {
      type: [
        {
          nome: { type: String, trim: true, maxlength: 120 },
          rg: { type: String, trim: true, maxlength: 40 },
          cpf: { type: String, trim: true, maxlength: 40 },
          tel: { type: String, trim: true, maxlength: 40 },
          motivo: { type: String, trim: true, maxlength: 120 },
          observacoes: { type: String, trim: true, maxlength: 600 },
          veiculo: {
            type: {
              tipo: { type: String, trim: true, maxlength: 40 },
              placa: { type: String, trim: true, maxlength: 16 },
              marca: { type: String, trim: true, maxlength: 60 },
              modelo: { type: String, trim: true, maxlength: 80 },
              cor: { type: String, trim: true, maxlength: 40 },
              ano: { type: String, trim: true, maxlength: 8 }
            },
            default: null
          },
          principal: { type: Boolean, default: false },
          criadoEm: { type: Date, default: Date.now }
        }
      ],
      default: []
    }
  },
  { timestamps: true }
);

condVisitanteSchema.index({ unidade_id: 1, morador_email: 1, createdAt: -1 });
condVisitanteSchema.index({ habitacaoId: 1, createdAt: -1 });
condVisitanteSchema.index({ unidade_id: 1, morador_email: 1, chegadaEm: -1 });

const CondVisitante =
  mongoose.models.CondVisitante ||
  mongoose.model('CondVisitante', condVisitanteSchema);

export default CondVisitante;
