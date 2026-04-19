import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/feedbackDetailApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

const FEEDBACK_ID = '507f1f77bcf86cd799439011';

function extractDetailOwnerSnippet(source) {
	const start = source.indexOf('export function createAdminFeedbackDetailHandler(');

	assert.ok(start >= 0, 'Nao foi possivel localizar o owner de detail admin de feedback.');

	return source
		.slice(start)
		.replace("import { processAdminFeedbackDetailCore } from './utils/processAdminFeedbackDetailCore.js';\r\n", '')
		.replace("import { processAdminFeedbackDetailCore } from './utils/processAdminFeedbackDetailCore.js';\n", '')
		.replace('export function createAdminFeedbackDetailHandler(', 'function createAdminFeedbackDetailHandler(');
}

function buildDelegatedDetailSnippet() {
	const original = extractDetailOwnerSnippet(CONTROLLER_SOURCE);
	if (original.includes('processAdminFeedbackDetailCore({')) {
		return original;
	}

	const coreBlockStart = original.indexOf('return apiOk(res, sanitizeFeedback(fb));');
	assert.ok(coreBlockStart >= 0, 'Nao foi possivel localizar o bloco atual de resposta do detail admin.');
	const coreBlock = 'return apiOk(res, sanitizeFeedback(fb));';

	const delegatedBlock = [
		'const detailResult = await processAdminFeedbackDetailCore({',
		'  feedback: fb,',
		'});',
		'return apiOk(res, detailResult?.feedback || fb);',
	].join('\n      ');

	const replaced = original.replace(coreBlock, delegatedBlock);
	assert.notEqual(replaced, original, 'Nao foi possivel instalar a seam estrutural de detail admin em memoria.');
	return replaced;
}

function makeResponseHelpers() {
	function send(res, status, payload) {
		res.status(status);
		res.json(payload);
		return res;
	}

	return {
		apiOk(res, data = null, extra = {}) {
			return send(res, 200, { ok: true, success: true, data, ...extra });
		},
		apiFail(res, status, message, extra = {}) {
			return send(res, status, { ok: false, success: false, error: message, message, ...extra });
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

function feedbackFixture(overrides = {}) {
	return {
		_id: FEEDBACK_ID,
		mensagem: 'Feedback admin detail',
		resposta: { texto: 'resposta legado objeto' },
		status: 'novo',
		criadoPor: {
			userId: '507f191e810c19729de860ea',
			email: 'admin.detail@test.local',
			nome: 'Admin Detail',
			role: 'user',
		},
		...overrides,
	};
}

function buildReq(overrides = {}) {
	const { params: paramsOverrides = {}, user: userOverrides = {}, ...restOverrides } = overrides;
	return {
		params: {
			feedbackId: FEEDBACK_ID,
			...paramsOverrides,
		},
		unitScope: {
			unidadeId: '507f191e810c19729de860ff',
		},
		user: {
			role: 'admin',
			isMaster: false,
			...userOverrides,
		},
		...restOverrides,
	};
}

function toPlainJson(value) {
	return JSON.parse(JSON.stringify(value));
}

function loadDetailOwnerHarness(runtimeOverrides = {}) {
	const snippet = buildDelegatedDetailSnippet();
	const responseHelpers = makeResponseHelpers();
	const callLog = {
		seamCalls: [],
		repositoryCalls: [],
		apiOkCalls: [],
		apiFailCalls: [],
		logErrorCalls: [],
		sanitizeCalls: [],
	};

	const deps = {
		isAdminLike: runtimeOverrides.isAdminLike ?? ((user) => !!(user && (user.isMaster || user.role === 'admin' || user.role === 'master'))),
		feedbackPolicy: runtimeOverrides.feedbackPolicy ?? {
			ensureAdminAccess: ({ currentUser, scopedUnitId } = {}) => ({
				allowed: deps.isAdminLike(currentUser),
				feedbackQueryOptions: scopedUnitId
					? { scopedUnitId, allowLegacyUnscoped: true, preferScopedRepoRead: true }
					: {},
			}),
		},
		apiOk: runtimeOverrides.apiOk ?? ((res, data = null, extra = {}) => {
			callLog.apiOkCalls.push([data, extra]);
			return responseHelpers.apiOk(res, data, extra);
		}),
		apiFail: runtimeOverrides.apiFail ?? ((res, status, message, extra = {}) => {
			callLog.apiFailCalls.push([status, message, extra]);
			return responseHelpers.apiFail(res, status, message, extra);
		}),
		findFeedbackByIdLean: runtimeOverrides.findFeedbackByIdLean ?? (async (id, options) => {
			callLog.repositoryCalls.push([id, options]);
			if (Object.prototype.hasOwnProperty.call(runtimeOverrides, 'findFeedbackResult')) {
				return runtimeOverrides.findFeedbackResult;
			}
			return feedbackFixture();
		}),
		sanitizeFeedback: runtimeOverrides.sanitizeFeedback ?? ((feedback) => {
			callLog.sanitizeCalls.push([feedback]);
			return {
				...feedback,
				resposta: 'resposta legado objeto',
			};
		}),
		processAdminFeedbackDetailCore:
			runtimeOverrides.processAdminFeedbackDetailCore ??
			(async (input) => {
				callLog.seamCalls.push(input);
				if (Object.prototype.hasOwnProperty.call(runtimeOverrides, 'seamResult')) {
					return runtimeOverrides.seamResult;
				}
				return { feedback: deps.sanitizeFeedback(input.feedback) };
			}),
		console: runtimeOverrides.console ?? {
			error(...args) {
				callLog.logErrorCalls.push(args);
			},
			log() {},
			warn() {},
		},
	};

	const factoryScript = new vm.Script(`(function (__deps) {
const isAdminLike = __deps.isAdminLike;
const feedbackPolicy = __deps.feedbackPolicy;
const apiOk = __deps.apiOk;
const apiFail = __deps.apiFail;
const findFeedbackByIdLean = __deps.findFeedbackByIdLean;
const sanitizeFeedback = __deps.sanitizeFeedback;
const processAdminFeedbackDetailCore = __deps.processAdminFeedbackDetailCore;
const console = __deps.console;
${snippet}
return {
	detailFeedbackAdmin: createAdminFeedbackDetailHandler({
		isAdminLike,
		apiOk,
		apiFail,
			feedbackPolicy,
		findFeedbackByIdLean,
		sanitizeFeedback,
	}),
};
})`);

	const factory = factoryScript.runInNewContext({});
	return {
		...factory(deps),
		callLog,
	};
}

test('feedback detail admin: ordem estrutural mantem owner antes da seam e resposta apos seam', () => {
	const snippet = buildDelegatedDetailSnippet();
	const adminPolicyIndex = snippet.indexOf('const access = feedbackPolicy.ensureAdminAccess({');
	const scopedUnitIndex = snippet.indexOf("scopedUnitId: String(req.unitScope?.unidadeId || '').trim(),");
	const adminGateIndex = snippet.indexOf("if (!access.allowed) return apiFail(res, 403, 'Acesso negado.');");
	const idValidationIndex = snippet.indexOf("if (!/^[0-9a-fA-F]{24}$/.test(id)) return apiFail(res, 400, 'ID inválido.');");
	const notFoundIndex = snippet.indexOf("if (!fb) return apiFail(res, 404, 'Feedback não encontrado.');");
	const seamIndex = snippet.indexOf('processAdminFeedbackDetailCore({');
	const responseIndex = snippet.indexOf('return apiOk(res,');

	assert.ok(adminPolicyIndex >= 0, 'Owner precisa preservar o gate admin via feedbackPolicy.');
	assert.ok(scopedUnitIndex >= 0, 'Owner precisa propagar scopedUnitId para o gate admin.');
	assert.ok(adminGateIndex >= 0, 'Owner precisa preservar o gate admin.');
	assert.ok(idValidationIndex >= 0, 'Owner precisa preservar a validacao de id.');
	assert.ok(notFoundIndex >= 0, 'Owner precisa preservar a traducao de feedback nao encontrado.');
	assert.ok(seamIndex >= 0, 'Seam de detail admin precisa existir no meio do fluxo em memoria.');
	assert.ok(responseIndex >= 0, 'Owner precisa preservar a resposta HTTP final.');
	assert.ok(adminPolicyIndex < adminGateIndex, 'Resolucao de acesso deve ocorrer antes do gate admin.');
	assert.ok(adminGateIndex < seamIndex, 'Gate admin deve ocorrer antes da seam.');
	assert.ok(idValidationIndex < seamIndex, 'Validacao de id deve ocorrer antes da seam.');
	assert.ok(notFoundIndex < seamIndex, 'Traducao 404 deve ocorrer antes da seam.');
	assert.ok(seamIndex < responseIndex, 'Resposta HTTP final deve permanecer no owner apos a seam.');
});

test('feedback detail admin: owner preserva gate admin antes da seam', async () => {
	const { detailFeedbackAdmin, callLog } = loadDetailOwnerHarness({
		processAdminFeedbackDetailCore: async () => {
			throw new Error('nao deve delegar detail admin sem autorizacao');
		},
	});

	const req = buildReq({ user: { role: 'user', isMaster: false } });
	const res = makeRes();

	await detailFeedbackAdmin(req, res);

	assert.equal(res.statusCode, 403);
	assert.deepEqual(toPlainJson(res.body), {
		ok: false,
		success: false,
		error: 'Acesso negado.',
		message: 'Acesso negado.',
	});
	assert.equal(callLog.repositoryCalls.length, 0);
	assert.equal(callLog.seamCalls.length, 0);
	assert.equal(callLog.apiOkCalls.length, 0);
});

test('feedback detail admin: owner preserva validacao de id antes da seam', async () => {
	const { detailFeedbackAdmin, callLog } = loadDetailOwnerHarness({
		processAdminFeedbackDetailCore: async () => {
			throw new Error('nao deve delegar detail admin com id invalido');
		},
	});

	const req = buildReq({ params: { feedbackId: 'id-malformado' } });
	const res = makeRes();

	await detailFeedbackAdmin(req, res);

	assert.equal(res.statusCode, 400);
	assert.deepEqual(toPlainJson(res.body), {
		ok: false,
		success: false,
		error: 'ID inválido.',
		message: 'ID inválido.',
	});
	assert.equal(callLog.repositoryCalls.length, 0);
	assert.equal(callLog.seamCalls.length, 0);
	assert.equal(callLog.apiOkCalls.length, 0);
});

test('feedback detail admin: owner traduz feedback nao encontrado antes da seam', async () => {
	const { detailFeedbackAdmin, callLog } = loadDetailOwnerHarness({
		findFeedbackResult: null,
		processAdminFeedbackDetailCore: async () => {
			throw new Error('nao deve delegar detail admin sem feedback carregado');
		},
	});

	const req = buildReq();
	const res = makeRes();

	await detailFeedbackAdmin(req, res);

	assert.equal(res.statusCode, 404);
	assert.deepEqual(toPlainJson(res.body), {
		ok: false,
		success: false,
		error: 'Feedback não encontrado.',
		message: 'Feedback não encontrado.',
	});
	assert.deepEqual(toPlainJson(callLog.repositoryCalls), [[FEEDBACK_ID, {
		scopedUnitId: '507f191e810c19729de860ff',
		allowLegacyUnscoped: true,
		preferScopedRepoRead: true,
	}]]);
	assert.equal(callLog.seamCalls.length, 0);
	assert.equal(callLog.apiOkCalls.length, 0);
});

test('feedback detail admin: seam recebe apenas o feedback carregado e devolve payload final saneado', async () => {
	const feedback = feedbackFixture();
	const sanitizedFeedback = feedbackFixture({ resposta: 'resposta legado objeto' });
	const req = buildReq();
	const res = makeRes();

	const { detailFeedbackAdmin, callLog } = loadDetailOwnerHarness({
		findFeedbackResult: feedback,
		seamResult: { feedback: sanitizedFeedback },
	});

	await detailFeedbackAdmin(req, res);

	assert.equal(res.statusCode, 200);
	assert.equal(callLog.seamCalls.length, 1);
	assert.deepEqual(Object.keys(callLog.seamCalls[0]).sort(), ['feedback']);
	assert.deepEqual(toPlainJson(callLog.seamCalls[0]), {
		feedback: toPlainJson(feedback),
	});
	assert.deepEqual(toPlainJson(res.body), {
		ok: true,
		success: true,
		data: toPlainJson(sanitizedFeedback),
	});
	assert.equal(callLog.apiFailCalls.length, 0);
	assert.equal(callLog.apiOkCalls.length, 1);
});

test('feedback detail admin: owner trata erro externo com apiFail 500', async () => {
	const feedback = feedbackFixture();
	const req = buildReq();
	const res = makeRes();

	const { detailFeedbackAdmin, callLog } = loadDetailOwnerHarness({
		findFeedbackResult: feedback,
		processAdminFeedbackDetailCore: async (input) => {
			callLog.seamCalls.push(input);
			throw new Error('falha externa de detail admin');
		},
	});

	await detailFeedbackAdmin(req, res);

	assert.equal(res.statusCode, 500);
	assert.deepEqual(toPlainJson(res.body), {
		ok: false,
		success: false,
		error: 'Erro ao detalhar.',
		message: 'Erro ao detalhar.',
	});
	assert.equal(callLog.seamCalls.length, 1);
	assert.equal(callLog.apiOkCalls.length, 0);
	assert.equal(callLog.logErrorCalls.length, 1);
	assert.match(String(callLog.logErrorCalls[0][0] || ''), /GET \/api\/gestor\/feedback\/:id erro:/);
});