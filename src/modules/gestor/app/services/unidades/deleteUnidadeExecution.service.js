import mongoose from 'mongoose';
import {
	findUnidadeById as findUnidadeByIdBridge,
	findUnidadeByIdLean,
	deleteUnidadeById as deleteUnidadeByIdBridge,
} from '#modules/gestor/app/services/apiDbBridgeService.js';

export async function findUnidadeDeleteCandidateService({ unidadeId }) {
	if (!mongoose.isValidObjectId(unidadeId)) {
		return findUnidadeByIdBridge(unidadeId);
	}

	return findUnidadeByIdLean(unidadeId);
}

export async function deleteUnidadeExecutionService({ unidadeId }) {
	return deleteUnidadeByIdBridge(unidadeId);
}

export default {
	findUnidadeDeleteCandidateService,
	deleteUnidadeExecutionService,
};