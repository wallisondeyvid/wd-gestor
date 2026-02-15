export async function executionPresenceRepresentanteLogic({ req, res, shadow = false, deps }) {
  const {
    PRESENCE_ROLE,
    executionPresenceLogic,
    presenceLogicDeps,
    router
  } = deps;

  req.body = {
    ...(req.body || {}),
    presence_role: PRESENCE_ROLE.REPRESENTANTE,
    requested_by: 'MODERATOR'
  };

  if (shadow) {
    return executionPresenceLogic({
      req,
      res,
      shadow: true,
      deps: presenceLogicDeps
    });
  }

  if (!router || typeof router.handle !== 'function') {
    return {
      status: 500,
      body: { ok: false, error: 'Falha ao registrar representante' }
    };
  }

  return router.handle(
    { ...req, url: `/api/assembleias/${req.params.id}/execution/presence`, method: 'POST' },
    res,
    () => res.status(500).json({ ok: false, error: 'Falha ao registrar representante' })
  );
}