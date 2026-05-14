import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const SERVICE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/services/usuarios/createUsuarioExecution.service.js');
const SERVICE_SOURCE = fs.readFileSync(SERVICE_PATH, 'utf8');

function extractFunction(source, signature) {
	const start = source.indexOf(signature);
	assert.ok(start >= 0, `Nao encontrou assinatura: ${signature}`);

	const paramsEnd = source.indexOf(')', start);
	assert.ok(paramsEnd >= 0, `Nao encontrou fechamento de parametros para: ${signature}`);

	const braceStart = source.indexOf('{', paramsEnd);
	assert.ok(braceStart >= 0, `Nao encontrou bloco para: ${signature}`);

	let depth = 0;
	for (let index = braceStart; index < source.length; index += 1) {
		const char = source[index];
		if (char === '{') depth += 1;
		if (char === '}') {
			depth -= 1;
			if (depth === 0) {
				return source.slice(start, index + 1).replace(/^export\s+/, '');
			}
		}
	}

	throw new Error(`Nao conseguiu extrair funcao: ${signature}`);
}

function extractBlock(source, marker) {
	const start = source.indexOf(marker);
	assert.ok(start >= 0, `Nao encontrou marcador: ${marker}`);

	const braceStart = source.indexOf('{', start);
	assert.ok(braceStart >= 0, `Nao encontrou bloco para marcador: ${marker}`);

	let depth = 0;
	for (let index = braceStart; index < source.length; index += 1) {
		const char = source[index];
		if (char === '{') depth += 1;
		if (char === '}') {
			depth -= 1;
			if (depth === 0) {
				return source.slice(start, index + 1);
			}
		}
	}

	throw new Error(`Nao conseguiu extrair bloco: ${marker}`);
}

function buildFunction(source, signature, context = {}) {
	const functionSource = extractFunction(source, signature);
	const script = new vm.Script(`(${functionSource})`);
	return script.runInNewContext(context);
}

function stripComments(source) {
	return source
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/(^|\s)\/\/.*$/gm, '$1');
}

const helperSource = extractFunction(SERVICE_SOURCE, 'async function materializeCriarUsuarioFuncionarioLinkCore');
const duplicateRecoveryBlock = extractBlock(helperSource, 'if (isDup) {');

test('protecao estrutural denuncia duplicate key sem repasse tenant-aware explicito', () => {
	const normalizedBlock = stripComments(duplicateRecoveryBlock);

	assert.match(
		normalizedBlock,
		/setCriarUsuarioFuncionarioUsuarioIdById\(\s*existente\._id\s*,\s*user\._id\s*,\s*existente\.unidade_id\s*\|\|\s*unidadeId\s*\|\|\s*null\s*\)/,
	);
	assert.doesNotMatch(
		normalizedBlock,
		/setCriarUsuarioFuncionarioUsuarioIdById\(\s*existente\._id\s*,\s*user\._id\s*\)/,
	);
});

test('protecao contratual exige unidade contextual no religamento apos duplicate key', async () => {
	const setByIdCalls = [];
	let findCalls = 0;

	const materializeCriarUsuarioFuncionarioLinkCore = buildFunction(
		SERVICE_SOURCE,
		'async function materializeCriarUsuarioFuncionarioLinkCore',
		{
			saveUserDoc: async () => undefined,
			findCriarUsuarioFuncionarioByCpfUnidade: async () => {
				findCalls += 1;
				if (findCalls === 1) return null;
				return { _id: 'func-existing', unidade_id: 'unit-existing' };
			},
			setCriarUsuarioFuncionarioUsuarioIdIfEmpty: async () => {
				throw new Error('setIfEmpty nao deveria ser chamado no ramo duplicate key');
			},
			setCriarUsuarioFuncionarioUsuarioIdById: async (...args) => {
				setByIdCalls.push(args);
				return { acknowledged: true, modifiedCount: 1 };
			},
			createCriarUsuarioFuncionarioDoc: async () => {
				const error = new Error('duplicate key');
				error.code = 11000;
				throw error;
			},
			console,
			Date,
			String,
		},
	);

	const result = await materializeCriarUsuarioFuncionarioLinkCore({
		user: { _id: 'user-1', unidade_id: null, funcionario_id: null },
		isExistingUser: false,
		nome: 'Novo Usuario',
		email: 'novo@example.com',
		cleanCpf: '12345678900',
		unidadeId: 'unit-fallback',
		funcionarioId: null,
		funcionarioDoc: null,
		wantsNewFuncionario: true,
	});

	assert.equal(result.kind, 'ok');
	assert.deepEqual(setByIdCalls, [['func-existing', 'user-1', 'unit-existing']]);
});

test('ramos ja corretos preservam contexto de unidade no setIfEmpty e no setById anterior ao conflito', async () => {
	const setIfEmptyCalls = [];
	const setByIdCalls = [];

	const materializeCriarUsuarioFuncionarioLinkCore = buildFunction(
		SERVICE_SOURCE,
		'async function materializeCriarUsuarioFuncionarioLinkCore',
		{
			saveUserDoc: async () => undefined,
			findCriarUsuarioFuncionarioByCpfUnidade: async () => ({ _id: 'func-existing', unidade_id: 'unit-existing' }),
			setCriarUsuarioFuncionarioUsuarioIdIfEmpty: async (...args) => {
				setIfEmptyCalls.push(args);
				return { acknowledged: true, modifiedCount: 1 };
			},
			setCriarUsuarioFuncionarioUsuarioIdById: async (...args) => {
				setByIdCalls.push(args);
				return { acknowledged: true, modifiedCount: 1 };
			},
			createCriarUsuarioFuncionarioDoc: async () => {
				throw new Error('createFuncionarioDoc nao deveria ser chamado neste cenario');
			},
			console,
			Date,
			String,
		},
	);

	await materializeCriarUsuarioFuncionarioLinkCore({
		user: { _id: 'user-1', unidade_id: null, funcionario_id: null },
		isExistingUser: false,
		nome: 'Usuario com funcionario informado',
		email: 'doc@example.com',
		cleanCpf: '12345678900',
		unidadeId: 'unit-fallback',
		funcionarioId: 'func-doc',
		funcionarioDoc: { _id: 'func-doc', unidade_id: 'unit-doc' },
		wantsNewFuncionario: false,
	});

	await materializeCriarUsuarioFuncionarioLinkCore({
		user: { _id: 'user-2', unidade_id: null, funcionario_id: null },
		isExistingUser: false,
		nome: 'Usuario com existente',
		email: 'existente@example.com',
		cleanCpf: '12345678900',
		unidadeId: 'unit-fallback',
		funcionarioId: null,
		funcionarioDoc: null,
		wantsNewFuncionario: true,
	});

	assert.deepEqual(setIfEmptyCalls, [['func-doc', 'user-1', 'unit-doc']]);
	assert.deepEqual(setByIdCalls, [['func-existing', 'user-2', 'unit-existing']]);
});

test('ramos semanticos relevantes permanecem protegidos sem runtime real', async () => {
	const isDuplicateKeyError = buildFunction(SERVICE_SOURCE, 'function isDuplicateKeyError', {});
	const normalizeRoleValue = buildFunction(SERVICE_SOURCE, 'function normalizeRoleValue', {});
	const resolvePapelContextualFromRole = buildFunction(SERVICE_SOURCE, 'function resolvePapelContextualFromRole', {
		normalizeRoleValue,
	});
	const buildUserMembershipPayload = buildFunction(SERVICE_SOURCE, 'function buildUserMembershipPayload', {
		resolvePapelContextualFromRole,
	});
	const materializeCriarUsuarioMembershipCore = buildFunction(
		SERVICE_SOURCE,
		'async function materializeCriarUsuarioMembershipCore',
		{
			buildUserMembershipPayload,
			createUserMembership: async () => {
				const error = new Error('duplicate key');
				error.code = 11000;
				throw error;
			},
			isDuplicateKeyError,
			console,
		},
	);
	const materializeCriarUsuarioFuncionarioLinkCore = buildFunction(
		SERVICE_SOURCE,
		'async function materializeCriarUsuarioFuncionarioLinkCore',
		{
			saveUserDoc: async () => undefined,
			findCriarUsuarioFuncionarioByCpfUnidade: async () => null,
			setCriarUsuarioFuncionarioUsuarioIdIfEmpty: async () => undefined,
			setCriarUsuarioFuncionarioUsuarioIdById: async () => undefined,
			createCriarUsuarioFuncionarioDoc: async () => {
				throw new Error('falha externa nao-duplicate');
			},
			console,
			Date,
			String,
		},
	);

	const membershipResult = await materializeCriarUsuarioMembershipCore({
		userId: 'user-1',
		requestedUserRole: 'user',
		unidadeId: 'unit-1',
		linkedFuncionarioId: 'func-1',
	});
	assert.deepEqual(membershipResult, { kind: 'membership_duplicate' });

	const funcionarioErrorResult = await materializeCriarUsuarioFuncionarioLinkCore({
		user: { _id: 'user-2', unidade_id: null, funcionario_id: null },
		isExistingUser: false,
		nome: 'Erro Funcionario',
		email: 'erro@example.com',
		cleanCpf: '12345678900',
		unidadeId: 'unit-1',
		funcionarioId: null,
		funcionarioDoc: null,
		wantsNewFuncionario: true,
	});
	assert.equal(funcionarioErrorResult.kind, 'funcionario_create_error');
	assert.match(funcionarioErrorResult.message, /Falha ao criar funcionario automatico/i);
});
