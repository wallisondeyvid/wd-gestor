import { ok, created, badRequest, notFound, serverError } from '#core/utils/apiResponse.js';
import {
	createModulo,
	findAllModulosBaseLean,
	findModuloById,
	findModuloByNome,
	findUnidadeByIdWithModulosAcessiveisLean,
	saveModulo,
} from '#modules/gestor/app/services/apiDbBridgeService.js';
import { findModuloByIdLeanService } from '#modules/gestor/app/services/modulos/findModuloByIdLean.service.js';
import { deleteModuloByIdService } from '#modules/gestor/app/services/modulos/deleteModuloById.service.js';

function resolveActiveUnitId(req) {
	const authContextUnitId = String(req?.session?.gestorAuthContext?.active_unidade_id || '').trim();
	if (authContextUnitId) return authContextUnitId;

	return String(req?.user?.unidade_id || '').trim();
}

function normalizeModuloList(modulos = []) {
	return modulos.map((modulo) => ({
		_id: modulo._id,
		nome: modulo.nome,
		descricao: modulo.descricao,
		status: modulo.status,
		url_base: modulo.url_base,
	}));
}

export async function listarModulos(req,res){ try { let modulos; if (req.user?.role === 'master') { modulos = await findAllModulosBaseLean(); } else { const activeUnitId = resolveActiveUnitId(req); if (!activeUnitId) return ok(res, []); const unidade = await findUnidadeByIdWithModulosAcessiveisLean(activeUnitId); modulos = unidade?.modulosAcessiveis ? normalizeModuloList(unidade.modulosAcessiveis) : []; } return ok(res, modulos); } catch(e){ console.error('[API MODULOS][listar] Erro:', e); return serverError(res, e); } }
export async function obterModulo(req,res){ try { const modulo = await findModuloByIdLeanService(req.params.id); if(!modulo) return notFound(res,'Módulo não encontrado'); return ok(res, modulo); } catch(e){ console.error('[API MODULOS][get] Erro:', e); return serverError(res, e); } }
export async function criarModulo(req,res){ try { if(!req.user || (req.user.role !== 'master' && req.user.role !== 'admin')) return badRequest(res,'Permissão insuficiente'); const { nome, descricao, status, url_base } = req.body; if(!nome) return badRequest(res,'Nome é obrigatório'); const dup = await findModuloByNome(nome); if(dup) return badRequest(res,'Módulo já cadastrado'); const modulo = await createModulo({ nome, descricao, status, url_base }); return created(res, modulo._id, { data:{ _id:modulo._id } }); } catch(e){ console.error('[API MODULOS][create] Erro:', e); return serverError(res, e); } }
export async function atualizarModulo(req,res){ try { if(!req.user || (req.user.role !== 'master' && req.user.role !== 'admin')) return badRequest(res,'Permissão insuficiente'); const { nome, descricao, status, url_base } = req.body; const modulo = await findModuloById(req.params.id); if(!modulo) return notFound(res,'Módulo não encontrado'); if(nome && nome !== modulo.nome){ const dup = await findModuloByNome(nome); if(dup) return badRequest(res,'Nome de módulo já em uso'); modulo.nome = nome; } if(descricao !== undefined) modulo.descricao = descricao; if(status !== undefined) modulo.status = status; if(url_base !== undefined) modulo.url_base = url_base; await saveModulo(modulo); return ok(res, { updated:true }); } catch(e){ console.error('[API MODULOS][update] Erro:', e); return serverError(res, e); } }
export async function excluirModulo(req,res){ try { if(!req.user || (req.user.role !== 'master' && req.user.role !== 'admin')) return badRequest(res,'Permissão insuficiente'); const modulo = await deleteModuloByIdService({ moduloId: req.params.id }); if(!modulo) return notFound(res,'Módulo não encontrado'); return ok(res, { deleted:true, id: modulo._id }); } catch(e){ console.error('[API MODULOS][delete] Erro:', e); return serverError(res, e); } }
