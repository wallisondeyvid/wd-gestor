import { ok, created, badRequest, notFound, serverError } from '#core/utils/apiResponse.js';
import {
	findUnidadeUserBaseLean,
	findUnidadesByCondLean,
	findRecursosByFiltroComUnidadeLean,
	findRecursoByIdComUnidadeNome,
	findRecursoByPlacaUpper,
	findRecursoByChassiUpper,
	findRecursoByRenavam,
	createRecurso as createRecursoDb,
	findRecursoById,
	findOutroRecursoByPlacaUpper,
	findOutroRecursoByChassiUpper,
	findOutroRecursoByRenavam,
	updateRecursoByIdComUnidadeNome,
	deleteRecursoById,
} from '#modules/gestor/app/services/apiDbBridgeService.js';

function normalizeUnitId(value) {
	return String(value || '').trim();
}

function isMasterOrAdmin(req) {
	return req.user?.isMaster || req.user?.role === 'admin';
}

function getScopedUnitId(req) {
	return normalizeUnitId(req.unitScope?.unidadeId);
}

function getLegacyUserUnitId(req) {
	return normalizeUnitId(req.user?.unidade_id);
}

function getCanonicalContextUnitId(req) {
	const scopedUnitId = getScopedUnitId(req);
	if (scopedUnitId) return scopedUnitId;

	if (!isMasterOrAdmin(req)) {
		return getLegacyUserUnitId(req);
	}

	return '';
}

function requestedUnitMatchesContext(req, requestedUnitId) {
	const requested = normalizeUnitId(requestedUnitId);
	if (!requested) return true;

	const scopedUnitId = getScopedUnitId(req);
	if (scopedUnitId && scopedUnitId !== requested) return false;

	if (!isMasterOrAdmin(req)) {
		const legacyUserUnitId = getLegacyUserUnitId(req);
		if (legacyUserUnitId && legacyUserUnitId !== requested) return false;
	}

	return true;
}

// GET /gestor/api/recursos?placa=ABC1234&unidadeId=<id>
// Regras:
//  - Filtro parcial de placa (case-insensitive) se informado (mín 2 chars)
//  - unidadeId opcional: se presente restringe a essa unidade (se dentro do escopo)
//  - Usuário master/admin: vê todos; demais: restringe a sua matriz/principal + filiais associadas
//  - Retorna lista curta com campos usados no modal (id, placa, descricao, unidadeFormatada)
export async function listarRecursosApi(req, res) {
	try {
		let { placa, unidadeId } = req.query;
		placa = (placa || '').trim();
		unidadeId = (unidadeId || '').trim();
		const canonicalUnitId = getCanonicalContextUnitId(req);

		const filtro = {};
		let placaTermNorm = null;
		if (placa && placa.length >= 2) {
			placaTermNorm = placa.replace(/[^A-Za-z0-9]/g,'').toUpperCase();
		}

		if (canonicalUnitId) {
			filtro.unidade_id = canonicalUnitId;
		} else if (unidadeId) {
			filtro.unidade_id = unidadeId;
		}

		// Fallback legado isolado: enquanto ainda houver sessões sem unitScope canônico
		if (!canonicalUnitId && !isMasterOrAdmin(req)) {
			let principalId = req.user?.unidade_principal_id;
			if (!principalId && req.user?.unidade_id) {
				const u = await findUnidadeUserBaseLean(req.user.unidade_id);
				if (u) principalId = u.is_principal ? (u._id) : (u.unidade_principal_id || u.matriz_id || u._id);
			}
			const cond = principalId
				? { $or: [ { _id: principalId }, { unidade_principal_id: principalId }, { matriz_id: principalId } ] }
				: { _id: req.user?.unidade_id || null };
			const unidadesAcessiveis = await findUnidadesByCondLean(cond);
			const ids = unidadesAcessiveis.map(u => String(u._id));
			if (unidadeId) {
				if (!ids.includes(String(unidadeId))) {
					// Unidade requisitada fora do escopo => lista vazia
					return ok(res, []);
				}
			} else {
				filtro.unidade_id = { $in: ids };
			}
		}

		let recursos = await findRecursosByFiltroComUnidadeLean(filtro);

		if (placaTermNorm) {
			recursos = recursos.filter(r => (r.placa||'').replace(/[^A-Za-z0-9]/g,'').toUpperCase().includes(placaTermNorm));
		}

			// Retornar shape completo para não quebrar página de gestão (que espera _id, tipo, marca, etc.)
			// e simultaneamente manter campos resumidos usados no modal de busca (id, descricao, unidadeFormatada)
			const mapped = recursos.map(r => ({
				// Identificadores (ambos para retrocompatibilidade)
				id: r._id,
				_id: r._id,
				// Campos principais
				placa: r.placa,
				tipo: r.tipo,
				marca: r.marca,
				modelo: r.modelo,
				ano: r.ano,
				mod: r.mod,
				cor: r.cor,
				ativo: r.ativo,
				// Relação unidade (mantém estrutura parecida com populate original)
				unidade_id: r.unidade_id ? { _id: r.unidade_id._id, codigo: r.unidade_id.codigo, nome: r.unidade_id.nome } : null,
				// Campos derivados para modal
				descricao: [r.marca, r.modelo].filter(Boolean).join(' ') || r.modelo || r.marca || '',
				unidadeFormatada: r.unidade_id ? ((r.unidade_id.codigo ? r.unidade_id.codigo + ' - ' : '') + (r.unidade_id.nome || '')) : '',
			}));
			return ok(res, mapped);
	} catch (error) {
		console.error('[API RECURSOS][listar] Erro:', error);
		return serverError(res, error);
	}
}
export async function getRecurso(req, res) {
	try {
		if (!/^[0-9a-fA-F]{24}$/.test(String(req.params.id))) return badRequest(res, 'ID inválido');
		const unidadeEfetiva = getCanonicalContextUnitId(req) || null;

		const recurso = await findRecursoByIdComUnidadeNome(req.params.id, unidadeEfetiva || null);
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
		const canonicalUnitId = getCanonicalContextUnitId(req) || normalizeUnitId(unidade_id);
		if (!canonicalUnitId || !tipo || !placa || !chassi || !renavam || !ano || !mod || !marca || !modelo || !cor) {
			return badRequest(res, 'Todos os campos são obrigatórios');
		}

		if (!requestedUnitMatchesContext(req, unidade_id || canonicalUnitId)) {
			return notFound(res, 'Unidade não encontrada');
		}

		const placaRegexAntiga = /^[A-Z]{3}-[0-9]{4}$/;
		const placaRegexMercosul = /^[A-Z]{3}-[0-9][A-Z][0-9]{2}$/;
		if (!placaRegexAntiga.test(placa.toUpperCase()) && !placaRegexMercosul.test(placa.toUpperCase())) {
			return badRequest(res, 'Formato de placa inválido. Use ABC-1234 ou ABC-1D34');
		}

		if ((await findRecursosByFiltroComUnidadeLean({ unidade_id: canonicalUnitId, placa: placa.toUpperCase() })).length > 0) {
			return badRequest(res, 'Placa já cadastrada');
		}
		if ((await findRecursosByFiltroComUnidadeLean({ unidade_id: canonicalUnitId, chassi: chassi.toUpperCase() })).length > 0) {
			return badRequest(res, 'Chassi já cadastrado');
		}
		if ((await findRecursosByFiltroComUnidadeLean({ unidade_id: canonicalUnitId, renavam })).length > 0) {
			return badRequest(res, 'RENAVAM já cadastrado');
		}

		const novoRecurso = await createRecursoDb({
			unidade_id: canonicalUnitId,
			tipo,
			placa: placa.toUpperCase(),
			chassi: chassi.toUpperCase(),
			renavam,
			ano: parseInt(ano),
			mod: parseInt(mod),
			marca,
			modelo,
			cor,
			ativo: true,
		});

		return created(res, novoRecurso._id, { data: novoRecurso });
	} catch (error) {
		console.error('[API RECURSOS][create] Erro:', error);
		return serverError(res, error);
	}
}
export async function updateRecurso(req, res) {
	try {
		const { unidade_id, tipo, placa, chassi, renavam, ano, mod, marca, modelo, cor, ativo } = req.body;
		const canonicalUnitId = getCanonicalContextUnitId(req) || normalizeUnitId(unidade_id);

		if (!canonicalUnitId) return badRequest(res, 'Unidade é obrigatória');
		if (!/^[0-9a-fA-F]{24}$/.test(String(canonicalUnitId))) return badRequest(res, 'Unidade inválida');
		if (!/^[0-9a-fA-F]{24}$/.test(String(req.params.id))) return badRequest(res, 'ID inválido');
		if (!requestedUnitMatchesContext(req, unidade_id || canonicalUnitId)) return notFound(res, 'Unidade não encontrada');

		const unidadeEfetiva = canonicalUnitId || null;

		const recurso = await findRecursoByIdComUnidadeNome(req.params.id, unidadeEfetiva || null);
		if (!recurso) return notFound(res, 'Recurso não encontrado');

		if (placa) {
			const placaRegexAntiga = /^[A-Z]{3}-[0-9]{4}$/;
			const placaRegexMercosul = /^[A-Z]{3}-[0-9][A-Z][0-9]{2}$/;
			if (!placaRegexAntiga.test(placa.toUpperCase()) && !placaRegexMercosul.test(placa.toUpperCase())) {
				return badRequest(res, 'Formato de placa inválido. Use ABC-1234 ou ABC-1D34');
			}
		}

		if (placa && placa.toUpperCase() !== recurso.placa && await findOutroRecursoByPlacaUpper(req.params.id, placa.toUpperCase(), unidadeEfetiva)) {
			return badRequest(res, 'Placa já cadastrada para outro recurso');
		}

		if (chassi && chassi.toUpperCase() !== recurso.chassi && await findOutroRecursoByChassiUpper(req.params.id, chassi.toUpperCase(), unidadeEfetiva)) {
			return badRequest(res, 'Chassi já cadastrado para outro recurso');
		}

		if (renavam && renavam !== recurso.renavam && await findOutroRecursoByRenavam(req.params.id, renavam, unidadeEfetiva)) {
			return badRequest(res, 'RENAVAM já cadastrado para outro recurso');
		}

		const atualizado = await updateRecursoByIdComUnidadeNome(
			req.params.id,
			{
				unidade_id: canonicalUnitId,
				tipo,
				placa: placa ? placa.toUpperCase() : recurso.placa,
				chassi: chassi ? chassi.toUpperCase() : recurso.chassi,
				renavam,
				ano: ano ? parseInt(ano) : recurso.ano,
				mod: mod ? parseInt(mod) : recurso.mod,
				marca,
				modelo,
				cor,
				ativo: ativo !== undefined ? ativo : recurso.ativo,
			},
			unidadeEfetiva || null,
		);

		if (!atualizado) return notFound(res, 'Recurso não encontrado');

		return ok(res, atualizado);
	} catch (error) {
		console.error('[API RECURSOS][update] Erro:', error);
		return serverError(res, error);
	}
}
export async function deleteRecurso(req, res) {
	try {
		if (!/^[0-9a-fA-F]{24}$/.test(String(req.params.id))) return badRequest(res, 'ID inválido');

		const unidadeEfetiva = getCanonicalContextUnitId(req) || null;

		const recurso = await deleteRecursoById(req.params.id, unidadeEfetiva || null);
		if (!recurso) return notFound(res, 'Recurso não encontrado');

		return ok(res, { deleted: true, id: req.params.id });
	} catch (error) {
		console.error('[API RECURSOS][delete] Erro:', error);
		return serverError(res, error);
	}
}
