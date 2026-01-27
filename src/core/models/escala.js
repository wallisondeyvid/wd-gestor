import mongoose from 'mongoose';

const turnoItemSchema = new mongoose.Schema({
  ini: { type: String, required: true }, // HH:MM
  fim: { type: String, required: true }, // HH:MM
  overnight: { type: Boolean, default: false }
}, { _id:false });

const grupoTurnosSchema = new mongoose.Schema({
  id: { type: String, required: true }, // id gerado no front (uuid curto)
  turnos: { type: [turnoItemSchema], default: [] }
}, { _id:false });

// ============= NOVOS SUBSCHEMAS (reorganização) =============
const componenteSchema = new mongoose.Schema({
  funcionario_id: { type: String }, // renomeado de id -> funcionario_id para clareza
  id: { type: String }, // manter legacy (pode ser igual a funcionario_id)
  matricula: { type: String },
  nome: { type: String },
  // Periodização: manter campo legacy simples e incluir chaves explicitadas para consultas
  periodo: { type: String },
  periodoIni: { type: String }, // YYYY-MM-DD
  periodoFim: { type: String }, // YYYY-MM-DD
  // Disponibilidade calculada (resultante do período da escala menos férias/ausências)
  disponibilidade: {
    type: [ new mongoose.Schema({ ini: { type:String }, fim: { type:String } }, { _id:false }) ],
    default: []
  },
  // Indisponibilidades (bloqueios) usadas no cálculo, opcionalmente persistidas para auditoria
  indisponibilidades: {
    type: [ new mongoose.Schema({ ini: { type:String }, fim: { type:String }, tipo: { type:String } }, { _id:false }) ],
    default: []
  },
  // Lista de dias livres (derivada de disponibilidade), útil para verificações rápidas no front
  diasDisponiveis: { type: [String], default: [] },
  unidade_codigo: { type: String },
  unidade_nome: { type: String }
}, { _id:false });

const recursoMembroSchema = new mongoose.Schema({
  funcionario_id: { type: String },
  nome: { type: String },
  atribuicao: { type: String },
  origemEquipe: { type: String },
  added_at: { type: Date, default: Date.now }
}, { _id:false });

const recursoAlocacaoSchema = new mongoose.Schema({
  id: { type: String },
  dia: { type: String },
  turnoId: { type: String },
  ini: { type: String },
  fim: { type: String },
  scope: { type: String, enum: ['exato','ajustado'], default: 'exato' },
  // Nota específica desta alocação do recurso no dia/turno
  notas_recurso: { type: String, default: null }
}, { _id:false });

const recursoAtribuicaoSchema = new mongoose.Schema({
  id: { type: String },
  membroFuncionarioId: { type: String },
  papel: { type: String },
  turnoId: { type: String },
  dia: { type: String },
  escopo: { type: String, enum: ['recurso','dia','turno','dia+turno'], default: 'recurso' },
  prioridade: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now }
}, { _id:false });

const recursoRefeicaoSchema = new mongoose.Schema({
  id: { type: String },
  membroFuncionarioId: { type: String },
  dia: { type: String },
  ini: { type: String },
  fim: { type: String },
  // Indica se o intervalo é computável (conta na jornada)
  computavel: { type: Boolean, default: true },
  tipo: { type: String, enum: ['ALMOCO','JANTAR','LANCHE','PAUSA'], default: 'ALMOCO' },
  created_at: { type: Date, default: Date.now }
}, { _id:false });

const recursoSchema = new mongoose.Schema({
  id: { type: String },
  referenciaGestorId: { type: String },
  equipeId: { type: String },
  nome: { type: String },
  placa: { type: String },
  // Nota geral do recurso (fallback quando não há contexto de dia/turno)
  notas: { type: String, default: null },
  // Mapas legados por alocação (compatibilidade com escala_diaria e escala_nova):
  // chaves no formato 'YYYY-MM-DD__<turnoIdNormalizado>'
  // Observação: as novas estruturas preferenciais são os arrays alocacoes/atribuicoes/refeicoes
  // Estes mapas são mantidos para leitura e transição suave de dados legados e operações otimizadas por chave
  alocacoesRecurso: { type: Object, default: {} },
  atribuicoesRecurso: { type: Object, default: {} },
  refeicoesRecurso: { type: Object, default: {} },
  alocacoes: { type: [recursoAlocacaoSchema], default: [] },
  atribuicoes: { type: [recursoAtribuicaoSchema], default: [] },
  refeicoes: { type: [recursoRefeicaoSchema], default: [] },
  membros: { type: [recursoMembroSchema], default: [] },
  // Bloqueios de exibição por alocação (dia__turno) para funcionários removidos do recurso
  // Ex.: { '2025-10-12__08:00-17:00': ['<funcId1>','<funcId2>'] }
  remocoesRecurso: { type: Object, default: {} },
  created_at: { type: Date, default: Date.now }
}, { _id:false });

// Disponibilidade por funcionário (mapa de overrides)
const disponibilidadeFuncionarioSchema = new mongoose.Schema({
  default: { type: Boolean, default: true },
  dias: { type: Object, default: {} },    // { '2025-09-02': false }
  turnos: { type: Object, default: {} }   // { '2025-09-02|<turnoId>': true }
}, { _id:false });

// Alocação da equipe por dia/turno com nota específica
const equipeAlocacaoSchema = new mongoose.Schema({
  dia: { type: String },
  turnoId: { type: String }, // ex: '08:00-17:00'
  notas: { type: String, default: null }
}, { _id:false });

const equipeSchema = new mongoose.Schema({
  id: { type: String, required: true },
  nome: { type: String, required: true },
  descricao: { type: String },
  componentes: { type: [componenteSchema], default: [] },
  disponibilidade: { type: Object, default: {} },
  // Notas por alocação diária/turno da equipe (preferencial)
  alocacoes: { type: [equipeAlocacaoSchema], default: [] },
  // Campo legado (nota geral da equipe na escala). Mantido para compatibilidade.
  notas: { type: String, default: null },
  recursos: { type: [recursoSchema], default: [] }, // << agora os recursos vivem dentro da equipe
  // Bloqueios por alocação (dia__turno) para não exibir funcionário em "fora" após remoção definitiva
  // Ex.: { '2025-10-12__08:00-17:00': ['<funcId1>'] }
  remocoesEquipe: { type: Object, default: {} },
  // Adições pontuais de funcionários sem recurso, escopo de alocação (dia__turno)
  // Ex.: { '2025-10-12__08:00-17:00': [ { id:'<funcId>', nome:'Nome' } ] }
  adicoesEquipe: { type: Object, default: {} }
}, { _id:false });

const escalaSchema = new mongoose.Schema({
  descricao: { type: String, required: true, trim: true },
  classificacao: { type: String, enum: ['ORDINÁRIA','EXTRAORDINÁRIA'], required: false },
  unidade_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Unidade', default: null },
  // Responsável formal pela escala (usuário designado). Pode ser diferente do criador.
  responsavel_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  // Campos auxiliares de diagnóstico (não definitivos): preservam valores crus recebidos
  responsavel_raw: { type: String, default: null }, // valor original enviado (responsavelId/responsavelCodigo)
  responsavel_origem: { type: String, default: null }, // 'user','funcionario','bruto', null
  data_inicio: { type: Date, required: true },
  data_fim: { type: Date, required: true },
  grupos_turnos: { type: [grupoTurnosSchema], default: [] },
  equipes: { type: [equipeSchema], default: [] },
  alocacao: { type: Object, default: {} }, // (LEGACY) chave: turnoId|YYYY-MM-DD -> equipeId (pode ser futuramente derivado)
  // recursos (legacy) removido: agora sempre nested em equipes[].recursos
  status: { type: String, enum: ['rascunho','validada','fechada'], default: 'rascunho' },
  // Metadados de fechamento e desbloqueios granulares por dia/turno
  fechado_em: { type: Date, default: null },
  fechado_por: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  // Mapa de desbloqueios: chaves 'YYYY-MM-DD' (dia inteiro) ou 'YYYY-MM-DD__HH:MM-HH:MM' (célula específica)
  desbloqueios: { type: Object, default: {} },
  // Versionamento lógico para evolução incremental (migrations / auditoria)
  version: { type: Number, default: 0 },
  schemaVersion: { type: Number, default: 2 }, // controla migrações estruturais internas
  criado_por: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

escalaSchema.index({ unidade_id: 1, data_inicio: 1, data_fim: 1 });
escalaSchema.index({ status: 1, data_inicio: 1 });

// ============= MÉTODOS DE AJUDA (lógica comum por equipes) =============
// Busca uma equipe pelo id (string)
escalaSchema.methods.getEquipeById = function(equipeId){
  try { const eid = String(equipeId); return (this.equipes||[]).find(e=> e && String(e.id)===eid) || null; } catch(_){ return null; }
};
// Busca um recurso dentro de uma equipe por múltiplos identificadores aceitos nas rotas (id, placa, referenciaGestorId)
escalaSchema.methods.getRecursoById = function(equipeId, recursoId){
  try {
    const eq = this.getEquipeById(equipeId); if(!eq) return null;
    const rid = String(recursoId);
    const match = (r)=>{
      const cand = [r?.id, r?.placa, r?.referenciaGestorId].filter(Boolean).map(String);
      return cand.includes(rid);
    };
    return Array.isArray(eq.recursos) ? (eq.recursos.find(match) || null) : null;
  } catch(_){ return null; }
};

const Escala = mongoose.models.Escala || mongoose.model('Escala', escalaSchema);
export default Escala;
