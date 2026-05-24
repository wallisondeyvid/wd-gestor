import assert from 'node:assert/strict';
import test from 'node:test';

import { createControlledMemoryOnlyUserFixture } from './helpers/controlledMemoryOnlyFixtureHelper.js';

test('exporta createControlledMemoryOnlyUserFixture como funcao', () => {
	assert.equal(typeof createControlledMemoryOnlyUserFixture, 'function');
});

test('falha fechado sem MONGO_MEMORY=1', async () => {
	const mockUserModel = {
		async create() {
			throw new Error('UserModel.create nao deveria ser chamado');
		},
	};

	const mockBcrypt = {
		async hash() {
			throw new Error('bcrypt.hash nao deveria ser chamado');
		},
	};

	await assert.rejects(
		() => createControlledMemoryOnlyUserFixture({
			UserModel: mockUserModel,
			bcrypt: mockBcrypt,
			env: {},
		}),
		/controlledMemoryOnlyFixtureHelper requires MONGO_MEMORY=1/
	);
	});

test('rejeita email fora de @example.com sem criar user', async () => {
	let createCalls = 0;
	let hashCalls = 0;

	const mockUserModel = {
		async create() {
			createCalls += 1;
			return { _id: 'nao-deveria-criar' };
		},
	};

	const mockBcrypt = {
		async hash() {
			hashCalls += 1;
			return 'hash-nao-deveria-ser-usado';
		},
	};

	await assert.rejects(
		() => createControlledMemoryOnlyUserFixture({
			UserModel: mockUserModel,
			bcrypt: mockBcrypt,
			env: { MONGO_MEMORY: '1' },
			email: 'usuario@dominio-real.com',
		}),
		/only accepts @example.com emails/
	);

	assert.equal(createCalls, 0);
	assert.equal(hashCalls, 0);
	});

test('rejeita wallisondeyvid13@gmail.com por nao ser @example.com', async () => {
	let createCalls = 0;
	let hashCalls = 0;

	const mockUserModel = {
		async create() {
			createCalls += 1;
			return { _id: 'nao-deveria-criar' };
		},
	};

	const mockBcrypt = {
		async hash() {
			hashCalls += 1;
			return 'hash-nao-deveria-ser-usado';
		},
	};

	await assert.rejects(
		() => createControlledMemoryOnlyUserFixture({
			UserModel: mockUserModel,
			bcrypt: mockBcrypt,
			env: { MONGO_MEMORY: '1' },
			email: 'wallisondeyvid13@gmail.com',
		}),
		/only accepts @example.com emails/
	);

	assert.equal(createCalls, 0);
	assert.equal(hashCalls, 0);
	});