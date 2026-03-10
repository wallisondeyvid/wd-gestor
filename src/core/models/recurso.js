import mongoose from 'mongoose';

const recursoSchema = new mongoose.Schema({
	unidade_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Unidade', required: true },
	tipo: { type: String, required: true, enum: ['carro','motocicleta','bicicleta','carroça','caminhão','ônibus','van','caminhonete','outro'] },
	placa: { type: String, required: true, uppercase: true, trim: true },
	chassi: { type: String, required: true, uppercase: true, trim: true },
	renavam: { type: String, required: true, trim: true },
	ano: { type: Number, required: true, min:1900, max: new Date().getFullYear()+1 },
	mod: { type: Number, required: true, min:1900, max: new Date().getFullYear()+1 },
	marca: { type: String, required: true, trim: true },
	modelo: { type: String, required: true, trim: true },
	cor: { type: String, required: true, trim: true },
	ativo: { type: Boolean, default: true }
}, { timestamps: true });

recursoSchema.index({ unidade_id: 1, placa: 1 }, { unique: true });
recursoSchema.index({ unidade_id: 1, chassi: 1 }, { unique: true });
recursoSchema.index({ unidade_id: 1, renavam: 1 }, { unique: true });

const Recurso = mongoose.models.Recurso || mongoose.model('Recurso', recursoSchema);
export default Recurso;

