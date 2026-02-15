export async function executionPresenceConfirmPinLogic({ req, res, shadow = false, deps }) {
  const {
    executionPresenceConfirmLogic,
    presenceConfirmLogicDeps,
    router
  } = deps;

  req.body = {
    ...(req.body || {}),
    presenceId: req.params?.presenceId || req.body?.presenceId || ''
  };

  if (shadow) {
    return executionPresenceConfirmLogic({
      req,
      res,
      shadow: true,
      deps: presenceConfirmLogicDeps
    });
  }

  if (!router || typeof router.handle !== 'function') {
    return {
      status: 500,
      body: { ok: false, error: 'Falha ao confirmar por PIN' }
    };
  }

  return router.handle(
    { ...req, url: `/api/assembleias/${req.params.id}/execution/presence/confirm`, method: 'POST' },
    res,
    () => res.status(500).json({ ok: false, error: 'Falha ao confirmar por PIN' })
  );
}