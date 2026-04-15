import {
  deleteWrongMasterUserByIdData,
  findWrongMasterUserByEmailData,
} from '#modules/gestor/app/data/debug/removeWrongMasterExecutionDataFacade.js';

export async function removeWrongMasterExecutionService({ email }) {
  const user = await findWrongMasterUserByEmailData({ email });

  if (!user) {
    return { kind: 'not_found' };
  }

  await deleteWrongMasterUserByIdData({ userId: user._id });

  return { kind: 'removed' };
}

export default removeWrongMasterExecutionService;