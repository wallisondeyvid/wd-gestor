import {
  findUserByEmailCond,
  deleteUserById,
} from '#modules/gestor/app/services/apiDbBridgeService.js';

export async function removeWrongMasterExecutionService({ email }) {
  const user = await findUserByEmailCond({ email });

  if (!user) {
    return { kind: 'not_found' };
  }

  await deleteUserById(user._id);

  return { kind: 'removed' };
}

export default removeWrongMasterExecutionService;