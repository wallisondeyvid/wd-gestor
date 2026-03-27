import mongoose from 'mongoose';
import { createUnitScope } from '#shared/unitScope.js';
import { findUnidadeByIdLeanRepo } from '#modules/gestor/app/repositories/UnidadeReadRepository.js';
import { deleteUnidadeByIdRepo } from '#modules/gestor/app/repositories/UnidadeWriteRepository.js';
import {
	findUnidadeById as findUnidadeByIdBridge,
	deleteUnidadeById as deleteUnidadeByIdBridge,
} from '#modules/gestor/app/services/apiDbBridgeService.js';

function buildUnitScope(unidadeId) {
	return createUnitScope({ unidadeId });
}

export async function findUnidadeDeleteCandidateService({ unidadeId }) {
	if (!mongoose.isValidObjectId(unidadeId)) {
		return findUnidadeByIdBridge(unidadeId);
	}

	return findUnidadeByIdLeanRepo({
		unitScope: buildUnitScope(unidadeId),
		unidadeId,
	});
}

export async function deleteUnidadeExecutionService({ unidadeId }) {
	if (!mongoose.isValidObjectId(unidadeId)) {
		return deleteUnidadeByIdBridge(unidadeId);
	}

	return deleteUnidadeByIdRepo({
		unitScope: buildUnitScope(unidadeId),
		unidadeId,
	});
}

export default {
	findUnidadeDeleteCandidateService,
	deleteUnidadeExecutionService,
};