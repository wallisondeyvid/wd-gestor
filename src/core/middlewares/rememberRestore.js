import crypto from 'crypto';
import mongoose from 'mongoose';
import { createUnitScope } from '#shared/unitScope.js';
import { RememberSessionRepository } from '#shared/repositories/RememberSessionRepository.js';

function resolveRememberSessionUnitScope(req) {
  if (req?.unitScope) return req.unitScope;
  if (req?.ctx?.unitScope) return req.ctx.unitScope;

  const unidadeId = req?.session?.user?.unidade_id
    || req?.session?.user?.unidadeId
    || req?.session?.escalasUser?.unidade_id
    || req?.session?.escalasUser?.unidadeId
    || null;

  return createUnitScope({ unidadeId });
}

function getRememberSessionRepository(req) {
  return new RememberSessionRepository({
    unitScope: resolveRememberSessionUnitScope(req),
  });
}

export async function rememberRestore(req, res, next) {
  try {
    // Em modos "light" (skipDb) não tente acessar o banco para restaurar sessão
    // Isso evita timeouts/erros 500 em páginas públicas como /gestor/login
    if (req?.app?.locals?.skipDb || mongoose.connection.readyState !== 1) {
      return next();
    }
  // Por padrão, NÃO forçar novo login a cada boot — permite restaurar sessão via remember token após reinícios
  const forceRelogin = (process.env.FORCE_RELOGIN_ON_BOOT || 'false') === 'true';
    const currentBoot = req.app?.locals?.sessionBootId;
    const clientBoot = req.cookies?.wdg_boot;
    if (forceRelogin) {
      if (!req.session || !req.session._bootId || !clientBoot || clientBoot !== currentBoot) {
        return next();
      }
    }
    // Se já há usuário Gestor ou Escalas em sessão, não precisa restaurar
    if (req.session?.user || req.session?.escalasUser) return next();

    // Bloquear restauração automática especificamente na tela de login de Escalas para forçar autenticação manual (a não ser que variável desligue)
    if (req.originalUrl && req.originalUrl.startsWith('/escalas/login')) {
      const allow = (process.env.ESCALAS_ALLOW_REMEMBER_AT_LOGIN === '1');
      if (!allow) return next();
    }

    // Evitar interferir em logout explícito
    if (req.originalUrl && req.originalUrl.startsWith('/escalas/logout')) return next();

    const cookieName = process.env.REMEMBER_COOKIE_NAME || 'wdg_remember';
    const tokenPlain = req.cookies ? req.cookies[cookieName] : null;
    if (!tokenPlain) return next();

    const rememberSessionRepository = getRememberSessionRepository(req);
    const tokenHash = crypto.createHash('sha256').update(tokenPlain).digest('hex');
    const rt = await rememberSessionRepository.findValidRememberTokenByHash(tokenHash);
    if (!rt) return next();
    const user = await rememberSessionRepository.findActiveUserById(rt.user_id);
    if (!user || !user.ativo) return next();
    if (!req.session) return next();

    const sessPayload = {
      id: user._id,
      email: user.email,
      nome: user.nome,
      role: user.role,
      funcionario_id: user.funcionario_id || null,
      unidade_id: user.unidade_id || null,
    };

    const isEscalas = req.originalUrl && req.originalUrl.startsWith('/escalas');

    if (isEscalas) {
      req.session.escalasUser = sessPayload;
    } else {
      req.session.user = sessPayload;
    }

    await rememberSessionRepository.touchRememberTokenLastUsed(rt._id);
    return next();
  } catch (e) {
    console.warn('[rememberRestore] falha:', e.message);
    return next();
  }
}
