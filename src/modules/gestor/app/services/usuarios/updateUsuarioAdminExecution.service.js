import { saveUserDoc } from '#modules/gestor/app/services/apiDbBridgeService.js';

export async function updateUsuarioAdminExecutionService({ user, email = '', role = '' } = {}) {
	if (email) user.email = String(email).toLowerCase();
	if (role) user.role = role;

	await saveUserDoc(user);
	return user;
}

export default updateUsuarioAdminExecutionService;