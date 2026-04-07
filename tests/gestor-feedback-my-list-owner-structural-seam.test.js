import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/feedbackMyListApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

function extractMyListOwnerSnippet(source) {
	const start = source.indexOf('export function createMyFeedbackListHandler(');

	assert.ok(start >= 0, 'Nao foi possivel localizar o owner de my list de feedback.');

	return source
		.slice(start)
		.replace('export function createMyFeedbackListHandler(', 'function createMyFeedbackListHandler(');
}

function buildDelegatedMyListSnippet() {
	const original = extractMyListOwnerSnippet(CONTROLLER_SOURCE);
	assert.match(
		original,
		/feedbackPolicy\.buildMyFeedbackFilter\(\{[\s\S]*currentUser: req\.user \|\| null,[\s\S]*\}\)/,
		'Owner de my list deve delegar o filtro para feedbackPolicy.buildMyFeedbackFilter no shape atual.',
	);
	assert.doesNotMatch(
		original,
		/processMyFeedbackListFilterCore\(/,
		'Owner de my list nao deve mais chamar processMyFeedbackListFilterCore diretamente.',
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

function listItems() {
	return [
		{ _id: '507f1f77bcf86cd799439011', mensagem: 'meu primeiro feedback' },
		{ _id: '507f1f77bcf86cd799439012', mensagem: 'meu segundo feedback' },
	];
}

function buildReq(overrides = {}) {
	const { user: userOverrides = {}, ...restOverrides } = overrides;
	return {
		user: {
			_id: '507f191e810c19729de860ea',
			id: '507f191e810c19729de860ea',
			email: 'owner.feedback@test.local',
			nome: 'Owner Feedback',
			role: 'user',
			...userOverrides,
		},
		...restOverrides,
	};
}

function toPlainJson(value) {
	return JSON.parse(JSON.stringify(value));
}

function loadMyListOwnerHarness(runtimeOverrides = {}) {
	const snippet = buildDelegatedMyListSnippet();
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
		findFeedbackByFilterSortCreatedAtDescLimit200Lean:
			runtimeOverrides.findFeedbackByFilterSortCreatedAtDescLimit200Lean ??
			(async (filter) => {
				callLog.repositoryCalls.push([filter]);
				return listItems();
			}),
		feedbackPolicy:
			runtimeOverrides.feedbackPolicy ?? {
				buildMyFeedbackFilter(input) {
					callLog.seamCalls.push(input);
					const currentUser = input.currentUser || null;
					const currentId = currentUser?._id || currentUser?.id || null;
					return {
						filter: currentId
							? { 'criadoPor.userId': currentId }
							: { 'criadoPor.email': currentUser?.email || '' },
					};
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
const findFeedbackByFilterSortCreatedAtDescLimit200Lean = __deps.findFeedbackByFilterSortCreatedAtDescLimit200Lean;
	const feedbackPolicy = __deps.feedbackPolicy;
const console = __deps.console;
${snippet}
return {
	listMyFeedback: createMyFeedbackListHandler({
		apiOk,
		apiFail,
			feedbackPolicy,
		findFeedbackByFilterSortCreatedAtDescLimit200Lean,
	}),
};
})`);

	const factory = factoryScript.runInNewContext({});
	return {
		...factory(deps),
		callLog,
	};
}

test('feedback my list: seam estrutural fica entre owner, repositorio e resposta HTTP final', async () => {
	const snippet = buildDelegatedMyListSnippet();
	const seamIndex = snippet.indexOf('feedbackPolicy.buildMyFeedbackFilter({');
	const repoIndex = snippet.indexOf('findFeedbackByFilterSortCreatedAtDescLimit200Lean(filter)');
	const responseIndex = snippet.indexOf('return apiOk(res, items);');

	assert.ok(seamIndex >= 0, 'Seam de my list precisa existir no meio do fluxo em memoria.');
	assert.ok(repoIndex >= 0, 'Owner precisa preservar a chamada ao repositorio.');
	assert.ok(responseIndex >= 0, 'Owner precisa preservar a resposta HTTP final.');
	assert.ok(seamIndex < repoIndex, 'Seam deve rodar antes da chamada ao repositorio.');
	assert.ok(repoIndex < responseIndex, 'Resposta HTTP final deve permanecer no owner apos o repositorio.');

	const callOrder = [];
	const { listMyFeedback, callLog } = loadMyListOwnerHarness({
		feedbackPolicy: {
			buildMyFeedbackFilter(input) {
				callOrder.push('seam');
				callLog.seamCalls.push(input);
				return { filter: { 'criadoPor.userId': '507f191e810c19729de860ea' } };
			},
		},
		findFeedbackByFilterSortCreatedAtDescLimit200Lean: async (filter) => {
			callOrder.push('repo');
			callLog.repositoryCalls.push([filter]);
			return listItems();
		},
		apiOk: (res, data = null, extra = {}) => {
			callOrder.push('apiOk');
			callLog.apiOkCalls.push([data, extra]);
			return makeResponseHelpers().apiOk(res, data, extra);
		},
	});

	const req = buildReq();
	const res = makeRes();

	await listMyFeedback(req, res);

	assert.deepEqual(callOrder, ['seam', 'repo', 'apiOk']);
	assert.equal(res.statusCode, 200);
	assert.equal(callLog.apiFailCalls.length, 0);
	});

test('feedback my list: a seam futura recebe apenas o usuario atual e owner continua dono do repositorio e da resposta', async () => {
	const req = buildReq();
	const res = makeRes();

	const { listMyFeedback, callLog } = loadMyListOwnerHarness({
		feedbackPolicy: {
			buildMyFeedbackFilter(input) {
				callLog.seamCalls.push(input);
				return { filter: { 'criadoPor.userId': req.user._id } };
			},
		},
	});

	await listMyFeedback(req, res);

	assert.equal(callLog.seamCalls.length, 1);
	assert.deepEqual(Object.keys(callLog.seamCalls[0]).sort(), ['currentUser']);
	assert.deepEqual(toPlainJson(callLog.seamCalls[0]), {
		currentUser: toPlainJson(req.user),
	});
	assert.deepEqual(callLog.repositoryCalls, [[{ 'criadoPor.userId': req.user._id }]]);
	assert.equal(callLog.apiOkCalls.length, 1);
	assert.deepEqual(toPlainJson(res.body), {
		ok: true,
		success: true,
		data: toPlainJson(listItems()),
	});
});

test('feedback my list: a seam futura concentra o fallback para email quando nao houver _id ou id', async () => {
	const req = buildReq({
		user: {
			_id: null,
			id: null,
			email: 'fallback.feedback@test.local',
		},
	});
	const res = makeRes();

	const { listMyFeedback, callLog } = loadMyListOwnerHarness();

	await listMyFeedback(req, res);

	assert.equal(callLog.seamCalls.length, 1);
	assert.deepEqual(toPlainJson(callLog.seamCalls[0]), {
		currentUser: toPlainJson(req.user),
	});
	assert.deepEqual(callLog.repositoryCalls, [[{ 'criadoPor.email': 'fallback.feedback@test.local' }]]);
	assert.equal(callLog.apiOkCalls.length, 1);
	assert.equal(res.statusCode, 200);
});

test('feedback my list: owner trata erro externo com apiFail 500', async () => {
	const req = buildReq();
	const res = makeRes();

	const { listMyFeedback, callLog } = loadMyListOwnerHarness({
		feedbackPolicy: {
			buildMyFeedbackFilter(input) {
				callLog.seamCalls.push(input);
				throw new Error('forced-feedback-my-list-structural-failure');
			},
		},
	});

	await listMyFeedback(req, res);

	assert.equal(callLog.seamCalls.length, 1);
	assert.equal(callLog.repositoryCalls.length, 0);
	assert.equal(callLog.apiOkCalls.length, 0);
	assert.equal(callLog.logErrorCalls.length, 1);
	assert.equal(res.statusCode, 500);
	assert.deepEqual(toPlainJson(res.body), {
		ok: false,
		success: false,
		error: 'Erro ao listar.',
		message: 'Erro ao listar.',
	});
	assert.match(String(callLog.logErrorCalls[0][0] || ''), /GET \/api\/feedback\/meus erro:/);
});