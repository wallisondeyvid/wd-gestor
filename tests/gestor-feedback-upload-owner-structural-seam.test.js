import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROUTE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/routes/feedbackApi.js');
const POLICY_SERVICE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/services/feedback/createFeedbackPolicyOwnershipCore.service.js');
const UPLOAD_INFRA_PATH = path.join(process.cwd(), 'src/modules/gestor/app/routes/utils/createFeedbackUploadStorageInfra.js');
const ROUTE_SOURCE = fs.readFileSync(ROUTE_PATH, 'utf8');
const POLICY_SERVICE_SOURCE = fs.readFileSync(POLICY_SERVICE_PATH, 'utf8');
const UPLOAD_INFRA_SOURCE = fs.readFileSync(UPLOAD_INFRA_PATH, 'utf8');

function buildPolicyServiceSnippet() {
	return POLICY_SERVICE_SOURCE
		.replace(/export default createFeedbackPolicyOwnershipCore;\s*/g, '')
		.replace('export function createFeedbackPolicyOwnershipCore(', 'function createFeedbackPolicyOwnershipCore(');
}

function buildUploadInfraSnippet() {
	return UPLOAD_INFRA_SOURCE
		.replace(/import fs from 'fs';\r?\n/g, '')
		.replace(/import path from 'path';\r?\n/g, '')
		.replace(/import \{ put \} from '@vercel\/blob';\r?\n/g, '')
		.replace(/import \{ processFeedbackUploadStorageCore \} from '\.\/processFeedbackUploadStorageCore\.js';\r?\n\r?\n/g, '')
		.replace(/export default createFeedbackUploadStorageInfraCore;\s*/g, '')
		.replace('export function safeFileName(', 'function safeFileName(')
		.replace('export function getBlobToken(', 'function getBlobToken(')
		.replace('export function shouldUseBlobStorage(', 'function shouldUseBlobStorage(')
		.replace('export function isBlobNotConfiguredError(', 'function isBlobNotConfiguredError(')
		.replace('export function safeExtFromFile(', 'function safeExtFromFile(')
		.replace('export function createFeedbackUploadStorageInfraCore(', 'function createFeedbackUploadStorageInfraCore(');
}

function extractUploadOwnerSnippet(source) {
	const start = source.indexOf('function isAdminLike(');
	const end = source.indexOf('// Meus feedbacks', start);

	assert.ok(start >= 0, 'Nao foi possivel localizar o inicio do recorte de feedback upload.');
	assert.ok(end > start, 'Nao foi possivel localizar o fim do recorte de feedback upload.');

	return source.slice(start, end);
}

function buildDelegatedUploadSnippet() {
	const original = extractUploadOwnerSnippet(ROUTE_SOURCE);
	assert.match(original, /const uploadStorageInfra = createFeedbackUploadStorageInfraCore\(\);/);
	return original;
}

function createFakeRouter(registrations) {
	const router = {
		get(routePath, ...handlers) {
			registrations.push({ method: 'get', path: routePath, handlers });
			return router;
		},
		post(routePath, ...handlers) {
			registrations.push({ method: 'post', path: routePath, handlers });
			return router;
		},
		patch(routePath, ...handlers) {
			registrations.push({ method: 'patch', path: routePath, handlers });
			return router;
		},
		put(routePath, ...handlers) {
			registrations.push({ method: 'put', path: routePath, handlers });
			return router;
		},
		delete(routePath, ...handlers) {
			registrations.push({ method: 'delete', path: routePath, handlers });
			return router;
		},
	};

	return router;
}

function createResponseCapture() {
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

function toPlainJson(value) {
	return JSON.parse(JSON.stringify(value));
}

function loadUploadOwnerHarness(runtimeOverrides = {}) {
	const snippet = buildDelegatedUploadSnippet();
	const policyServiceSnippet = buildPolicyServiceSnippet();
	const uploadInfraSnippet = buildUploadInfraSnippet();
	const registrations = [];
	const router = createFakeRouter(registrations);
	const callLog = {
		createUploadHandlerCalls: [],
		createCreateHandlerCalls: [],
		seamCalls: [],
		apiFailCalls: [],
		apiOkCalls: [],
	};

	class FakeMulterError extends Error {
		constructor(code, fieldname) {
			super(code);
			this.code = code;
			this.fieldname = fieldname;
		}
	}

	const multerState = { nextError: null };
	const multer = Object.assign(
		() => ({
			any: () => (_req, _res, callback) => callback(multerState.nextError),
		}),
		{
			memoryStorage: () => ({}),
			MulterError: FakeMulterError,
		},
	);

	const deps = {
		router,
		requireLogin: runtimeOverrides.requireLogin ?? function requireLogin(_req, _res, next) {
			if (typeof next === 'function') next();
		},
		requireUnitScope: runtimeOverrides.requireUnitScope ?? function requireUnitScope(req, _res, next) {
			req.unitScope = req.unitScope || { unidadeId: '507f191e810c19729de860ff' };
			if (typeof next === 'function') next();
		},
		multer,
		put: runtimeOverrides.put ?? (async () => ({ url: 'https://blob.example/anexo.png' })),
		fs: runtimeOverrides.fs ?? {
			mkdirSync() {},
			writeFileSync() {},
			existsSync() { return false; },
			rmSync() {},
		},
		path,
		process: runtimeOverrides.process ?? {
			env: {},
			cwd: () => process.cwd(),
		},
		URL,
		findFeedbackById: runtimeOverrides.findFeedbackById ?? (async () => ({ _id: '507f1f77bcf86cd799439011' })),
		saveFeedbackDoc: runtimeOverrides.saveFeedbackDoc ?? (async () => {}),
		createFeedback: runtimeOverrides.createFeedback ?? (async () => ({})),
		createCreateFeedbackHandler: runtimeOverrides.createCreateFeedbackHandler ?? ((factoryDeps) => {
			callLog.createCreateHandlerCalls.push(factoryDeps);
			return function createFeedbackNoop(_req, _res, next) {
				if (typeof next === 'function') next();
			};
		}),
		createUploadFeedbackAnexoHandler: runtimeOverrides.createUploadFeedbackAnexoHandler ?? ((factoryDeps) => {
			callLog.createUploadHandlerCalls.push(factoryDeps);
			return async function uploadHandler(req, res) {
				const uploadResult = await factoryDeps.uploadStorageInfra.processUpload({
					file: req.file,
					files: req.files,
					baseUrl: req.baseUrl || '',
					feedbackId: String(req.params.feedbackId || ''),
				});
				return factoryDeps.apiOk(res, { uploadResult }, { id: req.params.feedbackId });
			};
		}),
		processFeedbackUploadStorageCore: runtimeOverrides.processFeedbackUploadStorageCore ?? (async (input) => {
			callLog.seamCalls.push(input);
			return { url: '/gestor/uploads/feedback/507f/anexo.png', storedIn: 'fs', originalName: 'anexo.png', stampedName: 'stamp.png' };
		}),
	};

	const factoryScript = new vm.Script(`(function (__deps) {
const router = __deps.router;
const requireLogin = __deps.requireLogin;
const requireUnitScope = __deps.requireUnitScope;
const multer = __deps.multer;
const put = __deps.put;
const fs = __deps.fs;
const path = __deps.path;
const process = __deps.process;
const URL = __deps.URL;
const createCreateFeedbackHandler = __deps.createCreateFeedbackHandler;
const createUploadFeedbackAnexoHandler = __deps.createUploadFeedbackAnexoHandler;
const createFeedback = __deps.createFeedback;
const findFeedbackById = __deps.findFeedbackById;
const saveFeedbackDoc = __deps.saveFeedbackDoc;
const processFeedbackUploadStorageCore = __deps.processFeedbackUploadStorageCore;
${policyServiceSnippet}
${uploadInfraSnippet}
${snippet}
return {
  registrations,
  uploadFeedbackAnexoMiddleware,
  safeFileName,
  getBlobToken,
  shouldUseBlobStorage,
  isBlobNotConfiguredError,
  safeExtFromFile,
	uploadStorageInfra,
};
})`);

	const factory = factoryScript.runInNewContext({ registrations });
	const api = factory(deps);

	return {
		...api,
		callLog,
		registrations,
		multerState,
		FakeMulterError,
		deps,
	};
}

test('feedback upload: route owner preserva wiring canonico da rota de anexo', () => {
	const { registrations, callLog, deps } = loadUploadOwnerHarness();

	const registration = registrations.find(
		(entry) => entry.method === 'post' && entry.path === '/api/feedback/:feedbackId/anexo',
	);

	assert.ok(registration, 'A rota canonica de upload de anexo deve permanecer registrada no route owner.');
	assert.equal(registration.handlers.length, 4);
	assert.equal(registration.handlers[0], deps.requireLogin);
	assert.equal(registration.handlers[1], deps.requireUnitScope);
	assert.equal(typeof registration.handlers[2], 'function');
	assert.equal(typeof registration.handlers[3], 'function');
	assert.equal(callLog.createUploadHandlerCalls.length, 1);
	assert.deepEqual(Object.keys(callLog.createUploadHandlerCalls[0]).sort(), [
		'apiFail',
		'apiOk',
		'feedbackPolicy',
		'findFeedbackById',
		'saveFeedbackDoc',
		'uploadStorageInfra',
	].sort());
});

test('feedback upload: route owner preserva traducao HTTP do middleware de upload', async () => {
	const { uploadFeedbackAnexoMiddleware, multerState, FakeMulterError } = loadUploadOwnerHarness();

	const cases = [
		[new FakeMulterError('LIMIT_UNEXPECTED_FILE', 'anexo'), 400, { ok: false, success: false, error: 'Tipo de arquivo inválido.', message: 'Tipo de arquivo inválido.' }],
		[new FakeMulterError('LIMIT_FILE_SIZE', 'anexo'), 400, { ok: false, success: false, error: 'Arquivo excede o limite de 5 MB.', message: 'Arquivo excede o limite de 5 MB.' }],
		[new FakeMulterError('LIMIT_FILE_COUNT', 'anexo'), 400, { ok: false, success: false, error: 'Envie no máximo 1 arquivo.', message: 'Envie no máximo 1 arquivo.' }],
	];

	for (const [error, expectedStatus, expectedBody] of cases) {
		multerState.nextError = error;
		const res = createResponseCapture();
		let nextArg = Symbol('not-called');

		uploadFeedbackAnexoMiddleware({}, res, (arg) => {
			nextArg = arg;
		});

		assert.equal(res.statusCode, expectedStatus);
		assert.deepEqual(toPlainJson(res.body), expectedBody);
		assert.equal(nextArg.description, 'not-called');
	}

	multerState.nextError = new Error('multer-unknown-error');
	const res = createResponseCapture();
	let nextArg = Symbol('not-called');

	uploadFeedbackAnexoMiddleware({}, res, (arg) => {
		nextArg = arg;
	});

	assert.equal(res.body, null);
	assert.equal(nextArg instanceof Error, true);
	assert.equal(nextArg.message, 'multer-unknown-error');
});

test('feedback upload: owner delega apenas o nucleo de storage local para a futura seam', async () => {
	let seamArgs = null;
	const { callLog } = loadUploadOwnerHarness({
		processFeedbackUploadStorageCore: async (input) => {
			callLog.seamCalls.push(input);
			seamArgs = input;
			return { url: '/gestor/uploads/feedback/507f/foto.png', storedIn: 'fs', originalName: 'foto 1.png', stampedName: 'stamp.png' };
		},
	});

	const factoryDeps = callLog.createUploadHandlerCalls[0];
	const result = await factoryDeps.uploadStorageInfra.processUpload({
		baseUrl: '/gestor',
		feedbackId: '507f1f77bcf86cd799439011',
		file: {
			originalname: 'foto 1.png',
			mimetype: 'image/png',
			buffer: Buffer.from('png'),
		},
	});

	assert.ok(seamArgs, 'A futura seam deve receber apenas o nucleo do corredor de storage.');
	assert.deepEqual(Object.keys(seamArgs).sort(), [
		'baseUrl',
		'cwdProvider',
		'feedbackId',
		'file',
		'fsModule',
		'getBlobToken',
		'isBlobNotConfiguredError',
		'isVercel',
		'pathModule',
		'putBlob',
		'safeExtFromFile',
		'safeFileName',
		'shouldUseBlobStorage',
	].sort());
	assert.equal(seamArgs.baseUrl, '/gestor');
	assert.equal(seamArgs.feedbackId, '507f1f77bcf86cd799439011');
	assert.equal(seamArgs.file.originalname, 'foto 1.png');
	assert.equal(seamArgs.file.mimetype, 'image/png');
	assert.equal(typeof seamArgs.safeFileName, 'function');
	assert.equal(typeof seamArgs.safeExtFromFile, 'function');
	assert.equal(typeof seamArgs.shouldUseBlobStorage, 'function');
	assert.equal(typeof seamArgs.getBlobToken, 'function');
	assert.equal(typeof seamArgs.putBlob, 'function');
	assert.equal(typeof seamArgs.cwdProvider, 'function');
	assert.equal(typeof seamArgs.isBlobNotConfiguredError, 'function');
	assert.equal(seamArgs.isVercel, false);
	assert.equal('req' in seamArgs, false);
	assert.equal('res' in seamArgs, false);
	assert.equal('apiOk' in seamArgs, false);
	assert.equal('apiFail' in seamArgs, false);
	assert.deepEqual(toPlainJson(result), {
		kind: 'stored',
		file: {
			originalname: 'foto 1.png',
			mimetype: 'image/png',
			buffer: { type: 'Buffer', data: [112, 110, 103] },
		},
		stored: {
			url: '/gestor/uploads/feedback/507f/foto.png',
			storedIn: 'fs',
			originalName: 'foto 1.png',
			stampedName: 'stamp.png',
		},
	});
});

test('feedback upload: ordem estrutural real permanece owner -> seam de storage -> resposta HTTP no handler', async () => {
	const callOrder = [];
	const createUploadHandlerCalls = [];
	const seamCalls = [];
	const { registrations, callLog } = loadUploadOwnerHarness({
		createUploadFeedbackAnexoHandler: (factoryDeps) => {
			createUploadHandlerCalls.push(factoryDeps);
			return async function uploadHandler(req, res) {
				callOrder.push('handler-start');
				const uploadResult = await factoryDeps.uploadStorageInfra.processUpload({
					file: req.file,
					files: req.files,
					baseUrl: req.baseUrl || '',
					feedbackId: String(req.params.feedbackId || ''),
				});
				callOrder.push('handler-response');
				return factoryDeps.apiOk(res, { uploadResult }, { id: req.params.feedbackId });
			};
		},
		processFeedbackUploadStorageCore: async (input) => {
			callOrder.push('seam');
			seamCalls.push(input);
			return { url: '/gestor/uploads/feedback/507f/foto.png', storedIn: 'fs', originalName: 'foto.png', stampedName: 'stamp.png' };
		},
	});

	const registration = registrations.find(
		(entry) => entry.method === 'post' && entry.path === '/api/feedback/:feedbackId/anexo',
	);
	const handler = registration.handlers[3];
	const res = createResponseCapture();

	await handler({
		params: { feedbackId: '507f1f77bcf86cd799439011' },
		unitScope: { unidadeId: '507f191e810c19729de860ff' },
		baseUrl: '/gestor',
		file: {
			originalname: 'foto.png',
			mimetype: 'image/png',
			buffer: Buffer.from('png'),
		},
	}, res);

	assert.deepEqual(callOrder, ['handler-start', 'seam', 'handler-response']);
	assert.equal(createUploadHandlerCalls.length, 1);
	assert.equal(callLog.createUploadHandlerCalls.length, 0);
	assert.equal(seamCalls.length, 1);
	assert.deepEqual(toPlainJson(res.body), {
		ok: true,
		success: true,
		data: {
			uploadResult: {
				kind: 'stored',
				file: {
					originalname: 'foto.png',
					mimetype: 'image/png',
					buffer: { type: 'Buffer', data: [112, 110, 103] },
				},
				stored: {
					url: '/gestor/uploads/feedback/507f/foto.png',
					storedIn: 'fs',
					originalName: 'foto.png',
					stampedName: 'stamp.png',
				},
			},
		},
		id: '507f1f77bcf86cd799439011',
	});
});