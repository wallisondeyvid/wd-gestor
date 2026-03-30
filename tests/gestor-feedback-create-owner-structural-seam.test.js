import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/feedbackCreateApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

const CREATED_ID = '507f1f77bcf86cd799439011';

function extractCreateOwnerSnippet(source) {
	const start = source.indexOf('const ALLOWED_FEEDBACK_TYPES = new Set([');

	assert.ok(start >= 0, 'Nao foi possivel localizar o owner de createFeedback.');

	return source
		.slice(start)
		.replace("import { processCreateFeedbackCore } from './utils/processCreateFeedbackCore.js';\r\n", '')
		.replace("import { processCreateFeedbackCore } from './utils/processCreateFeedbackCore.js';\n", '')
		.replace('export function createCreateFeedbackHandler(', 'function createCreateFeedbackHandler(');
}

function buildDelegatedCreateSnippet() {
	const original = extractCreateOwnerSnippet(CONTROLLER_SOURCE);
	if (original.includes('processCreateFeedbackCore({')) {
		return original;
	}

	const coreBlockStart = original.indexOf('// Compat com o widget: { contexto: { url, timezone, user_agent, page_label, viewport } }');
	const coreBlockEndMarker = "return apiOk(res, fb.toObject(), { id: fb._id, created: true });";
	const coreBlockEnd = original.indexOf(coreBlockEndMarker, coreBlockStart);
	assert.ok(coreBlockStart >= 0 && coreBlockEnd >= 0, 'Nao foi possivel localizar o bloco atual de createFeedback.');
	const coreBlock = original.slice(coreBlockStart, coreBlockEnd + coreBlockEndMarker.length);

	const delegatedBlock = [
		'const createResult = await processCreateFeedbackCore({',
		'  mensagem,',
		'  tipo,',
		"  rawModulo: String(req.body?.module || req.body?.modulo || '').trim(),",
		'  contexto: req.body && typeof req.body === \'object\' && req.body.contexto && typeof req.body.contexto === \'object\' ? req.body.contexto : null,',
		"  bodyUrl: String(req.body?.url || '').trim(),",
		"  bodyTimezone: String(req.body?.timezone || '').trim(),",
		"  bodyUserAgent: String(req.body?.userAgent || '').trim(),",
		"  referer: String(req.get('referer') || '').trim(),",
		"  headerUserAgent: String(req.get('user-agent') || '').trim(),",
		'  user: req.user || null,',
		'  inferModuloFromUrl,',
		'  createFeedback,',
		'});',
		'return apiOk(res, createResult.toObject(), { id: createResult._id, created: true });',
	].join('\n\t\t');

	const replaced = original.replace(coreBlock, delegatedBlock);
	assert.notEqual(replaced, original, 'Nao foi possivel instalar a seam estrutural de createFeedback em memoria.');
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

function createdFeedback(overrides = {}) {
	return {
		_id: CREATED_ID,
		tipo: 'elogio',
		status: 'novo',
		mensagem: 'Mensagem de criação contrato',
		criadoPor: {
			userId: '507f191e810c19729de860ea',
			email: 'create.feedback@test.local',
			nome: 'Create Feedback',
			role: 'user',
		},
		origem: {
			modulo: 'modulo_explicito',
			path: 'https://app.local/contexto/ignorado',
			userAgent: 'ctx-agent',
			timezone: 'America/Sao_Paulo',
		},
		toObject() {
			const { toObject, ...plain } = this;
			return JSON.parse(JSON.stringify(plain));
		},
		...overrides,
	};
}

function buildReq(overrides = {}) {
	const { body: bodyOverrides = {}, user: userOverrides = {}, headers: headerOverrides = {}, ...restOverrides } = overrides;
	const defaultBody = {
		mensagem: 'Mensagem de criação contrato',
		tipo: 'ELOGIO',
		module: 'modulo_explicito',
		contexto: {
			url: 'https://app.local/contexto/ignorado',
			timezone: 'America/Sao_Paulo',
			user_agent: 'ctx-agent',
		},
	};

	const headers = {
		referer: 'https://app.local/referer/ignorado',
		'user-agent': 'header-agent',
		...headerOverrides,
	};

	return {
		body: { ...defaultBody, ...bodyOverrides },
		user: {
			_id: '507f191e810c19729de860ea',
			id: '507f191e810c19729de860ea',
			email: 'create.feedback@test.local',
			nome: 'Create Feedback',
			role: 'user',
			...userOverrides,
		},
		headers,
		get(name) {
			return headers[String(name).toLowerCase()] || '';
		},
		...restOverrides,
	};
}

function toPlainJson(value) {
	return JSON.parse(JSON.stringify(value));
}

function loadCreateOwnerHarness(runtimeOverrides = {}) {
	const snippet = buildDelegatedCreateSnippet();
	const responseHelpers = makeResponseHelpers();
	const callLog = {
		seamCalls: [],
		apiOkCalls: [],
		apiFailCalls: [],
		createFeedbackCalls: [],
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
		normalizeTipo: runtimeOverrides.normalizeTipo ?? ((value) => String(value || '').trim().toLowerCase() || 'outro'),
		inferModuloFromUrl: runtimeOverrides.inferModuloFromUrl ?? ((value) => String(value || '').trim().replace(/^https?:\/\/[^/]+\//, '').replace(/^\/+/, '').split('/')[0] || ''),
		createFeedback: runtimeOverrides.createFeedback ?? (async (payload) => {
			callLog.createFeedbackCalls.push([payload]);
			return createdFeedback({ ...payload });
		}),
		processCreateFeedbackCore: runtimeOverrides.processCreateFeedbackCore ?? (async (input) => {
			callLog.seamCalls.push(input);
			return createdFeedback();
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
const apiOk = __deps.apiOk;
const apiFail = __deps.apiFail;
const normalizeTipo = __deps.normalizeTipo;
const inferModuloFromUrl = __deps.inferModuloFromUrl;
const createFeedback = __deps.createFeedback;
const processCreateFeedbackCore = __deps.processCreateFeedbackCore;
const console = __deps.console;
${snippet}
return {
	createFeedbackHandler: createCreateFeedbackHandler({
		apiOk,
		apiFail,
		normalizeTipo,
		inferModuloFromUrl,
		createFeedback,
	}),
};
})`);

	const factory = factoryScript.runInNewContext({});
	return {
		...factory(deps),
		callLog,
	};
}

test('createFeedback: owner preserva mensagem obrigatoria antes da seam', async () => {
	const { createFeedbackHandler, callLog } = loadCreateOwnerHarness({
		processCreateFeedbackCore: async () => {
			throw new Error('nao deve delegar create sem mensagem');
		},
	});

	const req = buildReq({ body: { mensagem: '   ' } });
	const res = makeRes();

	await createFeedbackHandler(req, res);

	assert.equal(res.statusCode, 400);
	assert.deepEqual(toPlainJson(res.body), {
		ok: false,
		success: false,
		error: 'Mensagem é obrigatória.',
		message: 'Mensagem é obrigatória.',
	});
	assert.equal(callLog.seamCalls.length, 0);
	assert.equal(callLog.apiOkCalls.length, 0);
	assert.equal(callLog.createFeedbackCalls.length, 0);
});

test('createFeedback: owner preserva limite maximo de mensagem antes da seam', async () => {
	const { createFeedbackHandler, callLog } = loadCreateOwnerHarness({
		processCreateFeedbackCore: async () => {
			throw new Error('nao deve delegar create com mensagem acima do limite');
		},
	});

	const req = buildReq({ body: { mensagem: 'x'.repeat(5001) } });
	const res = makeRes();

	await createFeedbackHandler(req, res);

	assert.equal(res.statusCode, 400);
	assert.deepEqual(toPlainJson(res.body), {
		ok: false,
		success: false,
		error: 'Mensagem deve ter no máximo 4000 caracteres.',
		message: 'Mensagem deve ter no máximo 4000 caracteres.',
	});
	assert.equal(callLog.seamCalls.length, 0);
	assert.equal(callLog.apiOkCalls.length, 0);
	assert.equal(callLog.createFeedbackCalls.length, 0);
});

test('createFeedback: owner preserva validacao de tipo permitido antes da seam', async () => {
	const { createFeedbackHandler, callLog } = loadCreateOwnerHarness({
		processCreateFeedbackCore: async () => {
			throw new Error('nao deve delegar create com tipo invalido');
		},
	});

	const req = buildReq({ body: { tipo: 'tipo-invalido' } });
	const res = makeRes();

	await createFeedbackHandler(req, res);

	assert.equal(res.statusCode, 400);
	assert.deepEqual(toPlainJson(res.body), {
		ok: false,
		success: false,
		error: 'Tipo inválido.',
		message: 'Tipo inválido.',
	});
	assert.equal(callLog.seamCalls.length, 0);
	assert.equal(callLog.apiOkCalls.length, 0);
	assert.equal(callLog.createFeedbackCalls.length, 0);
});

test('createFeedback: owner delega apenas o nucleo canonizado de criacao', async () => {
	let seamArgs = null;
	const { createFeedbackHandler, callLog } = loadCreateOwnerHarness({
		processCreateFeedbackCore: async (input) => {
			callLog.seamCalls.push(input);
			seamArgs = input;
			return createdFeedback();
		},
	});

	const req = buildReq();
	const res = makeRes();

	await createFeedbackHandler(req, res);

	assert.ok(seamArgs, 'A futura seam deve receber apenas o nucleo canonizado de createFeedback.');
	assert.deepEqual(Object.keys(seamArgs).sort(), [
		'bodyTimezone',
		'bodyUrl',
		'bodyUserAgent',
		'contexto',
		'createFeedback',
		'headerUserAgent',
		'inferModuloFromUrl',
		'mensagem',
		'rawModulo',
		'referer',
		'tipo',
		'user',
	].sort());
	assert.equal(seamArgs.mensagem, 'Mensagem de criação contrato');
	assert.equal(seamArgs.tipo, 'elogio');
	assert.equal(seamArgs.rawModulo, 'modulo_explicito');
	assert.deepEqual(toPlainJson(seamArgs.contexto), {
		url: 'https://app.local/contexto/ignorado',
		timezone: 'America/Sao_Paulo',
		user_agent: 'ctx-agent',
	});
	assert.equal(seamArgs.bodyUrl, '');
	assert.equal(seamArgs.bodyTimezone, '');
	assert.equal(seamArgs.bodyUserAgent, '');
	assert.equal(seamArgs.referer, 'https://app.local/referer/ignorado');
	assert.equal(seamArgs.headerUserAgent, 'header-agent');
	assert.deepEqual(toPlainJson(seamArgs.user), {
		_id: '507f191e810c19729de860ea',
		id: '507f191e810c19729de860ea',
		email: 'create.feedback@test.local',
		nome: 'Create Feedback',
		role: 'user',
	});
	assert.equal(typeof seamArgs.inferModuloFromUrl, 'function');
	assert.equal(typeof seamArgs.createFeedback, 'function');
	assert.equal('req' in seamArgs, false);
	assert.equal('res' in seamArgs, false);
	assert.equal('apiOk' in seamArgs, false);
	assert.equal('apiFail' in seamArgs, false);
	assert.equal(res.statusCode, 200);
	assert.deepEqual(toPlainJson(res.body), {
		ok: true,
		success: true,
		data: {
			_id: CREATED_ID,
			tipo: 'elogio',
			status: 'novo',
			mensagem: 'Mensagem de criação contrato',
			criadoPor: {
				userId: '507f191e810c19729de860ea',
				email: 'create.feedback@test.local',
				nome: 'Create Feedback',
				role: 'user',
			},
			origem: {
				modulo: 'modulo_explicito',
				path: 'https://app.local/contexto/ignorado',
				userAgent: 'ctx-agent',
				timezone: 'America/Sao_Paulo',
			},
		},
		id: CREATED_ID,
		created: true,
	});
});

test('createFeedback: owner preserva ordem estrutural owner -> seam -> resposta HTTP final', async () => {
	const callOrder = [];
	let seamArgs = null;
	const { createFeedbackHandler, callLog } = loadCreateOwnerHarness({
		apiOk: (res, data = null, extra = {}) => {
			callOrder.push('apiOk');
			callLog.apiOkCalls.push([data, extra]);
			return makeResponseHelpers().apiOk(res, data, extra);
		},
		processCreateFeedbackCore: async (input) => {
			callOrder.push('seam');
			callLog.seamCalls.push(input);
			seamArgs = input;

			const ctx = input.contexto && typeof input.contexto === 'object' ? input.contexto : null;
			const ctxUrl = String(((ctx && (ctx.url || ctx.path)) || input.bodyUrl || '')).trim();
			const ctxTz = String(((ctx && (ctx.timezone || ctx.tz)) || input.bodyTimezone || '')).trim();
			const ctxUa = String(((ctx && (ctx.user_agent || ctx.userAgent)) || input.bodyUserAgent || '')).trim();
			const inferredModulo = String(input.rawModulo || '').trim() || input.inferModuloFromUrl(ctxUrl) || input.inferModuloFromUrl(input.referer);
			const fb = await input.createFeedback({
				tipo: input.tipo,
				status: 'novo',
				mensagem: input.mensagem,
				criadoPor: {
					userId: input.user?._id || input.user?.id || null,
					email: input.user?.email || '',
					nome: input.user?.nome || '',
					role: input.user?.role || '',
				},
				origem: {
					modulo: String(inferredModulo || '').trim(),
					path: String(ctxUrl || '').trim(),
					userAgent: String(ctxUa || input.headerUserAgent || '').trim(),
					timezone: String(ctxTz || '').trim(),
				},
			});
			return fb;
		},
	});

	const req = buildReq();
	const res = makeRes();

	await createFeedbackHandler(req, res);

	assert.ok(seamArgs, 'A seam futura deve ser chamada no caminho de sucesso do create.');
	assert.deepEqual(callOrder, ['seam', 'apiOk']);
	assert.equal(callLog.seamCalls.length, 1);
	assert.equal(callLog.createFeedbackCalls.length, 1);
	assert.equal(res.statusCode, 200);
});

test('createFeedback: owner preserva tratamento de erro externo quando a seam falha', async () => {
	const { createFeedbackHandler, callLog } = loadCreateOwnerHarness({
		processCreateFeedbackCore: async (input) => {
			callLog.seamCalls.push(input);
			throw new Error('forced-feedback-create-structural-failure');
		},
	});

	const req = buildReq();
	const res = makeRes();

	await createFeedbackHandler(req, res);

	assert.equal(callLog.seamCalls.length, 1);
	assert.equal(callLog.logErrorCalls.length, 1);
	assert.equal(res.statusCode, 500);
	assert.deepEqual(toPlainJson(res.body), {
		ok: false,
		success: false,
		error: 'Erro ao criar feedback.',
		message: 'Erro ao criar feedback.',
	});
});