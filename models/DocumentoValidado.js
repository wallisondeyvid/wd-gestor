import mongoose from 'mongoose';

const referenciaSchema = new mongoose.Schema({
	entidade: { type: String, trim: true, default: '', maxlength: 80 },
	entidadeId: { type: String, trim: true, default: '', maxlength: 80 },
	numero: { type: String, trim: true, default: '', maxlength: 80 }
}, { _id: false });

const arquivoSchema = new mongoose.Schema({
	url: { type: String, trim: true, default: '', maxlength: 2000 },
	filename: { type: String, trim: true, default: '', maxlength: 260 },
	mime: { type: String, trim: true, default: '', maxlength: 120 },
	size: { type: Number, default: 0 }
}, { _id: false });

const metaSchema = new mongoose.Schema({
	versaoLayout: { type: String, trim: true, default: '', maxlength: 80 },
	ip: { type: String, trim: true, default: '', maxlength: 80 },
	userAgent: { type: String, trim: true, default: '', maxlength: 320 },

	// Versionamento do PDF original (assinado externamente) vs. PDF certificado (carimbado)
	verifyUrl: { type: String, trim: true, default: '', maxlength: 2000 },
	stampStyle: { type: String, trim: true, default: '', maxlength: 80 },
	originalHashSha256Pdf: { type: String, trim: true, default: '', maxlength: 128, index: true },
	originalArquivoUrl: { type: String, trim: true, default: '', maxlength: 2000 },
	certifiedHashSha256Pdf: { type: String, trim: true, default: '', maxlength: 128, index: true },

	// Campos auxiliares de histórico (não expostos publicamente por padrão)
	revogadoMotivo: { type: String, trim: true, default: '', maxlength: 400 },
	revogadoEm: { type: Date, default: null },
	substituidoPorToken: { type: String, trim: true, default: '', maxlength: 120 },
	substituidoEm: { type: Date, default: null }
}, { _id: false });

const documentoValidadoSchema = new mongoose.Schema({
	token: { type: String, trim: true, required: true, unique: true, index: true },
	modulo: { type: String, trim: true, required: true, maxlength: 80 },
	tipo: { type: String, trim: true, required: true, maxlength: 80 },

	// organizacaoId = identificador do “tenant” no WD Gestor.
	// Pode representar empresa/filial/condomínio/clínica/etc dependendo do módulo.
	// Mantém Mixed para suportar string e ObjectId sem acoplar a um módulo específico.
	organizacaoId: { type: mongoose.Schema.Types.Mixed, default: null },

	referencia: { type: referenciaSchema, default: () => ({}) },
	titulo: { type: String, trim: true, default: '', maxlength: 300 },

	emitidoEm: { type: Date, default: () => new Date(), index: true },
	emitidoPorUserId: { type: mongoose.Schema.Types.Mixed, default: null },
	emitidoPorNomeSnapshot: { type: String, trim: true, default: '', maxlength: 200 },

	status: { type: String, trim: true, enum: ['VALIDO', 'REVOGADO', 'SUBSTITUIDO'], default: 'VALIDO', index: true },

	hashSha256Pdf: { type: String, trim: true, default: '', maxlength: 128, index: true },

	arquivo: { type: arquivoSchema, default: () => ({}) },
	meta: { type: metaSchema, default: () => ({}) }
}, { timestamps: true });

documentoValidadoSchema.index({
	modulo: 1,
	tipo: 1,
	'referencia.entidade': 1,
	'referencia.entidadeId': 1,
	emitidoEm: -1
});

const DocumentoValidado = mongoose.models.DocumentoValidado || mongoose.model('DocumentoValidado', documentoValidadoSchema);
export default DocumentoValidado;
