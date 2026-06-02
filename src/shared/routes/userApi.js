// (migrado) userApi
import express from 'express';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import multer from 'multer';
import sharp from 'sharp';
import { randomUUID as uuid } from 'crypto';
import { put, del } from '@vercel/blob';
import User from '#models/user.js';

function buildDefaultPendingSelectionRequiredPayload(req) {
	return {
		success: false,
		authenticated: true,
		error: 'Seleção de unidade pendente',
		code: 'GESTOR_SELECTION_REQUIRED',
		needsUnitSelection: true,
		redirect: '/login?step=select',
	};
}

export function createUserApiRouter({
	criarUsuario,
	obterUsuarioAtual,
	atualizarSenhaUsuario,
	atualizarUsuario,
	toggleUsuario,
	deleteUsuario,
	updateUsuarioJson,
	requireRole,
	requireApiAuth,
	requireLogin,
	requireLegacyAdminMutationAccess,
	shouldResolveCanonicalModulos,
	resolveCanonicalModulos,
	buildSelectionRequiredPayload,
} = {}) {
const router = express.Router();
	const defaultBuildSelectionRequiredPayload = (req) => ({
		success: false,
		authenticated: true,
		error: 'Seleção de unidade pendente',
		code: 'GESTOR_SELECTION_REQUIRED',
		needsUnitSelection: true,
		redirect: '/login?step=select',
	});
	const shouldResolveCanonicalModulosForRequest = typeof shouldResolveCanonicalModulos === 'function'
		? shouldResolveCanonicalModulos
		: (typeof isAuthContextResolverEnabledForRequest === 'function' ? isAuthContextResolverEnabledForRequest : (() => false));
	const resolveCanonicalModulosForRequest = typeof resolveCanonicalModulos === 'function'
		? resolveCanonicalModulos
		: (typeof resolveUserApiModulosCanonicalResult === 'function' ? resolveUserApiModulosCanonicalResult : null);
	const buildSelectionRequiredPayloadForRequest = typeof buildSelectionRequiredPayload === 'function'
		? buildSelectionRequiredPayload
		: (typeof buildPendingSelectionRequiredPayload === 'function' ? buildPendingSelectionRequiredPayload : defaultBuildSelectionRequiredPayload);
	const requireLegacyAdminMutationAccessForRequest = typeof requireLegacyAdminMutationAccess === 'function'
		? requireLegacyAdminMutationAccess
		: ((req, res, next) => requireLogin(req, res, () => requireRole(['admin'])(req, res, next)));
	const handleApiModulos = async (req, res) => {
		try {
			const role = String(req.user?.role || 'user').toLowerCase();
			const wantDebug = String(req.query?.debug || '').trim() === '1';

			const tryLoadUnidadeComModulos = async (unidadeId) => {
				if (!unidadeId) return null;
				try {
					const Unidade = (await import('#models/unidade.js')).default;
					const unidade = await Unidade.findById(unidadeId)
						.select('_id is_principal subunidade unidade_principal_id modulosAcessiveis')
						.populate('modulosAcessiveis')
						.lean();
					if (!unidade) return null;
					if (unidade?.modulosAcessiveis?.length) return unidade;
					if (unidade.subunidade && unidade.unidade_principal_id) {
						const principal = await Unidade.findById(unidade.unidade_principal_id)
							.select('_id is_principal subunidade unidade_principal_id modulosAcessiveis')
							.populate('modulosAcessiveis')
							.lean();
						if (principal) return principal;
					}
					return unidade;
				} catch {
					return null;
				}
			};
			const mapMods = (mods) => (mods || []).filter(Boolean).map(m => ({
				_id: m._id,
				nome: m.nome,
				descricao: m.descricao,
				status: m.status,
				url_base: m.url_base,
			}));
			const uniqById = (mods) => {
				const out = [];
				const seen = new Set();
				for (const m of (mods || [])) {
					const id = m?._id ? String(m._id) : '';
					if (id && seen.has(id)) continue;
					if (id) seen.add(id);
					out.push(m);
				}
				return out;
			};

			if (shouldResolveCanonicalModulosForRequest(req) && typeof resolveCanonicalModulosForRequest === 'function') {
				const canonicalResult = await resolveCanonicalModulosForRequest({
					authenticatedUser: req.user || null,
					sessionUser: req.session?.user || null,
					existingAuthContext: req.session?.gestorAuthContext || null,
					featureFlags: req.app?.locals?.gestorAuthContextFeatureFlags || null,
					resolverDeps: req.app?.locals?.gestorAuthContextResolverDeps || {},
					maxTimeMS: req.app?.locals?.gestorAuthContextMaxTimeMS,
					wantDebug,
					deps: {
						tryLoadUnidadeComModulos,
					},
				});

				if (canonicalResult.kind === 'selection-required') {
					return res.status(409).json(buildSelectionRequiredPayloadForRequest(req));
				}

				if (canonicalResult.kind === 'resolved') {
					return res.json(canonicalResult.payload);
				}
			}

			if (role === 'master' || role === 'admin') {
				try {
					const Modulo = (await import('#models/modulo.js')).default;
					const todos = await Modulo.find({}).select('_id nome descricao status url_base').lean();
					return res.json({ data: todos });
				} catch (e) {
					console.warn('[gestor][api/modulos] fallback master/admin:', e?.message || e);
				}
			}

			if (role === 'diretor') {
				const unidadeId = req.user?.unidade_id || req.user?.unidade_principal_id || null;
				const unidade = await tryLoadUnidadeComModulos(unidadeId);
				if (unidade?.modulosAcessiveis?.length) {
					return res.json({ data: mapMods(unidade.modulosAcessiveis) });
				}
			}

			if (role === 'user') {
				try {
					const Funcionario = (await import('#models/Funcionario.js')).default;
					const Funcao = (await import('#models/funcao.js')).default;
					let dbg = wantDebug ? { source: 'user', funcionario: null, funcao: null, unidade: null } : null;
					let funcionario = null;
					const funcionarioId = req.user?.funcionario_id || null;
					const unidadeId = req.user?.unidade_id || null;
					const cpf = req.user?.cpf ? String(req.user.cpf).replace(/\D/g, '') : '';
					if (funcionarioId) {
						funcionario = await Funcionario.findById(funcionarioId).select('_id funcao_id unidade_id usuario_id cpf email').lean();
					}
					if (!funcionario && req.user?._id) {
						funcionario = await Funcionario.findOne({ usuario_id: req.user._id }).select('_id funcao_id unidade_id usuario_id cpf email').lean();
					}
					if (!funcionario && cpf && unidadeId) {
						funcionario = await Funcionario.findOne({ cpf, unidade_id: unidadeId }).select('_id funcao_id unidade_id usuario_id cpf email').lean();
					}
					if (dbg) dbg.funcionario = funcionario ? { _id: funcionario._id, funcao_id: funcionario.funcao_id, unidade_id: funcionario.unidade_id } : null;

					const unidade = await tryLoadUnidadeComModulos(funcionario?.unidade_id || req.user?.unidade_id || req.user?.unidade_principal_id || null);
					if (dbg) dbg.unidade = unidade ? { _id: unidade._id, subunidade: !!unidade.subunidade, unidade_principal_id: unidade.unidade_principal_id, modulosCount: (unidade.modulosAcessiveis || []).length } : null;
					const modsUnidade = (unidade?.modulosAcessiveis || []).filter(Boolean);
					let modsFuncao = [];

					if (funcionario?.funcao_id) {
						const funcao = await Funcao.findById(funcionario.funcao_id).populate('modulos_habilitados').lean();
						if (dbg) dbg.funcao = funcao ? { _id: funcao._id, ativa: funcao.ativa !== false, modulosCount: (funcao.modulos_habilitados || []).length } : null;
						modsFuncao = (funcao?.modulos_habilitados || []).filter(Boolean);
					}

					const union = uniqById([...modsFuncao, ...modsUnidade]);
					if (union.length) {
						const payload = { data: mapMods(union) };
						if (wantDebug) payload.debug = dbg;
						return res.json(payload);
					}
				} catch (e) {
					console.warn('[gestor][api/modulos] fallback user:', e?.message || e);
				}
			}

			{
				const unidade = await tryLoadUnidadeComModulos(req.user?.unidade_id || req.user?.unidade_principal_id || null);
				if (unidade?.modulosAcessiveis?.length) return res.json({ data: mapMods(unidade.modulosAcessiveis) });
			}

			return res.json({ data: [{ nome: 'Gestor', status: 'ativo' }] });
		} catch {
			return res.json({ data: [{ nome: 'Gestor', status: 'ativo' }] });
		}
	};

// GET /api/usuario/foto — endpoint de imagem deve ser resiliente.
// Importante: não devolver 401 aqui, porque é comumente consumido por <img> (e alguns front-ends interpretam 401 como “deslogou”).
// Se não houver sessão/usuário, responde placeholder (ou 204 se não existir placeholder local).
router.get('/api/usuario/foto', async (req, res) => {
	try {
		const requestUser = req.user && typeof req.user === 'object' ? req.user : null;
		const sessionUser = req.session?.user && typeof req.session.user === 'object' ? req.session.user : null;
		const email = String(requestUser?.email || sessionUser?.email || '').toLowerCase();
		// Placeholders
		const ROOT = process.cwd();
		const placeholderSvg = path.join(ROOT, 'public', 'img', 'user-placeholder.svg');
		const placeholderPng = path.join(ROOT, 'images', 'usuario.png');
		const hasOwnFoto = (value) => !!value && Object.prototype.hasOwnProperty.call(value, 'foto');
		const sendPlaceholder = () => {
			const target = fs.existsSync(placeholderSvg) ? placeholderSvg : (fs.existsSync(placeholderPng) ? placeholderPng : null);
			if (!target) return res.status(204).end();
			const ext = path.extname(target).toLowerCase();
			if (ext === '.svg') res.type('image/svg+xml');
			else if (ext === '.png') res.type('image/png');
			res.set('Cache-Control', 'public, max-age=300');
			return res.sendFile(target);
		};
		if (!email) return sendPlaceholder();

		// Preferir a foto já conhecida em req.user/sessão; se a ausência já for conhecida, cair direto no placeholder.
		let foto = requestUser?.foto || sessionUser?.foto || null;
		if (!foto && (hasOwnFoto(requestUser) || hasOwnFoto(sessionUser))) {
			return sendPlaceholder();
		}
		if (!foto) {
			try {
				const queryTimeout = Number(process.env.MONGO_QUERY_TIMEOUT_MS || 3000);
				// Se DB estiver offline, não force a query — cai direto no placeholder.
				if (req.app?.locals?.skipDb || mongoose.connection.readyState !== 1) {
					return sendPlaceholder();
				}
				const userDoc = await User.findOne({ email }).lean().maxTimeMS(queryTimeout);
				foto = userDoc?.foto || null;
			} catch {
				return sendPlaceholder();
			}
		}
		if (!foto) return sendPlaceholder();
		if (/^data:/i.test(String(foto))) {
			try {
				const [header, base64] = String(foto).split(',');
				const contentType = header.split(';')[0].split(':')[1] || 'application/octet-stream';
				const buffer = Buffer.from(base64 || '', 'base64');
				res.set('Content-Type', contentType);
				res.set('Cache-Control', 'private, max-age=300');
				return res.send(buffer);
			} catch { /* fallback */ }
		}
		if (/^https?:\/\//i.test(foto)) {
			res.set('Cache-Control', 'public, max-age=60');
			return res.redirect(foto);
		}
		try {
			if (typeof foto === 'string') {
				const rel = foto.replace(/^\/+/, '');
				const candidates = [
					path.join(ROOT, 'public', rel),
					path.join(ROOT, rel),
					path.join(ROOT, 'public', 'uploads', rel)
				];
				for (const p of candidates) {
					try {
						const st = fs.statSync(p);
						if (st && st.isFile()) {
							const ext = path.extname(p).toLowerCase();
							const type = ext === '.svg' ? 'image/svg+xml'
										: ext === '.png' ? 'image/png'
										: (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg'
										: ext === '.webp' ? 'image/webp' : 'application/octet-stream';
							res.set('Content-Type', type);
							res.set('Cache-Control', 'private, max-age=300');
							return res.sendFile(p);
						}
					} catch {}
				}
			}
		} catch {}
		return sendPlaceholder();
	} catch (err) {
		console.error('[gestor][api/usuario/foto] erro:', err);
		try {
			const ROOT = process.cwd();
			const placeholderSvg = path.join(ROOT, 'public', 'img', 'user-placeholder.svg');
			const placeholderPng = path.join(ROOT, 'images', 'usuario.png');
			const target = fs.existsSync(placeholderSvg) ? placeholderSvg : (fs.existsSync(placeholderPng) ? placeholderPng : null);
			if (!target) return res.status(204).end();
			const ext = path.extname(target).toLowerCase();
			if (ext === '.svg') res.type('image/svg+xml');
			else if (ext === '.png') res.type('image/png');
			res.set('Cache-Control', 'public, max-age=300');
			return res.sendFile(target);
		} catch {
			return res.status(204).end();
		}
	}
});

// Aplique autenticação apenas às rotas /api/* deste router, para não interferir em páginas públicas
router.get('/api/usuario', requireLogin, obterUsuarioAtual);
router.get('/api/modulos', requireLogin, handleApiModulos);
router.use('/api', requireLogin);
router.post('/api/usuarios', criarUsuario);
// Suporta edição via endpoint canônico /api (usado pelo modal). Mantém semântica de redirect pós-sucesso.
	router.post('/api/usuarios/:id/update', requireLegacyAdminMutationAccessForRequest, atualizarUsuario);
// Endpoints de administração também disponíveis sob /api para compatibilidade com o front
	router.post('/api/usuarios/:id/toggle', requireLegacyAdminMutationAccessForRequest, toggleUsuario);
	router.post('/api/usuarios/:id/delete', requireLegacyAdminMutationAccessForRequest, deleteUsuario);
router.put('/api/usuario/senha', atualizarSenhaUsuario);

// POST /api/usuario/foto — upload e atualização via Vercel Blob
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
router.post('/api/usuario/foto', upload.single('foto'), async (req, res) => {
	try {
		const email = String(req.user?.email || '').toLowerCase();
		if (!email) return res.status(401).json({ error: 'Não autenticado' });
		if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });
		const inVercel = !!process.env.VERCEL;
		const blobToken = process.env.BLOB_READ_WRITE_TOKEN || process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_RW_TOKEN || '';
		if (!inVercel && !blobToken) return res.status(503).json({ error: 'Blob não configurado' });
		const userDoc = await User.findOne({ email });
		if (!userDoc) return res.status(404).json({ error: 'Usuário não encontrado' });
		let webpBuf;
		try {
			webpBuf = await sharp(req.file.buffer).rotate().resize(512,512,{ fit:'cover', position:'center', withoutEnlargement:true }).toFormat('webp',{ quality:90 }).toBuffer();
		} catch {
			return res.status(400).json({ error: 'Arquivo inválido' });
		}
		const key = `users/${userDoc._id}-${uuid()}.webp`;
		const putOptions = { access:'public', contentType:'image/webp', cacheControl:'public, max-age=31536000, immutable', ...(blobToken ? { token: blobToken } : {}) };
		const { url } = await put(key, webpBuf, putOptions);
		const prev = userDoc.foto;
		if (prev && /^https?:\/\/.*blob\.vercel-storage\.com\//i.test(prev)) {
			try { await del(prev, blobToken ? { token: blobToken } : undefined); } catch {}
		}
		userDoc.foto = url;
		await userDoc.save();
		return res.json({ ok:true, foto: url });
	} catch (err) {
		console.error('[gestor][api/usuario/foto POST] erro:', err);
		return res.status(500).json({ error: 'Falha ao processar foto' });
	}
});
void updateUsuarioJson;
return router;
}

export default createUserApiRouter;
