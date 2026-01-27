import mongoose from 'mongoose';

const moduloSchema = new mongoose.Schema({
	nome: { type: String, required: true, unique: true },
	descricao: { type: String },
	status: { type: String, enum: ['planejado', 'ativo'], required: true },
	url_base: { type: String }
});

const Modulo = mongoose.models.Modulo || mongoose.model('Modulo', moduloSchema);
export default Modulo;

