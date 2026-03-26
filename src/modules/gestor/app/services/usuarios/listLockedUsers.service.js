import { createUnitScope } from '#shared/unitScope.js';
import { findUsersLockedAfterSelectLeanRepo } from '#modules/gestor/app/repositories/UserRepository.js';

const GLOBAL_SCOPE = createUnitScope({});

export async function listLockedUsersService(agora) {
  return findUsersLockedAfterSelectLeanRepo({ unitScope: GLOBAL_SCOPE, agora });
}

export default listLockedUsersService;