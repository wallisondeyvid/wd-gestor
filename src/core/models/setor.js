import mongoose from 'mongoose';

// Esquema de contador genérico para sequências atômicas
const counterSchema = new mongoose.Schema({
	_id: { type: String, required: true },
	seq: { type: Number, default: 0 }
});
const Counter = mongoose.models._Counter || mongoose.model('_Counter', counterSchema);

const setorSchema = new mongoose.Schema({
	codigo: { type: String, unique: true },
	nome: { type: String, required: true, trim: true, index: true },
	nome_normalizado: { type: String, index: true },
	descricao: { type: String },
	ativo: { type: Boolean, default: true, index: true },
	unidade_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Unidade', index: true }
}, { timestamps: true });

// Normalização leve do nome (trim + colapso de espaços + capitalização simples)
function normalizeNome(raw){
	if(!raw) return raw;
	const colapsado = raw.trim().replace(/\s+/g,' ');
	return colapsado.split(' ').map(p => p.charAt(0).toUpperCase()+p.slice(1)).join(' ');
}

setorSchema.pre('validate', function(next){
	if (this.isModified('nome') && typeof this.nome === 'string') {
		this.nome = normalizeNome(this.nome);
		this.nome_normalizado = this.nome.toLowerCase();
	}
	next();
});

// Geração robusta de código com até 5 tentativas para evitar colisões ocasionais
setorSchema.pre('save', async function(next){
	if (!(this.isNew && !this.codigo)) return next();
	try {
		let attempts = 0;
		while (attempts < 5) {
			attempts++;
			const ret = await Counter.findOneAndUpdate(
				{ _id: 'setor_codigo' },
				{ $inc: { seq: 1 } },
				{ new: true, upsert: true }
			);
			const candidate = 'S' + String(ret.seq).padStart(7,'0');
			// Verifica se já existe setor com este código (colisão teórica)
			const exists = await mongoose.models.Setor.findOne({ codigo: candidate }).select('_id').lean();
			if (!exists) {
				this.codigo = candidate;
				return next();
			}
			// Se colisão: loga e continua loop (incrementa novamente)
			if (attempts === 5) {
				return next(new Error('Falha ao gerar código único para Setor após múltiplas tentativas.'));
			}
		}
	} catch(err) {
		return next(err);
	}
	next();
});

// Índice composto para impedir duplicação de nome de setor por unidade (case-insensitive)
try {
	setorSchema.index({ unidade_id: 1, nome: 1 }, { unique: true, collation: { locale: 'pt', strength: 2 } });
	setorSchema.index({ unidade_id: 1, nome_normalizado: 1 }, { unique: true });
} catch(_) { /* índices podem já existir em hot-reload */ }

const Setor = mongoose.models.Setor || mongoose.model('Setor', setorSchema);
export default Setor;

