import {
	createModulo,
	findModuloByNome,
} from '#modules/gestor/app/services/apiDbBridgeService.js';

export async function createModuloExecutionService({ nome, descricao, status, url_base } = {}) {
	const dup = await findModuloByNome(nome);
	if (dup) {
		return { kind: 'duplicate_name' };
	}

	const modulo = await createModulo({ nome, descricao, status, url_base });
	return {
		kind: 'created',
		moduloId: modulo?._id,
	};
}

export default {
	createModuloExecutionService,
};