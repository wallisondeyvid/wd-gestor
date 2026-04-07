import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/recursoApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

const RESOURCE_ID = '507f1f77bcf86cd799439011';
const CONTEXTUAL_UNIT_ID = '507f191e810c19729de860ea';
const OUT_OF_SCOPE_UNIT_ID = '507f191e810c19729de860eb';

function extractUpdateOwnerSnippet(source) {
	const start = source.indexOf('function normalizeUnitId(');
	const end = source.indexOf('export async function deleteRecurso(', start);

	assert.ok(start >= 0, 'Nao foi possivel localizar o inicio do recorte de recursos.');
	assert.ok(end > start, 'Nao foi possivel localizar o fim do recorte de updateRecurso.');

	return source
		.slice(start, end)
		.replace(/export\s+async\s+function\s+/g, 'async function ');
}

function buildDelegatedUpdateSnippet() {
	const original = extractUpdateOwnerSnippet(CONTROLLER_SOURCE);
	if (original.includes('const updateValidation = await processUpdateRecursoCore({')) {
		return original;
	}

	const coreBlockPattern = /const updateValidation = await recursoWriteValidation\.validateUpdate\(\{\s*id: req\.params\.id,\s*unidadeEfetiva,\s*recurso,\s*tipo,\s*placa,\s*chassi,\s*renavam,\s*ano,\s*mod,\s*marca,\s*modelo,\s*cor,\s*ativo,\s*\}\);\s*if \(updateValidation\?\.error === 'invalid_placa_format'\) return badRequest\(res, 'Formato de placa inválido\. Use ABC-1234 ou ABC-1D34'\);\s*if \(updateValidation\?\.error === 'duplicate_placa'\) return badRequest\(res, 'Placa já cadastrada para outro recurso'\);\s*if \(updateValidation\?\.error === 'duplicate_chassi'\) return badRequest\(res, 'Chassi já cadastrado para outro recurso'\);\s*if \(updateValidation\?\.error === 'duplicate_renavam'\) return badRequest\(res, 'RENAVAM já cadastrado para outro recurso'\);\s*const updateResult = await updateRecursoByIdComUnidadeNome\(\s*req\.params\.id,\s*updateValidation\.data,\s*unidadeEfetiva \|\| null,\s*\);\s*if \(!updateResult\) return notFound\(res, 'Recurso não encontrado'\);\s*return ok\(res, updateResult\);/s;
	assert.match(original, coreBlockPattern, 'Nao foi possivel localizar o bloco atual de updateRecurso.');

	const delegatedBlock = [
		'const updateValidation = await processUpdateRecursoCore({',
		'  id: req.params.id,',
		'  unidadeEfetiva,',
		'  recurso,',
		'  tipo,',
		'  placa,',
		'  chassi,',
		'  renavam,',
		'  ano,',
		'  mod,',
		'  marca,',
		'  modelo,',
		'  cor,',
		'  ativo,',
		'});',
		"if (updateValidation?.error === 'invalid_placa_format') return badRequest(res, 'Formato de placa inválido. Use ABC-1234 ou ABC-1D34');",
		"if (updateValidation?.error === 'duplicate_placa') return badRequest(res, 'Placa já cadastrada para outro recurso');",
		"if (updateValidation?.error === 'duplicate_chassi') return badRequest(res, 'Chassi já cadastrado para outro recurso');",
		"if (updateValidation?.error === 'duplicate_renavam') return badRequest(res, 'RENAVAM já cadastrado para outro recurso');",
		'const updateResult = await updateRecursoByIdComUnidadeNome(',
		'  req.params.id,',
		'  updateValidation.data,',
		'  unidadeEfetiva || null,',
		');',
		"if (!updateResult) return notFound(res, 'Recurso não encontrado');",
		'return ok(res, updateResult);',
	].join('\n\t\t');

	const replaced = original.replace(coreBlockPattern, delegatedBlock);
	assert.notEqual(replaced, original, 'Nao foi possivel instalar a seam estrutural de updateRecurso em memoria.');
	return replaced;
}

function makeResponseHelpers() {
	function send(res, status, payload) {
		res.status(status);
		res.json(payload);
		return res;
	}

	return {
		ok(res, payload = {}) {
			return send(res, 200, { success: true, data: payload });
		},
		badRequest(res, message = 'Requisicao invalida') {
			return send(res, 400, { success: false, code: 'BAD_REQUEST', message });
		},
		notFound(res, message = 'Nao encontrado') {
			return send(res, 404, { success: false, code: 'NOT_FOUND', message });
		},
		serverError(res, error) {
			const message = typeof error === 'string' ? error : error?.message || 'Erro interno';
			return send(res, 500, { success: false, code: 'SERVER_ERROR', message });
		},
	};
}

function makeRes() {
	return {
		statusCode: 200,
		body: null,
		status(code) {
			this.statusCode = code;
			return this;
		},
		json(payload) {
			this.body = payload;
			return this;
		},
	};
}

function existingResource(overrides = {}) {
	return {
		_id: RESOURCE_ID,
		unidade_id: CONTEXTUAL_UNIT_ID,
		tipo: 'carro',
		placa: 'ABC-1D34',
		chassi: '9BWZZZ377VT004251',
		renavam: '12345678901',
		ano: 2024,
		mod: 2025,
		marca: 'Fiat',
		modelo: 'Argo',
		cor: 'Branco',
		ativo: true,
		...overrides,
	};
}

function validBody(overrides = {}) {
	return {
		unidade_id: CONTEXTUAL_UNIT_ID,
		tipo: 'carro',
		placa: 'ABC-1D34',
		chassi: '9BWZZZ377VT004251',
		renavam: '12345678901',
		ano: '2024',
		mod: '2025',
		marca: 'Fiat',
		modelo: 'Argo',
		cor: 'Branco',
		ativo: true,
		...overrides,
	};
}

function buildReq(overrides = {}) {
	return {
		body: validBody(),
		params: { id: RESOURCE_ID },
		query: {},
		unitScope: null,
		session: { user: { role: 'admin' } },
		user: { role: 'admin', isMaster: false },
		...overrides,
		body: {
			...validBody(),
			...(overrides.body || {}),
		},
		params: {
			id: RESOURCE_ID,
			...(overrides.params || {}),
		},
		session: {
			user: { role: 'admin' },
			...(overrides.session || {}),
		},
	};
}

function toPlainJson(value) {
	return JSON.parse(JSON.stringify(value));
}

function loadUpdateOwnerHarness(runtimeOverrides = {}) {
	const snippet = buildDelegatedUpdateSnippet();
	const responseHelpers = makeResponseHelpers();
	const callLog = {
		seamCalls: [],
		findRecursoByIdComUnidadeNomeCalls: [],
		findOutroRecursoByPlacaUpperCalls: [],
		findOutroRecursoByChassiUpperCalls: [],
		findOutroRecursoByRenavamCalls: [],
		updateRecursoByIdComUnidadeNomeCalls: [],
		okCalls: [],
		consoleErrors: [],
	};

	const deps = {
		findUnidadeUserBaseLean: runtimeOverrides.findUnidadeUserBaseLean ?? (async () => null),
		findUnidadesByCondLean: runtimeOverrides.findUnidadesByCondLean ?? (async () => []),
		findRecursosByFiltroComUnidadeLean: runtimeOverrides.findRecursosByFiltroComUnidadeLean ?? (async () => []),
		ok: runtimeOverrides.ok ?? ((res, payload = {}) => {
			callLog.okCalls.push([payload]);
			return responseHelpers.ok(res, payload);
		}),
		badRequest: runtimeOverrides.badRequest ?? responseHelpers.badRequest,
		notFound: runtimeOverrides.notFound ?? responseHelpers.notFound,
		serverError: runtimeOverrides.serverError ?? responseHelpers.serverError,
		findRecursoByIdComUnidadeNome: runtimeOverrides.findRecursoByIdComUnidadeNome ?? (async (...args) => {
			callLog.findRecursoByIdComUnidadeNomeCalls.push(args);
			return existingResource();
		}),
		findOutroRecursoByPlacaUpper: runtimeOverrides.findOutroRecursoByPlacaUpper ?? (async (...args) => {
			callLog.findOutroRecursoByPlacaUpperCalls.push(args);
			return null;
		}),
		findOutroRecursoByChassiUpper: runtimeOverrides.findOutroRecursoByChassiUpper ?? (async (...args) => {
			callLog.findOutroRecursoByChassiUpperCalls.push(args);
			return null;
		}),
		findOutroRecursoByRenavam: runtimeOverrides.findOutroRecursoByRenavam ?? (async (...args) => {
			callLog.findOutroRecursoByRenavamCalls.push(args);
			return null;
		}),
		updateRecursoByIdComUnidadeNome: runtimeOverrides.updateRecursoByIdComUnidadeNome ?? (async (...args) => {
			callLog.updateRecursoByIdComUnidadeNomeCalls.push(args);
			return existingResource();
		}),
		processUpdateRecursoCore: runtimeOverrides.processUpdateRecursoCore ?? (async (input) => {
			callLog.seamCalls.push(input);
			return { data: input };
		}),
		createRecursoContextPolicyCore: runtimeOverrides.createRecursoContextPolicyCore ?? (() => ({
			shouldBlockForMissingContext(context) {
				const role = context?.currentUser?.role || context?.sessionUser?.role || null;
				const isPrivileged = role === 'admin' || role === 'master' || context?.currentUser?.isMaster === true;
				return !isPrivileged && !context?.scopedUnitId;
			},
			resolveCanonicalContextUnitId(context) {
				return context?.scopedUnitId || null;
			},
			ensureRequestedUnitAccess(context) {
				const role = context?.currentUser?.role || context?.sessionUser?.role || null;
				const isPrivileged = role === 'admin' || role === 'master' || context?.currentUser?.isMaster === true;
				if (isPrivileged) {
					return { allowed: true, effectiveUnitId: context?.requestedUnitId || null };
				}
				if (context?.scopedUnitId && context?.requestedUnitId === context.scopedUnitId) {
					return { allowed: true, effectiveUnitId: context.scopedUnitId };
				}
				return { allowed: false, effectiveUnitId: null };
			},
		})),
		createRecursoWriteValidationCore: runtimeOverrides.createRecursoWriteValidationCore ?? (() => ({
			validateCreate: async () => ({ data: {} }),
			validateUpdate: async (input) => runtimeOverrides.processUpdateRecursoCore
				? runtimeOverrides.processUpdateRecursoCore(input)
				: deps.processUpdateRecursoCore(input),
		})),
		console: runtimeOverrides.console ?? {
			error(...args) {
				callLog.consoleErrors.push(args);
			},
			log() {},
			warn() {},
		},
	};

	const factoryScript = new vm.Script(`(function (__deps) {
const ok = __deps.ok;
const badRequest = __deps.badRequest;
const notFound = __deps.notFound;
const serverError = __deps.serverError;
const findUnidadeUserBaseLean = __deps.findUnidadeUserBaseLean;
const findUnidadesByCondLean = __deps.findUnidadesByCondLean;
const findRecursosByFiltroComUnidadeLean = __deps.findRecursosByFiltroComUnidadeLean;
const findRecursoByIdComUnidadeNome = __deps.findRecursoByIdComUnidadeNome;
const findOutroRecursoByPlacaUpper = __deps.findOutroRecursoByPlacaUpper;
const findOutroRecursoByChassiUpper = __deps.findOutroRecursoByChassiUpper;
const findOutroRecursoByRenavam = __deps.findOutroRecursoByRenavam;
const updateRecursoByIdComUnidadeNome = __deps.updateRecursoByIdComUnidadeNome;
const createRecursoContextPolicyCore = __deps.createRecursoContextPolicyCore;
const createRecursoWriteValidationCore = __deps.createRecursoWriteValidationCore;
const processUpdateRecursoCore = __deps.processUpdateRecursoCore;
const console = __deps.console;
${snippet}
return { updateRecurso };
})`);

	const factory = factoryScript.runInNewContext({});

	return {
		...factory(deps),
		callLog,
	};
}

test('updateRecurso: owner preserva bloqueio por falta de contexto canonico antes da seam', async () => {
	const { updateRecurso, callLog } = loadUpdateOwnerHarness({
		processUpdateRecursoCore: async () => {
			throw new Error('nao deve delegar update sem contexto canonico');
		},
	});

	const req = buildReq({
		user: { role: 'diretor', isMaster: false },
		session: { user: {} },
		unitScope: null,
	});
	const res = makeRes();

	await updateRecurso(req, res);

	assert.equal(res.statusCode, 404);
	assert.deepEqual(toPlainJson(res.body), {
		success: false,
		code: 'NOT_FOUND',
		message: 'Unidade não encontrada',
	});
	assert.equal(callLog.seamCalls.length, 0);
	assert.equal(callLog.findRecursoByIdComUnidadeNomeCalls.length, 0);
	assert.equal(callLog.okCalls.length, 0);
});

test('updateRecurso: owner preserva unidade obrigatoria e valida antes da seam', async () => {
	for (const [body, message] of [
		[validBody({ unidade_id: '' }), 'Unidade é obrigatória'],
		[validBody({ unidade_id: 'invalida' }), 'Unidade inválida'],
	]) {
		const { updateRecurso, callLog } = loadUpdateOwnerHarness({
			processUpdateRecursoCore: async () => {
				throw new Error('nao deve delegar update com unidade invalida');
			},
		});

		const req = buildReq({
			user: { role: 'admin', isMaster: false },
			body,
		});
		const res = makeRes();

		await updateRecurso(req, res);

		assert.equal(res.statusCode, 400);
		assert.deepEqual(toPlainJson(res.body), {
			success: false,
			code: 'BAD_REQUEST',
			message,
		});
		assert.equal(callLog.seamCalls.length, 0);
		assert.equal(callLog.findRecursoByIdComUnidadeNomeCalls.length, 0);
	}
});

test('updateRecurso: owner preserva validacao de id antes do lookup e da seam', async () => {
	const { updateRecurso, callLog } = loadUpdateOwnerHarness({
		processUpdateRecursoCore: async () => {
			throw new Error('nao deve delegar update com id invalido');
		},
	});

	const req = buildReq({
		user: { role: 'admin', isMaster: false },
		params: { id: 'invalido' },
	});
	const res = makeRes();

	await updateRecurso(req, res);

	assert.equal(res.statusCode, 400);
	assert.deepEqual(toPlainJson(res.body), {
		success: false,
		code: 'BAD_REQUEST',
		message: 'ID inválido',
	});
	assert.equal(callLog.seamCalls.length, 0);
	assert.equal(callLog.findRecursoByIdComUnidadeNomeCalls.length, 0);
});

test('updateRecurso: owner preserva gate contextual da unidade antes da seam', async () => {
	const { updateRecurso, callLog } = loadUpdateOwnerHarness({
		processUpdateRecursoCore: async () => {
			throw new Error('nao deve delegar update fora do contexto');
		},
	});

	const req = buildReq({
		user: { role: 'diretor', isMaster: false },
		unitScope: { unidadeId: CONTEXTUAL_UNIT_ID },
		body: validBody({ unidade_id: OUT_OF_SCOPE_UNIT_ID }),
	});
	const res = makeRes();

	await updateRecurso(req, res);

	assert.equal(res.statusCode, 404);
	assert.deepEqual(toPlainJson(res.body), {
		success: false,
		code: 'NOT_FOUND',
		message: 'Unidade não encontrada',
	});
	assert.equal(callLog.seamCalls.length, 0);
	assert.equal(callLog.findRecursoByIdComUnidadeNomeCalls.length, 0);
});

test('updateRecurso: owner preserva lookup escopado do recurso existente antes da seam', async () => {
	const { updateRecurso, callLog } = loadUpdateOwnerHarness({
		findRecursoByIdComUnidadeNome: async (...args) => {
			callLog.findRecursoByIdComUnidadeNomeCalls.push(args);
			return null;
		},
		processUpdateRecursoCore: async () => {
			throw new Error('nao deve delegar update sem recurso existente');
		},
	});

	const req = buildReq({
		user: { role: 'admin', isMaster: false },
	});
	const res = makeRes();

	await updateRecurso(req, res);

	assert.deepEqual(toPlainJson(callLog.findRecursoByIdComUnidadeNomeCalls), [[RESOURCE_ID, CONTEXTUAL_UNIT_ID]]);
	assert.equal(res.statusCode, 404);
	assert.deepEqual(toPlainJson(res.body), {
		success: false,
		code: 'NOT_FOUND',
		message: 'Recurso não encontrado',
	});
	assert.equal(callLog.seamCalls.length, 0);
	assert.equal(callLog.okCalls.length, 0);
});

test('updateRecurso: owner traduz invalid_placa_format vindo da seam baseada em validateUpdate', async () => {
	const { updateRecurso, callLog } = loadUpdateOwnerHarness({
		processUpdateRecursoCore: async (input) => {
			callLog.seamCalls.push(input);
			return { error: 'invalid_placa_format' };
		},
	});

	const req = buildReq({
		user: { role: 'diretor', isMaster: false },
		unitScope: { unidadeId: CONTEXTUAL_UNIT_ID },
		body: validBody({ placa: 'ABC1234' }),
	});
	const res = makeRes();

	await updateRecurso(req, res);

	assert.equal(res.statusCode, 400);
	assert.deepEqual(toPlainJson(res.body), {
		success: false,
		code: 'BAD_REQUEST',
		message: 'Formato de placa inválido. Use ABC-1234 ou ABC-1D34',
	});
	assert.equal(callLog.seamCalls.length, 1);
	assert.equal(callLog.updateRecursoByIdComUnidadeNomeCalls.length, 0);
	assert.equal(callLog.okCalls.length, 0);
});

test('updateRecurso: owner traduz conflitos vindos da seam sem delegar HTTP', async () => {
	const cases = [
		['duplicate_placa', 'Placa já cadastrada para outro recurso'],
		['duplicate_chassi', 'Chassi já cadastrado para outro recurso'],
		['duplicate_renavam', 'RENAVAM já cadastrado para outro recurso'],
	];

	for (const [errorKind, message] of cases) {
		let seamArgs = null;
		const { updateRecurso, callLog } = loadUpdateOwnerHarness({
			processUpdateRecursoCore: async (input) => {
				callLog.seamCalls.push(input);
				seamArgs = input;
				return { error: errorKind };
			},
		});

		const req = buildReq({
			user: { role: 'diretor', isMaster: false },
			unitScope: { unidadeId: CONTEXTUAL_UNIT_ID },
			body: validBody({
				placa: 'ZZZ-9Z99',
				chassi: '9BWZZZ377VT004252',
				renavam: '10987654321',
				ano: '2026',
				mod: '2027',
				marca: 'Toyota',
				modelo: 'Corolla',
				cor: 'Preto',
				ativo: false,
			}),
		});
		const res = makeRes();

		await updateRecurso(req, res);

		assert.ok(seamArgs, 'A seam futura deve receber apenas o nucleo canonizado apos o lookup.');
		assert.deepEqual(Object.keys(seamArgs).sort(), [
			'ano',
			'ativo',
			'chassi',
			'cor',
			'id',
			'marca',
			'mod',
			'modelo',
			'placa',
			'recurso',
			'renavam',
			'tipo',
			'unidadeEfetiva',
		].sort());
		assert.equal(seamArgs.id, RESOURCE_ID);
		assert.equal(seamArgs.unidadeEfetiva, CONTEXTUAL_UNIT_ID);
		assert.deepEqual(toPlainJson(seamArgs.recurso), existingResource());
		assert.equal(seamArgs.tipo, 'carro');
		assert.equal(seamArgs.placa, 'ZZZ-9Z99');
		assert.equal(seamArgs.chassi, '9BWZZZ377VT004252');
		assert.equal(seamArgs.renavam, '10987654321');
		assert.equal(seamArgs.ano, '2026');
		assert.equal(seamArgs.mod, '2027');
		assert.equal(seamArgs.marca, 'Toyota');
		assert.equal(seamArgs.modelo, 'Corolla');
		assert.equal(seamArgs.cor, 'Preto');
		assert.equal(seamArgs.ativo, false);
		assert.equal('req' in seamArgs, false);
		assert.equal('res' in seamArgs, false);
		assert.equal('ok' in seamArgs, false);
		assert.equal('badRequest' in seamArgs, false);
		assert.equal('notFound' in seamArgs, false);
		assert.equal('serverError' in seamArgs, false);
		assert.equal(res.statusCode, 400);
		assert.deepEqual(toPlainJson(res.body), {
			success: false,
			code: 'BAD_REQUEST',
			message,
		});
		assert.equal(callLog.okCalls.length, 0);
		assert.equal(callLog.findOutroRecursoByPlacaUpperCalls.length, 0);
		assert.equal(callLog.findOutroRecursoByChassiUpperCalls.length, 0);
		assert.equal(callLog.findOutroRecursoByRenavamCalls.length, 0);
	}
});

test('updateRecurso: owner preserva ordem estrutural owner -> seam -> response final de sucesso', async () => {
	const callOrder = [];
	let seamArgs = null;
	const atualizado = existingResource({
		placa: 'ZZZ-9Z99',
		chassi: '9BWZZZ377VT004252',
		renavam: '10987654321',
		ano: 2026,
		mod: 2027,
		marca: 'Toyota',
		modelo: 'Corolla',
		cor: 'Preto',
		ativo: false,
	});

	const { updateRecurso, callLog } = loadUpdateOwnerHarness({
		ok: (res, payload = {}) => {
			callOrder.push('ok');
			callLog.okCalls.push([payload]);
			return makeResponseHelpers().ok(res, payload);
		},
		processUpdateRecursoCore: async (input) => {
			callOrder.push('seam');
			callLog.seamCalls.push(input);
			seamArgs = input;

			return {
				data: {
					unidade_id: input.unidadeEfetiva,
					tipo: input.tipo,
					placa: input.placa,
					chassi: input.chassi,
					renavam: input.renavam,
					ano: parseInt(input.ano),
					mod: parseInt(input.mod),
					marca: input.marca,
					modelo: input.modelo,
					cor: input.cor,
					ativo: input.ativo,
				},
			};
		},
		updateRecursoByIdComUnidadeNome: async (...args) => {
			callLog.updateRecursoByIdComUnidadeNomeCalls.push(args);
			return atualizado;
		},
	});

	const req = buildReq({
		user: { role: 'diretor', isMaster: false },
		unitScope: { unidadeId: CONTEXTUAL_UNIT_ID },
		body: validBody({
			placa: 'ZZZ-9Z99',
			chassi: '9BWZZZ377VT004252',
			renavam: '10987654321',
			ano: '2026',
			mod: '2027',
			marca: 'Toyota',
			modelo: 'Corolla',
			cor: 'Preto',
			ativo: false,
		}),
	});
	const res = makeRes();

	await updateRecurso(req, res);

	assert.ok(seamArgs, 'A seam futura deve ser chamada no caminho de sucesso.');
	assert.deepEqual(callOrder, ['seam', 'ok']);
	assert.deepEqual(toPlainJson(callLog.updateRecursoByIdComUnidadeNomeCalls), [[
		RESOURCE_ID,
		{
			unidade_id: CONTEXTUAL_UNIT_ID,
			tipo: 'carro',
			placa: 'ZZZ-9Z99',
			chassi: '9BWZZZ377VT004252',
			renavam: '10987654321',
			ano: 2026,
			mod: 2027,
			marca: 'Toyota',
			modelo: 'Corolla',
			cor: 'Preto',
			ativo: false,
		},
		CONTEXTUAL_UNIT_ID,
	]]);
	assert.deepEqual(Object.keys(seamArgs).sort(), [
		'ano',
		'ativo',
		'chassi',
		'cor',
		'id',
		'marca',
		'mod',
		'modelo',
		'placa',
		'recurso',
		'renavam',
		'tipo',
		'unidadeEfetiva',
	].sort());
	assert.equal(res.statusCode, 200);
	assert.deepEqual(toPlainJson(res.body), {
		success: true,
		data: atualizado,
	});
});

test('updateRecurso: owner preserva serverError quando a seam falha com erro externo generico', async () => {
	const { updateRecurso, callLog } = loadUpdateOwnerHarness({
		processUpdateRecursoCore: async (input) => {
			callLog.seamCalls.push(input);
			throw new Error('forced-recursos-update-structural-failure');
		},
	});

	const req = buildReq({
		user: { role: 'diretor', isMaster: false },
		unitScope: { unidadeId: CONTEXTUAL_UNIT_ID },
	});
	const res = makeRes();

	await updateRecurso(req, res);

	assert.equal(callLog.seamCalls.length, 1);
	assert.equal(callLog.consoleErrors.length, 1);
	assert.equal(res.statusCode, 500);
	assert.deepEqual(toPlainJson(res.body), {
		success: false,
		code: 'SERVER_ERROR',
		message: 'forced-recursos-update-structural-failure',
	});
});