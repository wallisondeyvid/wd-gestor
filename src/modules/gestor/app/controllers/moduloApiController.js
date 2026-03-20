import { ok, created, badRequest, notFound, serverError } from '#core/utils/apiResponse.js';
import { createUnitScope } from '#shared/unitScope.js';
import {
	findAllModulosBaseLeanRepo,
	findModuloByIdLeanRepo,
	findModuloByNomeRepo,
	createModuloRepo,
	findModuloByIdRepo,
	deleteModuloByIdRepo,
} from '#modules/gestor/app/repositories/ModuloReadRepository.js';
import { findUnidadeByIdWithModulosAcessiveisLeanRepo } from '#modules/gestor/app/repositories/UnidadeReadRepository.js';

const GLOBAL_SCOPE = { type: 'global', unidadeId: null };

function resolveActiveUnitId(req) {
	const authContextUnitId = String(req?.session?.gestorAuthContext?.active_unidade_id || '').trim();
	if (authContextUnitId) return authContextUnitId;

	return String(req?.user?.unidade_id || '').trim();
}

export async function listarModulos(req,res){ try { const user = req.user; if(user?.role === 'master'){ const modulos = await findAllModulosBaseLeanRepo({ unitScope: GLOBAL_SCOPE }); return ok(res, modulos); } const activeUnitId = resolveActiveUnitId(req); if(activeUnitId){ const unidade = await findUnidadeByIdWithModulosAcessiveisLeanRepo({ unitScope: createUnitScope({ unidadeId: activeUnitId }), unidadeId: activeUnitId }); if(unidade?.modulosAcessiveis){ const modulos = unidade.modulosAcessiveis.map(m=>({ _id:m._id, nome:m.nome, descricao:m.descricao, status:m.status, url_base:m.url_base })); return ok(res, modulos); } } return ok(res, []); } catch(e){ console.error('[API MODULOS][listar] Erro:', e); return serverError(res, e); } }
export async function obterModulo(req,res){ try { const modulo = await findModuloByIdLeanRepo({ unitScope: GLOBAL_SCOPE, id: req.params.id }); if(!modulo) return notFound(res,'Módulo não encontrado'); return ok(res, modulo); } catch(e){ console.error('[API MODULOS][get] Erro:', e); return serverError(res, e); } }
export async function criarModulo(req,res){ try { if(!req.user || (req.user.role !== 'master' && req.user.role !== 'admin')) return badRequest(res,'Permissão insuficiente'); const { nome, descricao, status, url_base } = req.body; if(!nome) return badRequest(res,'Nome é obrigatório'); const dup = await findModuloByNomeRepo({ unitScope: GLOBAL_SCOPE, nome }); if(dup) return badRequest(res,'Módulo já cadastrado'); const modulo = await createModuloRepo({ unitScope: GLOBAL_SCOPE, data: { nome, descricao, status, url_base } }); return created(res, modulo._id, { data:{ _id:modulo._id } }); } catch(e){ console.error('[API MODULOS][create] Erro:', e); return serverError(res, e); } }
export async function atualizarModulo(req,res){ try { if(!req.user || (req.user.role !== 'master' && req.user.role !== 'admin')) return badRequest(res,'Permissão insuficiente'); const { nome, descricao, status, url_base } = req.body; const modulo = await findModuloByIdRepo({ unitScope: GLOBAL_SCOPE, id: req.params.id }); if(!modulo) return notFound(res,'Módulo não encontrado'); if(nome && nome !== modulo.nome){ const dup = await findModuloByNomeRepo({ unitScope: GLOBAL_SCOPE, nome }); if(dup) return badRequest(res,'Nome de módulo já em uso'); modulo.nome = nome; } if(descricao !== undefined) modulo.descricao = descricao; if(status !== undefined) modulo.status = status; if(url_base !== undefined) modulo.url_base = url_base; await modulo.save(); return ok(res, { updated:true }); } catch(e){ console.error('[API MODULOS][update] Erro:', e); return serverError(res, e); } }
export async function excluirModulo(req,res){ try { if(!req.user || (req.user.role !== 'master' && req.user.role !== 'admin')) return badRequest(res,'Permissão insuficiente'); const modulo = await findModuloByIdRepo({ unitScope: GLOBAL_SCOPE, id: req.params.id }); if(!modulo) return notFound(res,'Módulo não encontrado'); await deleteModuloByIdRepo({ unitScope: GLOBAL_SCOPE, id: modulo._id }); return ok(res, { deleted:true, id: modulo._id }); } catch(e){ console.error('[API MODULOS][delete] Erro:', e); return serverError(res, e); } }
