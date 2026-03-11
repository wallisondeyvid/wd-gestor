import assert from 'node:assert/strict';
import test from 'node:test';

import {
	BACKFILL_ORIGIN,
	planLegacyUserBackfill,
	resolveDesiredContextualRole,
	resolveDesiredGlobalRole,
} from '../scripts/migrations/2026-03-11_backfill-user-memberships-fase2.js';

const IDS = Object.freeze({
	user: '65f000000000000000000001',
	unit: '65f000000000000000000002',
	func: '65f000000000000000000003',
	otherUser: '65f000000000000000000004',
	membership: '65f000000000000000000005',
});

test('resolve mapeia papeis globais e contextuais corretamente', () => {
	assert.equal(resolveDesiredGlobalRole({ role: 'master' }), 'master');
	assert.equal(resolveDesiredGlobalRole({ role: 'admin' }), 'admin');
	assert.equal(resolveDesiredGlobalRole({ role: 'user' }), null);

	assert.equal(resolveDesiredContextualRole({ role: 'diretor' }), 'gestor');
	assert.equal(resolveDesiredContextualRole({ role: 'user' }), 'user');
	assert.equal(resolveDesiredContextualRole({ role: 'admin' }), null);
});

test('master define global_role e nao exige membership contextual', () => {
	const plan = planLegacyUserBackfill({
		user: { _id: IDS.user, email: 'master@example.com', role: 'master', global_role: null },
	});

	assert.equal(plan.globalRoleAction, 'set');
	assert.equal(plan.membershipAction, 'none');
	assert.equal(plan.flags.withoutRoleContextual, true);
	assert.equal(plan.anomalies.length, 0);
});

test('diretor com unidade e funcionario validos gera membership gestor', () => {
	const plan = planLegacyUserBackfill({
		user: {
			_id: IDS.user,
			email: 'diretor@example.com',
			role: 'diretor',
			unidade_id: IDS.unit,
			funcionario_id: IDS.func,
			ativo: true,
		},
		unitDoc: { _id: IDS.unit },
		funcionarioDoc: { _id: IDS.func, unidade_id: IDS.unit, usuario_id: IDS.user },
	});

	assert.equal(plan.membershipAction, 'create');
	assert.deepEqual(plan.desiredMembership, {
		user_id: IDS.user,
		unidade_id: IDS.unit,
		papel_contextual: 'gestor',
		status: 'active',
		funcionario_id: IDS.func,
		origem: BACKFILL_ORIGIN,
	});
	assert.equal(plan.anomalies.length, 0);
});

test('user contextual sem unidade gera anomalia e nao cria membership', () => {
	const plan = planLegacyUserBackfill({
		user: { _id: IDS.user, email: 'user@example.com', role: 'user', unidade_id: null },
	});

	assert.equal(plan.membershipAction, 'none');
	assert.equal(plan.flags.withoutUnitContextual, true);
	assert.equal(plan.anomalies[0]?.code, 'CONTEXTUAL_ROLE_WITHOUT_UNIDADE_ID');
});

test('membership existente com funcionario divergente vira conflito e nao e sobrescrito', () => {
	const plan = planLegacyUserBackfill({
		user: {
			_id: IDS.user,
			email: 'user@example.com',
			role: 'user',
			unidade_id: IDS.unit,
			funcionario_id: IDS.func,
			ativo: false,
		},
		unitDoc: { _id: IDS.unit },
		funcionarioDoc: { _id: IDS.func, unidade_id: IDS.unit, usuario_id: IDS.user },
		existingMembership: {
			_id: IDS.membership,
			user_id: IDS.user,
			unidade_id: IDS.unit,
			papel_contextual: 'user',
			status: 'active',
			funcionario_id: null,
			origem: BACKFILL_ORIGIN,
		},
	});

	assert.equal(plan.membershipAction, 'none');
	assert.equal(plan.anomalies[0]?.code, 'MEMBERSHIP_FUNCIONARIO_CONFLICT');
});

test('ocupacao previa do mesmo funcionario por outro membership vira anomalia', () => {
	const plan = planLegacyUserBackfill({
		user: {
			_id: IDS.user,
			email: 'user@example.com',
			role: 'user',
			unidade_id: IDS.unit,
			funcionario_id: IDS.func,
		},
		unitDoc: { _id: IDS.unit },
		funcionarioDoc: { _id: IDS.func, unidade_id: IDS.unit, usuario_id: IDS.user },
		occupyingMembershipByFunc: {
			_id: IDS.membership,
			user_id: IDS.otherUser,
			unidade_id: IDS.unit,
			funcionario_id: IDS.func,
		},
	});

	assert.equal(plan.membershipAction, 'none');
	assert.equal(plan.anomalies[0]?.code, 'MEMBERSHIP_FUNCIONARIO_OCCUPIED');
});
