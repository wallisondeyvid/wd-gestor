import { ok, created, badRequest, notFound, serverError } from '#core/utils/apiResponse.js';
import {
	findUnidadeUserBaseLean,
	findUnidadesByCondLean,
	findRecursoByIdComUnidadeNome,
	findRecursosByFiltroComUnidadeLean,
	findRecursoByPlacaUpper,
	findRecursoByChassiUpper,
	findRecursoByRenavam,
	createRecurso as createRecursoDb,
	findRecursoById,
	findOutroRecursoByPlacaUpper,
	findOutroRecursoByChassiUpper,
	findOutroRecursoByRenavam,
	updateRecursoByIdComUnidadeNome,
} from '#modules/gestor/app/services/apiDbBridgeService.js';
import { listarRecursosService } from '#modules/gestor/app/services/recursos/listarRecursos.service.js';
import { deleteRecursoScopedService } from '#modules/gestor/app/services/recursos/deleteRecursoScoped.service.js';
import { createRecursoContextPolicyCore } from '#modules/gestor/app/services/recursos/createRecursoContextPolicyCore.js';
import { createRecursoWriteValidationCore } from '#modules/gestor/app/services/recursos/createRecursoWriteValidationCore.js';
import { getRecursoByIdCore } from './utils/getRecursoByIdCore.js';

function normalizeUnitId(value) {
	return String(value || '').trim();
}

const recursoContextPolicy = createRecursoContextPolicyCore({
	findUnidadeUserBaseLean,
	findUnidadesByCondLean,
});

const recursoWriteValidation = createRecursoWriteValidationCore({
	findRecursosByFiltroComUnidadeLean,
	findOutroRecursoByPlacaUpper,
	findOutroRecursoByChassiUpper,
	findOutroRecursoByRenavam,
});

function getRequestScopeContext(req) {
	return {
		currentUser: req.user || null,
		sessionUser: req.session?.user || null,
		scopedUnitId: req.unitScope?.unidadeId || null,
	};
}

function respondMissingContext(res) {
	return notFound(res, 'Unidade não encontrada');
}

// GET /gestor/api/recursos?placa=ABC1234&unidadeId=<id>
// Regras:
//  - Filtro parcial de placa (case-insensitive) se informado (mín 2 chars)
//  - unidadeId opcional: se presente restringe a essa unidade (se dentro do escopo)
//  - Usuário master/admin: vê todos; demais: restringe a sua matriz/principal + filiais associadas
//  - Retorna lista curta com campos usados no modal (id, placa, descricao, unidadeFormatada)
export async function listarRecursosApi(req, res) {
	try {
		const result = await listarRecursosService({
			query: req.query,
			user: req.user,
			session: req.session,
			unitScope: req.unitScope,
		});

		if (result.blocked) {
			return respondMissingContext(res);
		}

		return ok(res, result.data);
	} catch (error) {
		console.error('[API RECURSOS][listar] Erro:', error);
		return serverError(res, error);
	}
}
export async function getRecurso(req, res) {
	try {
		if (!/^[0-9a-fA-F]{24}$/.test(String(req.params.id))) return badRequest(res, 'ID inválido');
		const context = getRequestScopeContext(req);
		if (recursoContextPolicy.shouldBlockForMissingContext(context)) return respondMissingContext(res);
		const unidadeEfetiva = recursoContextPolicy.resolveCanonicalContextUnitId(context) || null;

		const recurso = await getRecursoByIdCore({
			id: req.params.id,
			unidadeEfetiva,
			findRecursoByIdComUnidadeNome,
		});
		if (!recurso) return notFound(res, 'Recurso não encontrado');

		return ok(res, recurso);
	} catch (error) {
		console.error('[API RECURSOS][get] Erro:', error);
		return serverError(res, error);
	}
}
export async function createRecurso(req, res) {
	try {
		const { unidade_id, tipo, placa, chassi, renavam, ano, mod, marca, modelo, cor } = req.body;
		const requestedUnitId = normalizeUnitId(unidade_id);
		const context = getRequestScopeContext(req);
		if (recursoContextPolicy.shouldBlockForMissingContext(context)) return respondMissingContext(res);
		if (!requestedUnitId || !tipo || !placa || !chassi || !renavam || !ano || !mod || !marca || !modelo || !cor) {
			return badRequest(res, 'Todos os campos são obrigatórios');
		}

		const access = recursoContextPolicy.ensureRequestedUnitAccess({
			...context,
			requestedUnitId,
		});
		if (!access.allowed) {
			return notFound(res, 'Unidade não encontrada');
		}

		const createValidation = await recursoWriteValidation.validateCreate({
			requestedUnitId: access.effectiveUnitId || requestedUnitId,
			tipo,
			placa,
			chassi,
			renavam,
			ano,
			mod,
			marca,
			modelo,
			cor,
		});
		if (createValidation?.error === 'invalid_placa_format') return badRequest(res, 'Formato de placa inválido. Use ABC-1234 ou ABC-1D34');
		if (createValidation?.error === 'duplicate_placa') return badRequest(res, 'Placa já cadastrada');
		if (createValidation?.error === 'duplicate_chassi') return badRequest(res, 'Chassi já cadastrado');
		if (createValidation?.error === 'duplicate_renavam') return badRequest(res, 'RENAVAM já cadastrado');

		const createResult = await createRecursoDb(createValidation.data);

		return created(res, createResult._id, { data: createResult });
	} catch (error) {
		console.error('[API RECURSOS][create] Erro:', error);
		return serverError(res, error);
	}
}
export async function updateRecurso(req, res) {
	try {
		const { unidade_id, tipo, placa, chassi, renavam, ano, mod, marca, modelo, cor, ativo } = req.body;
		const requestedUnitId = normalizeUnitId(unidade_id);
		const context = getRequestScopeContext(req);
		if (recursoContextPolicy.shouldBlockForMissingContext(context)) return respondMissingContext(res);

		if (!requestedUnitId) return badRequest(res, 'Unidade é obrigatória');
		if (!/^[0-9a-fA-F]{24}$/.test(String(requestedUnitId))) return badRequest(res, 'Unidade inválida');
		if (!/^[0-9a-fA-F]{24}$/.test(String(req.params.id))) return badRequest(res, 'ID inválido');
		const access = recursoContextPolicy.ensureRequestedUnitAccess({
			...context,
			requestedUnitId,
		});
		if (!access.allowed) return notFound(res, 'Unidade não encontrada');

		const unidadeEfetiva = access.effectiveUnitId || requestedUnitId || null;

		const recurso = await findRecursoByIdComUnidadeNome(req.params.id, unidadeEfetiva || null);
		if (!recurso) return notFound(res, 'Recurso não encontrado');

		const updateValidation = await recursoWriteValidation.validateUpdate({
			id: req.params.id,
			unidadeEfetiva,
			recurso,
			tipo,
			placa,
			chassi,
			renavam,
			ano,
			mod,
			marca,
			modelo,
			cor,
			ativo,
		});
		if (updateValidation?.error === 'invalid_placa_format') return badRequest(res, 'Formato de placa inválido. Use ABC-1234 ou ABC-1D34');
		if (updateValidation?.error === 'duplicate_placa') return badRequest(res, 'Placa já cadastrada para outro recurso');
		if (updateValidation?.error === 'duplicate_chassi') return badRequest(res, 'Chassi já cadastrado para outro recurso');
		if (updateValidation?.error === 'duplicate_renavam') return badRequest(res, 'RENAVAM já cadastrado para outro recurso');

		const updateResult = await updateRecursoByIdComUnidadeNome(
			req.params.id,
			updateValidation.data,
			unidadeEfetiva || null,
		);
		if (!updateResult) return notFound(res, 'Recurso não encontrado');

		return ok(res, updateResult);
	} catch (error) {
		console.error('[API RECURSOS][update] Erro:', error);
		return serverError(res, error);
	}
}
export async function deleteRecurso(req, res) {
	try {
		if (!/^[0-9a-fA-F]{24}$/.test(String(req.params.id))) return badRequest(res, 'ID inválido');
		const context = getRequestScopeContext(req);
		if (recursoContextPolicy.shouldBlockForMissingContext(context)) return respondMissingContext(res);

		const unidadeEfetiva = recursoContextPolicy.resolveCanonicalContextUnitId(context) || null;

		const recurso = await deleteRecursoScopedService({
			recursoId: req.params.id,
			unidadeEfetiva: unidadeEfetiva || null,
		});
		if (!recurso) return notFound(res, 'Recurso não encontrado');

		return ok(res, { deleted: true, id: req.params.id });
	} catch (error) {
		console.error('[API RECURSOS][delete] Erro:', error);
		return serverError(res, error);
	}
}
