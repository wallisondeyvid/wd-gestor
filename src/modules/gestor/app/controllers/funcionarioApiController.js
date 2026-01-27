import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { put, del } from '@vercel/blob';
import { v4 as uuid } from 'uuid';
import { fileURLToPath } from 'url';
import { ok, notFound, serverError, badRequest, created, missingFields } from '#core/utils/apiResponse.js';
import Funcionario from '#models/Funcionario.js';
import User from '#models/user.js';
import { normalizeFuncionarioPayload } from './utils/funcionarioNormalize.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ================= Normalização e movimentação de arquivos =================
const ROOT_PROJ = path.join(__dirname, '../../../../..');
function ensureDir(dir){ if(!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true}); }
function normalizeAndMaybeMove(fullPath){
  try {
    const normFull = fullPath.replace(/\\/g,'/');
    // Já em public/uploads ou uploads
    if(/\/public\/uploads\//.test(normFull) || /\/uploads\//.test(normFull)){
      let rel = path.relative(ROOT_PROJ, normFull).replace(/\\/g,'/');
      rel = rel.replace(/^public\//,'')
      if(!rel.startsWith('uploads/')) rel = 'uploads/' + path.basename(normFull);
      return { relative: rel, moved:false };
    }
    // Arquivo temporário em tmp/uploads -> mover
    if(/\/tmp\/uploads\//.test(normFull)){
      const baseName = path.basename(normFull);
      const destDir = path.join(ROOT_PROJ,'public','uploads'); ensureDir(destDir);
      let destFull = path.join(destDir, baseName);
      if(fs.existsSync(destFull)){
        const nameNoExt = baseName.replace(/\.[^.]+$/,'')
        const ext = (baseName.match(/\.[^.]+$/)||[''])[0];
        let c=1; while(fs.existsSync(destFull)){ destFull = path.join(destDir, `${nameNoExt}_${c}${ext}`); c++; }
      }
      try { fs.renameSync(normFull, destFull); }
      catch(err){ console.warn('[UPLOAD][move] rename falhou, tentando copy:', err.message); try { fs.copyFileSync(normFull, destFull); } catch(copyErr){ console.error('[UPLOAD][copy] falhou:', copyErr.message); } }
      return { relative: 'uploads/'+path.basename(destFull), moved:true };
    }
    // Outro local: relativiza e, se não for uploads, copia para lá
    let rel = path.relative(ROOT_PROJ, normFull).replace(/\\/g,'/');
    rel = rel.replace(/^public\//,'')
    if(!rel.startsWith('uploads/')){
      const destDir = path.join(ROOT_PROJ,'public','uploads'); ensureDir(destDir);
      const baseName = path.basename(normFull);
      const destFull = path.join(destDir, baseName);
      try { if(!fs.existsSync(destFull)) fs.copyFileSync(normFull, destFull); rel = 'uploads/'+baseName; } catch(err){ console.error('[UPLOAD][force-copy] falhou:', err.message); }
    }
    return { relative: rel, moved:false };
  } catch(err){
    console.error('[UPLOAD][normalize] erro:', err.message);
		// fallback com extensão jpg para evitar 404 por estáticos que exigem mime
		return { relative: 'uploads/erro-'+Date.now()+'.jpg', moved:false };
  }
}
// Quando multer usa memoryStorage, req.file não tem 'path'. Precisamos gravar buffer em tmp/uploads.
function ensureDiskPathFromMemoryFile(file){
	try {
		if(!file) return file;
		if(file.path) return file; // já possui caminho no disco
		if(!file.buffer) return file; // nada a fazer
		// Gravamos direto em public/uploads para simplificar (antes: tmp/uploads)
		const destDir = path.join(ROOT_PROJ,'public','uploads'); ensureDir(destDir);
		let original = file.originalname || 'arquivo';
		// Garante extensão coerente se original vier sem
		if(!/\.[a-zA-Z0-9]{2,6}$/.test(original) && file.mimetype){
			const extMap = { 'image/jpeg':'.jpg', 'image/pjpeg':'.jpg', 'image/png':'.png', 'image/webp':'.webp', 'image/gif':'.gif' };
			const guess = extMap[file.mimetype];
			if(guess) original += guess;
		}
		const safeBase = (Date.now()+'-'+ original)
			.replace(/[^a-zA-Z0-9._-]/g,'_')
			.slice(0,140);
		let full = path.join(destDir, safeBase);
		// Evita colisão (improvável, mas garantimos)
		let c=1; while(fs.existsSync(full)) { full = path.join(destDir, safeBase.replace(/(\.[^.]+)?$/, `_${c}$1`)); c++; }
		fs.writeFileSync(full, file.buffer);
		const size = fs.statSync(full).size;
		console.log('[UPLOAD][memory->disk] gravado', { full, size, original: file.originalname, mimetype: file.mimetype });
		file.path = full; // injeta caminho para reutilizar lógica existente
		return file;
	} catch(err){
		console.warn('[UPLOAD][memory->disk] Falha ao persistir buffer:', err.message);
		return file;
	}
}
function mapFiles(list = []) {
  if (!Array.isArray(list)) return [];
  return list.map(f => {
		if (!f) return null;
		// Garante path em disco se veio de memoryStorage
		ensureDiskPathFromMemoryFile(f);
		if (!f.path) return null; // ainda sem path -> ignora
		try {
			const norm = normalizeAndMaybeMove(f.path);
			return { nome: f.originalname || 'arquivo_sem_nome', mime: f.mimetype || 'application/octet-stream', tamanho: f.size || 0, caminho: norm.relative, data_upload: new Date() };
		} catch(err){
			console.warn('[UPLOAD][anexo] Falha ao normalizar anexo', f.originalname, err.message);
			return null;
		}
  }).filter(Boolean);
}
// ==========================================================================

// ============================ Blob Helpers ================================
function getBlobToken(){
	return process.env.BLOB_READ_WRITE_TOKEN
		|| process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN
		|| process.env.VERCEL_BLOB_RW_TOKEN
		|| '';
}
function isBlobUrl(u){ return typeof u==='string' && /https?:\/\/.*blob\.vercel-storage\.com\//i.test(u); }
async function uploadFuncionarioFotoToBlob(buffer, funcionarioId){
	if(!buffer || !buffer.length) return null;
	// Garante WEBP 512x512 cover
	let webp;
	try {
		webp = await sharp(buffer).rotate().resize(512,512,{ fit:'cover', position:'center', withoutEnlargement:true }).toFormat('webp',{ quality:90 }).toBuffer();
	} catch(err){
		console.warn('[FUNC][FOTO] sharp falhou:', err?.message);
		throw new Error('Arquivo de imagem inválido');
	}
	const key = `funcionarios/${funcionarioId || 'temp'}-${uuid()}.webp`;
	const token = getBlobToken();
	const putOptions = {
		access:'public',
		contentType:'image/webp',
		cacheControl:'public, max-age=31536000, immutable',
		...(token? { token } : {})
	};
	const { url } = await put(key, webp, putOptions);
	return url;
}
async function deleteFromBlobIfNeeded(url){ try { if(isBlobUrl(url)){ const token=getBlobToken(); await del(url, token?{ token }:undefined); } } catch(_){} }
function canUseBlob(){ return !!process.env.VERCEL || !!getBlobToken(); }
// ==========================================================================

// ============= Blob helpers para prévias faciais (biometrias) =============
function parseDataUrl(dataUrl){
	try {
		if(!/^data:/i.test(String(dataUrl))) return null;
		const [header, base64] = String(dataUrl).split(',');
		if(!base64) return null;
		const contentType = header.split(';')[0].split(':')[1] || 'application/octet-stream';
		const buffer = Buffer.from(base64, 'base64');
		return { contentType, buffer };
	} catch { return null; }
}
async function uploadFacePreviewToBlob(buffer, funcionarioId, idx){
	if(!buffer || !buffer.length) return null;
	// Normaliza para WEBP com tamanho controlado
	let webp;
	try {
		webp = await sharp(buffer).rotate().resize(640, 640, { fit: 'inside', withoutEnlargement: true }).toFormat('webp', { quality: 92 }).toBuffer();
	} catch(err){
		console.warn('[BIO FACE] sharp falhou:', err?.message);
		return null;
	}
	const key = `faces/${funcionarioId || 'temp'}-${uuid()}-${(idx??0)+1}.webp`;
	const token = getBlobToken();
	const putOptions = { access:'public', contentType:'image/webp', cacheControl:'public, max-age=31536000, immutable', ...(token?{ token }: {}) };
	const { url } = await put(key, webp, putOptions);
	return url;
}
async function mapBiometriasFaciaisToBlob(arr, funcionarioId){
	if(!Array.isArray(arr) || !arr.length) return arr;
	if(!canUseBlob()) return arr;
	const out = [];
	for(let i=0;i<arr.length;i++){
		const it = arr[i] || {};
		const obj = { ...it };
		if(obj.imagem && /^data:/i.test(String(obj.imagem))){
			const parsed = parseDataUrl(obj.imagem);
			if(parsed && parsed.buffer){
				try {
					const url = await uploadFacePreviewToBlob(parsed.buffer, funcionarioId, i);
					if(url) obj.imagem = url;
				} catch(err){ console.warn('[BIO FACE] falha upload Blob:', err?.message); }
			}
		}
		out.push(obj);
	}
	return out;
}
// ==========================================================================

const asStr = v => (v == null ? '' : (Array.isArray(v) ? String(v[0] ?? '') : String(v)));
const asISODate = v => { const s = asStr(v).trim(); if(!s) return undefined; const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m?`${m[3]}-${m[2]}-${m[1]}`:s; };

// --- Normalização de datas em updates ---
const DATE_FIELDS = [
	'rg_data_expedicao','data_nascimento','data_chegada_brasil','data_admissao','data_termino',
	'fgts_data','cert_militar_data','cnh_validade'
];
// Debug opcional de datas: habilitar com DEBUG_DATES=1 no ambiente
function logDateDebug(stage, payload){
	try {
		if(process.env.DEBUG_DATES !== '1') return;
		const dateKeys = Array.from(new Set([
			...DATE_FIELDS,
			'data_nascimento','data_admissao','data_termino','rg_data_expedicao','fgts_data',
			'cert_militar_data','cnh_validade','data_chegada_brasil'
		]));
		const snapshot = {};
		dateKeys.forEach(k=>{
			if(Object.prototype.hasOwnProperty.call(payload, k)){
				const v = payload[k];
				snapshot[k] = {
					value: v,
						type: Array.isArray(v)?'array':typeof v,
						length: (typeof v==='string')? v.length : (Array.isArray(v)? v.length : undefined)
				};
			}
		});
		console.log(`[DATES][${stage}]`, JSON.stringify(snapshot));
	} catch(err){
		console.error('[DATES][debug-failed]', err);
	}
}
function normalizeDateInput(raw){
	if(raw == null) return undefined;
	if(Array.isArray(raw)){
		// pega o primeiro valor não vazio após trim
		for(const item of raw){
			const norm = normalizeDateInput(item);
			if(norm) return norm; // retorna primeiro válido
		}
		return undefined;
	}
	if(raw instanceof Date && !isNaN(raw.getTime())) return raw;
	const s = String(raw).trim();
	if(!s) return undefined;
	// dd/mm/aaaa -> ISO
	const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
	if(m){
		return `${m[3]}-${m[2]}-${m[1]}`; // manter como string ISO (Mongoose converte)
	}
	// já ISO ou outra string aceitável
	if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s;
	// qualquer outra forma ignoramos para evitar CastError
	return undefined;
}
function applyDateNormalizationToBody(body){
	DATE_FIELDS.forEach(field=>{
		if(Object.prototype.hasOwnProperty.call(body, field)){
			const norm = normalizeDateInput(body[field]);
			if(norm) body[field]=norm; else body[field]=''; // string vazia fará com que seja tratada como unset posteriormente
		}
	});
}

// --- Validação backend de PIS/PASEP ---
function isValidPIS(pis){
	if(!pis) return false;
	const digits = String(pis).replace(/\D/g,'');
	if(digits.length !== 11) return false;
	if(/^(\d)\1{10}$/.test(digits)) return false; // todos dígitos iguais
	const pesos = [3,2,9,8,7,6,5,4,3,2];
	let soma=0;
	for(let i=0;i<10;i++) soma += parseInt(digits[i],10) * pesos[i];
	const resto = soma % 11;
	const dv = resto < 2 ? 0 : 11 - resto;
	return dv === parseInt(digits[10],10);
}

export async function createFuncionarioInitial(req,res){ try { let { unidade_id, funcao_id, nome, rg, cpf, data_nascimento, sexo, endereco, email, telefone } = req.body; const faltando=[]; function need(v,c){ if(!v) faltando.push(c); else if(typeof v==='string' && !v.trim()) faltando.push(c); else if(typeof v==='object' && (Array.isArray(v)? v.length===0 : Object.keys(v).length===0)) faltando.push(c); } ['unidade_id','nome','rg','cpf','data_nascimento','sexo','endereco','email','telefone'].forEach(c=> need(eval(c), c)); if(faltando.length) return missingFields(res, faltando); cpf = cpf.replace(/[^\d]/g,''); const [cpfExist, emailExist] = await Promise.all([ Funcionario.findOne({ cpf, unidade_id }), Funcionario.findOne({ email: email.toLowerCase() }) ]); if(cpfExist) return badRequest(res, 'Já existe um funcionário cadastrado com este CPF nesta empresa.'); if(emailExist) return badRequest(res, 'Já existe um funcionário cadastrado com este e-mail.'); const funcionario = await Funcionario.create({ unidade_id, funcao_id: funcao_id || undefined, nome: nome.trim(), rg: rg.trim(), cpf, data_nascimento: data_nascimento.trim(), sexo, endereco, email: email.toLowerCase().trim(), telefone: telefone.trim() }); await criarUsuarioAuto(funcionario); return created(res, funcionario._id, { data:{ id: funcionario._id } }); } catch(e){ console.error('[API FUNCIONARIOS][initial] Erro:', e); return serverError(res, 'Falha ao criar funcionário inicial'); } }
async function criarUsuarioAuto(funcionario){ try { const existingUser = await User.findOne({ email: funcionario.email }); if(existingUser) return; const { createUserAndSendPassword } = await import('../services/userService.js'); await createUserAndSendPassword({ nome: funcionario.nome, email: funcionario.email, cpf: funcionario.cpf, role: funcionario.email === 'wallisondeyvid13@gmail.com' ? 'master' : 'user', unidade_id: funcionario.unidade_id, funcionario_id: funcionario._id }); } catch(err){ console.error('[AUTO USER] Falha criação automática usuário:', err); } }
const asNumber = v => { const s = asStr(v).replace(/[R$\s]/g,'').replace(/\./g,'').replace(',', '.'); return s? Number(s): undefined; };
export async function createFuncionario(req,res){ try {
	if (typeof req.body.endereco === 'string') delete req.body.endereco;
	logDateDebug('create.raw-body', req.body);
		let { unidade_id, funcao_id, nome, nome_social, nome_mae, nome_pai, rg, rg_orgao, rg_uf, rg_data_expedicao, cpf, pis, data_nascimento, sexo, estado_civil, raca_cor, escolaridade, nacionalidade, pais_nascimento, data_chegada_brasil, naturalidade, endereco, telefone, telefone2, email, tipo_ctps, ctps_numero, ctps_serie, ctps_uf, pcd, tipo_deficiencia, cid, biometrico, biometrico_face, fp_template_b64, fp_template_sha256, fp_imagem, fp_dedo, face_template_b64, face_template_sha256, face_imagem, data_admissao, tipo_admissao, categoria_trabalhador, tipo_contrato, data_termino, objeto_determinante, clausula_assecuratoria, cargo, cbo, departamento, regime_contratacao, regime_jornada, carga_semanal, salario_base, tipo_salario, forma_pagamento, forma_pagamento_desc, banco, agencia_num, agencia_dv, conta_num, conta_dv, tipo_conta, sindicato, fgts_optante, fgts_data, regime_previdenciario, tipo_especial, cert_militar, cert_militar_orgao, cert_militar_uf, cert_militar_data, titulo, titulo_zona, titulo_secao, cnh, cnh_categoria, cnh_validade, cnh_uf, orgao_prof, orgao_prof_uf, orgao_prof_numero } = req.body;
	const observacoes = req.body.observacoes ?? req.body.extra_observacoes ?? undefined;
	const normalizeDate = v => asISODate(v ?? undefined);
	const norm = v => asStr(v);
	unidade_id = norm(unidade_id); funcao_id = norm(funcao_id); nome = norm(nome); nome_social = norm(nome_social); nome_mae = norm(nome_mae); nome_pai = norm(nome_pai);
	rg = norm(rg); rg_orgao = norm(rg_orgao); rg_uf = norm(rg_uf);
	rg_data_expedicao = normalizeDate(rg_data_expedicao ?? req.body.extra_rg_data_expedicao);
		// Payload base normalizado em bloco para reduzir divergências
		({ cpf, pis, data_nascimento, rg_data_expedicao, data_chegada_brasil, data_admissao, data_termino, fgts_data, cert_militar_data, cnh_validade, telefone, telefone2, salario_base, carga_semanal } = normalizeFuncionarioPayload({ cpf, pis, data_nascimento, rg_data_expedicao, data_chegada_brasil, data_admissao, data_termino, fgts_data, cert_militar_data, cnh_validade, telefone, telefone2, salario_base, carga_semanal }));
	pis = norm(pis);
	data_nascimento = normalizeDate(data_nascimento);
	sexo = norm(sexo); estado_civil = norm(estado_civil); raca_cor = norm(raca_cor); escolaridade = norm(escolaridade);
	nacionalidade = norm(nacionalidade); pais_nascimento = norm(pais_nascimento); data_chegada_brasil = normalizeDate(data_chegada_brasil);
	naturalidade = norm(naturalidade); telefone = norm(telefone); telefone2 = norm(telefone2);
	email = norm(email).toLowerCase(); tipo_ctps = norm(tipo_ctps); ctps_numero = norm(ctps_numero); ctps_serie = norm(ctps_serie); ctps_uf = norm(ctps_uf);
	pcd = norm(pcd); tipo_deficiencia = norm(tipo_deficiencia); cid = norm(cid);
	biometrico = norm(biometrico); biometrico_face = norm(biometrico_face); fp_template_b64 = norm(fp_template_b64); fp_template_sha256 = norm(fp_template_sha256);
	fp_imagem = norm(fp_imagem); fp_dedo = norm(fp_dedo); face_template_b64 = norm(face_template_b64); face_template_sha256 = norm(face_template_sha256); face_imagem = norm(face_imagem);
	data_admissao = normalizeDate(data_admissao); tipo_admissao = norm(tipo_admissao); categoria_trabalhador = norm(categoria_trabalhador); tipo_contrato = norm(tipo_contrato);
	data_termino = normalizeDate(data_termino); objeto_determinante = norm(objeto_determinante); clausula_assecuratoria = norm(clausula_assecuratoria);
	cargo = norm(cargo); cbo = norm(cbo); departamento = norm(departamento); regime_contratacao = norm(regime_contratacao); regime_jornada = norm(regime_jornada); carga_semanal = norm(carga_semanal);
// Parse seguro de carga_semanal
if(carga_semanal !== undefined && carga_semanal !== null && carga_semanal !== ''){
  const parsedCarga = Number(String(carga_semanal).replace(/[^0-9.,-]/g,'').replace(',','.'));
  if(Number.isFinite(parsedCarga)) carga_semanal = parsedCarga; else carga_semanal = undefined;
} else { carga_semanal = undefined; }
{
  console.log('[UPLOAD][create][debug] keys.files =', Object.keys(req.files||{}));
  console.log('[UPLOAD][create][debug] anexos length bruto =', req.files?.anexos?.length || 0);
  if(req.body.anexos_existentes) console.log('[UPLOAD][create][debug] anexos_existentes strlen =', req.body.anexos_existentes.length);
  console.log('[UPLOAD][create] req.file?', !!req.file, 'req.files?.foto?.length', req.files?.foto?.length);
  const salarioBaseRaw = asStr(salario_base);
  const salarioBaseParsed = salarioBaseRaw ? Number(salarioBaseRaw.replace(/[R$\s]/g,'').replace(/\./g,'').replace(',', '.')) : undefined;
  salario_base = Number.isFinite(salarioBaseParsed) ? salarioBaseParsed : undefined;
}
tipo_salario = norm(tipo_salario); forma_pagamento = norm(forma_pagamento); forma_pagamento_desc = norm(forma_pagamento_desc); banco = norm(banco); agencia_num = norm(agencia_num); agencia_dv = norm(agencia_dv); conta_num = norm(conta_num); conta_dv = norm(conta_dv); tipo_conta = norm(tipo_conta); sindicato = norm(sindicato); fgts_optante = norm(fgts_optante); fgts_data = normalizeDate(fgts_data); regime_previdenciario = norm(regime_previdenciario); tipo_especial = norm(tipo_especial); cert_militar = norm(cert_militar); cert_militar_orgao = norm(cert_militar_orgao); cert_militar_uf = norm(cert_militar_uf); cert_militar_data = normalizeDate(cert_militar_data); titulo = norm(titulo); titulo_zona = norm(titulo_zona); titulo_secao = norm(titulo_secao); cnh = norm(cnh); cnh_categoria = norm(cnh_categoria); cnh_validade = normalizeDate(cnh_validade); cnh_uf = norm(cnh_uf); orgao_prof = norm(orgao_prof); orgao_prof_uf = norm(orgao_prof_uf); orgao_prof_numero = norm(orgao_prof_numero); const faltando=[]; function need(v,c){ if(!v) faltando.push(c); else if(typeof v==='string' && !v.trim()) faltando.push(c); else if(typeof v==='object' && (Array.isArray(v)? v.length===0 : Object.keys(v).length===0)) faltando.push(c); } if (req.user.role !== 'master') need(unidade_id,'unidade_id'); ['nome','rg','cpf','data_nascimento','sexo','endereco','email','telefone'].forEach(c=> need(eval(c),c)); if(!endereco || !endereco.cep) faltando.push('endereco[cep]'); if(faltando.length) return badRequest(res, 'Campos obrigatórios ausentes', { campos: faltando }); if (req.user.role !== 'master' && !unidade_id) unidade_id = req.user.unidade_id; const [existingCpf, existingEmail] = await Promise.all([ Funcionario.findOne({ cpf, unidade_id }), Funcionario.findOne({ email }) ]); if(existingCpf) return badRequest(res,'Já existe um funcionário cadastrado com este CPF nesta empresa.'); if(existingEmail) return badRequest(res,'Já existe um funcionário cadastrado com este e-mail.');
	if(pis && !isValidPIS(pis.replace(/\D/g,''))) return badRequest(res,'PIS inválido',{ campo:'pis' });
	// Captura buffer da foto (sem usar disco)
	let fotoBuffer = null;
	if(req.file && req.file.fieldname === 'foto'){
		fotoBuffer = req.file.buffer || null;
	} else if(req.files?.foto?.length){
		const f=req.files.foto[0]; fotoBuffer = f?.buffer || null;
	}
	let anexosExistentes=[]; if(req.body.anexos_existentes){ try { anexosExistentes=JSON.parse(req.body.anexos_existentes);} catch{} }
	const anexosNovos = mapFiles(req.files?.anexos || []);
	console.log('[UPLOAD][create] anexosNovos normalizados =', anexosNovos.length);
	const anexosFinais = [...anexosExistentes, ...anexosNovos];
	console.log('[UPLOAD][create] anexosFinais total =', anexosFinais.length);
	delete req.body.anexos; delete req.body.anexos_existentes;
	let dependentes=[], beneficiosArray=[], extras={};
	if(req.body.dependentes_json){ try { dependentes=JSON.parse(req.body.dependentes_json); if(!Array.isArray(dependentes)) dependentes=[]; } catch{} }
	// Normaliza CPF dependentes (create)
	if(Array.isArray(dependentes)){
		dependentes = dependentes.map(d=>{
			if(d && d.cpf) d.cpf = String(d.cpf).replace(/\D/g,'');
			return d;
		});
	}
	if(req.body.beneficios_json){ try { const arr=JSON.parse(req.body.beneficios_json); if(Array.isArray(arr)) beneficiosArray=arr.map(b=>({ tipo:b.tipo, nome:b.nome, cnpj_plano:b.cnpj_plano, tipo_valor:b.tipo_valor, valor:b.valor, inicio:b.inicio, data_inicio:b.data_inicio })); } catch{} }
	Object.entries(req.body).forEach(([k,v])=>{ if(k.startsWith('extra_')){ const campoBase=k.substring(6); const ignorar=['nome_social','nome_mae','nome_pai','rg_orgao','rg_uf','rg_data_expedicao','pis','estado_civil','raca_cor','escolaridade','nacionalidade','pais_nascimento','data_chegada_brasil','telefone2','tipo_ctps','ctps_numero','ctps_serie','ctps_uf','pcd','tipo_deficiencia','cid','biometrico','biometrico_face','data_admissao','tipo_admissao','categoria_trabalhador','tipo_contrato','data_termino','objeto_determinante','clausula_assecuratoria','cargo','cbo','departamento','regime_contratacao','regime_jornada','carga_semanal','salario_base','tipo_salario','forma_pagamento','forma_pagamento_desc','banco','agencia_num','agencia_dv','conta_num','conta_dv','tipo_conta','sindicato','fgts_optante','fgts_data','regime_previdenciario','tipo_especial','cert_militar','cert_militar_orgao','cert_militar_uf','cert_militar_data','titulo','titulo_zona','titulo_secao','cnh','cnh_categoria','cnh_validade','cnh_uf','orgao_prof','orgao_prof_uf','orgao_prof_numero','observacoes']; if(!ignorar.includes(campoBase)) extras[campoBase]=v; }});
	// --- Parse arrays de capturas biométricas (novos campos JSON opcionais) ---
	let biometriasDigitaisArr = undefined; let biometriasFacialArr = undefined;
	// Guardrails de tamanho bruto (evita payloads gigantes maliciosos)
	if (req.body.fp_capturas_json && req.body.fp_capturas_json.length > 500000) { console.warn('[BIO JSON][create] fp_capturas_json excede limite'); delete req.body.fp_capturas_json; }
	if (req.body.face_capturas_json && req.body.face_capturas_json.length > 500000) { console.warn('[BIO JSON][create] face_capturas_json excede limite'); delete req.body.face_capturas_json; }

	if(req.body.face_capturas_json){
		try {
			const parsed = JSON.parse(req.body.face_capturas_json);
			if(Array.isArray(parsed)){
				biometriasFacialArr = parsed.filter(o=>o && (o.hash||o.imagem)).map(o=>({
					hash: (o.hash||'').substring(0,128),
					imagem: o.imagem && String(o.imagem).length < 500000 ? o.imagem : undefined,
					template_b64: o.template_b64 && String(o.template_b64).length < 500000 ? o.template_b64 : undefined,
					template_sha256: o.template_sha256 || undefined,
					qualidade: o.qualidade && Number.isFinite(Number(o.qualidade)) ? Number(o.qualidade) : undefined
				}));
			}
		} catch(_){ }
	}
	const doc = { unidade_id, funcao_id: funcao_id || undefined, nome: nome.trim(), nome_social: nome_social||undefined, nome_mae: nome_mae||undefined, nome_pai: nome_pai||undefined, rg: rg.trim(), rg_orgao: rg_orgao||undefined, rg_uf: rg_uf||undefined, rg_data_expedicao: rg_data_expedicao||undefined, cpf, pis: pis? pis.replace(/[^\d]/g,''):undefined, data_nascimento: data_nascimento, sexo, estado_civil: estado_civil||undefined, raca_cor: raca_cor||undefined, escolaridade: escolaridade||undefined, nacionalidade: nacionalidade||undefined, pais_nascimento: pais_nascimento||undefined, data_chegada_brasil: data_chegada_brasil||undefined, naturalidade: naturalidade||undefined, endereco, telefone: telefone.trim(), telefone2: telefone2||undefined, email, tipo_ctps: tipo_ctps||undefined, ctps_numero: ctps_numero||undefined, ctps_serie: ctps_serie||undefined, ctps_uf: ctps_uf||undefined, pcd: pcd||undefined, tipo_deficiencia: tipo_deficiencia||undefined, cid: cid||undefined, foto: undefined, biometrico: biometrico||undefined, biometrico_face: biometrico_face||undefined, fp_template_b64: fp_template_b64||undefined, fp_template_sha256: fp_template_sha256||undefined, fp_imagem: fp_imagem||undefined, fp_dedo: fp_dedo||undefined, face_template_b64: face_template_b64||undefined, face_template_sha256: face_template_sha256||undefined, face_imagem: face_imagem||undefined, observacoes: observacoes?observacoes.trim():undefined, data_admissao: data_admissao||undefined, tipo_admissao: tipo_admissao||undefined, categoria_trabalhador: categoria_trabalhador||undefined, tipo_contrato: tipo_contrato||undefined, data_termino: data_termino||undefined, objeto_determinante: objeto_determinante||undefined, clausula_assecuratoria: clausula_assecuratoria||undefined, cargo: cargo||undefined, cbo: cbo||undefined, departamento: departamento||undefined, regime_contratacao: regime_contratacao||undefined, regime_jornada: regime_jornada||undefined, carga_semanal: carga_semanal||undefined, salario_base: salario_base||undefined, tipo_salario: tipo_salario||undefined, forma_pagamento: forma_pagamento||undefined, forma_pagamento_desc: forma_pagamento_desc||undefined, banco: banco||undefined, agencia_num: agencia_num||undefined, agencia_dv: agencia_dv||undefined, conta_num: conta_num||undefined, conta_dv: conta_dv||undefined, tipo_conta: tipo_conta||undefined, sindicato: sindicato||undefined, fgts_optante: fgts_optante||undefined, fgts_data: fgts_data||undefined, regime_previdenciario: regime_previdenciario||undefined, tipo_especial: tipo_especial||undefined, cert_militar: cert_militar||undefined, cert_militar_orgao: cert_militar_orgao||undefined, cert_militar_uf: cert_militar_uf||undefined, cert_militar_data: cert_militar_data||undefined, titulo: titulo||undefined, titulo_zona: titulo_zona||undefined, titulo_secao: titulo_secao||undefined, cnh: cnh||undefined, cnh_categoria: cnh_categoria||undefined, cnh_validade: cnh_validade||undefined, cnh_uf: cnh_uf||undefined, orgao_prof: orgao_prof||undefined, orgao_prof_uf: orgao_prof_uf||undefined, orgao_prof_numero: orgao_prof_numero||undefined, anexos: anexosFinais, extras, dependentes, beneficios: beneficiosArray, biometrias_digitais: biometriasDigitaisArr, biometrias_facial: biometriasFacialArr };
	const novo = await Funcionario.create(doc);
	// Upload da foto (se houver) após ter o _id
	try {
		if(fotoBuffer){
			const inVercel = !!process.env.VERCEL; const token=getBlobToken();
			if(inVercel || token){
				const url = await uploadFuncionarioFotoToBlob(fotoBuffer, novo._id);
				novo.foto = url; await novo.save();
			} else {
				console.warn('[FUNC][FOTO][create] Blob não configurado; ignorando upload');
			}
		}
	} catch(upErr){ console.warn('[FUNC][FOTO][create] Falha upload foto:', upErr?.message); }
	// Upload das prévias faciais para Blob (se houver)
	try {
		if(Array.isArray(novo.biometrias_facial) && novo.biometrias_facial.length && canUseBlob()){
			const mapped = await mapBiometriasFaciaisToBlob(novo.biometrias_facial, novo._id);
			novo.biometrias_facial = mapped;
			if(novo.face_imagem && /^data:/i.test(String(novo.face_imagem)) && mapped[0] && mapped[0].imagem && /^https?:\/\//i.test(mapped[0].imagem)){
				novo.face_imagem = mapped[0].imagem;
			}
			await novo.save();
		}
	} catch(upErr){ console.warn('[BIO FACE][create] Falha ao subir prévias:', upErr?.message); }
	await criarUsuarioAuto(novo); return created(res, novo._id, { data:{ id: novo._id } }); } catch(err){ console.error('[API FUNCIONARIOS][create] Erro:', err); return serverError(res,'Erro ao cadastrar funcionário'); } }
const bracketToDot = s => String(s||'').replace(/\]/g,'').replace(/\[/g,'.');
function buildUpdateOpsFromBody(body){
	const $set={}; const $unset={};
	const rawUnsets=[].concat(body['__unset[]']||[]).concat(body.__unset||[]);
	rawUnsets.forEach(p=>{ const dot=bracketToDot(p); if(dot) $unset[dot]=1; });
	// 'foto' é ignorado aqui para evitar remoção acidental quando o input file vem vazio.
	// A foto só será alterada via upload (req.file/req.files) ou excluída explicitamente com excluir_foto=true.
	const skip=new Set(['__unset','__unset[]','_method','anexos_existentes','anexos_excluidos','excluir_foto','foto']);
	Object.keys(body).forEach(k=>{
		if(skip.has(k)) return;
		if(k.startsWith('anexos[')) return;
		const dot=bracketToDot(k);
		const val=body[k];
		if($unset[dot]) return;
		let v=(typeof val==='string' && val.trim()==='')?null:val;
		if(dot==='dependentes_json'){
			try{
				if (typeof v === 'string') {
					$set['dependentes']=JSON.parse(v||'[]');
				} else {
					console.warn('[dependentes_json] não é string:', typeof v);
					$set['dependentes']=[];
				}
			}catch{$set['dependentes']=[];}
			return;
		}
		if(dot==='beneficios_json'){
			try{
				if (typeof v === 'string') {
					$set['beneficios']=JSON.parse(v||'[]');
				} else {
					console.warn('[beneficios_json] não é string:', typeof v);
					$set['beneficios']=[];
				}
			}catch{$set['beneficios']=[];}
			return;
		}
		$set[dot]=v;
	});
	Object.entries($set).forEach(([k,v])=>{ if(v===null||v===undefined){ delete $set[k]; $unset[k]=1; }});
	return { $set, $unset };
}
// Remove caminhos desconhecidos do $set/$unset para evitar StrictModeError
function filterOpsBySchema(ops){
	try {
		const filtered = { $set:{}, $unset:{} };
		const schema = Funcionario.schema;
		// Helpers: aceita nested e single; rejeita adhocOrUndefined
		function isKnownPath(p){
			try {
				const t = schema.pathType(p);
				return t && t !== 'adhocOrUndefined';
			} catch { return false; }
		}
		if(ops.$set){
			Object.keys(ops.$set).forEach(k=>{ if(isKnownPath(k)) filtered.$set[k]=ops.$set[k]; });
		}
		if(ops.$unset){
			Object.keys(ops.$unset).forEach(k=>{ if(isKnownPath(k)) filtered.$unset[k]=1; });
		}
		return filtered;
	} catch { return ops; }
}
// Evita $unset em campos required do schema (e.g., data_nascimento)
function protectRequiredFieldsFromUnset(ops){
  try {
    const schema = Funcionario.schema;
    if(ops.$unset){
      const kept = {};
      Object.keys(ops.$unset).forEach(k=>{
        try {
          const p = schema.path(k);
          const isReq = !!(p && (p.isRequired === true || p?.options?.required === true));
          if(!isReq) kept[k] = 1;
        } catch(_){ kept[k] = 1; }
      });
      ops.$unset = kept;
    }
    return ops;
  } catch { return ops; }
}
export async function updateFuncionarioIncremental(req,res){ try { const { id } = req.params; const funcionario = await Funcionario.findById(id); if(!funcionario) return notFound(res,'Funcionário não encontrado'); const asIsoMaybe=v=>{
	try {
		if(v==null) return '';
		// Strings: normaliza datas dd/mm/aaaa -> ISO
		if(typeof v==='string'){ return v.includes('/') ? asISODate(v) : v; }
		// Arrays: usa primeiro elemento (se string e aparenta data, normaliza)
		if(Array.isArray(v)){
			const f=v.find(x=>x!=null);
			if(typeof f==='string') return f.includes('/')? asISODate(f) : f;
			return f ?? '';
		}
		// Date: mantém string ISO
		if(v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0,10);
		// Objetos e outros tipos: retorna como está (evita String(obj) que pode falhar)
		if(typeof v==='object') return v;
		// number/boolean/etc: converte para string simples
		return String(v);
	} catch(err){
		console.warn('[incremental][coerce] falha ao normalizar valor', err?.message);
		return v;
	}
}; Object.keys(req.body).forEach(k=>{ try { req.body[k]=asIsoMaybe(req.body[k]); } catch(err){ console.warn('[incremental][body-map] falha chave=',k, err?.message); } });
	console.log('[UPLOAD][incremental] req.file?', !!req.file, 'req.files?.foto?.length', req.files?.foto?.length);
	console.log('[UPLOAD][incremental][debug] files keys:', Object.keys(req.files||{}));
	console.log('[UPLOAD][incremental][debug] anexos bruto length:', req.files?.anexos?.length || 0);
	if(req.body.anexos_existentes) console.log('[UPLOAD][incremental][debug] anexos_existentes strlen:', req.body.anexos_existentes.length);
	logDateDebug('incremental.before-normalize', req.body);
	applyDateNormalizationToBody(req.body);
	logDateDebug('incremental.after-normalize', req.body);
	if(req.body.pis && !isValidPIS(String(req.body.pis).replace(/\D/g,''))) return badRequest(res,'PIS inválido',{ campo:'pis' });
	if(req.body.pis_pasep && !isValidPIS(String(req.body.pis_pasep).replace(/\D/g,''))) return badRequest(res,'PIS/PASEP inválido',{ campo:'pis_pasep' });
	let ops = buildUpdateOpsFromBody(req.body);
	// Normalização de CPF (incremental)
	if(ops.$set && Object.prototype.hasOwnProperty.call(ops.$set,'cpf')){
		const rawCpf = String(ops.$set.cpf||'').replace(/\D/g,'');
		if(!rawCpf){ delete ops.$set.cpf; ops.$unset.cpf = 1; }
		else if(rawCpf.length !== 11){ return badRequest(res,'CPF inválido',{ campo:'cpf' }); }
		else { ops.$set.cpf = rawCpf; }
	}
	// Remover anexos de update incremental direto
	if(ops.$set){
		// dependentes normalização CPF
		if(Array.isArray(ops.$set.dependentes)){
			ops.$set.dependentes = ops.$set.dependentes.map(d=>{ if(d && d.cpf) d.cpf = String(d.cpf).replace(/\D/g,''); return d; });
		}
		Object.keys(ops.$set).forEach(k=>{ if(k==='anexos' || k.startsWith('anexos.')) delete ops.$set[k]; });
	}
	if(ops.$unset){ Object.keys(ops.$unset).forEach(k=>{ if(k==='anexos' || k.startsWith('anexos.')) delete ops.$unset[k]; }); }
	// Normalização específica de salario_base se presente (string formatada BR)
	if(ops.$set && Object.prototype.hasOwnProperty.call(ops.$set,'salario_base')) {
		const raw = String(ops.$set.salario_base||'').trim();
		if(!raw) { delete ops.$set.salario_base; ops.$unset.salario_base = 1; }
		else {
			const parsed = Number(raw.replace(/[R$\s]/g,'').replace(/\./g,'').replace(',', '.'));
			if(Number.isFinite(parsed)) ops.$set.salario_base = parsed; else { delete ops.$set.salario_base; ops.$unset.salario_base = 1; }
		}
	}
	if(req.body.pcd==='N'){ ops.$unset['tipo_deficiencia']=1; ops.$unset['cid']=1; }
	const blobReady = canUseBlob();
	if(req.file && req.file.fieldname === 'foto'){
		if(!blobReady){ return res.status(503).json({ error:'Blob não configurado (conecte a Store no Vercel ou defina BLOB_READ_WRITE_TOKEN/WDGESTOR_DB_DADOS_READ_WRITE_TOKEN)' }); }
		try { const url = await uploadFuncionarioFotoToBlob(req.file.buffer, funcionario._id); ops.$set.foto = url; await deleteFromBlobIfNeeded(funcionario.foto); } catch(err){ console.warn('[UPLOAD][incremental] Falha processar foto:', err.message); return res.status(500).json({ error:'Falha ao processar foto' }); }
	} else if(req.files?.foto?.length){
		if(!blobReady){ return res.status(503).json({ error:'Blob não configurado (conecte a Store no Vercel ou defina BLOB_READ_WRITE_TOKEN/WDGESTOR_DB_DADOS_READ_WRITE_TOKEN)' }); }
		try { const f=req.files.foto[0]; const url = await uploadFuncionarioFotoToBlob(f.buffer, funcionario._id); ops.$set.foto = url; await deleteFromBlobIfNeeded(funcionario.foto); } catch(err){ console.warn('[UPLOAD][incremental] Falha processar foto multi:', err.message); return res.status(500).json({ error:'Falha ao processar foto' }); }
	} else if(req.body.excluir_foto==='true' && funcionario.foto){
		// Exclusão explícita
		ops.$unset.foto = 1;
		await deleteFromBlobIfNeeded(funcionario.foto);
		try { const absFoto = path.join(__dirname,'../../../../..', String(funcionario.foto||'').replace(/^public\//,'')); if(fs.existsSync(absFoto)) fs.unlinkSync(absFoto); } catch{}
	} else {
		// Nenhum upload novo e não solicitou exclusão -> garantir que não haja unset acidental vindo do form
		if(ops.$unset && ops.$unset.foto){ delete ops.$unset.foto; }
		if(ops.$set && ops.$set.foto===null){ delete ops.$set.foto; }
	}
	if(req.files?.anexos?.length){ const novos=mapFiles(req.files.anexos); console.log('[UPLOAD][incremental] novos anexos normalizados:', novos.length); const existentes=ops.$set.anexos || funcionario.anexos || []; ops.$set.anexos = existentes.concat(novos); console.log('[UPLOAD][incremental] anexos total após concat:', ops.$set.anexos.length); }

	// Snapshot de diagnóstico do que será atualizado
	try {
		const setKeys = Object.keys(ops.$set||{});
		const unsetKeys = Object.keys(ops.$unset||{});
		console.log('[INCREMENTAL][OPS]', {
			set: setKeys,
			unset: unsetKeys,
			setCount: setKeys.length,
			unsetCount: unsetKeys.length
		});
	} catch(_d){ /* noop */ }

	// Filtra caminhos desconhecidos (evita StrictModeError) e protege required de serem unsetados
	ops = filterOpsBySchema(ops);
	ops = protectRequiredFieldsFromUnset(ops);

	// --- Patch: parse arrays biométricas via *_capturas_json (incremental) ---
	try {
		// guardrail tamanho bruto
		if (req.body.face_capturas_json && req.body.face_capturas_json.length > 500000) { console.warn('[BIO JSON][incremental] face_capturas_json excede limite'); delete req.body.face_capturas_json; }
		if (req.body.fp_capturas_json && req.body.fp_capturas_json.length > 500000) { console.warn('[BIO JSON][incremental] fp_capturas_json excede limite'); delete req.body.fp_capturas_json; }
		if (req.body.face_capturas_json) {
			let arr; try { 
				if (typeof req.body.face_capturas_json === 'string') {
					arr = JSON.parse(req.body.face_capturas_json); 
				} else {
					console.warn('[BIO JSON][incremental] face_capturas_json não é string:', typeof req.body.face_capturas_json);
					arr = null;
				}
			} catch { arr = null; }
			if (Array.isArray(arr)) {
					let norm = arr.filter(o=>o && (o.hash||o.imagem)).map(o=>
					(
						{
							hash: String(o.hash||'').substring(0,128),
							imagem: o.imagem && String(o.imagem).length < 500000 ? o.imagem : undefined,
							template_b64: o.template_b64 && String(o.template_b64).length < 500000 ? o.template_b64 : undefined,
							template_sha256: o.template_sha256 || undefined,
							qualidade: (o.qualidade!=null && Number.isFinite(Number(o.qualidade))) ? Number(o.qualidade) : undefined
						}
					)
				);
					// Converte imagens base64 -> Blob URLs quando possível
					if (norm.length) {
						try {
							if (canUseBlob()) norm = await mapBiometriasFaciaisToBlob(norm, funcionario._id);
						} catch(err){ console.warn('[BIO FACE][incremental] map blob falhou:', err?.message); }
						ops.$set.biometrias_facial = norm;
					} else { ops.$unset.biometrias_facial = 1; }
			}
		}
		if (req.body.fp_capturas_json) {
			let arr; try { 
				if (typeof req.body.fp_capturas_json === 'string') {
					arr = JSON.parse(req.body.fp_capturas_json); 
				} else {
					console.warn('[BIO JSON][incremental] fp_capturas_json não é string:', typeof req.body.fp_capturas_json);
					arr = null;
				}
			} catch { arr = null; }
			if (Array.isArray(arr)) {
				const norm = arr.filter(o=>o && (o.hash||o.imagem)).map(o=>({
					hash: String(o.hash||'').substring(0,128),
					imagem: o.imagem && String(o.imagem).length < 500000 ? o.imagem : undefined,
					template_b64: o.template_b64 && String(o.template_b64).length < 500000 ? o.template_b64 : undefined,
					template_sha256: o.template_sha256 || undefined,
					// mapeia idx (0..9) -> dedo D1..D10
					dedo: (Number.isInteger(o.idx) && o.idx>=0 && o.idx<10) ? ('D'+(o.idx+1)) : undefined
				}));
				if (norm.length) { ops.$set.biometrias_digitais = norm; } else { ops.$unset.biometrias_digitais = 1; }
			}
		}
	} catch(parseErr){ console.warn('[BIO JSON][incremental] falha parse:', parseErr.message); }
	// Converter face_imagem base64 -> Blob URL, se presente em $set
	if (blobReady && ops.$set && typeof ops.$set.face_imagem === 'string' && /^data:/i.test(ops.$set.face_imagem)){
		try { const parsed = parseDataUrl(ops.$set.face_imagem); if(parsed){ const url = await uploadFacePreviewToBlob(parsed.buffer, funcionario._id, 0); if(url) ops.$set.face_imagem = url; } } catch(err){ console.warn('[BIO FACE][incremental] face_imagem blob fail:', err?.message); }
	}
		try {
			await Funcionario.findByIdAndUpdate(id, ops, { new:true, runValidators:true });
			return ok(res, { updated:true });
		} catch(e){
			// Diagnóstico rico para facilitar a correção no front
			const isValidation = e && (e.name === 'ValidationError' || e.name === 'CastError');
			const payload = {
				success:false,
				code: isValidation ? 'BAD_REQUEST' : 'SERVER_ERROR',
				message: isValidation ? (e.message || 'Erro de validação') : 'Falha ao atualizar funcionário',
				path: e.path || undefined,
				errors: e.errors || undefined
			};
			// Duplicidade de índice (e-mail ou CPF)
			if (e && e.code === 11000) {
				const keys = Object.keys(e.keyPattern || {});
				let campo = keys[0] || undefined;
				let msg = 'Registro duplicado';
				if (keys.includes('email')) { campo = 'email'; msg = 'Já existe um funcionário cadastrado com este e-mail.'; }
				else if (keys.includes('cpf')) { campo = 'cpf'; msg = 'Já existe um funcionário cadastrado com este CPF nesta empresa.'; }
				payload.code = 'BAD_REQUEST';
				payload.message = msg;
				payload.path = campo;
				return res.status(400).json(payload);
			}
			console.error('[API FUNCIONARIOS][incremental] Erro:', e?.message, { path:e?.path, kind:e?.kind, code:e?.code, errors:Object.keys(e?.errors||{}) });
			if(isValidation) return res.status(400).json(payload);
			// Evita mascarar a mensagem com 'Erro interno' do helper
			return res.status(500).json(payload);
		}
		} catch(e){
			console.error('[API FUNCIONARIOS][incremental][outer] Erro:', e?.message, e?.stack);
			// Retorna mensagem do erro para facilitar diagnóstico no cliente
			return res.status(500).json({ success:false, code:'SERVER_ERROR', message: e?.message || 'Falha ao atualizar funcionário' });
		} }
// Aplica normalização de datas também no update incremental (após parsing acima mas antes de persistir)
// Reprocessa apenas campos de data em $set que ainda sejam arrays ou strings não convertidas.
// (Inserido logo após definição da função para garantir execução em chamadas futuras)
export async function updateFuncionario(req,res){ try { const { id } = req.params; const funcionario = await Funcionario.findById(id); if(!funcionario) return notFound(res,'Funcionário não encontrado');
	console.log('[UPLOAD][update-full] req.file?', !!req.file, 'req.files?.foto?.length', req.files?.foto?.length);
	console.log('[UPLOAD][update-full][debug] files keys:', Object.keys(req.files||{}));
	console.log('[UPLOAD][update-full][debug] anexos bruto length:', req.files?.anexos?.length || 0);
	if(req.body.anexos_existentes) console.log('[UPLOAD][update-full][debug] anexos_existentes strlen:', req.body.anexos_existentes.length);
	logDateDebug('update.before-normalize', req.body);
	applyDateNormalizationToBody(req.body);
	logDateDebug('update.after-normalize', req.body);
	if(req.body.pis && !isValidPIS(String(req.body.pis).replace(/\D/g,''))) return badRequest(res,'PIS inválido',{ campo:'pis' });
	if(req.body.pis_pasep && !isValidPIS(String(req.body.pis_pasep).replace(/\D/g,''))) return badRequest(res,'PIS/PASEP inválido',{ campo:'pis_pasep' });
	let ops = buildUpdateOpsFromBody(req.body);
	// Normalização de CPF (update completo)
	if(ops.$set && Object.prototype.hasOwnProperty.call(ops.$set,'cpf')){
		const rawCpf = String(ops.$set.cpf||'').replace(/\D/g,'');
		if(!rawCpf){ delete ops.$set.cpf; ops.$unset.cpf = 1; }
		else if(rawCpf.length !== 11){ return badRequest(res,'CPF inválido',{ campo:'cpf' }); }
		else { ops.$set.cpf = rawCpf; }
	}
	if(ops.$set){
		if(Array.isArray(ops.$set.dependentes)){
			ops.$set.dependentes = ops.$set.dependentes.map(d=>{ if(d && d.cpf) d.cpf = String(d.cpf).replace(/\D/g,''); return d; });
		}
		Object.keys(ops.$set).forEach(k=>{ if(k==='anexos' || k.startsWith('anexos.')) delete ops.$set[k]; });
	}
	if(ops.$unset){ Object.keys(ops.$unset).forEach(k=>{ if(k==='anexos' || k.startsWith('anexos.')) delete ops.$unset[k]; }); }
	// Normalização salario_base (string PT-BR -> number)
	if(ops.$set && Object.prototype.hasOwnProperty.call(ops.$set,'salario_base')) {
		const raw = String(ops.$set.salario_base||'').trim();
		if(!raw) { delete ops.$set.salario_base; ops.$unset.salario_base = 1; }
		else {
			const parsed = Number(raw.replace(/[R$\s]/g,'').replace(/\./g,'').replace(',', '.'));
			if(Number.isFinite(parsed)) ops.$set.salario_base = parsed; else { delete ops.$set.salario_base; ops.$unset.salario_base = 1; }
		}
	}
	if(req.body.pcd==='N'){ ops.$unset['tipo_deficiencia']=1; ops.$unset['cid']=1; }
	const blobReadyUpdate = canUseBlob();
	if(req.file && req.file.fieldname === 'foto'){
		if(!blobReadyUpdate){ return res.status(503).json({ error:'Blob não configurado (conecte a Store no Vercel ou defina BLOB_READ_WRITE_TOKEN/WDGESTOR_DB_DADOS_READ_WRITE_TOKEN)' }); }
		try { const url = await uploadFuncionarioFotoToBlob(req.file.buffer, funcionario._id); ops.$set.foto = url; await deleteFromBlobIfNeeded(funcionario.foto); } catch(err){ console.warn('[UPLOAD][update] Falha processar foto:', err.message); return res.status(500).json({ error:'Falha ao processar foto' }); }
	} else if(req.files?.foto?.length){
		if(!blobReadyUpdate){ return res.status(503).json({ error:'Blob não configurado (conecte a Store no Vercel ou defina BLOB_READ_WRITE_TOKEN/WDGESTOR_DB_DADOS_READ_WRITE_TOKEN)' }); }
		try { const f=req.files.foto[0]; const url = await uploadFuncionarioFotoToBlob(f.buffer, funcionario._id); ops.$set.foto = url; await deleteFromBlobIfNeeded(funcionario.foto); } catch(err){ console.warn('[UPLOAD][update] Falha processar foto multi:', err.message); return res.status(500).json({ error:'Falha ao processar foto' }); }
	} else if(req.body.excluir_foto==='true' && funcionario.foto){
		ops.$unset.foto=1; // remoção explícita
		await deleteFromBlobIfNeeded(funcionario.foto);
	} else {
		// Nem upload nem exclusão solicitada -> protege campo foto
		if(ops.$unset && ops.$unset.foto){ delete ops.$unset.foto; }
		if(ops.$set && ops.$set.foto===null){ delete ops.$set.foto; }
	}
	let anexosFinal=[]; if(req.body.anexos_existentes && typeof req.body.anexos_existentes === 'string'){ try { anexosFinal=JSON.parse(req.body.anexos_existentes); } catch{} }
	if(req.body.anexos_excluidos && typeof req.body.anexos_excluidos === 'string'){ try { const excluidos=JSON.parse(req.body.anexos_excluidos); const caminhos=new Set(excluidos.map(a=>a.caminho)); anexosFinal = anexosFinal.filter(e=>!caminhos.has(e.caminho)); for(const ex of excluidos){ if(ex.caminho){ const abs=path.join(__dirname,'../../../../..', ex.caminho.replace(/^public\//,'')); try { if(fs.existsSync(abs)) fs.unlinkSync(abs); } catch{} } } } catch{} }
	if(req.files?.anexos?.length){ const novos=mapFiles(req.files.anexos); console.log('[UPLOAD][update-full] novos anexos normalizados:', novos.length); anexosFinal = anexosFinal.concat(novos); }
	if(anexosFinal.length>0) ops.$set.anexos = anexosFinal; else ops.$unset.anexos=1;

	// Filtra caminhos desconhecidos (update completo) e protege required
	ops = filterOpsBySchema(ops);
	ops = protectRequiredFieldsFromUnset(ops);

	// --- Patch: parse arrays biométricas via *_capturas_json (update completo) ---
	try {
		if (req.body.face_capturas_json && req.body.face_capturas_json.length > 500000) { console.warn('[BIO JSON][update-full] face_capturas_json excede limite'); delete req.body.face_capturas_json; }
		if (req.body.fp_capturas_json && req.body.fp_capturas_json.length > 500000) { console.warn('[BIO JSON][update-full] fp_capturas_json excede limite'); delete req.body.fp_capturas_json; }
		if (req.body.face_capturas_json) {
			let arr; try { 
				if (typeof req.body.face_capturas_json === 'string') {
					arr = JSON.parse(req.body.face_capturas_json); 
				} else {
					console.warn('[BIO JSON][update-full] face_capturas_json não é string:', typeof req.body.face_capturas_json);
					arr = null;
				}
			} catch { arr = null; }
			if (Array.isArray(arr)) {
				let norm = arr.filter(o=>o && (o.hash||o.imagem)).map(o=>(
					{
						hash: String(o.hash||'').substring(0,128),
						imagem: o.imagem && String(o.imagem).length < 500000 ? o.imagem : undefined,
						template_b64: o.template_b64 && String(o.template_b64).length < 500000 ? o.template_b64 : undefined,
						template_sha256: o.template_sha256 || undefined,
						qualidade: (o.qualidade!=null && Number.isFinite(Number(o.qualidade))) ? Number(o.qualidade) : undefined
					}
				));
				// Converte base64 -> Blob URL quando possível
				try { if (canUseBlob()) norm = await mapBiometriasFaciaisToBlob(norm, funcionario._id); } catch(err){ console.warn('[BIO FACE][update-full] map blob falhou:', err?.message); }
				if (norm.length) { ops.$set.biometrias_facial = norm; } else { ops.$unset.biometrias_facial = 1; }
			}
		}
		if (req.body.fp_capturas_json) {
			let arr; try { 
				if (typeof req.body.fp_capturas_json === 'string') {
					arr = JSON.parse(req.body.fp_capturas_json); 
				} else {
					console.warn('[BIO JSON][update-full] fp_capturas_json não é string:', typeof req.body.fp_capturas_json);
					arr = null;
				}
			} catch { arr = null; }
			if (Array.isArray(arr)) {
				const norm = arr.filter(o=>o && (o.hash||o.imagem)).map(o=>(
					{
						hash: String(o.hash||'').substring(0,128),
						imagem: o.imagem && String(o.imagem).length < 500000 ? o.imagem : undefined,
						template_b64: o.template_b64 && String(o.template_b64).length < 500000 ? o.template_b64 : undefined,
						template_sha256: o.template_sha256 || undefined,
						// idx -> dedo
						dedo: (Number.isInteger(o.idx) && o.idx>=0 && o.idx<10) ? ('D'+(o.idx+1)) : undefined
					}
				));
				if (norm.length) { ops.$set.biometrias_digitais = norm; } else { ops.$unset.biometrias_digitais = 1; }
			}
		}
	} catch(parseErr){ console.warn('[BIO JSON][update-full] falha parse:', parseErr.message); }
	// face_imagem base64 -> Blob URL, se presente
	if (blobReadyUpdate && ops.$set && typeof ops.$set.face_imagem === 'string' && /^data:/i.test(ops.$set.face_imagem)){
		try { const parsed = parseDataUrl(ops.$set.face_imagem); if(parsed){ const url = await uploadFacePreviewToBlob(parsed.buffer, funcionario._id, 0); if(url) ops.$set.face_imagem = url; } } catch(err){ console.warn('[BIO FACE][update] face_imagem blob fail:', err?.message); }
	}
		try {
			await Funcionario.findByIdAndUpdate(id, ops, { new:true, runValidators:true });
			return ok(res, { updated:true });
		} catch(e){
			const isValidation = e && (e.name === 'ValidationError' || e.name === 'CastError');
			console.error('[API FUNCIONARIOS][update] Erro:', e?.message, { path:e?.path, kind:e?.kind, code:e?.code, errors:Object.keys(e?.errors||{}) });
			if(isValidation) return res.status(400).json({ success:false, code:'BAD_REQUEST', message:e.message, path:e.path, errors:e.errors });
			// Duplicidade de índice
			if (e && e.code === 11000) {
				const keys = Object.keys(e.keyPattern || {});
				let campo = keys[0] || undefined;
				let msg = 'Registro duplicado';
				if (keys.includes('email')) { campo = 'email'; msg = 'Já existe um funcionário cadastrado com este e-mail.'; }
				else if (keys.includes('cpf')) { campo = 'cpf'; msg = 'Já existe um funcionário cadastrado com este CPF nesta empresa.'; }
				return res.status(400).json({ success:false, code:'BAD_REQUEST', message: msg, path: campo });
			}
			return serverError(res,'Falha ao atualizar');
		}
		} catch(e){
			console.error('[API FUNCIONARIOS][update][outer] Erro:', e?.message, e?.stack);
			return res.status(500).json({ success:false, code:'SERVER_ERROR', message: e?.message || 'Falha ao atualizar' });
		} }
function isValidObjectIdLike(v){ return typeof v==='string' && /^[a-fA-F0-9]{24}$/.test(v); }
export async function getFuncionario(req,res){
	try {
		const { id } = req.params;
		if(!isValidObjectIdLike(id)) return badRequest(res,'ID inválido');
		const f = await Funcionario.findById(id).populate('unidade_id funcao_id departamento');
		if(!f) return notFound(res,'Não encontrado');
		// Enriquecimento: adiciona URL absoluta e relativa normalizada da foto para o frontend
		let payload;
		if(typeof f.toObject === 'function') payload = f.toObject({ virtuals:true }); else payload = f;
		if(payload.foto){
				const fotoVal = String(payload.foto);
				const baseMount = (req.baseUrl || '').replace(/\/$/,'');
				const apiUrl = `${baseMount}/api/funcionarios/${id}/foto`;
				if(/^https?:\/\//i.test(fotoVal)){
					payload.foto_url = apiUrl;
					payload.foto_url_api = apiUrl;
					payload.foto_urls = [apiUrl, fotoVal];
					try { payload.foto_url_abs = `${req.protocol}://${req.get('host')}${apiUrl}`; } catch {}
				} else {
					const rel = fotoVal.replace(/^public\//,'').replace(/^\//,'');
					const legacy = '/' + rel;
					const prefixed = baseMount ? `${baseMount}/${rel}` : legacy;
					payload.foto = rel;
					payload.foto_url_legacy = legacy;
					payload.foto_url_prefixed = prefixed;
					payload.foto_url = prefixed;
					payload.foto_url_api = apiUrl;
					payload.foto_urls = Array.from(new Set([apiUrl, prefixed, legacy]));
					try { payload.foto_url_abs = `${req.protocol}://${req.get('host')}${prefixed}`; } catch {}
					try {
						const abs = path.join(ROOT_PROJ, rel.startsWith('uploads/')? 'public' : '', rel.startsWith('uploads/')? rel : rel);
						if(!fs.existsSync(abs)) {
							console.warn('[UPLOAD][debug] Arquivo de foto ausente no disco:', abs, '-> mantendo apenas foto_url_api');
							delete payload.foto; delete payload.foto_url; delete payload.foto_url_abs;
						}
					} catch{}
				}
			}
		return ok(res, payload);
	} catch(e){ return serverError(res,e); }
}
export async function deleteFuncionario(req,res){ try { const { id } = req.params; const funcionario = await Funcionario.findById(id); if(!funcionario) {
	// UX: tratar como sucesso idempotente para evitar 404 ruidoso no front
	return ok(res, { deleted:true, alreadyRemoved:true });
}
const usuarioVinculado = await User.findOne({ funcionario_id: funcionario._id }); if(usuarioVinculado && usuarioVinculado.role==='master') return res.status(403).json({ success:false, error:'Funcionário vinculado a usuário master não pode ser excluído.', code:'FORBIDDEN' }); await Funcionario.findByIdAndDelete(id); return ok(res, { deleted:true }); } catch(e){ console.error('[API FUNCIONARIOS][delete] Erro:', e); return serverError(res,'Erro ao excluir funcionário'); } }

// GET da foto do funcionário: redireciona para URL pública (Blob) ou serve arquivo/Data URL legado
export async function getFuncionarioFoto(req, res){
	try {
		const { id } = req.params;
		if(!isValidObjectIdLike(id)) return res.status(400).json({ error:'ID inválido' });
		const f = await Funcionario.findById(id).lean();
		if(!f) return res.status(404).json({ error:'Funcionário não encontrado' });
		const foto = f.foto || '';
		// 1) Data URL
		if(/^data:/i.test(foto)){
			try {
				const [header, base64] = String(foto).split(',');
				const contentType = header.split(';')[0].split(':')[1] || 'application/octet-stream';
				const buffer = Buffer.from(base64 || '', 'base64');
				res.set('Content-Type', contentType);
				res.set('Cache-Control', 'private, max-age=300');
				return res.send(buffer);
			} catch { return res.status(204).end(); }
		}
		// 2) URL pública
		if(/^https?:\/\//i.test(foto)){
			res.set('Cache-Control', 'private, max-age=300');
			return res.redirect(foto);
		}
		// 3) Caminho em disco legado
		try {
			if(typeof foto === 'string' && foto){
				const rel = foto.replace(/^\/*/, '');
				const root = process.cwd();
				const candidates = [
					path.join(root, 'public', rel),
					path.join(root, rel),
					path.join(root, 'public', 'uploads', rel)
				];
				for(const p of candidates){
					try {
						const st = fs.statSync(p);
						if(st && st.isFile()){
							const ext = path.extname(p).toLowerCase();
							const type = ext === '.svg' ? 'image/svg+xml'
												: ext === '.png' ? 'image/png'
												: ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
												: ext === '.webp' ? 'image/webp'
												: 'application/octet-stream';
							res.set('Content-Type', type);
							res.set('Cache-Control', 'private, max-age=300');
							return res.sendFile(p);
						}
					} catch {}
				}
			}
		} catch {}
		// 4) Placeholder
		try {
			const root = process.cwd();
			const ph = path.join(root, 'public', 'img', 'user-placeholder.svg');
			res.set('Content-Type', 'image/svg+xml');
			res.set('Cache-Control', 'public, max-age=600');
			return res.sendFile(ph, err => err ? res.status(204).end() : undefined);
		} catch { return res.status(204).end(); }
	} catch(err){
		console.error('[FUNCIONARIO][GET FOTO] erro:', err);
		return res.status(500).json({ error:'Falha ao obter foto' });
	}
}
export async function deleteFuncionarioPost(req,res){ try { const { id } = req.params; const funcionario = await Funcionario.findById(id); if(!funcionario) {
	// Idempotente: sinaliza removido e segue com redirect neutro
	return ok(res, { deleted:true, alreadyRemoved:true, redirect:'/funcionarios?deleted=1' });
}
const usuarioVinculado = await User.findOne({ funcionario_id: funcionario._id }); if(usuarioVinculado && usuarioVinculado.role==='master') return res.status(403).json({ success:false, error:'Funcionário vinculado a usuário master não pode ser excluído.', code:'FORBIDDEN' }); await Funcionario.findByIdAndDelete(id); return ok(res, { deleted:true, redirect:'/funcionarios?deleted=1&nome='+encodeURIComponent(funcionario.nome) }); } catch(e){ console.error('[API FUNCIONARIOS][deletePost] Erro:', e); return serverError(res,'Erro ao excluir funcionário'); } }
export async function downloadAnexoFuncionario(req,res){
	try {
		const { id, idx } = req.params;
		const funcionario = await Funcionario.findById(id);
		if(!funcionario) return res.status(404).send('Funcionário não encontrado');
		const i = parseInt(idx,10);
		if(isNaN(i) || i < 0 || !funcionario.anexos || i >= funcionario.anexos.length)
			return res.status(404).send('Anexo não encontrado');
		const anexo = funcionario.anexos[i];
		if(!anexo.caminho) return res.status(404).send('Arquivo sem caminho');

		// Normaliza caminho relativo similar à lógica da foto
		let rel = String(anexo.caminho).replace(/^public\//,'').replace(/^\/+/, '');
		// Caminho físico: se começa com uploads/ então fica em public/uploads
		let abs = path.join(ROOT_PROJ, rel.startsWith('uploads/') ? 'public' : '', rel);
		if(!fs.existsSync(abs)) {
			// Tenta alternativa caso o caminho tenha vindo completo ou sem public
			const tentativa2 = path.join(ROOT_PROJ,'public', rel);
			if(fs.existsSync(tentativa2)) {
				abs = tentativa2;
			} else {
				console.warn('[ANEXO][download] Arquivo ausente. Tentativas:', { rel, absTentativa1: abs, absTentativa2: tentativa2 });
				return res.status(404).send('Arquivo ausente no servidor');
			}
		}
		try {
			const size = fs.statSync(abs).size;
			console.log('[ANEXO][download] OK', { rel, abs, size, idx:i });
		} catch(errStat){ console.warn('[ANEXO][download] Falha stat:', errStat.message); }
		res.setHeader('Content-Type', anexo.mime || 'application/octet-stream');
		res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(anexo.nome||'arquivo')}"`);
		fs.createReadStream(abs).pipe(res);
	} catch(e){
		console.error('[API FUNCIONARIOS][downloadAnexo] Erro:', e);
		res.status(500).send('Erro ao baixar anexo');
	}
}
export async function listarFuncionariosDisponiveis(req,res){
	try {
		const { unidadeId } = req.params;
		const includeId = String(req.query.include || '').trim();
		if(!unidadeId || unidadeId==='undefined' || unidadeId==='null'){
			return ok(res, []);
		}
		let funcionarios = await Funcionario.find({
			unidade_id: unidadeId,
			$or: [ { usuario_id: { $exists:false } }, { usuario_id: null } ]
		}).select('_id nome cpf').sort({ nome:1 }).lean();

		// Opcional: incluir o funcionário atual (já vinculado) para edição, se for da mesma unidade
		if (includeId && /^[a-fA-F0-9]{24}$/.test(includeId)) {
			try {
				const atual = await Funcionario.findById(includeId).select('_id nome cpf unidade_id').lean();
				if (atual && String(atual.unidade_id) === String(unidadeId)) {
					const exists = funcionarios.some(f => String(f._id) === String(atual._id));
					if (!exists) funcionarios = [...funcionarios, { _id: atual._id, nome: atual.nome, cpf: atual.cpf }];
				}
			} catch(_e) { /* noop */ }
		}
		return ok(res, funcionarios || []);
	} catch(error){
		return serverError(res, error);
	}
}

// Endpoint utilitário: tenta encontrar um Funcionário correspondente antes de criar usuário
// Critérios de match (prioridade):
// 1) CPF + unidade_id
// 2) e-mail
// Retorna dados mínimos para confirmação no frontend
export async function matchFuncionario(req, res){
	try {
		const cpfRaw = asStr(req.query.cpf || req.body?.cpf || '').replace(/\D/g,'');
		const unidadeId = asStr(req.query.unidade_id || req.body?.unidade_id || '').trim();
		const email = asStr(req.query.email || req.body?.email || '').toLowerCase().trim();

		let encontrado = null; let matchType = null;
		// Prioriza CPF+unidade
		if (cpfRaw && unidadeId) {
			encontrado = await Funcionario.findOne({ cpf: cpfRaw, unidade_id: unidadeId }).select('_id nome cpf email unidade_id usuario_id').lean();
			if (encontrado) matchType = 'cpf+unidade';
		}
		// Fallback por e-mail
		if (!encontrado && email) {
			encontrado = await Funcionario.findOne({ email }).select('_id nome cpf email unidade_id usuario_id').lean();
			if (encontrado) matchType = 'email';
		}

		if (!encontrado) return ok(res, { exists:false });

		const hasUsuario = !!encontrado.usuario_id;
		return ok(res, {
			exists: true,
			matchType,
			funcionario: {
				_id: encontrado._id,
				nome: encontrado.nome,
				cpf: encontrado.cpf,
				email: encontrado.email,
				unidade_id: encontrado.unidade_id,
				usuario_id: encontrado.usuario_id || null,
				hasUsuario
			},
			canLink: !hasUsuario
		});
	} catch (e) {
		console.error('[FUNCIONARIO][match] erro:', e);
		return serverError(res, 'Falha ao procurar funcionário correspondente');
	}
}

