import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/feedbackDeleteApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

const FEEDBACK_ID = '507f1f77bcf86cd799439011';

function extractDeleteOwnerSnippet(source) {
	const start = source.indexOf('export function createDeleteFeedbackHandler(');

	assert.ok(start >= 0, 'Nao foi possivel localizar o owner de deleteFeedback.');

	return source.slice(start).replace(/export\s+function\s+/g, 'function ');
}

function buildDelegatedDeleteSnippet() {
	const original = extractDeleteOwnerSnippet(CONTROLLER_SOURCE);
	if (original.includes('processFeedbackDeleteCleanupCore({')) {
		return original;
	}

	const cleanupBlockPattern = /try \{\s*const blobToken = getBlobToken\(\);\s*const anexos = Array\.isArray\(fb\?\.anexos\) \? fb\.anexos : \[\];\s*const urls = anexos\.map\(\(a\) => a && a\.url\)\.filter\(Boolean\)\.map\(String\);\s*for \(const u of urls\) \{\s*try \{\s*await delBlob\(u, blobToken \? \{ token: blobToken \} : undefined\);\s*\} catch \{\s*\/\/ noop\s*\}\s*\}\s*\} catch \(e\) \{\s*logWarn\('\[feedbackApi\] aviso: falha ao remover anexos do feedback \(blob\):', id, e\?\.message \|\| e\);\s*\}\s*\s*try \{\s*const ROOT = pathModule\.join\(cwdProvider\(\)\);\s*const absDir = pathModule\.join\(ROOT, 'public', 'uploads', 'feedback', String\(id\)\);\s*if \(fsModule\.existsSync\(absDir\)\) fsModule\.rmSync\(absDir, \{ recursive: true, force: true \}\);\s*\} catch \(e\) \{\s*logWarn\('\[feedbackApi\] aviso: falha ao remover anexos do feedback \(fs\):', id, e\?\.message \|\| e\);\s*\}\s*\s*return apiOk\(res, \{ id, deleted: true \}\);/s;
	assert.match(original, cleanupBlockPattern, 'Nao foi possivel localizar o bloco atual de cleanup do deleteFeedback.');

	const delegatedBlock = [
		'await processFeedbackDeleteCleanupCore({',
		'  id,',
		'  fb,',
		'  getBlobToken,',
		'  delBlob,',
		'  fsModule,',
		'  pathModule,',
		'  cwdProvider,',
		'  logWarn,',
		'});',
		'return apiOk(res, { id, deleted: true });',
	].join('\n\t\t');

	const replaced = original.replace(cleanupBlockPattern, delegatedBlock);
	assert.notEqual(replaced, original, 'Nao foi possivel instalar a seam estrutural de deleteFeedback em memoria.');
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
	return {
		params: { feedbackId: FEEDBACK_ID },
		body: {},
		query: {},
		user: { role: 'admin', isMaster: false },
		...overrides,
		params: {
			feedbackId: FEEDBACK_ID,
			...(overrides.params || {}),
		},
	};
}

function deletedFeedback(overrides = {}) {
	return {
		_id: FEEDBACK_ID,
		anexos: [
			{ url: 'https://blob.example/feedback/1.png' },
			{ url: '/gestor/uploads/feedback/507f/local.png' },
		],
		...overrides,
	};
}

function toPlainJson(value) {
	return JSON.parse(JSON.stringify(value));
}

function loadDeleteOwnerHarness(runtimeOverrides = {}) {
	const snippet = buildDelegatedDeleteSnippet();
	const responseHelpers = makeResponseHelpers();
	const callLog = {
		seamCalls: [],
		deleteCalls: [],
		apiOkCalls: [],
		apiFailCalls: [],
		logWarnCalls: [],
		logErrorCalls: [],
	};

	const deps = {
		isAdminLike: runtimeOverrides.isAdminLike ?? ((user) => !!(user && (user.isMaster || user.role === 'admin' || user.role === 'master'))),
		feedbackPolicy: runtimeOverrides.feedbackPolicy ?? {
			ensureAdminAccess: ({ currentUser } = {}) => ({
				allowed: deps.isAdminLike(currentUser),
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
		findFeedbackByIdAndDeleteLean: runtimeOverrides.findFeedbackByIdAndDeleteLean ?? (async (...args) => {
			callLog.deleteCalls.push(args);
			return deletedFeedback();
		}),
		getBlobToken: runtimeOverrides.getBlobToken ?? (() => 'blob-token'),
		delBlob: runtimeOverrides.delBlob ?? (async () => {}),
		fsModule: runtimeOverrides.fsModule ?? {
			existsSync() { return false; },
			rmSync() {},
		},
		pathModule: runtimeOverrides.pathModule ?? path,
		cwdProvider: runtimeOverrides.cwdProvider ?? (() => process.cwd()),
		logWarn: runtimeOverrides.logWarn ?? ((...args) => {
			callLog.logWarnCalls.push(args);
		}),
		logError: runtimeOverrides.logError ?? ((...args) => {
			callLog.logErrorCalls.push(args);
		}),
		processFeedbackDeleteCleanupCore: runtimeOverrides.processFeedbackDeleteCleanupCore ?? (async (input) => {
			callLog.seamCalls.push(input);
		}),
	};

	const factoryScript = new vm.Script(`(function (__deps) {
const isAdminLike = __deps.isAdminLike;
const feedbackPolicy = __deps.feedbackPolicy;
const apiOk = __deps.apiOk;
const apiFail = __deps.apiFail;
const findFeedbackByIdAndDeleteLean = __deps.findFeedbackByIdAndDeleteLean;
const getBlobToken = __deps.getBlobToken;
const delBlob = __deps.delBlob;
const fsModule = __deps.fsModule;
const pathModule = __deps.pathModule;
const cwdProvider = __deps.cwdProvider;
const logWarn = __deps.logWarn;
const logError = __deps.logError;
const processFeedbackDeleteCleanupCore = __deps.processFeedbackDeleteCleanupCore;
${snippet}
return {
	deleteFeedback: createDeleteFeedbackHandler({
		isAdminLike,
		apiOk,
		apiFail,
			feedbackPolicy,
		findFeedbackByIdAndDeleteLean,
		getBlobToken,
		delBlob,
		fsModule,
		pathModule,
		cwdProvider,
		logWarn,
		logError,
	}),
};
})`);

	const factory = factoryScript.runInNewContext({});
	return {
		...factory(deps),
		callLog,
	};
}

test('deleteFeedback: owner preserva autorizacao admin-like antes da seam', async () => {
	const { deleteFeedback, callLog } = loadDeleteOwnerHarness({
		processFeedbackDeleteCleanupCore: async () => {
			throw new Error('nao deve delegar cleanup sem autorizacao');
		},
	});

	const req = buildReq({ user: { role: 'user', isMaster: false } });
	const res = makeRes();

	await deleteFeedback(req, res);

	assert.equal(res.statusCode, 403);
	assert.deepEqual(toPlainJson(res.body), {
		ok: false,
		success: false,
		error: 'Acesso negado.',
		message: 'Acesso negado.',
	});
	assert.equal(callLog.deleteCalls.length, 0);
	assert.equal(callLog.seamCalls.length, 0);
	assert.equal(callLog.apiOkCalls.length, 0);
});

test('deleteFeedback: owner preserva validacao de id antes do delete principal e da seam', async () => {
	for (const feedbackId of ['   ', 'id-malformado']) {
		const { deleteFeedback, callLog } = loadDeleteOwnerHarness({
			processFeedbackDeleteCleanupCore: async () => {
				throw new Error('nao deve delegar cleanup com id invalido');
			},
		});

		const req = buildReq({ params: { feedbackId } });
		const res = makeRes();

		await deleteFeedback(req, res);

		assert.equal(res.statusCode, 400);
		assert.deepEqual(toPlainJson(res.body), {
			ok: false,
			success: false,
			error: 'ID inválido.',
			message: 'ID inválido.',
		});
		assert.equal(callLog.deleteCalls.length, 0);
		assert.equal(callLog.seamCalls.length, 0);
	}
});

test('deleteFeedback: owner preserva delete principal antes da seam', async () => {
	const { deleteFeedback, callLog } = loadDeleteOwnerHarness({
		findFeedbackByIdAndDeleteLean: async (...args) => {
			callLog.deleteCalls.push(args);
			return null;
		},
		processFeedbackDeleteCleanupCore: async () => {
			throw new Error('nao deve delegar cleanup sem feedback deletado');
		},
	});

	const req = buildReq();
	const res = makeRes();

	await deleteFeedback(req, res);

	assert.deepEqual(toPlainJson(callLog.deleteCalls), [[FEEDBACK_ID]]);
	assert.equal(res.statusCode, 404);
	assert.deepEqual(toPlainJson(res.body), {
		ok: false,
		success: false,
		error: 'Feedback não encontrado.',
		message: 'Feedback não encontrado.',
	});
	assert.equal(callLog.seamCalls.length, 0);
	assert.equal(callLog.apiOkCalls.length, 0);
});

test('deleteFeedback: owner delega apenas o nucleo de cleanup apos o delete principal', async () => {
	let seamArgs = null;
	const { deleteFeedback, callLog } = loadDeleteOwnerHarness({
		processFeedbackDeleteCleanupCore: async (input) => {
			callLog.seamCalls.push(input);
			seamArgs = input;
		},
	});

	const req = buildReq();
	const res = makeRes();

	await deleteFeedback(req, res);

	assert.ok(seamArgs, 'A futura seam deve receber apenas o nucleo de cleanup pos-delete.');
	assert.deepEqual(Object.keys(seamArgs).sort(), [
		'cwdProvider',
		'delBlob',
		'fb',
		'fsModule',
		'getBlobToken',
		'id',
		'logWarn',
		'pathModule',
	].sort());
	assert.equal(seamArgs.id, FEEDBACK_ID);
	assert.deepEqual(toPlainJson(seamArgs.fb), deletedFeedback());
	assert.equal(typeof seamArgs.getBlobToken, 'function');
	assert.equal(typeof seamArgs.delBlob, 'function');
	assert.equal(typeof seamArgs.cwdProvider, 'function');
	assert.equal(typeof seamArgs.logWarn, 'function');
	assert.equal('req' in seamArgs, false);
	assert.equal('res' in seamArgs, false);
	assert.equal('apiOk' in seamArgs, false);
	assert.equal('apiFail' in seamArgs, false);
	assert.equal(res.statusCode, 200);
	assert.deepEqual(toPlainJson(res.body), {
		ok: true,
		success: true,
		data: {
			id: FEEDBACK_ID,
			deleted: true,
		},
	});
});

test('deleteFeedback: owner preserva ordem estrutural owner -> seam -> resposta HTTP final', async () => {
	const callOrder = [];
	let seamArgs = null;
	const { deleteFeedback, callLog } = loadDeleteOwnerHarness({
		apiOk: (res, data = null, extra = {}) => {
			callOrder.push('apiOk');
			callLog.apiOkCalls.push([data, extra]);
			return makeResponseHelpers().apiOk(res, data, extra);
		},
		processFeedbackDeleteCleanupCore: async (input) => {
			callOrder.push('seam');
			callLog.seamCalls.push(input);
			seamArgs = input;
			const blobToken = input.getBlobToken();
			const anexos = Array.isArray(input.fb?.anexos) ? input.fb.anexos : [];
			const urls = anexos.map((a) => a && a.url).filter(Boolean).map(String);
			for (const url of urls) {
				try {
					await input.delBlob(url, blobToken ? { token: blobToken } : undefined);
				} catch {
					// noop
				}
			}
			try {
				const root = input.pathModule.join(input.cwdProvider());
				const absDir = input.pathModule.join(root, 'public', 'uploads', 'feedback', String(input.id));
				if (input.fsModule.existsSync(absDir)) input.fsModule.rmSync(absDir, { recursive: true, force: true });
			} catch (e) {
				input.logWarn('[feedbackApi] aviso: falha ao remover anexos do feedback (fs):', input.id, e?.message || e);
			}
		},
	});

	const req = buildReq();
	const res = makeRes();

	await deleteFeedback(req, res);

	assert.ok(seamArgs, 'A seam futura deve ser chamada no caminho de sucesso do delete.');
	assert.deepEqual(callOrder, ['seam', 'apiOk']);
	assert.equal(callLog.deleteCalls.length, 1);
	assert.equal(callLog.seamCalls.length, 1);
	assert.equal(res.statusCode, 200);
	assert.deepEqual(toPlainJson(res.body), {
		ok: true,
		success: true,
		data: {
			id: FEEDBACK_ID,
			deleted: true,
		},
	});
});

test('deleteFeedback: owner preserva tratamento de erro externo quando a seam falha', async () => {
	const { deleteFeedback, callLog } = loadDeleteOwnerHarness({
		processFeedbackDeleteCleanupCore: async (input) => {
			callLog.seamCalls.push(input);
			throw new Error('forced-feedback-delete-cleanup-failure');
		},
	});

	const req = buildReq();
	const res = makeRes();

	await deleteFeedback(req, res);

	assert.equal(callLog.seamCalls.length, 1);
	assert.equal(callLog.logErrorCalls.length, 1);
	assert.equal(res.statusCode, 500);
	assert.deepEqual(toPlainJson(res.body), {
		ok: false,
		success: false,
		error: 'Erro ao excluir feedback.',
		message: 'Erro ao excluir feedback.',
	});
});