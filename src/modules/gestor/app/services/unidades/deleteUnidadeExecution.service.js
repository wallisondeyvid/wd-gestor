import mongoose from 'mongoose';
import {
	findUnidadeById,
	findUnidadeByIdLean,
	deleteUnidadeById,
} from '#modules/gestor/app/data/unidades/unidadesDeleteDataFacade.js';

export async function findUnidadeDeleteCandidateService({ unidadeId }) {
	if (!mongoose.isValidObjectId(unidadeId)) {
		return findUnidadeById(unidadeId);
	}

	return findUnidadeByIdLean(unidadeId);
}

export async function deleteUnidadeExecutionService({ unidadeId }) {
	return deleteUnidadeById(unidadeId);
}

export default {
	findUnidadeDeleteCandidateService,
	deleteUnidadeExecutionService,
};