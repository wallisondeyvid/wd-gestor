import { ok, badRequest, notFound, serverError } from '#core/utils/apiResponse.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
	findUserByEmailCondLean,
	findUserByCpfCondLean,
	findAllUnidadesLean,
	findUnidadePrincipalLean,
	findUserByEmailCond,
	deleteUserById,
} from '#modules/gestor/app/db/api.db.js';
export function debugSession(req,res){ try { return ok(res, { hasCookie: Boolean(req.headers.cookie), sessionID: req.sessionID || null, user: req.user ? { id: req.user.id, email: req.user.email, role: req.user.role } : null }); } catch(e){ return serverError(res,e); } }
export function whoAmI(req,res){
	if(!req.user) return badRequest(res,'Não autenticado');
	const skip = Boolean(req.skipAuth);
	return ok(res, { user: req.user, skipAuth: skip });
}
export async function userByEmail(req,res){ try { const { email } = req.params; if(!email) return badRequest(res,'Email obrigatório'); const user = await findUserByEmailCondLean({ email: email.toLowerCase() }); if(!user) return notFound(res,'Usuário não encontrado'); return ok(res, { _id:user._id, email:user.email, role:user.role, ativo:user.ativo, unidade_id:user.unidade_id }); } catch(e){ return serverError(res,e); } }
export async function userByCpf(req,res){ try { const { cpf } = req.params; if(!cpf) return badRequest(res,'CPF obrigatório'); const clean = cpf.replace(/\D/g,''); const user = await findUserByCpfCondLean({ cpf: clean }); if(!user) return notFound(res,'Usuário não encontrado'); return ok(res, { _id:user._id, email:user.email, role:user.role, ativo:user.ativo, unidade_id:user.unidade_id }); } catch(e){ return serverError(res,e); } }
export async function testUnidades(req,res){ try { const unidades = await findAllUnidadesLean(); const unidadePrincipal = await findUnidadePrincipalLean(); return ok(res, { total_unidades: unidades.length, unidade_principal: unidadePrincipal ? { id:unidadePrincipal._id, nome:unidadePrincipal.nome, is_principal:unidadePrincipal.is_principal } : null, unidades: unidades.map(u=>({ id:u._id, nome:u.nome, is_principal:u.is_principal })) }); } catch(e){ return serverError(res,e); } }
export async function removeWrongMaster(req,res){ try { if(!req.user?.isMaster) return badRequest(res,'Acesso negado'); const wrongEmail = 'wallisondeyvdi13@gmail.com'; const errado = await findUserByEmailCond({ email: wrongEmail }); if(!errado) return ok(res, { removed:false, message:'Usuário incorreto não encontrado' }); await deleteUserById(errado._id); return ok(res, { removed:true, message:'Usuário incorreto removido' }); } catch(e){ return serverError(res,e); } }

// Retorna informações de versão/build para diagnosticar bundle em produção
export function versionInfo(req, res){
	try {
		// Descobre raiz do projeto e lê package.json (robusto para ESM)
		const __filename = fileURLToPath(import.meta.url);
		const __dirname = path.dirname(__filename);
		// Sobe até a raiz (src/modules/gestor/app/controllers -> raiz do repo)
		const ROOT = process.cwd();
		let pkg = { name: 'wdgestor', version: '0.0.0-dev' };
		try {
			const pj = path.join(ROOT, 'package.json');
			const txt = fs.readFileSync(pj, 'utf8');
			pkg = JSON.parse(txt);
		} catch {}
		const info = {
			name: pkg.name || 'wdgestor',
			version: pkg.version || '0.0.0-dev',
			buildTime: process.env.BUILD_TIME || null,
			commit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT || process.env.COMMIT_SHA || null,
			routes: {
				unidadesList: '/gestor/api/unidades',
				uploadLogo: '/gestor/api/unidades/:id/logo',
				uploadLogoInline: '/gestor/api/unidades/:id/logo-inline',
				getLogo: '/gestor/api/unidades/:id/logo',
			}
		};
		res.setHeader('X-App-Version', String(info.version));
		if (info.commit) res.setHeader('X-App-Commit', String(info.commit));
		if (info.buildTime) res.setHeader('X-App-Build-Time', String(info.buildTime));
		return ok(res, info);
	} catch (e) {
		return serverError(res, e);
	}
}
