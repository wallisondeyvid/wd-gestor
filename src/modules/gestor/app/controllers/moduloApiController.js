import { ok, created, badRequest, notFound, serverError } from '#core/utils/apiResponse.js';
import { findModuloByIdLeanService } from '#modules/gestor/app/services/modulos/findModuloByIdLean.service.js';
import { deleteModuloByIdService } from '#modules/gestor/app/services/modulos/deleteModuloById.service.js';
import { updateModuloByIdService } from '#modules/gestor/app/services/modulos/updateModuloById.service.js';
import { listModulosOwnerService } from '#modules/gestor/app/services/modulos/listModulosOwner.service.js';
import { createModuloExecutionService } from '#modules/gestor/app/services/modulos/createModuloExecution.service.js';

function resolveActiveUnitId(req) {
	const authContextUnitId = String(req?.session?.gestorAuthContext?.active_unidade_id || '').trim();
	if (authContextUnitId) return authContextUnitId;

	return String(req?.user?.unidade_id || '').trim();
}

export async function listarModulos(req,res){ try { const result = await listModulosOwnerService({ userRole: req.user?.role, activeUnitId: resolveActiveUnitId(req) }); return ok(res, result.modulos); } catch(e){ console.error('[API MODULOS][listar] Erro:', e); return serverError(res, e); } }
export async function obterModulo(req,res){ try { const modulo = await findModuloByIdLeanService(req.params.id); if(!modulo) return notFound(res,'Módulo não encontrado'); return ok(res, modulo); } catch(e){ console.error('[API MODULOS][get] Erro:', e); return serverError(res, e); } }
export async function criarModulo(req,res){ try { if(!req.user || (req.user.role !== 'master' && req.user.role !== 'admin')) return badRequest(res,'Permissão insuficiente'); const { nome, descricao, status, url_base } = req.body; if(!nome) return badRequest(res,'Nome é obrigatório'); const result = await createModuloExecutionService({ nome, descricao, status, url_base }); if(result?.kind === 'duplicate_name') return badRequest(res,'Módulo já cadastrado'); return created(res, result?.moduloId, { data:{ _id:result?.moduloId } }); } catch(e){ console.error('[API MODULOS][create] Erro:', e); return serverError(res, e); } }
export async function atualizarModulo(req,res){ try { if(!req.user || (req.user.role !== 'master' && req.user.role !== 'admin')) return badRequest(res,'Permissão insuficiente'); const result = await updateModuloByIdService({ moduloId: req.params.id, changes: req.body }); if(result.kind === 'not_found') return notFound(res,'Módulo não encontrado'); if(result.kind === 'duplicate_name') return badRequest(res,'Nome de módulo já em uso'); return ok(res, { updated:true }); } catch(e){ console.error('[API MODULOS][update] Erro:', e); return serverError(res, e); } }
export async function excluirModulo(req,res){ try { if(!req.user || (req.user.role !== 'master' && req.user.role !== 'admin')) return badRequest(res,'Permissão insuficiente'); const modulo = await deleteModuloByIdService({ moduloId: req.params.id }); if(!modulo) return notFound(res,'Módulo não encontrado'); return ok(res, { deleted:true, id: modulo._id }); } catch(e){ console.error('[API MODULOS][delete] Erro:', e); return serverError(res, e); } }
