import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/feedbackRespostaApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

const FEEDBACK_ID = '507f1f77bcf86cd799439011';

function extractRespostaOwnerSnippet(source) {
	const start = source.indexOf('export function createUpdateFeedbackRespostaHandler(');

	assert.ok(start >= 0, 'Nao foi possivel localizar o owner de resposta admin.');

	return source
		.slice(start)
		.replace("import { processUpdateFeedbackRespostaCore } from './utils/processUpdateFeedbackRespostaCore.js';\r\n", '')
		.replace("import { processUpdateFeedbackRespostaCore } from './utils/processUpdateFeedbackRespostaCore.js';\n", '')
		.replace('export function createUpdateFeedbackRespostaHandler(', 'function createUpdateFeedbackRespostaHandler(');
}

function buildDelegatedRespostaSnippet() {
	const original = extractRespostaOwnerSnippet(CONTROLLER_SOURCE);
	if (original.includes('processUpdateFeedbackRespostaCore({')) {
		return original;
	}

	const coreBlockStart = original.indexOf('const set = { resposta };');
	const coreBlockEndMarker = 'const fb = await findFeedbackByIdAndUpdateSetNewLean(id, set);';
	const coreBlockEnd = original.indexOf(coreBlockEndMarker, coreBlockStart);
	assert.ok(coreBlockStart >= 0 && coreBlockEnd >= 0, 'Nao foi possivel localizar o bloco atual de update de resposta.');
	const coreBlock = original.slice(coreBlockStart, coreBlockEnd + coreBlockEndMarker.length);

	const delegatedBlock = [
		'const fb = await processUpdateFeedbackRespostaCore({',
		'  id,',
		'  resposta,',
		'  findFeedbackByIdAndUpdateSetNewLean,',
		'});',
	].join('\n\t\t');

	const replaced = original.replace(coreBlock, delegatedBlock);
	assert.notEqual(replaced, original, 'Nao foi possivel instalar a seam estrutural de resposta admin em memoria.');
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
	const { body: bodyOverrides = {}, params: paramsOverrides = {}, user: userOverrides = {}, ...restOverrides } = overrides;
	return {
		body: {
			resposta: 'Resposta via PATCH',
			...bodyOverrides,
		},
		params: {
			feedbackId: FEEDBACK_ID,
			...paramsOverrides,
		},
		user: {
			role: 'admin',
			isMaster: false,
			...userOverrides,
		},
		...restOverrides,
	};
}

function updatedFeedback(overrides = {}) {
	return {
		_id: FEEDBACK_ID,
		resposta: 'Resposta via PATCH',
		status: 'respondido',
		toObject() {
			const { toObject, ...plain } = this;
			return JSON.parse(JSON.stringify(plain));
		},
		...overrides,
	};
}

function toPlainJson(value) {
	return JSON.parse(JSON.stringify(value));
}

function loadRespostaOwnerHarness(runtimeOverrides = {}) {
	const snippet = buildDelegatedRespostaSnippet();
	const responseHelpers = makeResponseHelpers();
	const callLog = {
		seamCalls: [],
		updateCalls: [],
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
		findFeedbackByIdAndUpdateSetNewLean: runtimeOverrides.findFeedbackByIdAndUpdateSetNewLean ?? (async (...args) => {
			callLog.updateCalls.push(args);
			return updatedFeedback();
		}),
		processUpdateFeedbackRespostaCore: runtimeOverrides.processUpdateFeedbackRespostaCore ?? (async (input) => {
			callLog.seamCalls.push(input);
			return updatedFeedback();
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
const findFeedbackByIdAndUpdateSetNewLean = __deps.findFeedbackByIdAndUpdateSetNewLean;
const processUpdateFeedbackRespostaCore = __deps.processUpdateFeedbackRespostaCore;
const console = __deps.console;
${snippet}
return {
	updateResposta: createUpdateFeedbackRespostaHandler({
		isAdminLike,
		apiOk,
		apiFail,
		findFeedbackByIdAndUpdateSetNewLean,
	}),
};
})`);

	const factory = factoryScript.runInNewContext({});
	return {
		...factory(deps),
		callLog,
	};
}

test('feedbackResposta admin: owner preserva gate admin antes da seam', async () => {
	const { updateResposta, callLog } = loadRespostaOwnerHarness({
		processUpdateFeedbackRespostaCore: async () => {
			throw new Error('nao deve delegar sem autorizacao admin');
		},
	});

	const req = buildReq({ user: { role: 'user', isMaster: false } });
	const res = makeRes();

	await updateResposta(req, res);

	assert.equal(res.statusCode, 403);
	assert.deepEqual(toPlainJson(res.body), {
		ok: false,
		success: false,
		error: 'Acesso negado.',
		message: 'Acesso negado.',
	});
	assert.equal(callLog.seamCalls.length, 0);
	assert.equal(callLog.updateCalls.length, 0);
	assert.equal(callLog.apiOkCalls.length, 0);
});

test('feedbackResposta admin: owner preserva validacao de id antes da seam', async () => {
	for (const feedbackId of ['   ', 'id-malformado']) {
		const { updateResposta, callLog } = loadRespostaOwnerHarness({
			processUpdateFeedbackRespostaCore: async () => {
				throw new Error('nao deve delegar com id invalido');
			},
		});

		const req = buildReq({ params: { feedbackId } });
		const res = makeRes();

		await updateResposta(req, res);

		assert.equal(res.statusCode, 400);
		assert.deepEqual(toPlainJson(res.body), {
			ok: false,
			success: false,
			error: 'ID inválido.',
			message: 'ID inválido.',
		});
		assert.equal(callLog.seamCalls.length, 0);
		assert.equal(callLog.updateCalls.length, 0);
	}
});

test('feedbackResposta admin: owner preserva validacao de limite maximo antes da seam', async () => {
	const { updateResposta, callLog } = loadRespostaOwnerHarness({
		processUpdateFeedbackRespostaCore: async () => {
			throw new Error('nao deve delegar resposta acima do limite');
		},
	});

	const req = buildReq({ body: { resposta: 'x'.repeat(4001) } });
	const res = makeRes();

	await updateResposta(req, res);

	assert.equal(res.statusCode, 400);
	assert.deepEqual(toPlainJson(res.body), {
		ok: false,
		success: false,
		error: 'Resposta deve ter no máximo 4000 caracteres.',
		message: 'Resposta deve ter no máximo 4000 caracteres.',
	});
	assert.equal(callLog.seamCalls.length, 0);
	assert.equal(callLog.updateCalls.length, 0);
	assert.equal(callLog.apiOkCalls.length, 0);
});

test('feedbackResposta admin: owner delega apenas o nucleo canonizado de update', async () => {
	let seamArgs = null;
	const { updateResposta, callLog } = loadRespostaOwnerHarness({
		processUpdateFeedbackRespostaCore: async (input) => {
			callLog.seamCalls.push(input);
			seamArgs = input;
			return updatedFeedback();
		},
	});

	const req = buildReq({ body: { resposta: '  Resposta via PATCH  ' } });
	const res = makeRes();

	await updateResposta(req, res);

	assert.ok(seamArgs, 'A futura seam deve receber apenas o nucleo canonizado de update de resposta.');
	assert.deepEqual(Object.keys(seamArgs).sort(), ['findFeedbackByIdAndUpdateSetNewLean', 'id', 'resposta'].sort());
	assert.equal(seamArgs.id, FEEDBACK_ID);
	assert.equal(seamArgs.resposta, 'Resposta via PATCH');
	assert.equal(typeof seamArgs.findFeedbackByIdAndUpdateSetNewLean, 'function');
	assert.equal('req' in seamArgs, false);
	assert.equal('res' in seamArgs, false);
	assert.equal('apiOk' in seamArgs, false);
	assert.equal('apiFail' in seamArgs, false);
	assert.equal(callLog.updateCalls.length, 0);
	assert.equal(res.statusCode, 200);
	assert.deepEqual(toPlainJson(res.body), {
		ok: true,
		success: true,
		data: {
			_id: FEEDBACK_ID,
			resposta: 'Resposta via PATCH',
			status: 'respondido',
		},
	});
});

test('feedbackResposta admin: owner preserva traducao HTTP de feedback nao encontrado depois da seam', async () => {
	const { updateResposta, callLog } = loadRespostaOwnerHarness({
		processUpdateFeedbackRespostaCore: async (input) => {
			callLog.seamCalls.push(input);
			return null;
		},
	});

	const req = buildReq();
	const res = makeRes();

	await updateResposta(req, res);

	assert.equal(callLog.seamCalls.length, 1);
	assert.equal(res.statusCode, 404);
	assert.deepEqual(toPlainJson(res.body), {
		ok: false,
		success: false,
		error: 'Feedback não encontrado.',
		message: 'Feedback não encontrado.',
	});
});

test('feedbackResposta admin: owner preserva ordem estrutural owner -> seam -> resposta HTTP final', async () => {
	const callOrder = [];
	const { updateResposta, callLog } = loadRespostaOwnerHarness({
		processUpdateFeedbackRespostaCore: async (input) => {
			callOrder.push('seam');
			callLog.seamCalls.push(input);
			return updatedFeedback();
		},
		apiOk: (res, data = null, extra = {}) => {
			callOrder.push('apiOk');
			callLog.apiOkCalls.push([data, extra]);
			return makeResponseHelpers().apiOk(res, data, extra);
		},
	});

	const req = buildReq();
	const res = makeRes();

	await updateResposta(req, res);

	assert.deepEqual(callOrder, ['seam', 'apiOk']);
	assert.equal(res.statusCode, 200);
});

test('feedbackResposta admin: owner preserva tratamento de erro externo quando a seam falha', async () => {
	const { updateResposta, callLog } = loadRespostaOwnerHarness({
		processUpdateFeedbackRespostaCore: async (input) => {
			callLog.seamCalls.push(input);
			throw new Error('forced-feedback-resposta-structural-failure');
		},
	});

	const req = buildReq();
	const res = makeRes();

	await updateResposta(req, res);

	assert.equal(callLog.seamCalls.length, 1);
	assert.equal(callLog.logErrorCalls.length, 1);
	assert.equal(res.statusCode, 500);
	assert.deepEqual(toPlainJson(res.body), {
		ok: false,
		success: false,
		error: 'Erro ao salvar resposta.',
		message: 'Erro ao salvar resposta.',
	});
});