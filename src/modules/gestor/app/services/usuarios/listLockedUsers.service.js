export async function listLockedUsersService(agora) {
  const { findUsersLockedAfterSelectLeanFromDb } = await import('#modules/gestor/app/services/apiDbBridgeService.js');
  return findUsersLockedAfterSelectLeanFromDb(agora);
}

export default listLockedUsersService;