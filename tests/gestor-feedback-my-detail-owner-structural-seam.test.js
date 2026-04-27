import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/feedbackMyDetailApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

const FEEDBACK_ID = '507f1f77bcf86cd799439011';
const CREATOR_ID = '507f191e810c19729de860ea';
const OTHER_USER_ID = '507f191e810c19729de860eb';

function extractMyDetailOwnerSnippet(source) {
	const start = source.indexOf('export function createMyFeedbackDetailHandler(');

	assert.ok(start >= 0, 'Nao foi possivel localizar o owner de meu detalhe de feedback.');

	return source
		.slice(start)
		.replace("import { processMyFeedbackDetailOwnershipCore } from './utils/processMyFeedbackDetailOwnershipCore.js';\r\n", '')
		.replace("import { processMyFeedbackDetailOwnershipCore } from './utils/processMyFeedbackDetailOwnershipCore.js';\n", '')
		.replace('export function createMyFeedbackDetailHandler(', 'function createMyFeedbackDetailHandler(');
}

function buildDelegatedMyDetailSnippet() {
	const original = extractMyDetailOwnerSnippet(CONTROLLER_SOURCE);
	assert.match(
		original,
		/const ownershipResult = feedbackPolicy\.ensureCreatorOwnership\(\{[\s\S]*?currentUser: req\.user \|\| null,[\s\S]*?\}\);/,
		'Nao foi possivel localizar o bloco atual de ownership de meu detalhe.'
	);
	return original;
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
		mensagem: 'Feedback de ownership',
		criadoPor: {
			userId: CREATOR_ID,
			email: 'creator.feedback@test.local',
			nome: 'Creator Feedback',
			role: 'user',
		},
		status: 'novo',
		...overrides,
	};
}

function buildReq(overrides = {}) {
	const { params: paramsOverrides = {}, user: userOverrides = {}, unitScope: unitScopeOverrides = {}, ...restOverrides } = overrides;
	return {
		params: {
			feedbackId: FEEDBACK_ID,
			...paramsOverrides,
		},
		unitScope: {
			unidadeId: '507f191e810c19729de860ff',
			...unitScopeOverrides,
		},
		user: {
			_id: CREATOR_ID,
			id: CREATOR_ID,
			email: 'creator.feedback@test.local',
			nome: 'Creator Feedback',
			role: 'user',
			...userOverrides,
		},
		...restOverrides,
	};
}

function toPlainJson(value) {
	return JSON.parse(JSON.stringify(value));
}

function loadMyDetailOwnerHarness(runtimeOverrides = {}) {
	const snippet = buildDelegatedMyDetailSnippet();
	const responseHelpers = makeResponseHelpers();
	const callLog = {
		seamCalls: [],
		repositoryCalls: [],
		apiOkCalls: [],
		apiFailCalls: [],
		logErrorCalls: [],
	};

	const deps = {
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
		feedbackPolicy:
			runtimeOverrides.feedbackPolicy ??
			{
				ensureCreatorOwnership(input) {
					callLog.seamCalls.push(input);
					if (Object.prototype.hasOwnProperty.call(runtimeOverrides, 'seamResult')) {
						return runtimeOverrides.seamResult;
					}
					return { allowed: true };
				},
			},
		console: runtimeOverrides.console ?? {
			error(...args) {
				callLog.logErrorCalls.push(args);
			},
			log() {},
			warn() {},
		},
	};

	const factoryScript = new vm.Script(`(function (__deps) {
const apiOk = __deps.apiOk;
const apiFail = __deps.apiFail;
const findFeedbackByIdLean = __deps.findFeedbackByIdLean;
const feedbackPolicy = __deps.feedbackPolicy;
const console = __deps.console;
${snippet}
return {
	detailMyFeedback: createMyFeedbackDetailHandler({
		apiOk,
		apiFail,
		feedbackPolicy,
		findFeedbackByIdLean,
	}),
};
})`);

	const factory = factoryScript.runInNewContext({});
	return {
		...factory(deps),
		callLog,
	};
}

test('feedback my detail: ordem estrutural mantem owner antes da seam e resposta apos seam', () => {
	const snippet = buildDelegatedMyDetailSnippet();
	const idValidationIndex = snippet.indexOf("if (!/^[0-9a-fA-F]{24}$/.test(id)) return apiFail(res, 400, 'ID inválido.');");
	const notFoundIndex = snippet.indexOf("if (!fb) return apiFail(res, 404, 'Feedback não encontrado.');");
	const seamIndex = snippet.indexOf('feedbackPolicy.ensureCreatorOwnership({');
	const responseIndex = snippet.indexOf('return apiOk(res,');

	assert.ok(idValidationIndex >= 0, 'Owner precisa preservar a validacao de id.');
	assert.ok(notFoundIndex >= 0, 'Owner precisa preservar a traducao de feedback nao encontrado.');
	assert.ok(seamIndex >= 0, 'Seam de ownership precisa existir no meio do fluxo em memoria.');
	assert.ok(responseIndex >= 0, 'Owner precisa preservar a resposta HTTP final.');
	assert.ok(idValidationIndex < seamIndex, 'Validacao de id deve ocorrer antes da seam.');
	assert.ok(notFoundIndex < seamIndex, 'Traducao 404 deve ocorrer antes da seam.');
	assert.ok(seamIndex < responseIndex, 'Resposta HTTP final deve permanecer no owner apos a seam.');
});

test('feedback my detail: owner preserva validacao de id antes da seam', async () => {
	const { detailMyFeedback, callLog } = loadMyDetailOwnerHarness({
		feedbackPolicy: {
			ensureCreatorOwnership() {
				throw new Error('nao deve delegar ownership com id invalido');
			},
		},
	});

	const req = buildReq({ params: { feedbackId: 'id-malformado' } });
	const res = makeRes();

	await detailMyFeedback(req, res);

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

test('feedback my detail: owner traduz feedback nao encontrado antes da seam', async () => {
	const { detailMyFeedback, callLog } = loadMyDetailOwnerHarness({
		findFeedbackResult: null,
		feedbackPolicy: {
			ensureCreatorOwnership() {
				throw new Error('nao deve delegar ownership sem feedback carregado');
			},
		},
	});

	const req = buildReq();
	const res = makeRes();

	await detailMyFeedback(req, res);

	assert.equal(res.statusCode, 404);
	assert.deepEqual(toPlainJson(res.body), {
		ok: false,
		success: false,
		error: 'Feedback não encontrado.',
		message: 'Feedback não encontrado.',
	});
	assert.deepEqual(toPlainJson(callLog.repositoryCalls), [[
		FEEDBACK_ID,
		{
			scopedUnitId: '507f191e810c19729de860ff',
			allowLegacyUnscoped: true,
			preferScopedRepoRead: true,
		},
	]]);
	assert.equal(callLog.seamCalls.length, 0);
	assert.equal(callLog.apiOkCalls.length, 0);
});

test('feedback my detail: seam recebe apenas o nucleo canonizado e owner traduz forbidden', async () => {
	const feedback = feedbackFixture();
	const req = buildReq({
		user: {
			_id: OTHER_USER_ID,
			id: OTHER_USER_ID,
		},
	});
	const res = makeRes();

	const { detailMyFeedback, callLog } = loadMyDetailOwnerHarness({
		findFeedbackResult: feedback,
		seamResult: { allowed: false },
	});

	await detailMyFeedback(req, res);

	assert.equal(res.statusCode, 403);
	assert.deepEqual(toPlainJson(res.body), {
		ok: false,
		success: false,
		error: 'Acesso negado.',
		message: 'Acesso negado.',
	});
	assert.equal(callLog.seamCalls.length, 1);
	assert.deepEqual(Object.keys(callLog.seamCalls[0]).sort(), ['currentUser', 'feedback', 'scopedUnitId']);
	assert.deepEqual(toPlainJson(callLog.seamCalls[0]), {
		feedback: toPlainJson(feedback),
		currentUser: toPlainJson(req.user),
		scopedUnitId: '507f191e810c19729de860ff',
	});
	assert.equal(callLog.apiOkCalls.length, 0);
});

test('feedback my detail: owner preserva a resposta HTTP final apos seam autorizada', async () => {
	const feedback = feedbackFixture();
	const req = buildReq();
	const res = makeRes();

	const { detailMyFeedback, callLog } = loadMyDetailOwnerHarness({
		findFeedbackResult: feedback,
		seamResult: { allowed: true },
	});

	await detailMyFeedback(req, res);

	assert.equal(res.statusCode, 200);
	assert.deepEqual(toPlainJson(res.body), {
		ok: true,
		success: true,
		data: toPlainJson(feedback),
	});
	assert.equal(callLog.seamCalls.length, 1);
	assert.equal(callLog.apiFailCalls.length, 0);
	assert.equal(callLog.apiOkCalls.length, 1);
});

test('feedback my detail: owner trata erro externo com apiFail 500', async () => {
	const feedback = feedbackFixture();
	const req = buildReq();
	const res = makeRes();

	const { detailMyFeedback, callLog } = loadMyDetailOwnerHarness({
		findFeedbackResult: feedback,
		feedbackPolicy: {
			ensureCreatorOwnership(input) {
				callLog.seamCalls.push(input);
				throw new Error('falha externa de ownership');
			},
		},
	});

	await detailMyFeedback(req, res);

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
	assert.match(String(callLog.logErrorCalls[0][0] || ''), /GET \/api\/feedback\/meus\/:id erro:/);
});