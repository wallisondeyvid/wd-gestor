import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { put, del } from '@vercel/blob';
import { v4 as uuid } from 'uuid';
import { fileURLToPath } from 'url';
import { ok, notFound, serverError, badRequest, created, missingFields } from '#core/utils/apiResponse.js';
import {
	findFuncionarioByCpfAndUnidade,
	createFuncionarioDoc,
	saveFuncionario,
	saveUserDoc,
	findUnidadeUserBaseLean,
	findFuncionarioById,
	updateFuncionarioByIdWithOps,
	findFuncionarioByIdPopulateRefs,
	findFuncionarioByIdLean,
	deleteFuncionarioById,
	findFuncionariosDisponiveisByUnidadeLean,
	findFuncionarioByIdSelectBasicLean,
	findFuncionarioByCpfAndUnidadeSelectLean,
	findUserByEmail,
	findUserByFuncionarioId,
	findUserMembershipByUserAndUnidade,
	createUserMembership,
	setUserMembershipFuncionarioIdIfEmpty,
} from '#modules/gestor/app/services/apiDbBridgeService.js';
import { normalizeFuncionarioPayload } from './utils/funcionarioNormalize.js';
import {
	reconcileUpdateFuncionarioIncrementalAnexos,
	reconcileUpdateFuncionarioFullAnexos,
} from './utils/reconcileFuncionarioAnexos.js';
import { reconcileUpdateFuncionarioFullBiometria } from './utils/reconcileFuncionarioBiometria.js';
import { reconcileUpdateFuncionarioFullFoto } from './utils/reconcileFuncionarioFoto.js';
import { deleteFuncionarioPostExecutionService } from '#modules/gestor/app/services/funcionarios/deleteFuncionarioPostExecution.service.js';
import { executeCreateFuncionarioCoreService } from '#modules/gestor/app/services/funcionarioCreateCoreService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = process.cwd();

function normalizeUnitId(value) {
	return String(value || '').trim();
}

function firstNonEmptyUnitId(...values) {
	for (const value of values) {
		const normalized = normalizeUnitId(value);
		if (normalized) return normalized;
	}
	return '';
}

function getScopedUnitId(req) {
	return normalizeUnitId(req?.unitScope?.unidadeId);
}

function getRequestUnitId(req) {
	return firstNonEmptyUnitId(
		req?.query?.unidade_id,
		req?.query?.unidadeId,
		req?.body?.unidade_id,
		req?.body?.unidadeId,
	);
}

function getAuthContextActiveUnitId(req) {
	const authContext = req?.session?.gestorAuthContext;
	return firstNonEmptyUnitId(
		authContext?.active_unidade_id,
		authContext?.activeUnidadeId,
		authContext?.activeContext?.unidadeId,
	);
}

function getCanonicalContextUnitId(req) {
	return firstNonEmptyUnitId(
		getAuthContextActiveUnitId(req),
		getScopedUnitId(req),
	);
}

async function resolveAuxiliaryOperationalUnitId(req) {
	const authContextUnitId = getAuthContextActiveUnitId(req);
	if (authContextUnitId) return authContextUnitId;

	const scopedUnitId = getScopedUnitId(req);
	if (!scopedUnitId) return '';

	return scopedUnitId;
}

function requestedUnitMatchesResolvedContext(requestedUnitId, resolvedUnitId) {
	const requested = normalizeUnitId(requestedUnitId);
	if (!requested) return true;

	const resolved = normalizeUnitId(resolvedUnitId);
	if (resolved) return requested === resolved;

	return true;
}

function requestedUnitMatchesContext(req, requestedUnitId) {
	const requested = normalizeUnitId(requestedUnitId);
	if (!requested) return true;

	const canonicalContextUnitId = getCanonicalContextUnitId(req);
	if (canonicalContextUnitId) return requested === canonicalContextUnitId;

	return true;
}

// ================= Normalização e movimentação de arquivos =================
const ROOT_PROJ = path.join(ROOT, '.');
function createFuncionarioAssetsInfraCore({
	rootDir = ROOT_PROJ,
	fileSystem = fs,
	pathModule = path,
	putObject = put,
	deleteObject = del,
	imageProcessor = sharp,
	uuidFactory = uuid,
	env = process.env,
	BufferCtor = Buffer,
} = {}) {
	function ensureDir(dir){ if(!fileSystem.existsSync(dir)) fileSystem.mkdirSync(dir,{recursive:true}); }
	function normalizeAndMaybeMove(fullPath){
	  try {
	    const normFull = String(fullPath || '').replace(/\\/g,'/');
	    if(/\/public\/uploads\//.test(normFull) || /\/uploads\//.test(normFull)){
	      let rel = pathModule.relative(rootDir, normFull).replace(/\\/g,'/');
	      rel = rel.replace(/^public\//,'');
	      if(!rel.startsWith('uploads/')) rel = 'uploads/' + pathModule.basename(normFull);
	      return { relative: rel, moved:false };
	    }
	    if(/\/tmp\/uploads\//.test(normFull)){
	      const baseName = pathModule.basename(normFull);
	      const destDir = pathModule.join(rootDir,'public','uploads'); ensureDir(destDir);
	      let destFull = pathModule.join(destDir, baseName);
	      if(fileSystem.existsSync(destFull)){
	        const nameNoExt = baseName.replace(/\.[^.]+$/,'');
	        const ext = (baseName.match(/\.[^.]+$/)||[''])[0];
	        let c=1; while(fileSystem.existsSync(destFull)){ destFull = pathModule.join(destDir, `${nameNoExt}_${c}${ext}`); c++; }
	      }
	      try { fileSystem.renameSync(normFull, destFull); }
	      catch(err){ console.warn('[UPLOAD][move] rename falhou, tentando copy:', err.message); try { fileSystem.copyFileSync(normFull, destFull); } catch(copyErr){ console.error('[UPLOAD][copy] falhou:', copyErr.message); } }
	      return { relative: 'uploads/'+pathModule.basename(destFull), moved:true };
	    }
	    let rel = pathModule.relative(rootDir, normFull).replace(/\\/g,'/');
	    rel = rel.replace(/^public\//,'');
	    if(!rel.startsWith('uploads/')){
	      const destDir = pathModule.join(rootDir,'public','uploads'); ensureDir(destDir);
	      const baseName = pathModule.basename(normFull);
	      const destFull = pathModule.join(destDir, baseName);
	      try { if(!fileSystem.existsSync(destFull)) fileSystem.copyFileSync(normFull, destFull); rel = 'uploads/'+baseName; } catch(err){ console.error('[UPLOAD][force-copy] falhou:', err.message); }
	    }
	    return { relative: rel, moved:false };
	  } catch(err){
	    console.error('[UPLOAD][normalize] erro:', err.message);
			return { relative: 'uploads/erro-'+Date.now()+'.jpg', moved:false };
	  }
	}
	function ensureDiskPathFromMemoryFile(file){
		try {
			if(!file) return file;
			if(file.path) return file;
			if(!file.buffer) return file;
			const destDir = pathModule.join(rootDir,'public','uploads'); ensureDir(destDir);
			let original = file.originalname || 'arquivo';
			if(!/\.[a-zA-Z0-9]{2,6}$/.test(original) && file.mimetype){
				const extMap = { 'image/jpeg':'.jpg', 'image/pjpeg':'.jpg', 'image/png':'.png', 'image/webp':'.webp', 'image/gif':'.gif' };
				const guess = extMap[file.mimetype];
				if(guess) original += guess;
			}
			const safeBase = (Date.now()+'-'+ original)
				.replace(/[^a-zA-Z0-9._-]/g,'_')
				.slice(0,140);
			let full = pathModule.join(destDir, safeBase);
			let c=1; while(fileSystem.existsSync(full)) { full = pathModule.join(destDir, safeBase.replace(/(\.[^.]+)?$/, `_${c}$1`)); c++; }
			fileSystem.writeFileSync(full, file.buffer);
			const size = fileSystem.statSync(full).size;
			console.log('[UPLOAD][memory->disk] gravado', { full, size, original: file.originalname, mimetype: file.mimetype });
			file.path = full;
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
			ensureDiskPathFromMemoryFile(f);
			if (!f.path) return null;
			try {
				const norm = normalizeAndMaybeMove(f.path);
				return { nome: f.originalname || 'arquivo_sem_nome', mime: f.mimetype || 'application/octet-stream', tamanho: f.size || 0, caminho: norm.relative, data_upload: new Date() };
			} catch(err){
				console.warn('[UPLOAD][anexo] Falha ao normalizar anexo', f.originalname, err.message);
				return null;
			}
	  }).filter(Boolean);
	}
	function getBlobToken(){
		return env.BLOB_READ_WRITE_TOKEN
			|| env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN
			|| env.VERCEL_BLOB_RW_TOKEN
			|| '';
	}
	function isBlobUrl(u){ return typeof u==='string' && /https?:\/\/.*blob\.vercel-storage\.com\//i.test(u); }
	async function uploadFuncionarioFotoToBlob(buffer, funcionarioId){
		if(!buffer || !buffer.length) return null;
		let webp;
		try {
			webp = await imageProcessor(buffer).rotate().resize(512,512,{ fit:'cover', position:'center', withoutEnlargement:true }).toFormat('webp',{ quality:90 }).toBuffer();
		} catch(err){
			console.warn('[FUNC][FOTO] sharp falhou:', err?.message);
			throw new Error('Arquivo de imagem inválido');
		}
		const key = `funcionarios/${funcionarioId || 'temp'}-${uuidFactory()}.webp`;
		const token = getBlobToken();
		const putOptions = {
			access:'public',
			contentType:'image/webp',
			cacheControl:'public, max-age=31536000, immutable',
			...(token? { token } : {})
		};
		const { url } = await putObject(key, webp, putOptions);
		return url;
	}
	async function deleteFromBlobIfNeeded(url){ try { if(isBlobUrl(url)){ const token=getBlobToken(); await deleteObject(url, token?{ token }:undefined); return true; } } catch(_){} return false; }
	function canUseBlob(){ return !!env.VERCEL || !!getBlobToken(); }
	function parseDataUrl(dataUrl){
		try {
			if(!/^data:/i.test(String(dataUrl))) return null;
			const [header, base64] = String(dataUrl).split(',');
			if(!base64) return null;
			const contentType = header.split(';')[0].split(':')[1] || 'application/octet-stream';
			const buffer = BufferCtor.from(base64, 'base64');
			return { contentType, buffer };
		} catch { return null; }
	}
	async function uploadFacePreviewToBlob(buffer, funcionarioId, idx){
		if(!buffer || !buffer.length) return null;
		let webp;
		try {
			webp = await imageProcessor(buffer).rotate().resize(640, 640, { fit: 'inside', withoutEnlargement: true }).toFormat('webp', { quality: 92 }).toBuffer();
		} catch(err){
			console.warn('[BIO FACE] sharp falhou:', err?.message);
			return null;
		}
		const key = `faces/${funcionarioId || 'temp'}-${uuidFactory()}-${(idx??0)+1}.webp`;
		const token = getBlobToken();
		const putOptions = { access:'public', contentType:'image/webp', cacheControl:'public, max-age=31536000, immutable', ...(token?{ token }: {}) };
		const { url } = await putObject(key, webp, putOptions);
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
	return {
		normalizeAndMaybeMove,
		ensureDiskPathFromMemoryFile,
		mapFiles,
		canUseBlob,
		uploadFuncionarioFotoToBlob,
		deleteFromBlobIfNeeded,
		parseDataUrl,
		uploadFacePreviewToBlob,
		mapBiometriasFaciaisToBlob,
	};
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

function handleFuncionarioCreateDuplicateError(res, error) {
	if (!error || error.code !== 11000) return null;
	const keys = Object.keys(error.keyPattern || {});
	if (keys.includes('email')) {
		return badRequest(res, 'Já existe um funcionário cadastrado com este e-mail.', { campo: 'email' });
	}
	if (keys.includes('cpf')) {
		return badRequest(res, 'Já existe um funcionário cadastrado com este CPF nesta empresa.', { campo: 'cpf' });
	}
	return badRequest(res, 'Registro duplicado');
}

function normalizeRoleValue(value) {
	return String(value || '').trim().toLowerCase();
}

function resolveAutoUserRole(funcionario) {
	const emailNorm = String(funcionario?.email || '').trim().toLowerCase();
	return emailNorm === 'wallisondeyvid13@gmail.com' ? 'master' : 'user';
}

function resolvePapelContextualFromRole(role) {
	const normalizedRole = normalizeRoleValue(role);
	if (normalizedRole === 'diretor') return 'gestor';
	if (normalizedRole === 'user') return 'user';
	return null;
}

function buildAutoUserMembershipPayload({ userId, role, unidadeId, funcionarioId }) {
	const papelContextual = resolvePapelContextualFromRole(role);
	const unidadeIdNorm = String(unidadeId || '').trim();
	if (!userId || !papelContextual || !unidadeIdNorm) {
		return null;
	}

	return {
		user_id: userId,
		unidade_id: unidadeIdNorm,
		papel_contextual: papelContextual,
		status: 'active',
		funcionario_id: funcionarioId || null,
		origem: 'gestor-funcionario-auto',
	};
}

function isDuplicateKeyError(error) {
	const code = error?.code || error?.original?.code || null;
	return code === 11000 || /duplicate key/i.test(String(error?.message || error || ''));
}

function resolveAutoUserMessage(outcome, fallbackMessage = null) {
	if (fallbackMessage) return fallbackMessage;
	if (outcome === 'created') return 'Usuário criado automaticamente para o funcionário.';
	if (outcome === 'linked') return 'Usuário existente vinculado automaticamente à unidade do funcionário.';
	if (outcome === 'already-linked') return 'Usuário já estava vinculado a esta unidade.';
	if (outcome === 'conflict') return 'Usuário já possui vínculo com esta unidade associado a outro funcionário.';
	if (outcome === 'error') return 'Falha ao criar ou vincular usuário automaticamente.';
	return 'Resultado do usuário automático processado.';
}

async function syncFuncionarioUsuarioIfEmpty(funcionario, userId) {
	if (!funcionario || !userId) return false;
	if (String(funcionario.usuario_id || '') === String(userId)) return false;
	if (funcionario.usuario_id) return false;
	funcionario.usuario_id = userId;
	await saveFuncionario(funcionario);
	return true;
}

async function syncLegacyUserFuncionarioIfEmpty(user, funcionario) {
	if (!user || !funcionario?._id) return false;
	if (String(user.funcionario_id || '') === String(funcionario._id)) return false;
	if (user.funcionario_id) return false;
	user.funcionario_id = funcionario._id;
	if (!user.unidade_id) user.unidade_id = funcionario.unidade_id;
	await saveUserDoc(user);
	return true;
}

async function syncExistingMembershipFuncionario(existingMembership, funcionarioId) {
	if (!existingMembership?._id || !funcionarioId) {
		return { updated: false, conflict: false };
	}

	const currentFuncionarioId = String(existingMembership.funcionario_id || '');
	const targetFuncionarioId = String(funcionarioId || '');
	if (!currentFuncionarioId) {
		const updated = await setUserMembershipFuncionarioIdIfEmpty(existingMembership._id, funcionarioId);
		return { updated: !!updated, conflict: !updated };
	}

	if (currentFuncionarioId === targetFuncionarioId) {
		return { updated: false, conflict: false };
	}

	return { updated: false, conflict: true };
}

async function createFuncionarioAutoUserLinkCore({
	funcionario,
	resolveRole = resolveAutoUserRole,
	buildMembershipPayload = buildAutoUserMembershipPayload,
	findUserByEmail: findUserByEmailFn = findUserByEmail,
	provisionUser,
	findUserMembershipByUserAndUnidade: findUserMembershipByUserAndUnidadeFn = findUserMembershipByUserAndUnidade,
	createUserMembership: createUserMembershipFn = createUserMembership,
	syncMembershipFuncionario: syncMembershipFuncionarioFn = syncExistingMembershipFuncionario,
	syncFuncionarioUsuario: syncFuncionarioUsuarioFn = syncFuncionarioUsuarioIfEmpty,
	syncLegacyUserFuncionario: syncLegacyUserFuncionarioFn = syncLegacyUserFuncionarioIfEmpty,
	isDuplicateMembershipError = isDuplicateKeyError,
	resolveMessage = resolveAutoUserMessage,
} = {}) {
	try {
		const emailNorm = String(funcionario?.email || '').trim().toLowerCase();
		const unidadeId = String(funcionario?.unidade_id || '').trim();
		const role = resolveRole(funcionario);
		let user = await findUserByEmailFn(emailNorm);
		const reusedUser = !!user;

		if (!user) {
			user = await provisionUser({
				nome: funcionario?.nome,
				email: emailNorm,
				cpf: funcionario?.cpf,
				role,
				unidade_id: funcionario?.unidade_id,
				funcionario_id: funcionario?._id,
			});
		}

		const membershipPayload = buildMembershipPayload({
			userId: user?._id,
			role,
			unidadeId,
			funcionarioId: funcionario?._id,
		});

		let outcome = reusedUser ? 'linked' : 'created';
		let code = null;
		let membershipCreated = false;
		let existingMembership = membershipPayload
			? await findUserMembershipByUserAndUnidadeFn(user?._id, unidadeId)
			: null;

		if (existingMembership) {
			const membershipSync = await syncMembershipFuncionarioFn(existingMembership, funcionario?._id);
			if (membershipSync.conflict) {
				outcome = 'conflict';
				code = 'AUTO_USER_MEMBERSHIP_CONFLICT';
			} else {
				outcome = 'already-linked';
			}
		} else if (membershipPayload) {
			try {
				await createUserMembershipFn(membershipPayload);
				membershipCreated = true;
			} catch (membershipErr) {
				if (isDuplicateMembershipError(membershipErr)) {
					existingMembership = await findUserMembershipByUserAndUnidadeFn(user?._id, unidadeId);
					const membershipSync = await syncMembershipFuncionarioFn(existingMembership, funcionario?._id);
					if (membershipSync.conflict) {
						outcome = 'conflict';
						code = 'AUTO_USER_MEMBERSHIP_CONFLICT';
					} else {
						outcome = 'already-linked';
					}
				} else {
					throw membershipErr;
				}
			}
		}

		const funcionarioLinked = outcome === 'conflict'
			? false
			: await syncFuncionarioUsuarioFn(funcionario, user?._id);
		const legacyUserLinked = outcome === 'conflict'
			? false
			: await syncLegacyUserFuncionarioFn(user, funcionario);

		return {
			ok: outcome !== 'conflict',
			outcome,
			code,
			message: resolveMessage(outcome),
			userId: String(user?._id || ''),
			reusedUser,
			membershipCreated,
			funcionarioLinked,
			legacyUserLinked,
		};
	} catch (err) {
		console.error('[AUTO USER] Falha criação automática usuário:', err);
		return {
			ok:false,
			outcome:'error',
			code:'AUTO_USER_ERROR',
			message: resolveMessage('error', err?.message || null),
		};
	}
}

export async function createFuncionarioInitial(req,res){ try {
	let { unidade_id, funcao_id, nome, rg, cpf, data_nascimento, sexo, endereco, email, telefone } = req.body;
	const requestedUnitId = normalizeUnitId(unidade_id);
	const operationalUnitId = await resolveAuxiliaryOperationalUnitId(req);
	const resolvedUnitId = operationalUnitId || requestedUnitId;
	if (requestedUnitId && !requestedUnitMatchesResolvedContext(requestedUnitId, resolvedUnitId)) {
		return notFound(res, 'Unidade não encontrada');
	}
	unidade_id = resolvedUnitId;
	const faltando=[];
	function need(v,c){ if(!v) faltando.push(c); else if(typeof v==='string' && !v.trim()) faltando.push(c); else if(typeof v==='object' && (Array.isArray(v)? v.length===0 : Object.keys(v).length===0)) faltando.push(c); }
	['unidade_id','nome','rg','cpf','data_nascimento','sexo','endereco','email','telefone'].forEach(c=> need(eval(c), c));
	if(faltando.length) return missingFields(res, faltando);
	cpf = cpf.replace(/[^\d]/g,'');
	const cpfExist = await findFuncionarioByCpfAndUnidade(cpf, unidade_id);
	if(cpfExist) return badRequest(res, 'Já existe um funcionário cadastrado com este CPF nesta empresa.');
	const funcionario = await createFuncionarioDoc({ unidade_id, funcao_id: funcao_id || undefined, nome: nome.trim(), rg: rg.trim(), cpf, data_nascimento: data_nascimento.trim(), sexo, endereco, email: email.toLowerCase().trim(), telefone: telefone.trim() });
	const autoUser = await criarUsuarioAuto(funcionario);
	return created(res, funcionario._id, { data:{ id: funcionario._id, autoUser } });
} catch(e){ const duplicateResponse = handleFuncionarioCreateDuplicateError(res, e); if (duplicateResponse) return duplicateResponse; console.error('[API FUNCIONARIOS][initial] Erro:', e); return serverError(res, 'Falha ao criar funcionário inicial'); } }
async function criarUsuarioAuto(funcionario){
	return createFuncionarioAutoUserLinkCore({
		funcionario,
		provisionUser: async (payload) => {
			const { createUserAndSendPassword } = await import('#modules/gestor/app/services/userService.js');
			return createUserAndSendPassword(payload);
		},
	});
}
const asNumber = v => { const s = asStr(v).replace(/[R$\s]/g,'').replace(/\./g,'').replace(',', '.'); return s? Number(s): undefined; };
export async function createFuncionario(req,res){ try {
	if (typeof req.body.endereco === 'string') delete req.body.endereco;
	logDateDebug('create.raw-body', req.body);
	const assetsInfra = createFuncionarioAssetsInfraCore();
		let { unidade_id, funcao_id, nome, nome_social, nome_mae, nome_pai, rg, rg_orgao, rg_uf, rg_data_expedicao, cpf, pis, data_nascimento, sexo, estado_civil, raca_cor, escolaridade, nacionalidade, pais_nascimento, data_chegada_brasil, naturalidade, endereco, telefone, telefone2, email, tipo_ctps, ctps_numero, ctps_serie, ctps_uf, pcd, tipo_deficiencia, cid, biometrico, biometrico_face, fp_template_b64, fp_template_sha256, fp_imagem, fp_dedo, face_template_b64, face_template_sha256, face_imagem, data_admissao, tipo_admissao, categoria_trabalhador, tipo_contrato, data_termino, objeto_determinante, clausula_assecuratoria, cargo, cbo, departamento, regime_contratacao, regime_jornada, carga_semanal, salario_base, tipo_salario, forma_pagamento, forma_pagamento_desc, banco, agencia_num, agencia_dv, conta_num, conta_dv, tipo_conta, sindicato, fgts_optante, fgts_data, regime_previdenciario, tipo_especial, cert_militar, cert_militar_orgao, cert_militar_uf, cert_militar_data, titulo, titulo_zona, titulo_secao, cnh, cnh_categoria, cnh_validade, cnh_uf, orgao_prof, orgao_prof_uf, orgao_prof_numero } = req.body;
	const requestUnitId = getRequestUnitId(req);
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
	tipo_salario = norm(tipo_salario); forma_pagamento = norm(forma_pagamento); forma_pagamento_desc = norm(forma_pagamento_desc); banco = norm(banco); agencia_num = norm(agencia_num); agencia_dv = norm(agencia_dv); conta_num = norm(conta_num); conta_dv = norm(conta_dv); tipo_conta = norm(tipo_conta); sindicato = norm(sindicato); fgts_optante = norm(fgts_optante); fgts_data = normalizeDate(fgts_data); regime_previdenciario = norm(regime_previdenciario); tipo_especial = norm(tipo_especial); cert_militar = norm(cert_militar); cert_militar_orgao = norm(cert_militar_orgao); cert_militar_uf = norm(cert_militar_uf); cert_militar_data = normalizeDate(cert_militar_data); titulo = norm(titulo); titulo_zona = norm(titulo_zona); titulo_secao = norm(titulo_secao); cnh = norm(cnh); cnh_categoria = norm(cnh_categoria); cnh_validade = normalizeDate(cnh_validade); cnh_uf = norm(cnh_uf); orgao_prof = norm(orgao_prof); orgao_prof_uf = norm(orgao_prof_uf); orgao_prof_numero = norm(orgao_prof_numero);
	const requestedUnitId = normalizeUnitId(unidade_id);
	if (requestUnitId && requestedUnitId && requestUnitId !== requestedUnitId) return notFound(res,'Unidade não encontrada');
	const canonicalUnitId = getCanonicalContextUnitId(req) || requestedUnitId;
	if (requestedUnitId && !requestedUnitMatchesContext(req, requestedUnitId)) return notFound(res,'Unidade não encontrada');
	if (requestUnitId && !requestedUnitMatchesContext(req, requestUnitId)) return notFound(res,'Unidade não encontrada');
	unidade_id = canonicalUnitId;
	const faltando=[];
	function need(v,c){ if(!v) faltando.push(c); else if(typeof v==='string' && !v.trim()) faltando.push(c); else if(typeof v==='object' && (Array.isArray(v)? v.length===0 : Object.keys(v).length===0)) faltando.push(c); }
	need(unidade_id,'unidade_id');
	['nome','rg','cpf','data_nascimento','sexo','endereco','email','telefone'].forEach(c=> need(eval(c),c));
	if(!endereco || !endereco.cep) faltando.push('endereco[cep]');
	if(faltando.length) return badRequest(res, 'Campos obrigatórios ausentes', { campos: faltando });
	const existingCpf = await findFuncionarioByCpfAndUnidade(cpf, unidade_id);
	if(existingCpf) return badRequest(res,'Já existe um funcionário cadastrado com este CPF nesta empresa.');
	if(pis && !isValidPIS(pis.replace(/\D/g,''))) return badRequest(res,'PIS inválido',{ campo:'pis' });
	// Captura buffer da foto (sem usar disco)
	let fotoBuffer = null;
	if(req.file && req.file.fieldname === 'foto'){
		fotoBuffer = req.file.buffer || null;
	} else if(req.files?.foto?.length){
		const f=req.files.foto[0]; fotoBuffer = f?.buffer || null;
	}
	const { novo } = await executeCreateFuncionarioCoreService({
		unidade_id,
		funcao_id,
		nome,
		nome_social,
		nome_mae,
		nome_pai,
		rg,
		rg_orgao,
		rg_uf,
		rg_data_expedicao,
		cpf,
		pis,
		data_nascimento,
		sexo,
		estado_civil,
		raca_cor,
		escolaridade,
		nacionalidade,
		pais_nascimento,
		data_chegada_brasil,
		naturalidade,
		endereco,
		telefone,
		telefone2,
		email,
		tipo_ctps,
		ctps_numero,
		ctps_serie,
		ctps_uf,
		pcd,
		tipo_deficiencia,
		cid,
		biometrico,
		biometrico_face,
		fp_template_b64,
		fp_template_sha256,
		fp_imagem,
		fp_dedo,
		face_template_b64,
		face_template_sha256,
		face_imagem,
		observacoes,
		data_admissao,
		tipo_admissao,
		categoria_trabalhador,
		tipo_contrato,
		data_termino,
		objeto_determinante,
		clausula_assecuratoria,
		cargo,
		cbo,
		departamento,
		regime_contratacao,
		regime_jornada,
		carga_semanal,
		salario_base,
		tipo_salario,
		forma_pagamento,
		forma_pagamento_desc,
		banco,
		agencia_num,
		agencia_dv,
		conta_num,
		conta_dv,
		tipo_conta,
		sindicato,
		fgts_optante,
		fgts_data,
		regime_previdenciario,
		tipo_especial,
		cert_militar,
		cert_militar_orgao,
		cert_militar_uf,
		cert_militar_data,
		titulo,
		titulo_zona,
		titulo_secao,
		cnh,
		cnh_categoria,
		cnh_validade,
		cnh_uf,
		orgao_prof,
		orgao_prof_uf,
		orgao_prof_numero,
		rawBody: req.body,
		anexosFiles: req.files?.anexos || [],
		mapFiles: assetsInfra.mapFiles,
		createFuncionarioDoc,
	});
	// Upload da foto (se houver) após ter o _id
	try {
		if(fotoBuffer){
			if(assetsInfra.canUseBlob()){
				const url = await assetsInfra.uploadFuncionarioFotoToBlob(fotoBuffer, novo._id);
				novo.foto = url; await saveFuncionario(novo);
			} else {
				console.warn('[FUNC][FOTO][create] Blob não configurado; ignorando upload');
			}
		}
	} catch(upErr){ console.warn('[FUNC][FOTO][create] Falha upload foto:', upErr?.message); }
	// Upload das prévias faciais para Blob (se houver)
	try {
		if(Array.isArray(novo.biometrias_facial) && novo.biometrias_facial.length && assetsInfra.canUseBlob()){
			const mapped = await assetsInfra.mapBiometriasFaciaisToBlob(novo.biometrias_facial, novo._id);
			novo.biometrias_facial = mapped;
			if(novo.face_imagem && /^data:/i.test(String(novo.face_imagem)) && mapped[0] && mapped[0].imagem && /^https?:\/\//i.test(mapped[0].imagem)){
				novo.face_imagem = mapped[0].imagem;
			}
			await saveFuncionario(novo);
		}
	} catch(upErr){ console.warn('[BIO FACE][create] Falha ao subir prévias:', upErr?.message); }
	const autoUser = await criarUsuarioAuto(novo); return created(res, novo._id, { data:{ id: novo._id, autoUser } }); } catch(err){ const duplicateResponse = handleFuncionarioCreateDuplicateError(res, err); if (duplicateResponse) return duplicateResponse; console.error('[API FUNCIONARIOS][create] Erro:', err); return serverError(res,'Erro ao cadastrar funcionário'); } }
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
		const schema = mongoose.models.Funcionario?.schema;
		// Helpers: aceita nested e single; rejeita adhocOrUndefined
		function isKnownPath(p){
			if(!schema) return false;
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
	const schema = mongoose.models.Funcionario?.schema;
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
function requestedUnitMatchesCanonicalContext(canonicalUnitId, requestedUnitId) {
	const requested = normalizeUnitId(requestedUnitId);
	if (!requested) return true;

	const canonical = normalizeUnitId(canonicalUnitId);
	if (canonical) return requested === canonical;

	return true;
}
function coerceBodyValues(body){
	const asIsoMaybe=v=>{
		try {
			if(v==null) return '';
			if(typeof v==='string'){ return v.includes('/') ? asISODate(v) : v; }
			if(Array.isArray(v)){
				const f=v.find(x=>x!=null);
				if(typeof f==='string') return f.includes('/')? asISODate(f) : f;
				return f ?? '';
			}
			if(v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0,10);
			if(typeof v==='object') return v;
			return String(v);
		} catch(err){
			console.warn('[incremental][coerce] falha ao normalizar valor', err?.message);
			return v;
		}
	};
	Object.keys(body || {}).forEach(k=>{ try { body[k]=asIsoMaybe(body[k]); } catch(err){ console.warn('[incremental][body-map] falha chave=',k, err?.message); } });
}
async function createFuncionarioUpdateSharedCore({ id, body, canonicalUnitId } = {}) {
	const funcionario = await findFuncionarioById(id, canonicalUnitId || null);
	if(!funcionario) return { kind:'not_found' };
	if (body?.unidade_id && !requestedUnitMatchesCanonicalContext(canonicalUnitId, body.unidade_id)) {
		return { kind:'unit_not_allowed' };
	}

	coerceBodyValues(body);
	applyDateNormalizationToBody(body);

	if(body?.pis && !isValidPIS(String(body.pis).replace(/\D/g,''))) {
		return { kind:'validation_error', field:'pis', message:'PIS inválido' };
	}
	if(body?.pis_pasep && !isValidPIS(String(body.pis_pasep).replace(/\D/g,''))) {
		return { kind:'validation_error', field:'pis_pasep', message:'PIS/PASEP inválido' };
	}

	let ops = buildUpdateOpsFromBody(body);
	if(ops.$set && Object.prototype.hasOwnProperty.call(ops.$set,'cpf')){
		const rawCpf = String(ops.$set.cpf||'').replace(/\D/g,'');
		if(!rawCpf){ delete ops.$set.cpf; ops.$unset.cpf = 1; }
		else if(rawCpf.length !== 11){ return { kind:'validation_error', field:'cpf', message:'CPF inválido' }; }
		else { ops.$set.cpf = rawCpf; }
	}
	if(ops.$set){
		if(Array.isArray(ops.$set.dependentes)){
			ops.$set.dependentes = ops.$set.dependentes.map(d=>{ if(d && d.cpf) d.cpf = String(d.cpf).replace(/\D/g,''); return d; });
		}
		Object.keys(ops.$set).forEach(k=>{ if(k==='anexos' || k.startsWith('anexos.')) delete ops.$set[k]; });
	}
	if(ops.$unset){ Object.keys(ops.$unset).forEach(k=>{ if(k==='anexos' || k.startsWith('anexos.')) delete ops.$unset[k]; }); }
	if(ops.$set && Object.prototype.hasOwnProperty.call(ops.$set,'salario_base')) {
		const raw = String(ops.$set.salario_base||'').trim();
		if(!raw) { delete ops.$set.salario_base; ops.$unset.salario_base = 1; }
		else {
			const parsed = Number(raw.replace(/[R$\s]/g,'').replace(/\./g,'').replace(',', '.'));
			if(Number.isFinite(parsed)) ops.$set.salario_base = parsed; else { delete ops.$set.salario_base; ops.$unset.salario_base = 1; }
		}
	}
	if(body?.pcd==='N'){ ops.$unset['tipo_deficiencia']=1; ops.$unset['cid']=1; }
	if (canonicalUnitId && Object.prototype.hasOwnProperty.call(body || {}, 'unidade_id')) {
		ops.$set.unidade_id = canonicalUnitId;
		if (ops.$unset?.unidade_id) delete ops.$unset.unidade_id;
	}

	ops = filterOpsBySchema(ops);
	ops = protectRequiredFieldsFromUnset(ops);

	return {
		kind: 'ready',
		funcionario,
		effectiveUnitId: canonicalUnitId || normalizeUnitId(funcionario?.unidade_id) || null,
		ops,
	};
}
export async function updateFuncionarioIncremental(req,res){ try { const { id } = req.params; const canonicalUnitId = getCanonicalContextUnitId(req) || '';
	const assetsInfra = createFuncionarioAssetsInfraCore();
	console.log('[UPLOAD][incremental] req.file?', !!req.file, 'req.files?.foto?.length', req.files?.foto?.length);
	console.log('[UPLOAD][incremental][debug] files keys:', Object.keys(req.files||{}));
	console.log('[UPLOAD][incremental][debug] anexos bruto length:', req.files?.anexos?.length || 0);
	if(req.body.anexos_existentes) console.log('[UPLOAD][incremental][debug] anexos_existentes strlen:', req.body.anexos_existentes.length);
	logDateDebug('incremental.before-normalize', req.body);
	const sharedUpdate = await createFuncionarioUpdateSharedCore({ id, body: req.body, canonicalUnitId });
	if(sharedUpdate.kind === 'not_found') return notFound(res,'Funcionário não encontrado');
	if(sharedUpdate.kind === 'unit_not_allowed') return notFound(res,'Unidade não encontrada');
	if(sharedUpdate.kind === 'validation_error') return badRequest(res, sharedUpdate.message, { campo: sharedUpdate.field });
	logDateDebug('incremental.after-normalize', req.body);
	let { funcionario, ops, effectiveUnitId } = sharedUpdate;
	const blobReady = assetsInfra.canUseBlob();
	if(req.file && req.file.fieldname === 'foto'){
		if(!blobReady){ return res.status(503).json({ error:'Blob não configurado (conecte a Store no Vercel ou defina BLOB_READ_WRITE_TOKEN/WDGESTOR_DB_DADOS_READ_WRITE_TOKEN)' }); }
		try { const url = await assetsInfra.uploadFuncionarioFotoToBlob(req.file.buffer, funcionario._id); ops.$set.foto = url; await assetsInfra.deleteFromBlobIfNeeded(funcionario.foto); } catch(err){ console.warn('[UPLOAD][incremental] Falha processar foto:', err.message); return res.status(500).json({ error:'Falha ao processar foto' }); }
	} else if(req.files?.foto?.length){
		if(!blobReady){ return res.status(503).json({ error:'Blob não configurado (conecte a Store no Vercel ou defina BLOB_READ_WRITE_TOKEN/WDGESTOR_DB_DADOS_READ_WRITE_TOKEN)' }); }
		try { const f=req.files.foto[0]; const url = await assetsInfra.uploadFuncionarioFotoToBlob(f.buffer, funcionario._id); ops.$set.foto = url; await assetsInfra.deleteFromBlobIfNeeded(funcionario.foto); } catch(err){ console.warn('[UPLOAD][incremental] Falha processar foto multi:', err.message); return res.status(500).json({ error:'Falha ao processar foto' }); }
	} else if(req.body.excluir_foto==='true' && funcionario.foto){
		// Exclusão explícita
		ops.$unset.foto = 1;
		await assetsInfra.deleteFromBlobIfNeeded(funcionario.foto);
		try { const absFoto = path.join(ROOT, '.', String(funcionario.foto||'').replace(/^public\//,'')); if(fs.existsSync(absFoto)) fs.unlinkSync(absFoto); } catch{}
	} else {
		// Nenhum upload novo e não solicitou exclusão -> garantir que não haja unset acidental vindo do form
		if(ops.$unset && ops.$unset.foto){ delete ops.$unset.foto; }
		if(ops.$set && ops.$set.foto===null){ delete ops.$set.foto; }
	}
	const hasAnexosMutation = req.body.anexos_existentes !== undefined || req.body.anexos_excluidos !== undefined || !!req.files?.anexos?.length;
	if(hasAnexosMutation){
		const anexosReconciliados = reconcileUpdateFuncionarioIncrementalAnexos({
			funcionarioAtual: funcionario,
			anexosExistentes: req.body.anexos_existentes,
			anexosExcluidos: req.body.anexos_excluidos,
			novosUploads: req.files?.anexos || [],
			mapFiles: assetsInfra.mapFiles,
		});
		if(anexosReconciliados.length > 0) ops.$set.anexos = anexosReconciliados;
		else ops.$unset.anexos = 1;
	}

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
							if (assetsInfra.canUseBlob()) norm = await assetsInfra.mapBiometriasFaciaisToBlob(norm, funcionario._id);
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
		try { const parsed = assetsInfra.parseDataUrl(ops.$set.face_imagem); if(parsed){ const url = await assetsInfra.uploadFacePreviewToBlob(parsed.buffer, funcionario._id, 0); if(url) ops.$set.face_imagem = url; } } catch(err){ console.warn('[BIO FACE][incremental] face_imagem blob fail:', err?.message); }
	}
		try {
			await updateFuncionarioByIdWithOps(id, ops, effectiveUnitId);
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
export async function updateFuncionario(req,res){ try { const { id } = req.params; const canonicalUnitId = getCanonicalContextUnitId(req) || '';
	const assetsInfra = createFuncionarioAssetsInfraCore();
	console.log('[UPLOAD][update-full] req.file?', !!req.file, 'req.files?.foto?.length', req.files?.foto?.length);
	console.log('[UPLOAD][update-full][debug] files keys:', Object.keys(req.files||{}));
	console.log('[UPLOAD][update-full][debug] anexos bruto length:', req.files?.anexos?.length || 0);
	if(req.body.anexos_existentes) console.log('[UPLOAD][update-full][debug] anexos_existentes strlen:', req.body.anexos_existentes.length);
	logDateDebug('update.before-normalize', req.body);
	const sharedUpdate = await createFuncionarioUpdateSharedCore({ id, body: req.body, canonicalUnitId });
	if(sharedUpdate.kind === 'not_found') return notFound(res,'Funcionário não encontrado');
	if(sharedUpdate.kind === 'unit_not_allowed') return notFound(res,'Unidade não encontrada');
	if(sharedUpdate.kind === 'validation_error') return badRequest(res, sharedUpdate.message, { campo: sharedUpdate.field });
	logDateDebug('update.after-normalize', req.body);
	let { funcionario, ops, effectiveUnitId } = sharedUpdate;
	const blobReadyUpdate = assetsInfra.canUseBlob();
	try {
		const fotoResult = await reconcileUpdateFuncionarioFullFoto({
			reqFile: req.file,
			reqFilesFoto: req.files?.foto || [],
			excluirFoto: req.body.excluir_foto,
			fotoAtual: funcionario.foto,
			funcionarioId: funcionario._id,
			blobReady: blobReadyUpdate,
			uploadFuncionarioFotoToBlob: assetsInfra.uploadFuncionarioFotoToBlob,
			deleteFromBlobIfNeeded: assetsInfra.deleteFromBlobIfNeeded,
		});

		if (fotoResult?.mode === 'set') {
			ops.$set.foto = fotoResult.fotoUrl;
			if (ops.$unset?.foto) delete ops.$unset.foto;
		} else if (fotoResult?.mode === 'unset') {
			ops.$unset.foto = 1;
			if (ops.$set && ops.$set.foto === null) delete ops.$set.foto;
		} else {
			if (ops.$unset && ops.$unset.foto) delete ops.$unset.foto;
			if (ops.$set && ops.$set.foto === null) delete ops.$set.foto;
		}
	} catch(err){
		if (err?.code === 'BLOB_NOT_CONFIGURED') {
			return res.status(503).json({ error: err.message });
		}
		if (err?.code === 'FOTO_PROCESSING_FAILED') {
			console.warn('[UPLOAD][update] Falha processar foto:', err?.cause?.message || err.message);
			return res.status(500).json({ error: err.message });
		}
		throw err;
	}
	const anexosReconciliados = reconcileUpdateFuncionarioFullAnexos({
		anexosExistentes: req.body.anexos_existentes,
		anexosExcluidos: req.body.anexos_excluidos,
		novosUploads: req.files?.anexos || [],
		mapFiles: assetsInfra.mapFiles,
		fs,
		path,
		rootDir: ROOT,
	});
	if(anexosReconciliados.length>0) ops.$set.anexos = anexosReconciliados; else ops.$unset.anexos=1;

	const biometriaPatch = await reconcileUpdateFuncionarioFullBiometria({
		faceCapturasJson: req.body.face_capturas_json,
		fpCapturasJson: req.body.fp_capturas_json,
		faceImagem: ops.$set?.face_imagem,
		blobReady: blobReadyUpdate,
		funcionarioId: funcionario._id,
		mapBiometriasFaciaisToBlob: assetsInfra.mapBiometriasFaciaisToBlob,
		parseDataUrl: assetsInfra.parseDataUrl,
		uploadFacePreviewToBlob: assetsInfra.uploadFacePreviewToBlob,
	});
	if (biometriaPatch?.set && typeof biometriaPatch.set === 'object') {
		Object.assign(ops.$set, biometriaPatch.set);
	}
	if (Array.isArray(biometriaPatch?.unset)) {
		for (const field of biometriaPatch.unset) {
			ops.$unset[field] = 1;
			if (ops.$set && Object.prototype.hasOwnProperty.call(ops.$set, field) && biometriaPatch?.set?.[field] === undefined) delete ops.$set[field];
		}
	}
		try {
			await updateFuncionarioByIdWithOps(id, ops, effectiveUnitId);
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
		const canonicalUnitId = getCanonicalContextUnitId(req) || null;
		const f = await findFuncionarioByIdPopulateRefs(id, canonicalUnitId);
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
export async function deleteFuncionario(req,res){ try { const { id } = req.params; const canonicalUnitId = getCanonicalContextUnitId(req) || null; const funcionario = await findFuncionarioById(id, canonicalUnitId); if(!funcionario) {
	return res.status(404).json({ success:false, error:'Funcionário não encontrado', code:'NOT_FOUND' });
}
const usuarioVinculado = await findUserByFuncionarioId(funcionario._id); if(usuarioVinculado && usuarioVinculado.role==='master') return res.status(403).json({ success:false, error:'Funcionário vinculado a usuário master não pode ser excluído.', code:'FORBIDDEN' }); await deleteFuncionarioById(id, canonicalUnitId || normalizeUnitId(funcionario?.unidade_id) || null); return ok(res, { deleted:true }); } catch(e){ console.error('[API FUNCIONARIOS][delete] Erro:', e); return serverError(res,'Erro ao excluir funcionário'); } }

// GET da foto do funcionário: redireciona para URL pública (Blob) ou serve arquivo/Data URL legado
export async function getFuncionarioFoto(req, res){
	try {
		const { id } = req.params;
		if(!isValidObjectIdLike(id)) return res.status(400).json({ error:'ID inválido' });
		const canonicalUnitId = getCanonicalContextUnitId(req) || null;
		const f = await findFuncionarioByIdLean(id, canonicalUnitId);
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
export async function deleteFuncionarioPost(req,res){ try { const { id } = req.params; const canonicalUnitId = getCanonicalContextUnitId(req) || null; const result = await deleteFuncionarioPostExecutionService({ funcionarioId: id, canonicalUnitId }); if(result.kind === 'already_removed') {
	// Idempotente: sinaliza removido e segue com redirect neutro
	return ok(res, { deleted:true, alreadyRemoved:true, redirect:'/funcionarios?deleted=1' });
}
if(result.kind === 'forbidden_master_link') return res.status(403).json({ success:false, error:'Funcionário vinculado a usuário master não pode ser excluído.', code:'FORBIDDEN' }); return ok(res, { deleted:true, redirect:'/funcionarios?deleted=1&nome='+encodeURIComponent(result.funcionarioNome) }); } catch(e){ console.error('[API FUNCIONARIOS][deletePost] Erro:', e); return serverError(res,'Erro ao excluir funcionário'); } }
export async function downloadAnexoFuncionario(req,res){
	try {
		const { id, idx } = req.params;
		const canonicalUnitId = getCanonicalContextUnitId(req) || null;
		const funcionario = await findFuncionarioById(id, canonicalUnitId);
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
		const operationalUnitId = await resolveAuxiliaryOperationalUnitId(req);
		// Master/Admin globais podem operar sem unitScope aqui; sem contexto resolvido, o alvo explicito da rota permanece valido.
		const resolvedUnitId = operationalUnitId || normalizeUnitId(unidadeId);
		if (!requestedUnitMatchesResolvedContext(unidadeId, resolvedUnitId)) {
			return ok(res, []);
		}
		let funcionarios = await findFuncionariosDisponiveisByUnidadeLean(resolvedUnitId);

		// Opcional: incluir o funcionário atual (já vinculado) para edição, se for da mesma unidade
		if (includeId && /^[a-fA-F0-9]{24}$/.test(includeId)) {
			try {
				const atual = await findFuncionarioByIdSelectBasicLean(includeId, resolvedUnitId || null);
				if (atual && String(atual.unidade_id) === String(resolvedUnitId)) {
					const exists = funcionarios.some(f => String(f._id) === String(atual._id));
					if (!exists) funcionarios = [...funcionarios, { _id: atual._id, nome: atual.nome, cpf: atual.cpf, email: atual.email || '' }];
				}
			} catch(_e) { /* noop */ }
		}
		return ok(res, funcionarios || []);
	} catch(error){
		return serverError(res, error);
	}
}

// Endpoint utilitário: tenta encontrar um Funcionário correspondente antes de criar usuário
// Critério de match neste recorte:
// 1) CPF + unidade_id
// Retorna dados mínimos para confirmação no frontend
export async function matchFuncionario(req, res){
	try {
		const cpfRaw = asStr(req.query.cpf || req.body?.cpf || '').replace(/\D/g,'');
		const unidadeId = asStr(req.query.unidade_id || req.body?.unidade_id || '').trim();
		const operationalUnitId = await resolveAuxiliaryOperationalUnitId(req);
		const resolvedUnitId = operationalUnitId || unidadeId;
		if (unidadeId && !requestedUnitMatchesResolvedContext(unidadeId, resolvedUnitId)) {
			return ok(res, { exists:false });
		}

		let encontrado = null; let matchType = null;
		// Match apenas por CPF+unidade
		if (cpfRaw && resolvedUnitId) {
			encontrado = await findFuncionarioByCpfAndUnidadeSelectLean(cpfRaw, resolvedUnitId);
			if (encontrado) matchType = 'cpf+unidade';
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

