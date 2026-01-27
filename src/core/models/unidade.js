import mongoose from 'mongoose';

const apiBancariaSchema = new mongoose.Schema({
	tipoAutenticacaoAPI: {
		type: String,
		enum: ['', 'api-key-header', 'api-key-query', 'basic', 'oauth2', 'mtls'],
		default: ''
	},
	apiHeaderName: String,
	apiHeaderValue: String,
	apiQueryParamName: String,
	apiQueryParamValue: String,
	apiBasicUser: String,
	apiBasicPassword: String,
	apiOauthClientId: String,
	apiOauthClientSecret: String,
	apiOauthScope: String,
	apiOauthTokenUrl: String,
	apiBaseUrl: String,
	apiTokenUrlGenerica: String,
	apiMtlsCertFileName: String,
	apiMtlsCertFileData: String,
	apiMtlsPassword: String
}, { _id: false, minimize: false });

const unidadeSchema = new mongoose.Schema({
	codigo: { type: String, unique: true },
	nome: { type: String, required: true },
	razaoSocial: String,
	cnpj: String,
	cpf: String,
	pessoaTipo: { type: String, enum: ['pf','pj'], required: true },
	inscricaoEstadual: String,
	inscricaoMunicipal: String,
	cnaePrincipal: String,
	cnaeSecundarios: String,
	regimeTributario: String,
	naturezaJuridica: String,
	is_principal: { type: Boolean, default: false },
	ativa: { type: Boolean, default: true },
	subunidade: { type: Boolean, default: false },
	unidade_principal_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Unidade', default: null },
	dataAbertura: Date,
	tipoLogradouro: String,
	logradouro: String,
	numero: String,
	complemento: String,
	bairro: String,
	cep: String,
	cidade: String,
	estado: String,
	codigoIbgeMunicipio: String,
	telefoneFixo: String,
	telefoneCelular: String,
	emailPrincipal: String,
	emailFiscal: String,
	site: String,
	banco: String,
	agencia: String,
	contaCorrente: String,
	pixChave: String,
	tipoPix: String,
	modulosAcessiveis: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Modulo' }],
	diretor_usuario_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
	endereco: String,
	logo: String, // caminho relativo legado (ex: 'uploads/unidades/<file>') OU Data URL (ex: 'data:image/webp;base64,....')
	apiBancaria: { type: apiBancariaSchema, default: () => ({}) }
});

unidadeSchema.pre('save', async function(next){
	if (!this.codigo) {
		let codigo = 'M0000001';
		const ultima = await this.constructor.findOne().sort({ codigo: -1 });
		if (ultima) {
			const ultimoNumero = parseInt(ultima.codigo.replace('M',''),10);
			codigo = `M${(ultimoNumero+1).toString().padStart(7,'0')}`;
		}
		let existente = await this.constructor.findOne({ codigo });
		while (existente) {
			const ultimoNumero = parseInt(codigo.replace('M',''),10);
			codigo = `M${(ultimoNumero+1).toString().padStart(7,'0')}`;
			existente = await this.constructor.findOne({ codigo });
		}
		this.codigo = codigo;
	}
	next();
});

const Unidade = mongoose.models.Unidade || mongoose.model('Unidade', unidadeSchema);
export default Unidade;

