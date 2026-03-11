import assert from 'node:assert/strict';
import test from 'node:test';

import User from '#models/user.js';
import UserMembership from '#models/userMembership.js';

function indexByName(schema) {
	return new Map(schema.indexes().map(([key, options]) => [options?.name || JSON.stringify(key), { key, options: options || {} }]));
}

test('User expõe global_role opcional sem remover campos legados', () => {
	const path = User.schema.path('global_role');
	assert.ok(path);
	assert.deepEqual(path?.options?.enum, ['master', 'admin']);
	assert.equal(path?.defaultValue, null);
	assert.ok(User.schema.path('role'));
	assert.ok(User.schema.path('unidade_id'));
	assert.ok(User.schema.path('funcionario_id'));
});

test('UserMembership define campos e índices mínimos da fase 1', () => {
	assert.equal(UserMembership.collection.name, 'user_memberships');
	assert.ok(UserMembership.schema.path('user_id'));
	assert.ok(UserMembership.schema.path('unidade_id'));
	assert.ok(UserMembership.schema.path('papel_contextual'));
	assert.ok(UserMembership.schema.path('status'));
	assert.ok(UserMembership.schema.path('funcionario_id'));
	assert.ok(UserMembership.schema.path('origem'));

	const indexes = indexByName(UserMembership.schema);

	assert.deepEqual(indexes.get('uk_user_membership_user_unidade')?.key, { user_id: 1, unidade_id: 1 });
	assert.equal(indexes.get('uk_user_membership_user_unidade')?.options?.unique, true);

	assert.deepEqual(indexes.get('idx_user_membership_user_status')?.key, { user_id: 1, status: 1 });
	assert.deepEqual(indexes.get('idx_user_membership_unidade_status_papel')?.key, { unidade_id: 1, status: 1, papel_contextual: 1 });

	assert.deepEqual(indexes.get('uk_user_membership_unidade_funcionario')?.key, { unidade_id: 1, funcionario_id: 1 });
	assert.equal(indexes.get('uk_user_membership_unidade_funcionario')?.options?.unique, true);
	assert.deepEqual(indexes.get('uk_user_membership_unidade_funcionario')?.options?.partialFilterExpression, {
		funcionario_id: { $type: 'objectId' },
	});
});
