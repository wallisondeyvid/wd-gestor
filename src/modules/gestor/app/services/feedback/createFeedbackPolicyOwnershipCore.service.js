export function createFeedbackPolicyOwnershipCore({
  isAdminLike,
} = {}) {
  function resolveActor(currentUser) {
    const actorId = currentUser?._id || currentUser?.id || null;

    return {
      id: actorId ? String(actorId) : null,
      email: String(currentUser?.email || '').trim(),
      isAdmin: !!isAdminLike(currentUser || null),
    };
  }

  function ensureAdminAccess({ currentUser } = {}) {
    const actor = resolveActor(currentUser);
    if (!actor.isAdmin) return { allowed: false, error: 'forbidden' };
    return { allowed: true, actor };
  }

  function ensureCreatorOwnership({ currentUser, feedback } = {}) {
    const actor = resolveActor(currentUser);
    const creatorId = feedback?.criadoPor?.userId ? String(feedback.criadoPor.userId) : '';

    if (creatorId && actor.id && actor.id !== creatorId) {
      return { allowed: false, error: 'forbidden', actor };
    }

    return { allowed: true, actor };
  }

  function buildMyFeedbackFilter({ currentUser } = {}) {
    const actor = resolveActor(currentUser);
    const filter = actor.id ? { 'criadoPor.userId': actor.id } : { 'criadoPor.email': actor.email };

    return { filter, actor };
  }

  return {
    resolveActor,
    ensureAdminAccess,
    ensureCreatorOwnership,
    buildMyFeedbackFilter,
  };
}

export default createFeedbackPolicyOwnershipCore;