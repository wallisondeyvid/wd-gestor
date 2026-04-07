import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { registerHooks } from 'node:module';
import express from 'express';

const SCOPED_UNIT_ID = '507f191e810c19729de860ea';
const SAME_CLUSTER_FILIAL_ID = '507f191e810c19729de860eb';
const SAME_CLUSTER_PRINCIPAL_ID = '507f191e810c19729de860ed';
const OTHER_CLUSTER_PRINCIPAL_ID = '507f191e810c19729de860ef';
const OTHER_CLUSTER_FILIAL_ID = '507f191e810c19729de860f0';
const projectRoot = process.cwd();
const controllerModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/controllers/funcaoApiController.js')).href;
const gestorAppModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/gestor-app.js')).href;
const actualDbBridgeModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/services/apiDbBridgeService.js')).href;
const dbBridgeMockModuleUrl = 'mock:gestor-funcoes-list-api-db-bridge';
const listServiceAlias = '#modules/gestor/app/services/funcoes/listarFuncoes.service.js';
const listServiceMockModuleUrl = 'mock:gestor-funcoes-list-service';
const DB_BRIDGE_EXPORTS = [
	'findUnidadeUserBaseLean',
	'findFuncoesByFiltroLean',
	'findFuncoesByFiltroSelectLean',
];

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === '#modules/gestor/app/services/apiDbBridgeService.js') {
			return { url: dbBridgeMockModuleUrl, shortCircuit: true };
		}
		if (specifier === listServiceAlias) {
			return { url: listServiceMockModuleUrl, shortCircuit: true };
		}
		return nextResolve(specifier, context);
	},
	load(url, context, nextLoad) {
		if (url === dbBridgeMockModuleUrl) {
			const lines = [
				`export * from '${actualDbBridgeModuleUrl}';`,
				`import * as actual from '${actualDbBridgeModuleUrl}';`,
				"const getMocks = () => globalThis.__GESTOR_FUNCOES_LIST_DB_MOCKS__ || {};",
			];

			for (const exportName of DB_BRIDGE_EXPORTS) {
				lines.push(`export async function ${exportName}(...args) { const fn = getMocks()['${exportName}']; if (typeof fn === 'function') return await fn(...args); return await actual['${exportName}'](...args); }`);
			}

			return {
				format: 'module',
				shortCircuit: true,
				source: lines.join('\n'),
			};
		}

		if (url === listServiceMockModuleUrl) {
			return {
				format: 'module',
				shortCircuit: true,
				source: [
					"const getMocks = () => globalThis.__GESTOR_FUNCOES_LIST_DB_MOCKS__ || {};",
					"export async function findFuncoesByFiltroService(...args) {",
					"  return getMocks().findFuncoesByFiltroLean(...args);",
					"}",
					"export async function findFuncoesByFiltroSelectService(...args) {",
					"  return getMocks().findFuncoesByFiltroSelectLean(...args);",
					"}",
					"export async function listarFuncoesService(...args) {",
					"  return getMocks().listarFuncoesService(...args);",
					"}",
				].join('\n'),
			};
		}

		return nextLoad(url, context);
	},
});

function uniqueSuffix() {
	return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeUnitId(value) {
	return String(value || '').trim();
}

function mapClusterFuncao(funcao) {
	return {
		_id: funcao._id,
		nome: funcao.nome,
		descricao: funcao.descricao || '',
		codigo: funcao.codigo || '',
	};
}

function mapUnidadeFuncao(funcao) {
	const nome = funcao.nome || '';
	const rawDesc = (funcao.descricao && funcao.descricao.trim()) ? funcao.descricao.trim() : '';
	const codigo = funcao.codigo || '';
	const descricaoDisplay = rawDesc || (nome && nome !== codigo ? nome : codigo);
	const descricaoFinal = rawDesc || nome || codigo;

	return {
		_id: funcao._id,
		codigo,
		nome,
		descricao: rawDesc,
		descricao_display: descricaoDisplay,
		descricao_final: descricaoFinal,
		hasDescricaoReal: !!rawDesc,
	};
}

async function resolvePrincipalUnitId(mocks, unidadeId) {
	const unidadeIdNorm = normalizeUnitId(unidadeId);
	if (!unidadeIdNorm) return '';
	const unidade = await mocks.findUnidadeUserBaseLean(unidadeIdNorm);
	if (!unidade) return unidadeIdNorm;
	return String(unidade.is_principal ? unidade._id : (unidade.unidade_principal_id || unidade.matriz_id || unidade._id || unidadeIdNorm)).trim();
}

function createListServiceMock(mocks) {
	return async function listarFuncoesService({ query, unitScope }) {
		const queryTerm = String(query?.q || '').trim().toLowerCase();
		const scopedUnitId = normalizeUnitId(unitScope?.unidadeId);

		if (normalizeUnitId(query?.unidade_cluster)) {
			const unidadeCluster = normalizeUnitId(query.unidade_cluster);
			if (scopedUnitId) {
				const contextPrincipal = await resolvePrincipalUnitId(mocks, scopedUnitId);
				const requestedPrincipal = await resolvePrincipalUnitId(mocks, unidadeCluster);
				if (contextPrincipal && requestedPrincipal !== contextPrincipal) return [];
			}

			const targetPrincipal = await resolvePrincipalUnitId(mocks, unidadeCluster) || unidadeCluster;
			let funcoes = await mocks.findFuncoesByFiltroLean({ unidade_principal_id: targetPrincipal });

			if (queryTerm) {
				funcoes = funcoes.filter((funcao) => (
					(funcao.nome && funcao.nome.toLowerCase().includes(queryTerm))
					|| (funcao.codigo && funcao.codigo.toLowerCase().includes(queryTerm))
					|| (funcao.descricao && funcao.descricao.toLowerCase().includes(queryTerm))
				));
			}

			funcoes.sort((left, right) => (left.nome || '').localeCompare(right.nome || ''));
			return funcoes.map(mapClusterFuncao);
		}

		if (normalizeUnitId(query?.unidade_id)) {
			const rawIds = String(query.unidade_id)
				.split(',')
				.map((item) => normalizeUnitId(item))
				.filter(Boolean);
			if (!rawIds.length) return [];

			const principalIds = [];
			for (const unidadeId of rawIds) {
				if (scopedUnitId) {
					const contextPrincipal = await resolvePrincipalUnitId(mocks, scopedUnitId);
					const requestedPrincipal = await resolvePrincipalUnitId(mocks, unidadeId);
					if (contextPrincipal && requestedPrincipal !== contextPrincipal) return [];
				}

				principalIds.push(await resolvePrincipalUnitId(mocks, unidadeId) || unidadeId);
			}

			const uniquePrincipalIds = [...new Set(principalIds)];
			const filtro = uniquePrincipalIds.length === 1
				? { unidade_principal_id: uniquePrincipalIds[0] }
				: { unidade_principal_id: { $in: uniquePrincipalIds } };
			const funcoes = await mocks.findFuncoesByFiltroSelectLean(filtro);
			return funcoes.map(mapUnidadeFuncao);
		}

		return [];
	};
}

function setDbMocks(overrides = {}) {
	const mocks = {
		findUnidadeUserBaseLean: overrides.findUnidadeUserBaseLean ?? (async () => null),
		findFuncoesByFiltroLean: overrides.findFuncoesByFiltroLean ?? (async () => []),
		findFuncoesByFiltroSelectLean: overrides.findFuncoesByFiltroSelectLean ?? (async () => []),
	};

	globalThis.__GESTOR_FUNCOES_LIST_DB_MOCKS__ = {
		...mocks,
		listarFuncoesService: overrides.listarFuncoesService ?? createListServiceMock(mocks),
	};
}

function clearDbMocks() {
	globalThis.__GESTOR_FUNCOES_LIST_DB_MOCKS__ = {};
}

function createResponseCapture() {
	return {
		statusCode: 200,
		body: undefined,
		headers: {},
		status(code) {
			this.statusCode = code;
			return this;
		},
		json(payload) {
			this.body = JSON.parse(JSON.stringify(payload));
			return this;
		},
		send(payload) {
			this.body = JSON.parse(JSON.stringify(payload));
			return this;
		},
		set(name, value) {
			this.headers[String(name).toLowerCase()] = value;
			return this;
		},
		setHeader(name, value) {
			this.headers[String(name).toLowerCase()] = value;
		},
		type(value) {
			this.headers['content-type'] = value;
			return this;
		},
	};
}

function createRequest(overrides = {}) {
	return {
		params: {},
		query: {},
		body: {},
		headers: {},
		session: {},
		user: null,
		unitScope: null,
		...overrides,
		query: {
			...(overrides.query || {}),
		},
		session: {
			...(overrides.session || {}),
		},
	};
}

async function invokeOwner({ reqOverrides = {}, bridgeOverrides = {} } = {}) {
	setDbMocks(bridgeOverrides);
	const { listarFuncoesApi } = await import(`${controllerModuleUrl}?case=${encodeURIComponent(uniqueSuffix())}`);
	const req = createRequest(reqOverrides);
	const res = createResponseCapture();

	await listarFuncoesApi(req, res);
	return { req, res };
}

async function requestGestorApp(pathname) {
	const { default: buildGestorApp } = await import(`${gestorAppModuleUrl}?case=app-${encodeURIComponent(uniqueSuffix())}`);
	const gestorApp = buildGestorApp();
	const rootApp = express();
	rootApp.use('/gestor', gestorApp);

	const server = await new Promise((resolve) => {
		const instance = rootApp.listen(0, '127.0.0.1', () => resolve(instance));
	});

	try {
		const { port } = server.address();
		const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
			method: 'GET',
			redirect: 'manual',
			headers: { accept: 'application/json' },
		});
		const text = await response.text();
		let body = null;
		try {
			body = text ? JSON.parse(text) : null;
		} catch {
			body = null;
		}
		return { status: response.status, body, text };
	} finally {
		await new Promise((resolve, reject) => {
			server.close((error) => {
				if (error) reject(error);
				else resolve();
			});
		});
	}
}

test.afterEach(() => {
	clearDbMocks();
});

test('GET /gestor/api/funcoes sem sessao responde 401 JSON no app real', async () => {
	const response = await requestGestorApp('/gestor/api/funcoes');

	assert.equal(response.status, 401);
	assert.deepEqual(response.body, {
		success: false,
		error: 'Não autenticado',
		code: 'UNAUTHORIZED',
	});
});

test('listarFuncoesApi com unidade_cluster fora do contexto retorna lista vazia sem consultar funcoes', async () => {
	const unidadeCalls = [];
	const filtroCalls = [];
	const unidades = {
		[SCOPED_UNIT_ID]: { _id: SCOPED_UNIT_ID, is_principal: false, unidade_principal_id: SAME_CLUSTER_PRINCIPAL_ID },
		[OTHER_CLUSTER_PRINCIPAL_ID]: { _id: OTHER_CLUSTER_PRINCIPAL_ID, is_principal: true },
	};
	const { res } = await invokeOwner({
		reqOverrides: {
			query: { unidade_cluster: OTHER_CLUSTER_PRINCIPAL_ID },
			user: { role: 'diretor' },
			unitScope: { unidadeId: SCOPED_UNIT_ID },
		},
		bridgeOverrides: {
			findUnidadeUserBaseLean: async (unidadeId) => {
				unidadeCalls.push(unidadeId);
				return unidades[unidadeId] || null;
			},
			findFuncoesByFiltroLean: async (filtro) => {
				filtroCalls.push(JSON.parse(JSON.stringify(filtro)));
				return [];
			},
		},
	});

	assert.equal(res.statusCode, 200);
	assert.deepEqual(res.body, { success: true, data: [] });
	assert.deepEqual(unidadeCalls, [SCOPED_UNIT_ID, OTHER_CLUSTER_PRINCIPAL_ID]);
	assert.deepEqual(filtroCalls, []);
});

test('listarFuncoesApi com unidade_cluster em contexto aplica filtro resolvido, busca por q e ordena por nome', async () => {
	const unidadeCalls = [];
	const filtroCalls = [];
	const unidades = {
		[SCOPED_UNIT_ID]: { _id: SCOPED_UNIT_ID, is_principal: false, unidade_principal_id: SAME_CLUSTER_PRINCIPAL_ID },
		[SAME_CLUSTER_FILIAL_ID]: { _id: SAME_CLUSTER_FILIAL_ID, is_principal: false, unidade_principal_id: SAME_CLUSTER_PRINCIPAL_ID },
	};
	const { res } = await invokeOwner({
		reqOverrides: {
			query: { unidade_cluster: SAME_CLUSTER_FILIAL_ID, q: 'ana' },
			user: { role: 'diretor' },
			unitScope: { unidadeId: SCOPED_UNIT_ID },
		},
		bridgeOverrides: {
			findUnidadeUserBaseLean: async (unidadeId) => {
				unidadeCalls.push(unidadeId);
				return unidades[unidadeId] || null;
			},
			findFuncoesByFiltroLean: async (filtro) => {
				filtroCalls.push(JSON.parse(JSON.stringify(filtro)));
				return [
					{ _id: 'f-2', nome: 'Zelador', descricao: 'Atua no predio', codigo: 'ZEL' },
					{ _id: 'f-1', nome: 'Analista', descricao: 'Atua na análise', codigo: 'ANA' },
					{ _id: 'f-3', nome: 'Analista Senior', descricao: '', codigo: 'ASR' },
				];
			},
		},
	});

	assert.deepEqual(unidadeCalls, [SCOPED_UNIT_ID, SAME_CLUSTER_FILIAL_ID, SAME_CLUSTER_FILIAL_ID]);
	assert.deepEqual(filtroCalls, [{ unidade_principal_id: SAME_CLUSTER_PRINCIPAL_ID }]);
	assert.equal(res.statusCode, 200);
	assert.deepEqual(res.body, {
		success: true,
		data: [
			{ _id: 'f-1', nome: 'Analista', descricao: 'Atua na análise', codigo: 'ANA' },
			{ _id: 'f-3', nome: 'Analista Senior', descricao: '', codigo: 'ASR' },
		],
	});
});

test('listarFuncoesApi com unidade_id fora do contexto retorna lista vazia sem select', async () => {
	const unidadeCalls = [];
	const selectCalls = [];
	const unidades = {
		[SCOPED_UNIT_ID]: { _id: SCOPED_UNIT_ID, is_principal: false, unidade_principal_id: SAME_CLUSTER_PRINCIPAL_ID },
		[OTHER_CLUSTER_FILIAL_ID]: { _id: OTHER_CLUSTER_FILIAL_ID, is_principal: false, unidade_principal_id: OTHER_CLUSTER_PRINCIPAL_ID },
	};
	const { res } = await invokeOwner({
		reqOverrides: {
			query: { unidade_id: OTHER_CLUSTER_FILIAL_ID },
			user: { role: 'diretor' },
			unitScope: { unidadeId: SCOPED_UNIT_ID },
		},
		bridgeOverrides: {
			findUnidadeUserBaseLean: async (unidadeId) => {
				unidadeCalls.push(unidadeId);
				return unidades[unidadeId] || null;
			},
			findFuncoesByFiltroSelectLean: async (filtro) => {
				selectCalls.push(JSON.parse(JSON.stringify(filtro)));
				return [];
			},
		},
	});

	assert.equal(res.statusCode, 200);
	assert.deepEqual(res.body, { success: true, data: [] });
	assert.deepEqual(unidadeCalls, [SCOPED_UNIT_ID, OTHER_CLUSTER_FILIAL_ID]);
	assert.deepEqual(selectCalls, []);
});

test('listarFuncoesApi com unidade_id multipla deduplica principais e retorna shape expandido para fallback de modal', async () => {
	const unidadeCalls = [];
	const selectCalls = [];
	const unidades = {
		[SAME_CLUSTER_FILIAL_ID]: { _id: SAME_CLUSTER_FILIAL_ID, is_principal: false, unidade_principal_id: SAME_CLUSTER_PRINCIPAL_ID },
		[SAME_CLUSTER_PRINCIPAL_ID]: { _id: SAME_CLUSTER_PRINCIPAL_ID, is_principal: true },
		[SCOPED_UNIT_ID]: { _id: SCOPED_UNIT_ID, is_principal: false, unidade_principal_id: SAME_CLUSTER_PRINCIPAL_ID },
	};
	const { res } = await invokeOwner({
		reqOverrides: {
			query: { unidade_id: `${SAME_CLUSTER_FILIAL_ID}, ${SAME_CLUSTER_PRINCIPAL_ID}` },
			user: { role: 'diretor' },
			unitScope: { unidadeId: SCOPED_UNIT_ID },
		},
		bridgeOverrides: {
			findUnidadeUserBaseLean: async (unidadeId) => {
				unidadeCalls.push(unidadeId);
				return unidades[unidadeId] || null;
			},
			findFuncoesByFiltroSelectLean: async (filtro) => {
				selectCalls.push(JSON.parse(JSON.stringify(filtro)));
				return [
					{ _id: 'f-10', codigo: 'SUP', nome: 'Supervisor', descricao: '' },
					{ _id: 'f-11', codigo: 'C002', nome: 'C002', descricao: '   ' },
				];
			},
		},
	});

	assert.deepEqual(unidadeCalls, [
		SCOPED_UNIT_ID,
		SAME_CLUSTER_FILIAL_ID,
		SAME_CLUSTER_FILIAL_ID,
		SCOPED_UNIT_ID,
		SAME_CLUSTER_PRINCIPAL_ID,
		SAME_CLUSTER_PRINCIPAL_ID,
	]);
	assert.deepEqual(selectCalls, [{ unidade_principal_id: SAME_CLUSTER_PRINCIPAL_ID }]);
	assert.equal(res.statusCode, 200);
	assert.deepEqual(res.body, {
		success: true,
		data: [
			{
				_id: 'f-10',
				codigo: 'SUP',
				nome: 'Supervisor',
				descricao: '',
				descricao_display: 'Supervisor',
				descricao_final: 'Supervisor',
				hasDescricaoReal: false,
			},
			{
				_id: 'f-11',
				codigo: 'C002',
				nome: 'C002',
				descricao: '',
				descricao_display: 'C002',
				descricao_final: 'C002',
				hasDescricaoReal: false,
			},
		],
	});
});

test('listarFuncoesApi sem filtros retorna lista vazia', async () => {
	const filtroCalls = [];
	const selectCalls = [];
	const { res } = await invokeOwner({
		reqOverrides: {
			user: { role: 'admin' },
		},
		bridgeOverrides: {
			findFuncoesByFiltroLean: async (filtro) => {
				filtroCalls.push(filtro);
				return [];
			},
			findFuncoesByFiltroSelectLean: async (filtro) => {
				selectCalls.push(filtro);
				return [];
			},
		},
	});

	assert.equal(res.statusCode, 200);
	assert.deepEqual(res.body, { success: true, data: [] });
	assert.deepEqual(filtroCalls, []);
	assert.deepEqual(selectCalls, []);
});

test('listarFuncoesApi retorna 500 quando a busca lanca erro interno', async () => {
	const { res } = await invokeOwner({
		reqOverrides: {
			query: { unidade_cluster: SAME_CLUSTER_FILIAL_ID },
			user: { role: 'admin' },
		},
		bridgeOverrides: {
			findUnidadeUserBaseLean: async () => ({ _id: SAME_CLUSTER_FILIAL_ID, is_principal: false, unidade_principal_id: SAME_CLUSTER_PRINCIPAL_ID }),
			findFuncoesByFiltroLean: async () => {
				throw new Error('forced-funcoes-list-failure');
			},
		},
	});

	assert.equal(res.statusCode, 500);
	assert.deepEqual(res.body, {
		success: false,
		code: 'SERVER_ERROR',
		message: 'forced-funcoes-list-failure',
	});
});