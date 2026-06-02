import bcrypt from 'bcryptjs';
import {
  loadLoginPreAuthUserData,
  saveLoginPreAuthUserStateData,
} from '#modules/gestor/app/data/auth/loginPreAuthGateDataFacade.js';

function buildErrorResult(code, extras = {}) {
  return {
    ok: false,
    code,
    headers: {},
    ...extras,
  };
}

function withHeader(result, name, value) {
  return {
    ...result,
    headers: {
      ...(result.headers || {}),
      [name]: value,
    },
  };
}

function maskEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return 'anon';
  const atIndex = normalized.indexOf('@');
  if (atIndex <= 0) return normalized.slice(0, 1) + '***';
  const local = normalized.slice(0, atIndex);
  const domain = normalized.slice(atIndex + 1);
  return `${local.slice(0, 1)}***@${domain || 'dominio.local'}`;
}

async function applyDelay(delayMs) {
  if (!delayMs) return;
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function evaluateLoginPreAuthGateService({ email, senha } = {}) {
  let user = null;

  try {
    user = await loadLoginPreAuthUserData({
      email: String(email || '').trim().toLowerCase(),
      maxTimeMS: Number(process.env.MONGO_QUERY_TIMEOUT_MS || 5000),
    });
  } catch (queryError) {
    console.warn('[login] timeout/erro find user:', queryError.message);
    return buildErrorResult('servidor');
  }

  if (!user) return buildErrorResult('usuario');
  if (!user.ativo) return buildErrorResult('suspenso');

  const maxTentativas = Number(process.env.LOGIN_MAX_ATTEMPTS || 5);
  const lockMinutos = Number(process.env.LOGIN_LOCK_MINUTES || 15);
  const agora = new Date();
  const isMasterRole = user.role === 'master' || user.global_role === 'master';
  const masterBypassLockout = (process.env.MASTER_BYPASS_LOCKOUT || 'true').toLowerCase() !== 'false';

  if (user.lock_until && user.lock_until > agora && !(isMasterRole && masterBypassLockout)) {
    const minutosRestantes = Math.ceil((user.lock_until.getTime() - agora.getTime()) / 60000);
    console.warn('[login] tentativa durante bloqueio', { user: maskEmail(user.email), ate: user.lock_until });
    const retrySeconds = Math.max(1, Math.ceil((user.lock_until.getTime() - agora.getTime()) / 1000));
    let result = buildErrorResult('bloqueado', { min: minutosRestantes });
    result = withHeader(result, 'Retry-After', retrySeconds);
    result = withHeader(result, 'X-Account-Lock-Until', user.lock_until.toISOString());
    result = withHeader(result, 'X-Account-Lock-Seconds', String(retrySeconds));
    result = withHeader(result, 'X-Account-Lock-Minutes', String(minutosRestantes));
    return result;
  }

  if (user.lock_until && user.lock_until <= agora) {
    user.lock_until = null;
    user.failed_login_attempts = 0;
    try {
      await saveLoginPreAuthUserStateData({ user });
    } catch (error) {
      console.warn('[login] falha ao resetar bloqueio expirado:', error.message);
    }
  }

  let senhaCorreta = false;
  try {
    senhaCorreta = await bcrypt.compare(senha, user.senha || '');
  } catch (compareError) {
    console.warn('[login] falha ao comparar senha (bcrypt):', compareError.message);
    senhaCorreta = false;
  }

  if (!senhaCorreta) {
    try {
      console.warn('[login] credenciais invalidas', { user: maskEmail(user.email), attempts_next: (user.failed_login_attempts || 0) + 1 });
    } catch {}

    user.failed_login_attempts = (user.failed_login_attempts || 0) + 1;
    const baseDelay = Number(process.env.LOGIN_FAILED_DELAY_BASE_MS || 150);
    const maxDelay = Number(process.env.LOGIN_FAILED_DELAY_MAX_MS || 3000);
    const delay = Math.min(baseDelay * user.failed_login_attempts, maxDelay);

    if (user.failed_login_attempts >= maxTentativas && !(isMasterRole && masterBypassLockout)) {
      user.lock_until = new Date(Date.now() + lockMinutos * 60000);
      try {
        await saveLoginPreAuthUserStateData({ user });
      } catch (error) {
        console.warn('[login] falha ao salvar bloqueio:', error.message);
      }
      console.warn('[login] usuario bloqueado por tentativas', {
        user: maskEmail(user.email),
        lock_until: user.lock_until,
        attempts: user.failed_login_attempts,
      });
      await applyDelay(delay);

      const lockMinutes = Math.ceil((user.lock_until.getTime() - Date.now()) / 60000);
      const lockSeconds = Math.ceil((user.lock_until.getTime() - Date.now()) / 1000);
      let result = buildErrorResult('bloqueado', { min: lockMinutes });
      result = withHeader(result, 'Retry-After', lockSeconds);
      result = withHeader(result, 'X-Account-Lock-Until', user.lock_until.toISOString());
      result = withHeader(result, 'X-Account-Lock-Seconds', String(lockSeconds));
      result = withHeader(result, 'X-Account-Lock-Minutes', String(lockMinutes));
      return result;
    }

    try {
      await saveLoginPreAuthUserStateData({ user });
    } catch (error) {
      console.warn('[login] falha ao salvar tentativa falhada:', error.message);
    }

    await applyDelay(delay);

    const restantes = (isMasterRole && masterBypassLockout)
      ? maxTentativas
      : Math.max(0, maxTentativas - user.failed_login_attempts);

    let result = buildErrorResult('senha', { restantes });
    result = withHeader(result, 'X-Account-Attempts-Used', String(user.failed_login_attempts));
    result = withHeader(result, 'X-Account-Attempts-Remaining', String(restantes));
    result = withHeader(result, 'X-Account-Attempts-Limit', String(maxTentativas));
    return result;
  }

  if (user.failed_login_attempts || user.lock_until) {
    user.failed_login_attempts = 0;
    user.lock_until = null;
    try {
      await saveLoginPreAuthUserStateData({ user });
    } catch (error) {
      console.warn('[login] falha ao resetar lockout:', error.message);
    }
  }

  return { ok: true, user };
}

export default {
  evaluateLoginPreAuthGateService,
};