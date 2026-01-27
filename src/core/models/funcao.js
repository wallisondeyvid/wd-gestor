import mongoose from 'mongoose';

const funcaoSchema = new mongoose.Schema({
	codigo: { type: String, unique: true },
	nome: { type: String, required: true, trim: true, index: true },
	descricao: { type: String },
	ativa: { type: Boolean, default: true, index: true },
	unidade_principal_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Unidade', index: true },
	modulos_habilitados: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Modulo' }]
}, { timestamps: true });

funcaoSchema.pre('save', async function(next) {
	if (!this.codigo) {
		const count = await mongoose.model('Funcao').countDocuments();
		this.codigo = 'F' + (count + 1).toString().padStart(7, '0');
	}
	next();
});

const Funcao = mongoose.models.Funcao || mongoose.model('Funcao', funcaoSchema);
export default Funcao;

