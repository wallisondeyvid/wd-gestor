import { saveUserDoc } from '#modules/gestor/app/services/apiDbBridgeService.js';

export async function unlockUsuarioExecutionService({ user } = {}) {
	user.failed_login_attempts = 0;
	user.lock_until = null;
	await saveUserDoc(user);

	return {
		kind: 'ok',
		userId: user._id,
		unlocked: true,
	};
}

export default unlockUsuarioExecutionService;