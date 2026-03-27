import {
  findUserByEmailCondRepo,
  deleteUserByIdRepo,
} from '#modules/gestor/app/repositories/UserRepository.js';

const GLOBAL_SCOPE = { type: 'global', unidadeId: null };

export async function removeWrongMasterExecutionService({ email }) {
  const user = await findUserByEmailCondRepo({
    unitScope: GLOBAL_SCOPE,
    cond: { email },
  });

  if (!user) {
    return { kind: 'not_found' };
  }

  await deleteUserByIdRepo({
    unitScope: GLOBAL_SCOPE,
    userId: user._id,
  });

  return { kind: 'removed' };
}

export default removeWrongMasterExecutionService;