export const REQUIRE_LOGIN_ENTRY_DECISION = Object.freeze({
  ALLOW: 'allow',
  DENY: 'deny',
  CONTINUE: 'continue',
});

export const REQUIRE_LOGIN_ENTRY_REASON = Object.freeze({
  NONE: 'none',
  AUTHENTICATED_FUNCIONARIO: 'authenticated-funcionario',
  AUTHENTICATED_USER: 'authenticated-user',
  ESCALAS_BYPASS: 'escalas-bypass',
  FIRST_ACCESS_REQUIRED: 'first-access-required',
  LOGIN_REQUIRED: 'login-required',
  PUBLIC_ROUTE: 'public-route',
  SELECTION_REQUIRED: 'selection-required',
  SESSION_FALLBACK: 'session-fallback',
  UNAUTHENTICATED: 'unauthenticated',
  USER_NOT_FOUND: 'user-not-found',
});

function allow(reason) {
  return { decision: REQUIRE_LOGIN_ENTRY_DECISION.ALLOW, reason };
}

function deny(reason) {
  return { decision: REQUIRE_LOGIN_ENTRY_DECISION.DENY, reason };
}

function continueFlow(reason = REQUIRE_LOGIN_ENTRY_REASON.NONE) {
  return { decision: REQUIRE_LOGIN_ENTRY_DECISION.CONTINUE, reason };
}

export function classifyRequireLoginEntry(input = {}) {
  const stage = String(input.stage || '').trim();

  switch (stage) {
    case 'pending-selection': {
      if (!input.hasSessionUser) return continueFlow();
      if (!input.hasPendingSelection) return continueFlow();
      if (input.shouldBypassPendingSelectionGuard) return continueFlow();
      return deny(REQUIRE_LOGIN_ENTRY_REASON.SELECTION_REQUIRED);
    }

    case 'route-access': {
      if (input.isEscalasPath) {
        return allow(REQUIRE_LOGIN_ENTRY_REASON.ESCALAS_BYPASS);
      }

      if (input.hasSessionUser) {
        return continueFlow();
      }

      if (input.isLoginPath || input.isPublicPath) {
        return allow(REQUIRE_LOGIN_ENTRY_REASON.PUBLIC_ROUTE);
      }

      return deny(REQUIRE_LOGIN_ENTRY_REASON.UNAUTHENTICATED);
    }

    case 'resolved-user': {
      if (!input.hasUser) {
        return continueFlow(REQUIRE_LOGIN_ENTRY_REASON.USER_NOT_FOUND);
      }

      if (input.requiresFirstAccess) {
        return deny(REQUIRE_LOGIN_ENTRY_REASON.FIRST_ACCESS_REQUIRED);
      }

      return allow(REQUIRE_LOGIN_ENTRY_REASON.AUTHENTICATED_USER);
    }

    case 'transient-error': {
      if (input.hasTransientError && input.hasSessionUser) {
        return allow(REQUIRE_LOGIN_ENTRY_REASON.SESSION_FALLBACK);
      }

      return continueFlow();
    }

    case 'funcionario-fallback': {
      if (!input.hasReliableFuncionarioId) {
        return deny(REQUIRE_LOGIN_ENTRY_REASON.LOGIN_REQUIRED);
      }

      if (typeof input.hasFuncionario === 'undefined') {
        return continueFlow();
      }

      if (!input.hasFuncionario) {
        return deny(REQUIRE_LOGIN_ENTRY_REASON.LOGIN_REQUIRED);
      }

      return allow(REQUIRE_LOGIN_ENTRY_REASON.AUTHENTICATED_FUNCIONARIO);
    }

    default:
      return continueFlow();
  }
}