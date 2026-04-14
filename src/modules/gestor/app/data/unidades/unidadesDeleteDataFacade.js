import mongoose from 'mongoose';
import { createUnitScope } from '#shared/unitScope.js';
import {
  findUnidadeByIdLeanRepo,
  findUnidadeByIdRepo,
} from '#modules/gestor/app/repositories/UnidadeReadRepository.js';
import { deleteUnidadeByIdRepo } from '#modules/gestor/app/repositories/UnidadeWriteRepository.js';

function isValidUnidadeId(unidadeId) {
  return mongoose.isValidObjectId(unidadeId);
}

export async function findUnidadeByIdLean(unidadeId) {
  if (!isValidUnidadeId(unidadeId)) return null;

  return findUnidadeByIdLeanRepo({
    unitScope: createUnitScope({ unidadeId }),
    unidadeId,
  });
}

export async function findUnidadeById(unidadeId) {
  if (!isValidUnidadeId(unidadeId)) return null;

  return findUnidadeByIdRepo({
    unitScope: createUnitScope({ unidadeId }),
    setorUnidadeId: unidadeId,
  });
}

export async function deleteUnidadeById(unidadeId) {
  if (!isValidUnidadeId(unidadeId)) return undefined;

  return deleteUnidadeByIdRepo({
    unitScope: createUnitScope({ unidadeId }),
    unidadeId,
  });
}