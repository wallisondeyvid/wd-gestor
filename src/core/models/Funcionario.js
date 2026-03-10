import mongoose from 'mongoose';
import { createSyncHook } from '#shared/funcionarios/syncUserFuncionario.js';

const counterSchema = new mongoose.Schema({ name: String, seq: Number });
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

const funcionarioSchema = new mongoose.Schema({
	codigo: { type: String, unique: true },
	unidade_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Unidade', required: true },
	funcao_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Funcao' },
	usuario_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
	nome: { type: String, required: true },
	nome_social: { type: String },
	nome_mae: { type: String },
	nome_pai: { type: String },
	rg: { type: String, required: true },
	rg_orgao: { type: String },
	rg_uf: { type: String },
	rg_data_expedicao: { type: Date },
	cpf: { type: String, required: true, match: /^\d{11}$/ },
	pis: { type: String },
	data_nascimento: { type: Date, required: true },
	sexo: { type: String, required: true, enum: ['F', 'M', 'N'] },
	estado_civil: { type: String },
	raca_cor: { type: String },
	escolaridade: { type: String },
	nacionalidade: { type: String },
	pais_nascimento: { type: String },
	data_chegada_brasil: { type: Date },
	naturalidade: { type: String },
	endereco: {
		cep: String, tipo_logradouro: String, logradouro: String, numero: String, complemento: String,
		bairro: String, estado: String, cidade: String, codigo_ibge: String
	},
	email: { type: String, required: true, match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
	telefone: { type: String, required: true, match: /^\(\d{2}\)\s?\d{4,5}-\d{4}$/ },
	telefone2: { type: String },
	tipo_ctps: { type: String },
	ctps_numero: { type: String },
	ctps_serie: { type: String },
	ctps_uf: { type: String },
	pcd: { type: String, enum: ['S', 'N'] },
	tipo_deficiencia: { type: String },
	cid: { type: String },
	foto: { type: String },
	biometrico: { type: String },
	biometrico_face: { type: String },
	fp_template_b64: { type: String },
	fp_template_sha256: { type: String },
	fp_imagem: { type: String },
	fp_dedo: { type: String },
	face_template_b64: { type: String },
	face_template_sha256: { type: String },
	face_imagem: { type: String },
	data_admissao: { type: Date },
	tipo_admissao: { type: String },
	categoria_trabalhador: { type: String },
	tipo_contrato: { type: String },
	data_termino: { type: Date },
	objeto_determinante: { type: String },
	clausula_assecuratoria: { type: String },
	cargo: { type: String },
	cbo: { type: String },
	departamento: { type: mongoose.Schema.Types.ObjectId, ref: 'Setor' },
	regime_contratacao: { type: String },
	regime_jornada: { type: String },
	carga_semanal: { type: Number },
	salario_base: { type: Number },
	tipo_salario: { type: String },
	forma_pagamento: { type: String },
	forma_pagamento_desc: { type: String },
	banco: { type: String }, agencia_num: { type: String }, agencia_dv: { type: String }, conta_num: { type: String }, conta_dv: { type: String }, tipo_conta: { type: String },
	sindicato: { type: String }, fgts_optante: { type: String, enum: ['1', '2', '3'] }, fgts_data: { type: Date },
	regime_previdenciario: { type: String }, tipo_especial: { type: String },
	cert_militar: { type: String }, cert_militar_orgao: { type: String }, cert_militar_uf: { type: String }, cert_militar_data: { type: Date },
	titulo: { type: String }, titulo_zona: { type: String }, titulo_secao: { type: String },
	cnh: { type: String }, cnh_categoria: { type: String }, cnh_validade: { type: Date }, cnh_uf: { type: String },
	orgao_prof: { type: String }, orgao_prof_uf: { type: String }, orgao_prof_numero: { type: String },
	observacoes: { type: String },
	anexos: [{ nome: String, mime: String, tamanho: { type: Number, min: 0, max: 10485760 }, caminho: String, data_upload: { type: Date, default: Date.now } }],
	dependentes: [{ nome: String, parentesco: String, data_nascimento: Date, cpf: { type: String, match: /^\d{11}$/ }, salario_familia: { type: Boolean, default: false }, irpf: { type: Boolean, default: false } }],
	beneficios: [{ tipo: String, nome: String, cnpj_plano: String, tipo_valor: String, valor: Number, inicio: String, data_inicio: Date }],
	biometrias_digitais: [{ hash: String, template_b64: String, template_sha256: String, imagem: String, dedo: String, data_captura: { type: Date, default: Date.now } }],
	biometrias_facial: [{ hash: String, template_b64: String, template_sha256: String, imagem: String, qualidade: Number, data_captura: { type: Date, default: Date.now } }],
	extras: { type: mongoose.Schema.Types.Mixed, default: {} },
	ativo: { type: Boolean, default: true }
}, { timestamps: true });

funcionarioSchema.index({ nome: 1 });
funcionarioSchema.index({ unidade_id: 1 });
funcionarioSchema.index({ unidade_id: 1, cpf: 1 }, { unique: true });
funcionarioSchema.index({ unidade_id: 1, email: 1 }, { unique: true });

funcionarioSchema.pre('validate', function(next) {
	if (this.beneficios && Array.isArray(this.beneficios)) {
		const ps = this.beneficios.find(b => b.tipo === 'ps' || b.nome?.toLowerCase().includes('saúde'));
		if (ps && !ps.cnpj_plano) return next(new Error('CNPJ do plano é obrigatório quando o plano de saúde está habilitado'));
	}
	next();
});

funcionarioSchema.pre('save', function(next) {
	if (this.cpf) this.cpf = this.cpf.replace(/\D/g, '');
	if (this.email) this.email = this.email.toLowerCase().trim();
	next();
});

funcionarioSchema.pre('save', async function(next) {
	if (!this.codigo) {
		const counter = await Counter.findOneAndUpdate({ name: 'funcionario' }, { $inc: { seq: 1 } }, { new: true, upsert: true });
		this.codigo = `FUNC${counter.seq.toString().padStart(5, '0')}`;
	}
	next();
});

funcionarioSchema.post('save', createSyncHook('Funcionario'));

const Funcionario = mongoose.models.Funcionario || mongoose.model('Funcionario', funcionarioSchema);
export default Funcionario;

