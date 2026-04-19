export function createFeedbackPolicyOwnershipCore({
  isAdminLike,
} = {}) {
  function normalizeUnitId(value) {
    return String(value || '').trim();
  }

  function resolveActor(currentUser) {
    const actorId = currentUser?._id || currentUser?.id || null;

    return {
      id: actorId ? String(actorId) : null,
      email: String(currentUser?.email || '').trim(),
      isAdmin: !!isAdminLike(currentUser || null),
    };
  }

  function resolveCanonicalContextUnitId({ scopedUnitId } = {}) {
    return normalizeUnitId(scopedUnitId);
  }

  function ensureAdminAccess(options = {}) {
    const { currentUser } = options;
    const actor = resolveActor(currentUser);
    const canonicalContextUnitId = resolveCanonicalContextUnitId(options);
    if (!actor.isAdmin) return { allowed: false, error: 'forbidden' };

    const feedbackQueryOptions = canonicalContextUnitId
      ? {
          scopedUnitId: canonicalContextUnitId,
          allowLegacyUnscoped: true,
          preferScopedRepoRead: true,
        }
      : {};

    const feedbackMutationOptions = canonicalContextUnitId
      ? {
          scopedUnitId: canonicalContextUnitId,
          allowLegacyUnscoped: true,
        }
      : {};

    return {
      allowed: true,
      actor,
      canonicalContextUnitId,
      branch: canonicalContextUnitId ? 'contextual' : 'global',
      feedbackQueryOptions,
      feedbackMutationOptions,
    };
  }

  function ensureCreatorOwnership({ currentUser, feedback, scopedUnitId } = {}) {
    const actor = resolveActor(currentUser);
    const canonicalContextUnitId = resolveCanonicalContextUnitId({ scopedUnitId });
    const feedbackUnitId = normalizeUnitId(feedback?.unidade_id);
    const creatorId = feedback?.criadoPor?.userId ? String(feedback.criadoPor.userId) : '';
    const creatorEmail = String(feedback?.criadoPor?.email || '').trim();

    if (canonicalContextUnitId && feedbackUnitId && feedbackUnitId !== canonicalContextUnitId) {
      return { allowed: false, error: 'forbidden', actor, canonicalContextUnitId };
    }

    if (creatorId && actor.id && actor.id !== creatorId) {
      return { allowed: false, error: 'forbidden', actor, canonicalContextUnitId };
    }

    if (!creatorId && creatorEmail && actor.email && actor.email !== creatorEmail) {
      return { allowed: false, error: 'forbidden', actor, canonicalContextUnitId };
    }

    return { allowed: true, actor, canonicalContextUnitId };
  }

  function buildMyFeedbackFilter({ currentUser, scopedUnitId } = {}) {
    const actor = resolveActor(currentUser);
    const canonicalContextUnitId = resolveCanonicalContextUnitId({ scopedUnitId });
    const ownerFilter = actor.id ? { 'criadoPor.userId': actor.id } : { 'criadoPor.email': actor.email };
    const filter = canonicalContextUnitId
      ? {
          $and: [
            ownerFilter,
            {
              $or: [
                { unidade_id: canonicalContextUnitId },
                { unidade_id: { $exists: false } },
                { unidade_id: null },
              ],
            },
          ],
        }
      : ownerFilter;

    return { filter, actor, canonicalContextUnitId };
  }

  return {
    resolveActor,
    resolveCanonicalContextUnitId,
    ensureAdminAccess,
    ensureCreatorOwnership,
    buildMyFeedbackFilter,
  };
}

export default createFeedbackPolicyOwnershipCore;