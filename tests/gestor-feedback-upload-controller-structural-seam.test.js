import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/feedbackUploadApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

const FEEDBACK_ID = '507f1f77bcf86cd799439011';
const CREATOR_ID = '507f191e810c19729de860ea';

function extractUploadOwnerSnippet(source) {
	const start = source.indexOf('export function createUploadFeedbackAnexoHandler(');

	assert.ok(start >= 0, 'Nao foi possivel localizar o owner de upload de feedback.');

	return source
		.slice(start)
		.replace('export function createUploadFeedbackAnexoHandler(', 'function createUploadFeedbackAnexoHandler(');
}

function buildDelegatedUploadSnippet() {
	const original = extractUploadOwnerSnippet(CONTROLLER_SOURCE);
	assert.match(
		original,
		/const access = feedbackPolicy\.ensureCreatorOwnership\(\{[\s\S]*?currentUser: req\.user \|\| null,[\s\S]*?scopedUnitId,[\s\S]*?\}\);/,
		'Nao foi possivel localizar o bloco atual de ownership de upload.'
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
	const base = {
		_id: FEEDBACK_ID,
		mensagem: 'Feedback de upload',
		criadoPor: {
			userId: CREATOR_ID,
			email: 'creator.feedback@test.local',
			nome: 'Creator Feedback',
			role: 'user',
		},
		anexos: [],
		toObject() {
			return {
				_id: this._id,
				mensagem: this.mensagem,
				criadoPor: this.criadoPor,
				anexos: this.anexos,
			};
		},
	};

	return Object.assign(base, overrides);
}

function buildReq(overrides = {}) {
	const {
		params: paramsOverrides = {},
		user: userOverrides = {},
		unitScope: unitScopeOverrides = {},
		file: fileOverride,
		files: filesOverride,
		...restOverrides
	} = overrides;

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
		baseUrl: '/gestor',
		file:
			fileOverride === undefined
				? { originalname: 'print.png', mimetype: 'image/png', buffer: Buffer.from('png'), size: 3 }
				: fileOverride,
		files: filesOverride === undefined ? [] : filesOverride,
		...restOverrides,
	};
}

function toPlainJson(value) {
	return JSON.parse(JSON.stringify(value));
}

function loadUploadOwnerHarness(runtimeOverrides = {}) {
	const snippet = buildDelegatedUploadSnippet();
	const responseHelpers = makeResponseHelpers();
	const callLog = {
		repositoryCalls: [],
		seamCalls: [],
		uploadCalls: [],
		saveCalls: [],
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
		findFeedbackById: runtimeOverrides.findFeedbackById ?? (async (id, options) => {
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
		saveFeedbackDoc: runtimeOverrides.saveFeedbackDoc ?? (async (feedback) => {
			callLog.saveCalls.push(feedback);
		}),
		uploadStorageInfra:
			runtimeOverrides.uploadStorageInfra ??
			{
				async processUpload(input) {
					callLog.uploadCalls.push(input);
					return {
						kind: 'stored',
						file: input.file,
						stored: {
							originalName: 'print.png',
							url: '/gestor/uploads/feedback/fb-1/print.png',
						},
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
const findFeedbackById = __deps.findFeedbackById;
const feedbackPolicy = __deps.feedbackPolicy;
const saveFeedbackDoc = __deps.saveFeedbackDoc;
const uploadStorageInfra = __deps.uploadStorageInfra;
const console = __deps.console;
${snippet}
return {
	uploadFeedbackAnexoHandler: createUploadFeedbackAnexoHandler({
		apiOk,
		apiFail,
		findFeedbackById,
		feedbackPolicy,
		saveFeedbackDoc,
		uploadStorageInfra,
	}),
};
})`);

	const factory = factoryScript.runInNewContext({ Buffer });
	return {
		...factory(deps),
		callLog,
	};
}

test('feedback upload controller: ordem estrutural mantem repositorio antes da seam e resposta ao final', () => {
	const snippet = buildDelegatedUploadSnippet();
	const idValidationIndex = snippet.indexOf("if (!/^[0-9a-fA-F]{24}$/.test(feedbackId)) return apiFail(res, 400, 'ID inválido.');");
	const repoIndex = snippet.indexOf('const fb = await findFeedbackById(feedbackId, {');
	const notFoundIndex = snippet.indexOf("if (!fb) return apiFail(res, 404, 'Feedback não encontrado.');");
	const seamIndex = snippet.indexOf('feedbackPolicy.ensureCreatorOwnership({');
	const responseIndex = snippet.indexOf('return apiOk(res, fb.toObject(), { id: fb._id });');

	assert.ok(idValidationIndex >= 0, 'Owner precisa preservar a validacao de id.');
	assert.ok(repoIndex >= 0, 'Owner precisa preservar a chamada ao repositorio.');
	assert.ok(notFoundIndex >= 0, 'Owner precisa preservar a traducao 404 antes da seam.');
	assert.ok(seamIndex >= 0, 'Owner precisa preservar a seam de ownership.');
	assert.ok(responseIndex >= 0, 'Owner precisa preservar a resposta HTTP final.');
	assert.ok(idValidationIndex < repoIndex, 'Validacao de id deve ocorrer antes do repositorio.');
	assert.ok(repoIndex < notFoundIndex, 'Traducao 404 deve ocorrer logo apos o repositorio.');
	assert.ok(notFoundIndex < seamIndex, 'Seam deve ocorrer apenas com feedback carregado.');
	assert.ok(seamIndex < responseIndex, 'Resposta HTTP final deve permanecer apos a seam.');
	assert.match(
		snippet,
		/findFeedbackById\(feedbackId, \{[\s\S]*?scopedUnitId,[\s\S]*?allowLegacyUnscoped: true,[\s\S]*?preferScopedRepoRead: true,[\s\S]*?\}\);/,
		'Owner precisa propagar a intencao scoped non-lean no shape atual.'
	);
});

test('feedback upload controller: owner preserva validacao de id antes do repositorio', async () => {
	const { uploadFeedbackAnexoHandler, callLog } = loadUploadOwnerHarness({
		findFeedbackById: async () => {
			throw new Error('nao deve buscar feedback com id invalido');
		},
	});

	const req = buildReq({ params: { feedbackId: 'id-malformado' } });
	const res = makeRes();

	await uploadFeedbackAnexoHandler(req, res);

	assert.equal(res.statusCode, 400);
	assert.deepEqual(toPlainJson(res.body), {
		ok: false,
		success: false,
		error: 'ID inválido.',
		message: 'ID inválido.',
	});
	assert.equal(callLog.repositoryCalls.length, 0);
	assert.equal(callLog.seamCalls.length, 0);
	assert.equal(callLog.uploadCalls.length, 0);
	assert.equal(callLog.saveCalls.length, 0);
	assert.equal(callLog.apiOkCalls.length, 0);
});

test('feedback upload controller: owner chama findFeedbackById com id e options scoped antes da seam', async () => {
	const { uploadFeedbackAnexoHandler, callLog } = loadUploadOwnerHarness({
		findFeedbackResult: null,
		feedbackPolicy: {
			ensureCreatorOwnership() {
				throw new Error('nao deve delegar ownership sem feedback carregado');
			},
		},
	});

	const req = buildReq();
	const res = makeRes();

	await uploadFeedbackAnexoHandler(req, res);

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
	assert.equal(callLog.uploadCalls.length, 0);
	assert.equal(callLog.saveCalls.length, 0);
	assert.equal(callLog.apiOkCalls.length, 0);
});

test('feedback upload controller: owner preserva ownership, mutacao de anexos e resposta final sem storage real', async () => {
	const feedback = feedbackFixture();
	const req = buildReq();
	const res = makeRes();

	const { uploadFeedbackAnexoHandler, callLog } = loadUploadOwnerHarness({
		findFeedbackResult: feedback,
		seamResult: { allowed: true },
	});

	await uploadFeedbackAnexoHandler(req, res);

	assert.equal(callLog.seamCalls.length, 1);
	assert.deepEqual(Object.keys(callLog.seamCalls[0]).sort(), ['currentUser', 'feedback', 'scopedUnitId']);
	assert.deepEqual(toPlainJson(callLog.seamCalls[0]), {
		currentUser: toPlainJson(req.user),
		feedback: toPlainJson(feedback),
		scopedUnitId: '507f191e810c19729de860ff',
	});
	assert.equal(callLog.uploadCalls.length, 1);
	assert.equal(callLog.saveCalls.length, 1);
	assert.equal(feedback.anexos.length, 1);
	assert.deepEqual(toPlainJson(feedback.anexos[0]), {
		nome: 'print.png',
		url: '/gestor/uploads/feedback/fb-1/print.png',
		mime: 'image/png',
		size: 3,
	});
	assert.equal(res.statusCode, 200);
	assert.deepEqual(toPlainJson(res.body), {
		ok: true,
		success: true,
		data: {
			_id: FEEDBACK_ID,
			mensagem: 'Feedback de upload',
			criadoPor: {
				userId: CREATOR_ID,
				email: 'creator.feedback@test.local',
				nome: 'Creator Feedback',
				role: 'user',
			},
			anexos: [
				{
					nome: 'print.png',
					url: '/gestor/uploads/feedback/fb-1/print.png',
					mime: 'image/png',
					size: 3,
				},
			],
		},
		id: FEEDBACK_ID,
	});
});