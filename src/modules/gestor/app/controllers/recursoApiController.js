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
import { getRecursoByIdCore } from './utils/getRecursoByIdCore.js';
import { processCreateRecursoCore } from './utils/processCreateRecursoCore.js';
import { processUpdateRecursoCore } from './utils/processUpdateRecursoCore.js';

function normalizeUnitId(value) {
	return String(value || '').trim();
}

function isMasterOrAdmin(req) {
	return req.user?.isMaster || req.user?.role === 'admin';
}

function getScopedUnitId(req) {
	return normalizeUnitId(req.unitScope?.unidadeId);
}

function getLegacyAuthenticatedUnitId(req) {
	return normalizeUnitId(req.user?.unidade_id || req.session?.user?.unidade_id);
}

function getCanonicalContextUnitId(req) {
	return normalizeUnitId(getScopedUnitId(req) || getLegacyAuthenticatedUnitId(req));
}

function hasCanonicalContextUnitId(req) {
	return Boolean(getCanonicalContextUnitId(req));
}

function shouldBlockForMissingContext(req) {
	return !isMasterOrAdmin(req) && !hasCanonicalContextUnitId(req);
}

function respondMissingContext(res) {
	return notFound(res, 'Unidade não encontrada');
}

function requestedUnitMatchesContext(req, requestedUnitId) {
	const requested = normalizeUnitId(requestedUnitId);
	if (!requested) return true;
	if (isMasterOrAdmin(req)) return true;

	const canonicalContextUnitId = getCanonicalContextUnitId(req);
	if (!canonicalContextUnitId) return false;
	if (canonicalContextUnitId) return canonicalContextUnitId === requested;

	return false;
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
		if (shouldBlockForMissingContext(req)) return respondMissingContext(res);
		const unidadeEfetiva = getCanonicalContextUnitId(req) || null;

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
		if (shouldBlockForMissingContext(req)) return respondMissingContext(res);
		if (!requestedUnitId || !tipo || !placa || !chassi || !renavam || !ano || !mod || !marca || !modelo || !cor) {
			return badRequest(res, 'Todos os campos são obrigatórios');
		}

		if (!requestedUnitMatchesContext(req, requestedUnitId)) {
			return notFound(res, 'Unidade não encontrada');
		}

		const placaRegexAntiga = /^[A-Z]{3}-[0-9]{4}$/;
		const placaRegexMercosul = /^[A-Z]{3}-[0-9][A-Z][0-9]{2}$/;
		if (!placaRegexAntiga.test(placa.toUpperCase()) && !placaRegexMercosul.test(placa.toUpperCase())) {
			return badRequest(res, 'Formato de placa inválido. Use ABC-1234 ou ABC-1D34');
		}

		const createResult = await processCreateRecursoCore({
			requestedUnitId,
			tipo,
			placa,
			chassi,
			renavam,
			ano,
			mod,
			marca,
			modelo,
			cor,
			findRecursosByFiltroComUnidadeLean,
			createRecursoDb,
		});
		if (createResult?.error === 'duplicate_placa') return badRequest(res, 'Placa já cadastrada');
		if (createResult?.error === 'duplicate_chassi') return badRequest(res, 'Chassi já cadastrado');
		if (createResult?.error === 'duplicate_renavam') return badRequest(res, 'RENAVAM já cadastrado');

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
		if (shouldBlockForMissingContext(req)) return respondMissingContext(res);

		if (!requestedUnitId) return badRequest(res, 'Unidade é obrigatória');
		if (!/^[0-9a-fA-F]{24}$/.test(String(requestedUnitId))) return badRequest(res, 'Unidade inválida');
		if (!/^[0-9a-fA-F]{24}$/.test(String(req.params.id))) return badRequest(res, 'ID inválido');
		if (!requestedUnitMatchesContext(req, requestedUnitId)) return notFound(res, 'Unidade não encontrada');

		const unidadeEfetiva = requestedUnitId || null;

		const recurso = await findRecursoByIdComUnidadeNome(req.params.id, unidadeEfetiva || null);
		if (!recurso) return notFound(res, 'Recurso não encontrado');

		if (placa) {
			const placaRegexAntiga = /^[A-Z]{3}-[0-9]{4}$/;
			const placaRegexMercosul = /^[A-Z]{3}-[0-9][A-Z][0-9]{2}$/;
			if (!placaRegexAntiga.test(placa.toUpperCase()) && !placaRegexMercosul.test(placa.toUpperCase())) {
				return badRequest(res, 'Formato de placa inválido. Use ABC-1234 ou ABC-1D34');
			}
		}

		const updateResult = await processUpdateRecursoCore({
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
			findOutroRecursoByPlacaUpper,
			findOutroRecursoByChassiUpper,
			findOutroRecursoByRenavam,
			updateRecursoByIdComUnidadeNome,
		});
		if (updateResult?.error === 'duplicate_placa') return badRequest(res, 'Placa já cadastrada para outro recurso');
		if (updateResult?.error === 'duplicate_chassi') return badRequest(res, 'Chassi já cadastrado para outro recurso');
		if (updateResult?.error === 'duplicate_renavam') return badRequest(res, 'RENAVAM já cadastrado para outro recurso');
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
		if (shouldBlockForMissingContext(req)) return respondMissingContext(res);

		const unidadeEfetiva = getCanonicalContextUnitId(req) || null;

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
