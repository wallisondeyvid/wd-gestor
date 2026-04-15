import {
  deleteUserByIdRepo,
  findUserByEmailCondRepo,
} from '#modules/gestor/app/repositories/UserRepository.js';

const GLOBAL_SCOPE = { type: 'global', unidadeId: null };

export async function findWrongMasterUserByEmailData({ email }) {
  return findUserByEmailCondRepo({
    unitScope: GLOBAL_SCOPE,
    cond: { email },
  });
}

export async function deleteWrongMasterUserByIdData({ userId }) {
  return deleteUserByIdRepo({
    unitScope: GLOBAL_SCOPE,
    userId,
  });
}

export default {
  findWrongMasterUserByEmailData,
  deleteWrongMasterUserByIdData,
};