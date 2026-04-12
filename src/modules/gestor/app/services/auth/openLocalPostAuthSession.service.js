function clearStoredAuthContext(session) {
  if (!session || !Object.prototype.hasOwnProperty.call(session, 'gestorAuthContext')) {
    return;
  }

  delete session.gestorAuthContext;
}

function buildSeededSessionUser(authenticatedUser) {
  return {
    id: authenticatedUser._id.toString(),
    email: authenticatedUser.email,
  };
}

function resolveSession({ req, session }) {
  return req?.session || session || null;
}

async function regenerateSession(session, logger) {
  await new Promise((resolve, reject) => {
    session.regenerate((error) => {
      if (error) {
        try {
          logger?.warn?.('[login] session regenerate error:', error.message);
        } catch {}
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export async function openLocalPostAuthSession({ req, session, authenticatedUser, logger = console } = {}) {
  const initialSession = resolveSession({ req, session });
  if (!initialSession) {
    return null;
  }

  try {
    await regenerateSession(initialSession, logger);
  } catch (error) {
    try {
      logger?.warn?.('[login] session regenerate failed, continuing without:', error.message);
    } catch {}
    // Mantem o contrato legado: falha ao regenerar nao impede semear a sessao autenticada.
  }

  const activeSession = resolveSession({ req, session: initialSession });
  clearStoredAuthContext(activeSession);
  activeSession.user = buildSeededSessionUser(authenticatedUser);

  return activeSession.user;
}

export default openLocalPostAuthSession;