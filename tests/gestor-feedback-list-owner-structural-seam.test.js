import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/feedbackListApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

function extractListOwnerSnippet(source) {
	const start = source.indexOf('const ALLOWED_FEEDBACK_STATUSES = new Set([');

	assert.ok(start >= 0, 'Nao foi possivel localizar o owner de listagem admin de feedback.');

	return source
		.slice(start)
		.replace("import { processAdminFeedbackListFilterCore } from './utils/processAdminFeedbackListFilterCore.js';\r\n", '')
		.replace("import { processAdminFeedbackListFilterCore } from './utils/processAdminFeedbackListFilterCore.js';\n", '')
		.replace('export function createAdminFeedbackListHandler(', 'function createAdminFeedbackListHandler(');
}

function buildDelegatedListSnippet() {
	const original = extractListOwnerSnippet(CONTROLLER_SOURCE);
	if (original.includes('processAdminFeedbackListFilterCore({')) {
		return original;
	}

	const coreBlockStart = original.indexOf("const q = String(req.query?.q || '').trim();");
	const coreBlockEndMarker = "const items = await findFeedbackByFilterSortCreatedAtDescLimit500Lean(filter);";
	const coreBlockEnd = original.indexOf(coreBlockEndMarker, coreBlockStart);
	assert.ok(coreBlockStart >= 0 && coreBlockEnd >= 0, 'Nao foi possivel localizar o bloco atual de filtro admin.');
	const coreBlock = original.slice(coreBlockStart, coreBlockEnd);

	const delegatedBlock = [
		'const filterResult = await processAdminFeedbackListFilterCore({',
		"  q: String(req.query?.q || '').trim(),",
		"  status: String(req.query?.status || '').trim(),",
		"  tipo: String(req.query?.tipo || '').trim(),",
		'  normalizeStatus,',
		'  normalizeTipo,',
		'});',
		"if (filterResult?.error === 'invalid_status') return apiFail(res, 400, 'Status inválido.');",
		"if (filterResult?.error === 'invalid_tipo') return apiFail(res, 400, 'Tipo inválido.');",
		'const filter = filterResult?.filter || {};',
	].join('\n\t\t');

	const replaced = original.replace(coreBlock, delegatedBlock);
	assert.notEqual(replaced, original, 'Nao foi possivel instalar a seam estrutural da listagem admin em memoria.');
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

function buildReq(overrides = {}) {
	const { query: queryOverrides = {}, user: userOverrides = {}, ...restOverrides } = overrides;
	return {
		query: {
			q: 'feedback termo',
			status: ' Em Andamento ',
			tipo: ' ELOGIO ',
			...queryOverrides,
		},
		user: {
			role: 'admin',
			isMaster: false,
			...userOverrides,
		},
		...restOverrides,
	};
}

function listItems() {
	return [
		{ _id: '507f1f77bcf86cd799439011', mensagem: 'primeiro', resposta: 'ok' },
		{ _id: '507f1f77bcf86cd799439012', mensagem: 'segundo', resposta: 'ok' },
	];
}

function toPlainJson(value) {
	return JSON.parse(JSON.stringify(value));
}

function loadListOwnerHarness(runtimeOverrides = {}) {
	const snippet = buildDelegatedListSnippet();
	const responseHelpers = makeResponseHelpers();
	const callLog = {
		seamCalls: [],
		repositoryCalls: [],
		sanitizeCalls: [],
		apiOkCalls: [],
		apiFailCalls: [],
		logErrorCalls: [],
	};

	const deps = {
		isAdminLike: runtimeOverrides.isAdminLike ?? ((user) => !!(user && (user.isMaster || user.role === 'admin' || user.role === 'master'))),
		apiOk: runtimeOverrides.apiOk ?? ((res, data = null, extra = {}) => {
			callLog.apiOkCalls.push([data, extra]);
			return responseHelpers.apiOk(res, data, extra);
		}),
		apiFail: runtimeOverrides.apiFail ?? ((res, status, message, extra = {}) => {
			callLog.apiFailCalls.push([status, message, extra]);
			return responseHelpers.apiFail(res, status, message, extra);
		}),
		normalizeStatus: runtimeOverrides.normalizeStatus ?? ((value) => String(value || '').trim().toLowerCase().replaceAll(' ', '_') || 'novo'),
		normalizeTipo: runtimeOverrides.normalizeTipo ?? ((value) => String(value || '').trim().toLowerCase() || 'outro'),
		findFeedbackByFilterSortCreatedAtDescLimit500Lean: runtimeOverrides.findFeedbackByFilterSortCreatedAtDescLimit500Lean ?? (async (filter) => {
			callLog.repositoryCalls.push([filter]);
			return listItems();
		}),
		sanitizeFeedback: runtimeOverrides.sanitizeFeedback ?? ((item) => {
			callLog.sanitizeCalls.push([item]);
			return { ...item, sanitized: true };
		}),
		processAdminFeedbackListFilterCore: runtimeOverrides.processAdminFeedbackListFilterCore ?? (async (input) => {
			callLog.seamCalls.push(input);
			return { filter: { status: 'em_andamento', tipo: 'elogio' } };
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
const apiOk = __deps.apiOk;
const apiFail = __deps.apiFail;
const normalizeStatus = __deps.normalizeStatus;
const normalizeTipo = __deps.normalizeTipo;
const findFeedbackByFilterSortCreatedAtDescLimit500Lean = __deps.findFeedbackByFilterSortCreatedAtDescLimit500Lean;
const sanitizeFeedback = __deps.sanitizeFeedback;
const processAdminFeedbackListFilterCore = __deps.processAdminFeedbackListFilterCore;
const console = __deps.console;
${snippet}
return {
	listFeedbackAdmin: createAdminFeedbackListHandler({
		isAdminLike,
		apiOk,
		apiFail,
		normalizeStatus,
		normalizeTipo,
		findFeedbackByFilterSortCreatedAtDescLimit500Lean,
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

test('feedbackList admin: owner preserva gate admin antes da seam', async () => {
	const { listFeedbackAdmin, callLog } = loadListOwnerHarness({
		processAdminFeedbackListFilterCore: async () => {
			throw new Error('nao deve delegar sem autorizacao admin');
		},
	});

	const req = buildReq({ user: { role: 'user', isMaster: false } });
	const res = makeRes();

	await listFeedbackAdmin(req, res);

	assert.equal(res.statusCode, 403);
	assert.deepEqual(toPlainJson(res.body), {
		ok: false,
		success: false,
		error: 'Acesso negado.',
		message: 'Acesso negado.',
	});
	assert.equal(callLog.seamCalls.length, 0);
	assert.equal(callLog.repositoryCalls.length, 0);
	assert.equal(callLog.sanitizeCalls.length, 0);
	assert.equal(callLog.apiOkCalls.length, 0);
});

test('feedbackList admin: owner traduz status invalido retornado pela seam', async () => {
	const { listFeedbackAdmin, callLog } = loadListOwnerHarness({
		processAdminFeedbackListFilterCore: async (input) => {
			callLog.seamCalls.push(input);
			return { error: 'invalid_status' };
		},
	});

	const req = buildReq();
	const res = makeRes();

	await listFeedbackAdmin(req, res);

	assert.equal(res.statusCode, 400);
	assert.deepEqual(toPlainJson(res.body), {
		ok: false,
		success: false,
		error: 'Status inválido.',
		message: 'Status inválido.',
	});
	assert.equal(callLog.seamCalls.length, 1);
	assert.equal(callLog.repositoryCalls.length, 0);
	assert.equal(callLog.sanitizeCalls.length, 0);
	assert.equal(callLog.apiOkCalls.length, 0);
});

test('feedbackList admin: owner traduz tipo invalido retornado pela seam', async () => {
	const { listFeedbackAdmin, callLog } = loadListOwnerHarness({
		processAdminFeedbackListFilterCore: async (input) => {
			callLog.seamCalls.push(input);
			return { error: 'invalid_tipo' };
		},
	});

	const req = buildReq();
	const res = makeRes();

	await listFeedbackAdmin(req, res);

	assert.equal(res.statusCode, 400);
	assert.deepEqual(toPlainJson(res.body), {
		ok: false,
		success: false,
		error: 'Tipo inválido.',
		message: 'Tipo inválido.',
	});
	assert.equal(callLog.seamCalls.length, 1);
	assert.equal(callLog.repositoryCalls.length, 0);
	assert.equal(callLog.sanitizeCalls.length, 0);
	assert.equal(callLog.apiOkCalls.length, 0);
});

test('feedbackList admin: owner delega apenas o nucleo canonizado do filtro admin', async () => {
	let seamArgs = null;
	const filter = { status: 'em_andamento', tipo: 'elogio', $or: [{ mensagem: /feedback termo/i }] };
	const { listFeedbackAdmin, callLog } = loadListOwnerHarness({
		processAdminFeedbackListFilterCore: async (input) => {
			callLog.seamCalls.push(input);
			seamArgs = input;
			return { filter };
		},
	});

	const req = buildReq();
	const res = makeRes();

	await listFeedbackAdmin(req, res);

	assert.ok(seamArgs, 'A futura seam deve receber apenas o nucleo canonizado do filtro admin.');
	assert.deepEqual(Object.keys(seamArgs).sort(), ['normalizeStatus', 'normalizeTipo', 'q', 'status', 'tipo'].sort());
	assert.equal(seamArgs.q, 'feedback termo');
	assert.equal(seamArgs.status, 'Em Andamento');
	assert.equal(seamArgs.tipo, 'ELOGIO');
	assert.equal(typeof seamArgs.normalizeStatus, 'function');
	assert.equal(typeof seamArgs.normalizeTipo, 'function');
	assert.equal('req' in seamArgs, false);
	assert.equal('res' in seamArgs, false);
	assert.equal('apiOk' in seamArgs, false);
	assert.equal('apiFail' in seamArgs, false);
	assert.equal(callLog.repositoryCalls.length, 1);
	assert.equal(callLog.repositoryCalls[0][0].status, 'em_andamento');
	assert.equal(callLog.repositoryCalls[0][0].tipo, 'elogio');
	assert.ok(callLog.repositoryCalls[0][0].$or[0].mensagem instanceof RegExp);
	assert.equal(callLog.repositoryCalls[0][0].$or[0].mensagem.source, 'feedback termo');
	assert.equal(callLog.repositoryCalls[0][0].$or[0].mensagem.flags, 'i');
	assert.equal(callLog.sanitizeCalls.length, 2);
	assert.equal(res.statusCode, 200);
	assert.deepEqual(toPlainJson(res.body), {
		ok: true,
		success: true,
		data: [
			{ _id: '507f1f77bcf86cd799439011', mensagem: 'primeiro', resposta: 'ok', sanitized: true },
			{ _id: '507f1f77bcf86cd799439012', mensagem: 'segundo', resposta: 'ok', sanitized: true },
		],
	});
});

test('feedbackList admin: owner preserva ordem estrutural owner -> seam -> consulta/sanitize/resposta', async () => {
	const callOrder = [];
	const { listFeedbackAdmin, callLog } = loadListOwnerHarness({
		processAdminFeedbackListFilterCore: async (input) => {
			callOrder.push('seam');
			callLog.seamCalls.push(input);
			return { filter: { status: 'em_andamento' } };
		},
		findFeedbackByFilterSortCreatedAtDescLimit500Lean: async (filter) => {
			callOrder.push('repo');
			callLog.repositoryCalls.push([filter]);
			return listItems();
		},
		sanitizeFeedback: (item) => {
			callOrder.push('sanitize');
			callLog.sanitizeCalls.push([item]);
			return { ...item, sanitized: true };
		},
		apiOk: (res, data = null, extra = {}) => {
			callOrder.push('apiOk');
			callLog.apiOkCalls.push([data, extra]);
			return makeResponseHelpers().apiOk(res, data, extra);
		},
	});

	const req = buildReq();
	const res = makeRes();

	await listFeedbackAdmin(req, res);

	assert.deepEqual(callOrder, ['seam', 'repo', 'sanitize', 'sanitize', 'apiOk']);
	assert.equal(res.statusCode, 200);
});

test('feedbackList admin: owner preserva tratamento de erro externo quando a seam falha', async () => {
	const { listFeedbackAdmin, callLog } = loadListOwnerHarness({
		processAdminFeedbackListFilterCore: async (input) => {
			callLog.seamCalls.push(input);
			throw new Error('forced-feedback-list-structural-failure');
		},
	});

	const req = buildReq();
	const res = makeRes();

	await listFeedbackAdmin(req, res);

	assert.equal(callLog.seamCalls.length, 1);
	assert.equal(callLog.logErrorCalls.length, 1);
	assert.equal(res.statusCode, 500);
	assert.deepEqual(toPlainJson(res.body), {
		ok: false,
		success: false,
		error: 'Erro ao listar feedbacks.',
		message: 'Erro ao listar feedbacks.',
	});
});