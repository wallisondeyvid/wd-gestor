import { findClusterUnidadesByAnchorLeanFromDb } from '#modules/gestor/app/services/apiDbBridgeService.js';

export async function findClusterUnidadesByAnchorService(anchorRaw) {
  return findClusterUnidadesByAnchorLeanFromDb(anchorRaw);
}

export default findClusterUnidadesByAnchorService;