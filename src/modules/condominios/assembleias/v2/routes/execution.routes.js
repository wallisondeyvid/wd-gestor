import express from 'express';
import mongoose from 'mongoose';
import CondAssembleia from '#core/models/cond_assembleia.js';
import CondUsuario from '#core/models/cond_usuario.js';
import CondMorador from '#core/models/cond_morador.js';
import CondHabitacao from '#core/models/cond_habitacao.js';
import CondProprietario from '#core/models/cond_proprietario.js';
import executionV1, {
  mustAuth,
  mustControl,
  getOrCreateExecution,
  pushEvent,
  safeStr,
  getActorSource,
  writeAuditLog,
  isPortalRequest,
  PRESENCE_ROLE,
  PRESENCE_STATUS,
  normalizePresenceRole,
  normalizePresenceStatus,
  getPortalHabitacaoId,
  pickUserId,
  getPortalPresenceKey,
  normalizePresenceKey,
  getPortalPresenceNome,
  toObjectOrPlain,
  finalizePresenceStatus,
  newPresenceId,
  hasOtherConfirmedRepresentative,
  buildActorSnapshot,
  isPresenceConfirmed,
  computeQuorum,
  serializePresence,
  parsePortalUserIdFromPresenceKey
  ,
  voteSummary,
  parseConvocacaoDateTime
} from '#modules/condominios/assembleias/routes/execution.routes.js';
import { executionCloseLogic } from '#modules/condominios/assembleias/shared/executionClose.logic.js';
import { executionPauseLogic } from '#modules/condominios/assembleias/shared/executionPause.logic.js';
import { executionPresenceLogic } from '#modules/condominios/assembleias/shared/executionPresence.logic.js';
import { executionPresenceConfirmLogic } from '#modules/condominios/assembleias/shared/executionPresenceConfirm.logic.js';
import { executionVoteOpenLogic } from '#modules/condominios/assembleias/shared/executionVoteOpen.logic.js';
import { executionVoteLogic } from '#modules/condominios/assembleias/shared/executionVote.logic.js';
import { executionVoteCloseLogic } from '#modules/condominios/assembleias/shared/executionVoteClose.logic.js';
import { executionOpenLogic } from '#modules/condominios/assembleias/shared/executionOpen.logic.js';
import { executionAgendaLogic } from '#modules/condominios/assembleias/shared/executionAgenda.logic.js';
import { executionPresenceConfirmModeratorLogic } from '#modules/condominios/assembleias/shared/executionPresenceConfirmModerator.logic.js';
import { executionPresenceRepresentanteLogic } from '#modules/condominios/assembleias/shared/executionPresenceRepresentante.logic.js';
import { executionPresenceNaoRepresentanteLogic } from '#modules/condominios/assembleias/shared/executionPresenceNaoRepresentante.logic.js';
import { executionPresenceConfirmPinLogic } from '#modules/condominios/assembleias/shared/executionPresenceConfirmPin.logic.js';
import { executionStatusLogic } from '#modules/condominios/assembleias/shared/executionStatus.logic.js';
import { computeSessionClockMs } from '#modules/condominios/assembleias/v2/services/executionStatus.service.js';
import { executionPresenceMeLogic } from '#modules/condominios/assembleias/shared/executionPresenceMe.logic.js';
import { executionAtaLogic } from '#modules/condominios/assembleias/shared/executionAta.logic.js';
import { executionAtaPdfLogic } from '#modules/condominios/assembleias/shared/executionAtaPdf.logic.js';
import { verifyPortalPassword } from '#modules/portal-morador/lib/portalAuth.js';

const V1_NOT_FOUND = { error: true, message: 'Recurso não encontrado', success: false };

function cloneReqForShadow(req, method, url) {
  const headers = { ...(req.headers || {}) };
  return {
    method,
    url,
    originalUrl: url,
    baseUrl: req.baseUrl || '',
    params: { ...(req.params || {}) },
    query: { ...(req.query || {}) },
    body: req.body,
    headers,
    session: req.session,
    user: req.user,
    ctxUser: req.ctxUser,
    portalUser: req.portalUser,
    skipAuth: req.skipAuth,
    protocol: req.protocol,
    get(name) {
      return this.headers?.[String(name || '').toLowerCase()];
    }
  };
}

function captureRouter(router, reqLike) {
  return new Promise((resolve) => {
    const out = {
      status: 200,
      headers: {},
      jsonBody: undefined,
      textBody: undefined,
      handled: false
    };

    const resLike = {
      status(code) {
        out.status = Number(code) || out.status;
        return this;
      },
      setHeader(k, v) {
        out.headers[String(k).toLowerCase()] = String(v);
      },
      set(k, v) {
        out.headers[String(k).toLowerCase()] = String(v);
        return this;
      },
      json(payload) {
        out.headers['content-type'] = out.headers['content-type'] || 'application/json; charset=utf-8';
        out.jsonBody = payload;
        out.textBody = JSON.stringify(payload);
        out.handled = true;
        resolve(out);
        return this;
      },
      send(payload) {
        if (Buffer.isBuffer(payload)) out.textBody = payload.toString('binary');
        else if (typeof payload === 'object') {
          out.jsonBody = payload;
          out.textBody = JSON.stringify(payload);
        } else out.textBody = String(payload ?? '');
        out.handled = true;
        resolve(out);
        return this;
      }
    };

    router.handle(reqLike, resLike, () => resolve(out));
  });
}

function normalizeForCompare(result) {
  const body = result?.jsonBody || {};
  return {
    status: Number(result?.status || 0),
    ok: body?.ok,
    error: body?.error || null,
    sessionStatus: body?.data?.sessionStatus || null,
    isPaused: body?.data?.isPaused
  };
}

function ensureCanonicalV1Result(result) {
  if (result?.handled) return result;
  return {
    status: 404,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    jsonBody: V1_NOT_FOUND,
    textBody: JSON.stringify(V1_NOT_FOUND),
    handled: true
  };
}

export default function executionV2() {
  const router = express.Router();
  const v1Router = executionV1();
  router.use(express.json({ limit: '220kb' }));
  router.use(express.urlencoded({ extended: true, limit: '220kb' }));

  router.post('/api/assembleias/:id/execution/open', async (req, res, next) => {
    const path = `/api/assembleias/${encodeURIComponent(String(req.params?.id || ''))}/execution/open`;
    try {
      const isV2On = String(process.env.WDG_FLAG_ASSEMBLEIAS_V2 || '').trim() === '1';
      if (isV2On) {
        const result = await executionOpenLogic({
          req,
          res,
          shadow: false,
          deps: {
            mongoose,
            mustControl,
            CondAssembleia,
            parseConvocacaoDateTime,
            getOrCreateExecution,
            pushEvent,
            safeStr,
            writeAuditLog,
            getActorSource
          }
        });
        if (result?.handled) return;
        return res.status(result.status).json(result.body);
      }

      const isShadowEnabled = String(process.env.WDG_FLAG_ASSEMBLEIAS_SHADOW ?? '1').trim() !== '0';
      if (!isShadowEnabled) {
        return v1Router(req, res, next);
      }

      const reqForV2 = cloneReqForShadow(req, 'POST', path);
      const shadowResState = { statusCode: 200, payload: null, handled: false };
      const shadowRes = {
        status(code) {
          shadowResState.statusCode = Number(code) || shadowResState.statusCode;
          return this;
        },
        json(payload) {
          shadowResState.payload = payload;
          shadowResState.handled = true;
          return this;
        }
      };

      const v2Shadow = await executionOpenLogic({
        req: reqForV2,
        res: shadowRes,
        shadow: true,
        deps: {
          mongoose,
          mustControl,
          CondAssembleia,
          parseConvocacaoDateTime,
          getOrCreateExecution,
          pushEvent,
          safeStr,
          writeAuditLog,
          getActorSource
        }
      });

      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);

      res.json = (payload) => {
        try {
          const v1Norm = normalizeForCompare({ status: res.statusCode || 200, jsonBody: payload });
          const v2Norm = v2Shadow?.handled
            ? normalizeForCompare({ status: shadowResState.statusCode, jsonBody: shadowResState.payload })
            : normalizeForCompare({ status: v2Shadow.status, jsonBody: v2Shadow.body });
          if (JSON.stringify(v1Norm) !== JSON.stringify(v2Norm)) {
            console.error('[assembleias][shadow][open] divergence', { v1: v1Norm, v2: v2Norm });
          }
        } catch {}
        return originalJson(payload);
      };

      res.send = (payload) => {
        try {
          const contentType = String(res.getHeader('content-type') || '');
          let parsed = null;
          if (typeof payload === 'string' && /application\/json/i.test(contentType)) {
            try { parsed = JSON.parse(payload); } catch {}
          } else if (payload && typeof payload === 'object' && !Buffer.isBuffer(payload)) {
            parsed = payload;
          }
          if (parsed) {
            const v1Norm = normalizeForCompare({ status: res.statusCode || 200, jsonBody: parsed });
            const v2Norm = v2Shadow?.handled
              ? normalizeForCompare({ status: shadowResState.statusCode, jsonBody: shadowResState.payload })
              : normalizeForCompare({ status: v2Shadow.status, jsonBody: v2Shadow.body });
            if (JSON.stringify(v1Norm) !== JSON.stringify(v2Norm)) {
              console.error('[assembleias][shadow][open] divergence', { v1: v1Norm, v2: v2Norm });
            }
          }
        } catch {}
        return originalSend(payload);
      };

      return v1Router(req, res, next);
    } catch (e) {
      console.error('[assembleias][shadow][open] erro:', e);
      return res.status(500).json({ ok: false, error: 'Falha ao abrir sessão' });
    }
  });

  router.post('/api/assembleias/:id/execution/pause', async (req, res, next) => {
    const path = `/api/assembleias/${encodeURIComponent(String(req.params?.id || ''))}/execution/pause`;
    try {
      const isV2On = String(process.env.WDG_FLAG_ASSEMBLEIAS_V2 || '').trim() === '1';
      if (isV2On) {
        const result = await executionPauseLogic({
          req,
          res,
          shadow: false,
          deps: {
            mongoose,
            mustControl,
            getOrCreateExecution,
            pushEvent,
            safeStr,
            getActorSource,
            writeAuditLog
          }
        });
        if (result?.handled) return;
        return res.status(result.status).json(result.body);
      }

      const isShadowEnabled = String(process.env.WDG_FLAG_ASSEMBLEIAS_SHADOW ?? '1').trim() !== '0';
      if (!isShadowEnabled) {
        return v1Router(req, res, next);
      }

      const reqForV2 = cloneReqForShadow(req, 'POST', path);

      const shadowResState = { statusCode: 200, payload: null, handled: false };
      const shadowRes = {
        status(code) {
          shadowResState.statusCode = Number(code) || shadowResState.statusCode;
          return this;
        },
        json(payload) {
          shadowResState.payload = payload;
          shadowResState.handled = true;
          return this;
        }
      };

      const v2Shadow = await executionPauseLogic({
        req: reqForV2,
        res: shadowRes,
        shadow: true,
        deps: {
          mongoose,
          mustControl,
          getOrCreateExecution,
          pushEvent,
          safeStr,
          getActorSource,
          writeAuditLog
        }
      });

      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);

      res.json = (payload) => {
        try {
          const v1Norm = normalizeForCompare({ status: res.statusCode || 200, jsonBody: payload });
          const v2Norm = v2Shadow?.handled
            ? normalizeForCompare({ status: shadowResState.statusCode, jsonBody: shadowResState.payload })
            : normalizeForCompare({ status: v2Shadow.status, jsonBody: v2Shadow.body });
          if (JSON.stringify(v1Norm) !== JSON.stringify(v2Norm)) {
            console.error('[assembleias][shadow][pause] divergence', { v1: v1Norm, v2: v2Norm });
          }
        } catch {}
        return originalJson(payload);
      };

      res.send = (payload) => {
        try {
          const contentType = String(res.getHeader('content-type') || '');
          let parsed = null;
          if (typeof payload === 'string' && /application\/json/i.test(contentType)) {
            try { parsed = JSON.parse(payload); } catch {}
          } else if (payload && typeof payload === 'object' && !Buffer.isBuffer(payload)) {
            parsed = payload;
          }
          if (parsed) {
            const v1Norm = normalizeForCompare({ status: res.statusCode || 200, jsonBody: parsed });
            const v2Norm = v2Shadow?.handled
              ? normalizeForCompare({ status: shadowResState.statusCode, jsonBody: shadowResState.payload })
              : normalizeForCompare({ status: v2Shadow.status, jsonBody: v2Shadow.body });
            if (JSON.stringify(v1Norm) !== JSON.stringify(v2Norm)) {
              console.error('[assembleias][shadow][pause] divergence', { v1: v1Norm, v2: v2Norm });
            }
          }
        } catch {}
        return originalSend(payload);
      };

      return v1Router(req, res, next);
    } catch (e) {
      console.error('[assembleias][shadow][pause] erro:', e);
      return res.status(500).json({ ok: false, error: 'Falha ao pausar/retomar sessão' });
    }
  });

  router.post('/api/assembleias/:id/execution/close', async (req, res, next) => {
    const path = `/api/assembleias/${encodeURIComponent(String(req.params?.id || ''))}/execution/close`;
    try {
      const isV2On = String(process.env.WDG_FLAG_ASSEMBLEIAS_V2 || '').trim() === '1';
      if (isV2On) {
        const result = await executionCloseLogic({
          req,
          res,
          shadow: false,
          deps: {
            mongoose,
            mustControl,
            getOrCreateExecution,
            pushEvent,
            safeStr,
            getActorSource,
            writeAuditLog
          }
        });
        if (result?.handled) return;
        return res.status(result.status).json(result.body);
      }

      const isShadowEnabled = String(process.env.WDG_FLAG_ASSEMBLEIAS_SHADOW ?? '1').trim() !== '0';
      if (!isShadowEnabled) {
        return v1Router(req, res, next);
      }

      const reqForV2 = cloneReqForShadow(req, 'POST', path);
      const shadowResState = { statusCode: 200, payload: null, handled: false };
      const shadowRes = {
        status(code) {
          shadowResState.statusCode = Number(code) || shadowResState.statusCode;
          return this;
        },
        json(payload) {
          shadowResState.payload = payload;
          shadowResState.handled = true;
          return this;
        }
      };

      const v2Shadow = await executionCloseLogic({
        req: reqForV2,
        res: shadowRes,
        shadow: true,
        deps: {
          mongoose,
          mustControl,
          getOrCreateExecution,
          pushEvent,
          safeStr,
          getActorSource,
          writeAuditLog
        }
      });

      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);

      res.json = (payload) => {
        try {
          const v1Norm = normalizeForCompare({ status: res.statusCode || 200, jsonBody: payload });
          const v2Norm = v2Shadow?.handled
            ? normalizeForCompare({ status: shadowResState.statusCode, jsonBody: shadowResState.payload })
            : normalizeForCompare({ status: v2Shadow.status, jsonBody: v2Shadow.body });
          if (JSON.stringify(v1Norm) !== JSON.stringify(v2Norm)) {
            console.error('[assembleias][shadow][close] divergence', { v1: v1Norm, v2: v2Norm });
          }
        } catch {}
        return originalJson(payload);
      };

      res.send = (payload) => {
        try {
          const contentType = String(res.getHeader('content-type') || '');
          let parsed = null;
          if (typeof payload === 'string' && /application\/json/i.test(contentType)) {
            try { parsed = JSON.parse(payload); } catch {}
          } else if (payload && typeof payload === 'object' && !Buffer.isBuffer(payload)) {
            parsed = payload;
          }
          if (parsed) {
            const v1Norm = normalizeForCompare({ status: res.statusCode || 200, jsonBody: parsed });
            const v2Norm = v2Shadow?.handled
              ? normalizeForCompare({ status: shadowResState.statusCode, jsonBody: shadowResState.payload })
              : normalizeForCompare({ status: v2Shadow.status, jsonBody: v2Shadow.body });
            if (JSON.stringify(v1Norm) !== JSON.stringify(v2Norm)) {
              console.error('[assembleias][shadow][close] divergence', { v1: v1Norm, v2: v2Norm });
            }
          }
        } catch {}
        return originalSend(payload);
      };

      return v1Router(req, res, next);
    } catch (e) {
      console.error('[assembleias][shadow][close] erro:', e);
      return res.status(500).json({ ok: false, error: 'Falha ao encerrar sessão' });
    }
  });

  router.post('/api/assembleias/:id/execution/presence', async (req, res, next) => {
    const path = `/api/assembleias/${encodeURIComponent(String(req.params?.id || ''))}/execution/presence`;
    try {
      const isV2On = String(process.env.WDG_FLAG_ASSEMBLEIAS_V2 || '').trim() === '1';
      if (isV2On) {
        const result = await executionPresenceLogic({
          req,
          res,
          shadow: false,
          deps: {
            mongoose,
            isPortalRequest,
            mustAuth,
            mustControl,
            getOrCreateExecution,
            PRESENCE_ROLE,
            PRESENCE_STATUS,
            normalizePresenceRole,
            safeStr,
            getPortalHabitacaoId,
            pickUserId,
            getPortalPresenceKey,
            normalizePresenceKey,
            getPortalPresenceNome,
            toObjectOrPlain,
            finalizePresenceStatus,
            newPresenceId,
            hasOtherConfirmedRepresentative,
            buildActorSnapshot,
            isPresenceConfirmed,
            pushEvent,
            writeAuditLog,
            getActorSource,
            computeQuorum,
            serializePresence
          }
        });
        if (result?.handled) return;
        return res.status(result.status).json(result.body);
      }

      const isShadowEnabled = String(process.env.WDG_FLAG_ASSEMBLEIAS_SHADOW ?? '1').trim() !== '0';
      if (!isShadowEnabled) {
        return v1Router(req, res, next);
      }

      const reqForV2 = cloneReqForShadow(req, 'POST', path);
      const shadowResState = { statusCode: 200, payload: null, handled: false };
      const shadowRes = {
        status(code) {
          shadowResState.statusCode = Number(code) || shadowResState.statusCode;
          return this;
        },
        json(payload) {
          shadowResState.payload = payload;
          shadowResState.handled = true;
          return this;
        }
      };

      const v2Shadow = await executionPresenceLogic({
        req: reqForV2,
        res: shadowRes,
        shadow: true,
        deps: {
          mongoose,
          isPortalRequest,
          mustAuth,
          mustControl,
          getOrCreateExecution,
          PRESENCE_ROLE,
          PRESENCE_STATUS,
          normalizePresenceRole,
          safeStr,
          getPortalHabitacaoId,
          pickUserId,
          getPortalPresenceKey,
          normalizePresenceKey,
          getPortalPresenceNome,
          toObjectOrPlain,
          finalizePresenceStatus,
          newPresenceId,
          hasOtherConfirmedRepresentative,
          buildActorSnapshot,
          isPresenceConfirmed,
          pushEvent,
          writeAuditLog,
          getActorSource,
          computeQuorum,
          serializePresence
        }
      });

      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);

      res.json = (payload) => {
        try {
          const v1Norm = normalizeForCompare({ status: res.statusCode || 200, jsonBody: payload });
          const v2Norm = v2Shadow?.handled
            ? normalizeForCompare({ status: shadowResState.statusCode, jsonBody: shadowResState.payload })
            : normalizeForCompare({ status: v2Shadow.status, jsonBody: v2Shadow.body });
          if (JSON.stringify(v1Norm) !== JSON.stringify(v2Norm)) {
            console.error('[assembleias][shadow][presence] divergence', { v1: v1Norm, v2: v2Norm });
          }
        } catch {}
        return originalJson(payload);
      };

      res.send = (payload) => {
        try {
          const contentType = String(res.getHeader('content-type') || '');
          let parsed = null;
          if (typeof payload === 'string' && /application\/json/i.test(contentType)) {
            try { parsed = JSON.parse(payload); } catch {}
          } else if (payload && typeof payload === 'object' && !Buffer.isBuffer(payload)) {
            parsed = payload;
          }
          if (parsed) {
            const v1Norm = normalizeForCompare({ status: res.statusCode || 200, jsonBody: parsed });
            const v2Norm = v2Shadow?.handled
              ? normalizeForCompare({ status: shadowResState.statusCode, jsonBody: shadowResState.payload })
              : normalizeForCompare({ status: v2Shadow.status, jsonBody: v2Shadow.body });
            if (JSON.stringify(v1Norm) !== JSON.stringify(v2Norm)) {
              console.error('[assembleias][shadow][presence] divergence', { v1: v1Norm, v2: v2Norm });
            }
          }
        } catch {}
        return originalSend(payload);
      };

      return v1Router(req, res, next);
    } catch (e) {
      console.error('[assembleias][shadow][presence] erro:', e);
      return res.status(500).json({ ok: false, error: 'Falha ao registrar presença' });
    }
  });

  router.post('/api/assembleias/:id/execution/presence/confirm', async (req, res, next) => {
    const path = `/api/assembleias/${encodeURIComponent(String(req.params?.id || ''))}/execution/presence/confirm`;
    try {
      const isV2On = String(process.env.WDG_FLAG_ASSEMBLEIAS_V2 || '').trim() === '1';
      if (isV2On) {
        const result = await executionPresenceConfirmLogic({
          req,
          res,
          shadow: false,
          deps: {
            mongoose,
            mustControl,
            safeStr,
            normalizePresenceKey,
            getOrCreateExecution,
            toObjectOrPlain,
            normalizePresenceRole,
            PRESENCE_ROLE,
            parsePortalUserIdFromPresenceKey,
            CondMorador,
            CondHabitacao,
            CondProprietario,
            CondUsuario,
            verifyPortalPassword,
            finalizePresenceStatus,
            PRESENCE_STATUS,
            hasOtherConfirmedRepresentative,
            pushEvent,
            writeAuditLog,
            getActorSource,
            computeQuorum,
            serializePresence
          }
        });
        if (result?.handled) return;
        return res.status(result.status).json(result.body);
      }

      const isShadowEnabled = String(process.env.WDG_FLAG_ASSEMBLEIAS_SHADOW ?? '1').trim() !== '0';
      if (!isShadowEnabled) {
        return v1Router(req, res, next);
      }

      const reqForV2 = cloneReqForShadow(req, 'POST', path);
      const shadowResState = { statusCode: 200, payload: null, handled: false };
      const shadowRes = {
        status(code) {
          shadowResState.statusCode = Number(code) || shadowResState.statusCode;
          return this;
        },
        json(payload) {
          shadowResState.payload = payload;
          shadowResState.handled = true;
          return this;
        }
      };

      const v2Shadow = await executionPresenceConfirmLogic({
        req: reqForV2,
        res: shadowRes,
        shadow: true,
        deps: {
          mongoose,
          mustControl,
          safeStr,
          normalizePresenceKey,
          getOrCreateExecution,
          toObjectOrPlain,
          normalizePresenceRole,
          PRESENCE_ROLE,
          parsePortalUserIdFromPresenceKey,
          CondMorador,
          CondHabitacao,
          CondProprietario,
          CondUsuario,
          verifyPortalPassword,
          finalizePresenceStatus,
          PRESENCE_STATUS,
          hasOtherConfirmedRepresentative,
          pushEvent,
          writeAuditLog,
          getActorSource,
          computeQuorum,
          serializePresence
        }
      });

      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);

      res.json = (payload) => {
        try {
          const v1Norm = normalizeForCompare({ status: res.statusCode || 200, jsonBody: payload });
          const v2Norm = v2Shadow?.handled
            ? normalizeForCompare({ status: shadowResState.statusCode, jsonBody: shadowResState.payload })
            : normalizeForCompare({ status: v2Shadow.status, jsonBody: v2Shadow.body });
          if (JSON.stringify(v1Norm) !== JSON.stringify(v2Norm)) {
            console.error('[assembleias][shadow][presence-confirm] divergence', { v1: v1Norm, v2: v2Norm });
          }
        } catch {}
        return originalJson(payload);
      };

      res.send = (payload) => {
        try {
          const contentType = String(res.getHeader('content-type') || '');
          let parsed = null;
          if (typeof payload === 'string' && /application\/json/i.test(contentType)) {
            try { parsed = JSON.parse(payload); } catch {}
          } else if (payload && typeof payload === 'object' && !Buffer.isBuffer(payload)) {
            parsed = payload;
          }
          if (parsed) {
            const v1Norm = normalizeForCompare({ status: res.statusCode || 200, jsonBody: parsed });
            const v2Norm = v2Shadow?.handled
              ? normalizeForCompare({ status: shadowResState.statusCode, jsonBody: shadowResState.payload })
              : normalizeForCompare({ status: v2Shadow.status, jsonBody: v2Shadow.body });
            if (JSON.stringify(v1Norm) !== JSON.stringify(v2Norm)) {
              console.error('[assembleias][shadow][presence-confirm] divergence', { v1: v1Norm, v2: v2Norm });
            }
          }
        } catch {}
        return originalSend(payload);
      };

      return v1Router(req, res, next);
    } catch (e) {
      console.error('[assembleias][shadow][presence-confirm] erro:', e);
      return res.status(500).json({ ok: false, error: 'Falha ao confirmar presença' });
    }
  });

  router.post('/condominios/administracao/assembleia/execution/:id/presencas/representante', async (req, res, next) => {
    const path = `/condominios/administracao/assembleia/execution/${encodeURIComponent(String(req.params?.id || ''))}/presencas/representante`;
    try {
      const isV2On = String(process.env.WDG_FLAG_ASSEMBLEIAS_V2 || '').trim() === '1';
      const isShadowEnabled = String(process.env.WDG_FLAG_ASSEMBLEIAS_SHADOW ?? '1').trim() !== '0';
      if (isV2On) {
        const result = await executionPresenceRepresentanteLogic({
          req,
          res,
          shadow: false,
          deps: {
            PRESENCE_ROLE,
            executionPresenceLogic,
            presenceLogicDeps: {
              mongoose,
              isPortalRequest,
              mustAuth,
              mustControl,
              getOrCreateExecution,
              PRESENCE_ROLE,
              PRESENCE_STATUS,
              normalizePresenceRole,
              safeStr,
              getPortalHabitacaoId,
              pickUserId,
              getPortalPresenceKey,
              normalizePresenceKey,
              getPortalPresenceNome,
              toObjectOrPlain,
              finalizePresenceStatus,
              newPresenceId,
              hasOtherConfirmedRepresentative,
              buildActorSnapshot,
              isPresenceConfirmed,
              pushEvent,
              writeAuditLog,
              getActorSource,
              computeQuorum,
              serializePresence
            },
            router: v1Router
          }
        });
        if (result?.handled) return;
        if (typeof result?.status === 'number') res.status(result.status);
        if (result?.body !== undefined) return res.json(result.body);
        return;
      }

      if (!isShadowEnabled) {
        return v1Router(req, res, next);
      }

      const reqForV2 = cloneReqForShadow(req, 'POST', path);
      const shadowResState = { statusCode: 200, payload: null, handled: false };
      const shadowRes = {
        status(code) {
          shadowResState.statusCode = Number(code) || shadowResState.statusCode;
          return this;
        },
        json(payload) {
          shadowResState.payload = payload;
          shadowResState.handled = true;
          return this;
        }
      };

      const v2Shadow = await executionPresenceRepresentanteLogic({
        req: reqForV2,
        res: shadowRes,
        shadow: true,
        deps: {
          PRESENCE_ROLE,
          executionPresenceLogic,
          presenceLogicDeps: {
            mongoose,
            isPortalRequest,
            mustAuth,
            mustControl,
            getOrCreateExecution,
            PRESENCE_ROLE,
            PRESENCE_STATUS,
            normalizePresenceRole,
            safeStr,
            getPortalHabitacaoId,
            pickUserId,
            getPortalPresenceKey,
            normalizePresenceKey,
            getPortalPresenceNome,
            toObjectOrPlain,
            finalizePresenceStatus,
            newPresenceId,
            hasOtherConfirmedRepresentative,
            buildActorSnapshot,
            isPresenceConfirmed,
            pushEvent,
            writeAuditLog,
            getActorSource,
            computeQuorum,
            serializePresence
          },
          router: v1Router
        }
      });

      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);

      res.json = (payload) => {
        try {
          const v1Norm = normalizeForCompare({ status: res.statusCode || 200, jsonBody: payload });
          const v2Norm = v2Shadow?.handled
            ? normalizeForCompare({ status: shadowResState.statusCode, jsonBody: shadowResState.payload })
            : normalizeForCompare({ status: v2Shadow.status, jsonBody: v2Shadow.body });
          if (JSON.stringify(v1Norm) !== JSON.stringify(v2Norm)) {
            console.error('[assembleias][shadow][representante] divergence', { v1: v1Norm, v2: v2Norm });
          }
        } catch {}
        return originalJson(payload);
      };

      res.send = (payload) => {
        try {
          const contentType = String(res.getHeader('content-type') || '');
          let parsed = null;
          if (typeof payload === 'string' && /application\/json/i.test(contentType)) {
            try { parsed = JSON.parse(payload); } catch {}
          } else if (payload && typeof payload === 'object' && !Buffer.isBuffer(payload)) {
            parsed = payload;
          }
          if (parsed) {
            const v1Norm = normalizeForCompare({ status: res.statusCode || 200, jsonBody: parsed });
            const v2Norm = v2Shadow?.handled
              ? normalizeForCompare({ status: shadowResState.statusCode, jsonBody: shadowResState.payload })
              : normalizeForCompare({ status: v2Shadow.status, jsonBody: v2Shadow.body });
            if (JSON.stringify(v1Norm) !== JSON.stringify(v2Norm)) {
              console.error('[assembleias][shadow][representante] divergence', { v1: v1Norm, v2: v2Norm });
            }
          }
        } catch {}
        return originalSend(payload);
      };

      return v1Router(req, res, next);
    } catch (e) {
      console.error('[assembleias][shadow][representante] erro:', e);
      return res.status(500).json({ ok: false, error: 'Falha ao registrar representante' });
    }
  });

  router.post('/condominios/administracao/assembleia/execution/:id/presencas/nao-representante', async (req, res, next) => {
    const path = `/condominios/administracao/assembleia/execution/${encodeURIComponent(String(req.params?.id || ''))}/presencas/nao-representante`;
    try {
      const isV2On = String(process.env.WDG_FLAG_ASSEMBLEIAS_V2 || '').trim() === '1';
      const isShadowEnabled = String(process.env.WDG_FLAG_ASSEMBLEIAS_SHADOW ?? '1').trim() !== '0';
      if (isV2On) {
        const result = await executionPresenceNaoRepresentanteLogic({
          req,
          res,
          shadow: false,
          deps: {
            PRESENCE_ROLE,
            executionPresenceLogic,
            presenceLogicDeps: {
              mongoose,
              isPortalRequest,
              mustAuth,
              mustControl,
              getOrCreateExecution,
              PRESENCE_ROLE,
              PRESENCE_STATUS,
              normalizePresenceRole,
              safeStr,
              getPortalHabitacaoId,
              pickUserId,
              getPortalPresenceKey,
              normalizePresenceKey,
              getPortalPresenceNome,
              toObjectOrPlain,
              finalizePresenceStatus,
              newPresenceId,
              hasOtherConfirmedRepresentative,
              buildActorSnapshot,
              isPresenceConfirmed,
              pushEvent,
              writeAuditLog,
              getActorSource,
              computeQuorum,
              serializePresence
            },
            router: v1Router
          }
        });
        if (result?.handled) return;
        if (result?.status) return res.status(result.status).json(result.body ?? {});
        return res.json(result?.body ?? { ok: false });
      }

      if (!isShadowEnabled) {
        return v1Router(req, res, next);
      }

      const reqForV2 = cloneReqForShadow(req, 'POST', path);
      const shadowResState = { statusCode: 200, payload: null, handled: false };
      const shadowRes = {
        status(code) {
          shadowResState.statusCode = Number(code) || shadowResState.statusCode;
          return this;
        },
        json(payload) {
          shadowResState.payload = payload;
          shadowResState.handled = true;
          return this;
        }
      };

      const v2Shadow = await executionPresenceNaoRepresentanteLogic({
        req: reqForV2,
        res: shadowRes,
        shadow: true,
        deps: {
          PRESENCE_ROLE,
          executionPresenceLogic,
          presenceLogicDeps: {
            mongoose,
            isPortalRequest,
            mustAuth,
            mustControl,
            getOrCreateExecution,
            PRESENCE_ROLE,
            PRESENCE_STATUS,
            normalizePresenceRole,
            safeStr,
            getPortalHabitacaoId,
            pickUserId,
            getPortalPresenceKey,
            normalizePresenceKey,
            getPortalPresenceNome,
            toObjectOrPlain,
            finalizePresenceStatus,
            newPresenceId,
            hasOtherConfirmedRepresentative,
            buildActorSnapshot,
            isPresenceConfirmed,
            pushEvent,
            writeAuditLog,
            getActorSource,
            computeQuorum,
            serializePresence
          },
          router: v1Router
        }
      });

      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);

      res.json = (payload) => {
        try {
          const v1Norm = normalizeForCompare({ status: res.statusCode || 200, jsonBody: payload });
          const v2Norm = v2Shadow?.handled
            ? normalizeForCompare({ status: shadowResState.statusCode, jsonBody: shadowResState.payload })
            : normalizeForCompare({ status: v2Shadow.status, jsonBody: v2Shadow.body });
          if (JSON.stringify(v1Norm) !== JSON.stringify(v2Norm)) {
            console.error('[assembleias][shadow][nao-representante] divergence', { v1: v1Norm, v2: v2Norm });
          }
        } catch {}
        return originalJson(payload);
      };

      res.send = (payload) => {
        try {
          const contentType = String(res.getHeader('content-type') || '');
          let parsed = null;
          if (typeof payload === 'string' && /application\/json/i.test(contentType)) {
            try { parsed = JSON.parse(payload); } catch {}
          } else if (payload && typeof payload === 'object' && !Buffer.isBuffer(payload)) {
            parsed = payload;
          }
          if (parsed) {
            const v1Norm = normalizeForCompare({ status: res.statusCode || 200, jsonBody: parsed });
            const v2Norm = v2Shadow?.handled
              ? normalizeForCompare({ status: shadowResState.statusCode, jsonBody: shadowResState.payload })
              : normalizeForCompare({ status: v2Shadow.status, jsonBody: v2Shadow.body });
            if (JSON.stringify(v1Norm) !== JSON.stringify(v2Norm)) {
              console.error('[assembleias][shadow][nao-representante] divergence', { v1: v1Norm, v2: v2Norm });
            }
          }
        } catch {}
        return originalSend(payload);
      };

      return v1Router(req, res, next);
    } catch (e) {
      console.error('[assembleias][shadow][nao-representante] erro:', e);
      return res.status(500).json({ ok: false, error: 'Falha ao registrar não representante' });
    }
  });

  router.post('/condominios/administracao/assembleia/execution/:id/presencas/:presenceId/confirmar-moderador', async (req, res, next) => {
    const path = `/condominios/administracao/assembleia/execution/${encodeURIComponent(String(req.params?.id || ''))}/presencas/${encodeURIComponent(String(req.params?.presenceId || ''))}/confirmar-moderador`;
    try {
      const isV2On = String(process.env.WDG_FLAG_ASSEMBLEIAS_V2 || '').trim() === '1';
      const isShadowEnabled = String(process.env.WDG_FLAG_ASSEMBLEIAS_SHADOW ?? '1').trim() !== '0';
      if (isV2On) {
        const result = await executionPresenceConfirmModeratorLogic({
          req,
          res,
          shadow: false,
          deps: {
            mongoose,
            mustControl,
            getOrCreateExecution,
            toObjectOrPlain,
            normalizePresenceRole,
            PRESENCE_ROLE,
            finalizePresenceStatus,
            PRESENCE_STATUS,
            hasOtherConfirmedRepresentative,
            safeStr,
            buildActorSnapshot,
            pushEvent,
            writeAuditLog,
            getActorSource,
            computeQuorum,
            serializePresence
          }
        });
        if (result?.handled) return;
        if (result && typeof result.status === 'number') {
          if (result.body === undefined) return res.sendStatus(result.status);
          return res.status(result.status).send(result.body);
        }
        return res.status(500).json({ ok: false, error: 'Falha ao confirmar presença pelo moderador' });
      }

      if (!isShadowEnabled) {
        return v1Router(req, res, next);
      }

      const reqForV2 = cloneReqForShadow(req, 'POST', path);
      const shadowResState = { statusCode: 200, payload: null, handled: false };
      const shadowRes = {
        status(code) {
          shadowResState.statusCode = Number(code) || shadowResState.statusCode;
          return this;
        },
        json(payload) {
          shadowResState.payload = payload;
          shadowResState.handled = true;
          return this;
        }
      };

      const v2Shadow = await executionPresenceConfirmModeratorLogic({
        req: reqForV2,
        res: shadowRes,
        shadow: true,
        deps: {
          mongoose,
          mustControl,
          getOrCreateExecution,
          toObjectOrPlain,
          normalizePresenceRole,
          PRESENCE_ROLE,
          finalizePresenceStatus,
          PRESENCE_STATUS,
          hasOtherConfirmedRepresentative,
          safeStr,
          buildActorSnapshot,
          pushEvent,
          writeAuditLog,
          getActorSource,
          computeQuorum,
          serializePresence
        }
      });

      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);

      res.json = (payload) => {
        try {
          const v1Norm = normalizeForCompare({ status: res.statusCode || 200, jsonBody: payload });
          const v2Norm = v2Shadow?.handled
            ? normalizeForCompare({ status: shadowResState.statusCode, jsonBody: shadowResState.payload })
            : normalizeForCompare({ status: v2Shadow.status, jsonBody: v2Shadow.body });
          if (JSON.stringify(v1Norm) !== JSON.stringify(v2Norm)) {
            console.error('[assembleias][shadow][confirmar-moderador] divergence', { v1: v1Norm, v2: v2Norm });
          }
        } catch {}
        return originalJson(payload);
      };

      res.send = (payload) => {
        try {
          const contentType = String(res.getHeader('content-type') || '');
          let parsed = null;
          if (typeof payload === 'string' && /application\/json/i.test(contentType)) {
            try { parsed = JSON.parse(payload); } catch {}
          } else if (payload && typeof payload === 'object' && !Buffer.isBuffer(payload)) {
            parsed = payload;
          }
          if (parsed) {
            const v1Norm = normalizeForCompare({ status: res.statusCode || 200, jsonBody: parsed });
            const v2Norm = v2Shadow?.handled
              ? normalizeForCompare({ status: shadowResState.statusCode, jsonBody: shadowResState.payload })
              : normalizeForCompare({ status: v2Shadow.status, jsonBody: v2Shadow.body });
            if (JSON.stringify(v1Norm) !== JSON.stringify(v2Norm)) {
              console.error('[assembleias][shadow][confirmar-moderador] divergence', { v1: v1Norm, v2: v2Norm });
            }
          }
        } catch {}
        return originalSend(payload);
      };

      return v1Router(req, res, next);
    } catch (e) {
      console.error('[assembleias][shadow][confirmar-moderador] erro:', e);
      return res.status(500).json({ ok: false, error: 'Falha ao confirmar presença pelo moderador' });
    }
  });

  router.post('/condominios/administracao/assembleia/execution/:id/presencas/:presenceId/confirmar-pin', async (req, res, next) => {
    const path = `/condominios/administracao/assembleia/execution/${encodeURIComponent(String(req.params?.id || ''))}/presencas/${encodeURIComponent(String(req.params?.presenceId || ''))}/confirmar-pin`;
    try {
      const isV2On = String(process.env.WDG_FLAG_ASSEMBLEIAS_V2 || '').trim() === '1';
      const isShadowEnabled = String(process.env.WDG_FLAG_ASSEMBLEIAS_SHADOW ?? '1').trim() !== '0';
      if (isV2On) {
        const result = await executionPresenceConfirmPinLogic({
          req,
          res,
          shadow: false,
          deps: {
            executionPresenceConfirmLogic,
            presenceConfirmLogicDeps: {
              mongoose,
              mustControl,
              safeStr,
              normalizePresenceKey,
              getOrCreateExecution,
              toObjectOrPlain,
              normalizePresenceRole,
              PRESENCE_ROLE,
              parsePortalUserIdFromPresenceKey,
              CondMorador,
              CondHabitacao,
              CondProprietario,
              CondUsuario,
              verifyPortalPassword,
              finalizePresenceStatus,
              PRESENCE_STATUS,
              hasOtherConfirmedRepresentative,
              pushEvent,
              writeAuditLog,
              getActorSource,
              computeQuorum,
              serializePresence
            },
            router: v1Router
          }
        });
        if (result?.handled) return;
        if (result && typeof result.status === 'number') {
          if (result.body === undefined) return res.sendStatus(result.status);
          return res.status(result.status).send(result.body);
        }
        return res.status(500).json({ ok: false, error: 'Falha ao confirmar por PIN' });
      }

      if (!isShadowEnabled) {
        return v1Router(req, res, next);
      }

      const reqForV2 = cloneReqForShadow(req, 'POST', path);
      const shadowResState = { statusCode: 200, payload: null, handled: false };
      const shadowRes = {
        status(code) {
          shadowResState.statusCode = Number(code) || shadowResState.statusCode;
          return this;
        },
        json(payload) {
          shadowResState.payload = payload;
          shadowResState.handled = true;
          return this;
        }
      };

      const v2Shadow = await executionPresenceConfirmPinLogic({
        req: reqForV2,
        res: shadowRes,
        shadow: true,
        deps: {
          executionPresenceConfirmLogic,
          presenceConfirmLogicDeps: {
            mongoose,
            mustControl,
            safeStr,
            normalizePresenceKey,
            getOrCreateExecution,
            toObjectOrPlain,
            normalizePresenceRole,
            PRESENCE_ROLE,
            parsePortalUserIdFromPresenceKey,
            CondMorador,
            CondHabitacao,
            CondProprietario,
            CondUsuario,
            verifyPortalPassword,
            finalizePresenceStatus,
            PRESENCE_STATUS,
            hasOtherConfirmedRepresentative,
            pushEvent,
            writeAuditLog,
            getActorSource,
            computeQuorum,
            serializePresence
          },
          router: v1Router
        }
      });

      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);

      res.json = (payload) => {
        try {
          const v1Norm = normalizeForCompare({ status: res.statusCode || 200, jsonBody: payload });
          const v2Norm = v2Shadow?.handled
            ? normalizeForCompare({ status: shadowResState.statusCode, jsonBody: shadowResState.payload })
            : normalizeForCompare({ status: v2Shadow.status, jsonBody: v2Shadow.body });
          if (JSON.stringify(v1Norm) !== JSON.stringify(v2Norm)) {
            console.error('[assembleias][shadow][confirmar-pin] divergence', { v1: v1Norm, v2: v2Norm });
          }
        } catch {}
        return originalJson(payload);
      };

      res.send = (payload) => {
        try {
          const contentType = String(res.getHeader('content-type') || '');
          let parsed = null;
          if (typeof payload === 'string' && /application\/json/i.test(contentType)) {
            try { parsed = JSON.parse(payload); } catch {}
          } else if (payload && typeof payload === 'object' && !Buffer.isBuffer(payload)) {
            parsed = payload;
          }
          if (parsed) {
            const v1Norm = normalizeForCompare({ status: res.statusCode || 200, jsonBody: parsed });
            const v2Norm = v2Shadow?.handled
              ? normalizeForCompare({ status: shadowResState.statusCode, jsonBody: shadowResState.payload })
              : normalizeForCompare({ status: v2Shadow.status, jsonBody: v2Shadow.body });
            if (JSON.stringify(v1Norm) !== JSON.stringify(v2Norm)) {
              console.error('[assembleias][shadow][confirmar-pin] divergence', { v1: v1Norm, v2: v2Norm });
            }
          }
        } catch {}
        return originalSend(payload);
      };

      return v1Router(req, res, next);
    } catch (e) {
      console.error('[assembleias][shadow][confirmar-pin] erro:', e);
      return res.status(500).json({ ok: false, error: 'Falha ao confirmar por PIN' });
    }
  });

  router.post('/api/assembleias/:id/execution/agenda', async (req, res, next) => {
    const path = `/api/assembleias/${encodeURIComponent(String(req.params?.id || ''))}/execution/agenda`;
    try {
      const isV2On = String(process.env.WDG_FLAG_ASSEMBLEIAS_V2 || '').trim() === '1';
      const isShadowEnabled = String(process.env.WDG_FLAG_ASSEMBLEIAS_SHADOW ?? '1').trim() !== '0';
      if (isV2On) {
        const result = await executionAgendaLogic({
          req,
          res,
          shadow: false,
          deps: {
            mongoose,
            mustControl,
            getOrCreateExecution,
            safeStr,
            pushEvent,
            writeAuditLog,
            getActorSource
          }
        });
        if (result?.handled) return;
        return res.status(result.status).json(result.body);
      }

      if (!isShadowEnabled) {
        return v1Router(req, res, next);
      }

      const reqForV2 = cloneReqForShadow(req, 'POST', path);
      const shadowResState = { statusCode: 200, payload: null, handled: false };
      const shadowRes = {
        status(code) {
          shadowResState.statusCode = Number(code) || shadowResState.statusCode;
          return this;
        },
        json(payload) {
          shadowResState.payload = payload;
          shadowResState.handled = true;
          return this;
        }
      };

      const v2Shadow = await executionAgendaLogic({
        req: reqForV2,
        res: shadowRes,
        shadow: true,
        deps: {
          mongoose,
          mustControl,
          getOrCreateExecution,
          safeStr,
          pushEvent,
          writeAuditLog,
          getActorSource
        }
      });

      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);

      res.json = (payload) => {
        try {
          const v1Norm = normalizeForCompare({ status: res.statusCode || 200, jsonBody: payload });
          const v2Norm = v2Shadow?.handled
            ? normalizeForCompare({ status: shadowResState.statusCode, jsonBody: shadowResState.payload })
            : normalizeForCompare({ status: v2Shadow.status, jsonBody: v2Shadow.body });
          if (JSON.stringify(v1Norm) !== JSON.stringify(v2Norm)) {
            console.error('[assembleias][shadow][agenda] divergence', { v1: v1Norm, v2: v2Norm });
          }
        } catch {}
        return originalJson(payload);
      };

      res.send = (payload) => {
        try {
          const contentType = String(res.getHeader('content-type') || '');
          let parsed = null;
          if (typeof payload === 'string' && /application\/json/i.test(contentType)) {
            try { parsed = JSON.parse(payload); } catch {}
          } else if (payload && typeof payload === 'object' && !Buffer.isBuffer(payload)) {
            parsed = payload;
          }
          if (parsed) {
            const v1Norm = normalizeForCompare({ status: res.statusCode || 200, jsonBody: parsed });
            const v2Norm = v2Shadow?.handled
              ? normalizeForCompare({ status: shadowResState.statusCode, jsonBody: shadowResState.payload })
              : normalizeForCompare({ status: v2Shadow.status, jsonBody: v2Shadow.body });
            if (JSON.stringify(v1Norm) !== JSON.stringify(v2Norm)) {
              console.error('[assembleias][shadow][agenda] divergence', { v1: v1Norm, v2: v2Norm });
            }
          }
        } catch {}
        return originalSend(payload);
      };

      return v1Router(req, res, next);
    } catch (e) {
      console.error('[assembleias][shadow][agenda] erro:', e);
      return res.status(500).json({ ok: false, error: 'Falha ao atualizar pauta' });
    }
  });

  router.post('/api/assembleias/:id/execution/vote/open', async (req, res, next) => {
    const path = `/api/assembleias/${encodeURIComponent(String(req.params?.id || ''))}/execution/vote/open`;
    try {
      const isV2On = String(process.env.WDG_FLAG_ASSEMBLEIAS_V2 || '').trim() === '1';
      const isShadowEnabled = String(process.env.WDG_FLAG_ASSEMBLEIAS_SHADOW ?? '1').trim() !== '0';
      if (isV2On) {
        const result = await executionVoteOpenLogic({
          req,
          res,
          shadow: false,
          deps: {
            mongoose,
            mustControl,
            getOrCreateExecution,
            safeStr,
            pushEvent,
            writeAuditLog,
            getActorSource
          }
        });
        if (result?.handled) return;
        return res.status(result.status).json(result.body);
      }

      if (!isShadowEnabled) {
        return v1Router(req, res, next);
      }

      const reqForV2 = cloneReqForShadow(req, 'POST', path);
      const shadowResState = { statusCode: 200, payload: null, handled: false };
      const shadowRes = {
        status(code) {
          shadowResState.statusCode = Number(code) || shadowResState.statusCode;
          return this;
        },
        json(payload) {
          shadowResState.payload = payload;
          shadowResState.handled = true;
          return this;
        }
      };

      const v2Shadow = await executionVoteOpenLogic({
        req: reqForV2,
        res: shadowRes,
        shadow: true,
        deps: {
          mongoose,
          mustControl,
          getOrCreateExecution,
          safeStr,
          pushEvent,
          writeAuditLog,
          getActorSource
        }
      });

      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);

      res.json = (payload) => {
        try {
          const v1Norm = normalizeForCompare({ status: res.statusCode || 200, jsonBody: payload });
          const v2Norm = v2Shadow?.handled
            ? normalizeForCompare({ status: shadowResState.statusCode, jsonBody: shadowResState.payload })
            : normalizeForCompare({ status: v2Shadow.status, jsonBody: v2Shadow.body });
          if (JSON.stringify(v1Norm) !== JSON.stringify(v2Norm)) {
            console.error('[assembleias][shadow][vote-open] divergence', { v1: v1Norm, v2: v2Norm });
          }
        } catch {}
        return originalJson(payload);
      };

      res.send = (payload) => {
        try {
          const contentType = String(res.getHeader('content-type') || '');
          let parsed = null;
          if (typeof payload === 'string' && /application\/json/i.test(contentType)) {
            try { parsed = JSON.parse(payload); } catch {}
          } else if (payload && typeof payload === 'object' && !Buffer.isBuffer(payload)) {
            parsed = payload;
          }
          if (parsed) {
            const v1Norm = normalizeForCompare({ status: res.statusCode || 200, jsonBody: parsed });
            const v2Norm = v2Shadow?.handled
              ? normalizeForCompare({ status: shadowResState.statusCode, jsonBody: shadowResState.payload })
              : normalizeForCompare({ status: v2Shadow.status, jsonBody: v2Shadow.body });
            if (JSON.stringify(v1Norm) !== JSON.stringify(v2Norm)) {
              console.error('[assembleias][shadow][vote-open] divergence', { v1: v1Norm, v2: v2Norm });
            }
          }
        } catch {}
        return originalSend(payload);
      };

      return v1Router(req, res, next);
    } catch (e) {
      console.error('[assembleias][shadow][vote-open] erro:', e);
      return res.status(500).json({ ok: false, error: 'Falha ao abrir votação' });
    }
  });

  router.post('/api/assembleias/:id/execution/vote', async (req, res, next) => {
    const path = `/api/assembleias/${encodeURIComponent(String(req.params?.id || ''))}/execution/vote`;
    try {
      const isV2On = String(process.env.WDG_FLAG_ASSEMBLEIAS_V2 || '').trim() === '1';
      const isShadowEnabled = String(process.env.WDG_FLAG_ASSEMBLEIAS_SHADOW ?? '1').trim() !== '0';
      if (isV2On) {
        const result = await executionVoteLogic({
          req,
          res,
          shadow: false,
          deps: {
            mongoose,
            isPortalRequest,
            mustAuth,
            mustControl,
            getOrCreateExecution,
            normalizePresenceKey,
            getPortalPresenceKey,
            safeStr,
            normalizePresenceRole,
            normalizePresenceStatus,
            PRESENCE_ROLE,
            PRESENCE_STATUS,
            pushEvent,
            writeAuditLog,
            voteSummary
          }
        });
        if (result?.handled) return;
        return res.status(result.status).json(result.body);
      }

      if (!isShadowEnabled) {
        return v1Router(req, res, next);
      }

      const reqForV2 = cloneReqForShadow(req, 'POST', path);
      const shadowResState = { statusCode: 200, payload: null, handled: false };
      const shadowRes = {
        status(code) {
          shadowResState.statusCode = Number(code) || shadowResState.statusCode;
          return this;
        },
        json(payload) {
          shadowResState.payload = payload;
          shadowResState.handled = true;
          return this;
        }
      };

      const v2Shadow = await executionVoteLogic({
        req: reqForV2,
        res: shadowRes,
        shadow: true,
        deps: {
          mongoose,
          isPortalRequest,
          mustAuth,
          mustControl,
          getOrCreateExecution,
          normalizePresenceKey,
          getPortalPresenceKey,
          safeStr,
          normalizePresenceRole,
          normalizePresenceStatus,
          PRESENCE_ROLE,
          PRESENCE_STATUS,
          pushEvent,
          writeAuditLog,
          voteSummary
        }
      });

      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);

      res.json = (payload) => {
        try {
          const v1Norm = normalizeForCompare({ status: res.statusCode || 200, jsonBody: payload });
          const v2Norm = v2Shadow?.handled
            ? normalizeForCompare({ status: shadowResState.statusCode, jsonBody: shadowResState.payload })
            : normalizeForCompare({ status: v2Shadow.status, jsonBody: v2Shadow.body });
          if (JSON.stringify(v1Norm) !== JSON.stringify(v2Norm)) {
            console.error('[assembleias][shadow][vote] divergence', { v1: v1Norm, v2: v2Norm });
          }
        } catch {}
        return originalJson(payload);
      };

      res.send = (payload) => {
        try {
          const contentType = String(res.getHeader('content-type') || '');
          let parsed = null;
          if (typeof payload === 'string' && /application\/json/i.test(contentType)) {
            try { parsed = JSON.parse(payload); } catch {}
          } else if (payload && typeof payload === 'object' && !Buffer.isBuffer(payload)) {
            parsed = payload;
          }
          if (parsed) {
            const v1Norm = normalizeForCompare({ status: res.statusCode || 200, jsonBody: parsed });
            const v2Norm = v2Shadow?.handled
              ? normalizeForCompare({ status: shadowResState.statusCode, jsonBody: shadowResState.payload })
              : normalizeForCompare({ status: v2Shadow.status, jsonBody: v2Shadow.body });
            if (JSON.stringify(v1Norm) !== JSON.stringify(v2Norm)) {
              console.error('[assembleias][shadow][vote] divergence', { v1: v1Norm, v2: v2Norm });
            }
          }
        } catch {}
        return originalSend(payload);
      };

      return v1Router(req, res, next);
    } catch (e) {
      console.error('[assembleias][shadow][vote] erro:', e);
      return res.status(500).json({ ok: false, error: 'Falha ao registrar voto' });
    }
  });

  router.post('/api/assembleias/:id/execution/vote/close', async (req, res, next) => {
    const path = `/api/assembleias/${encodeURIComponent(String(req.params?.id || ''))}/execution/vote/close`;
    try {
      const isV2On = String(process.env.WDG_FLAG_ASSEMBLEIAS_V2 || '').trim() === '1';
      if (isV2On) {
        const result = await executionVoteCloseLogic({
          req,
          res,
          shadow: false,
          deps: {
            mongoose,
            mustControl,
            getOrCreateExecution,
            pushEvent,
            safeStr,
            writeAuditLog,
            getActorSource,
            voteSummary
          }
        });
        if (result?.handled) return;
        return res.status(result.status).json(result.body);
      }

      const reqForV2 = cloneReqForShadow(req, 'POST', path);
      const shadowResState = { statusCode: 200, payload: null, handled: false };
      const shadowRes = {
        status(code) {
          shadowResState.statusCode = Number(code) || shadowResState.statusCode;
          return this;
        },
        json(payload) {
          shadowResState.payload = payload;
          shadowResState.handled = true;
          return this;
        }
      };

      const v2Shadow = await executionVoteCloseLogic({
        req: reqForV2,
        res: shadowRes,
        shadow: true,
        deps: {
          mongoose,
          mustControl,
          getOrCreateExecution,
          pushEvent,
          safeStr,
          writeAuditLog,
          getActorSource,
          voteSummary
        }
      });

      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);

      res.json = (payload) => {
        try {
          const v1Norm = normalizeForCompare({ status: res.statusCode || 200, jsonBody: payload });
          const v2Norm = v2Shadow?.handled
            ? normalizeForCompare({ status: shadowResState.statusCode, jsonBody: shadowResState.payload })
            : normalizeForCompare({ status: v2Shadow.status, jsonBody: v2Shadow.body });
          if (JSON.stringify(v1Norm) !== JSON.stringify(v2Norm)) {
            console.error('[assembleias][shadow][vote-close] divergence', { v1: v1Norm, v2: v2Norm });
          }
        } catch {}
        return originalJson(payload);
      };

      res.send = (payload) => {
        try {
          const contentType = String(res.getHeader('content-type') || '');
          let parsed = null;
          if (typeof payload === 'string' && /application\/json/i.test(contentType)) {
            try { parsed = JSON.parse(payload); } catch {}
          } else if (payload && typeof payload === 'object' && !Buffer.isBuffer(payload)) {
            parsed = payload;
          }
          if (parsed) {
            const v1Norm = normalizeForCompare({ status: res.statusCode || 200, jsonBody: parsed });
            const v2Norm = v2Shadow?.handled
              ? normalizeForCompare({ status: shadowResState.statusCode, jsonBody: shadowResState.payload })
              : normalizeForCompare({ status: v2Shadow.status, jsonBody: v2Shadow.body });
            if (JSON.stringify(v1Norm) !== JSON.stringify(v2Norm)) {
              console.error('[assembleias][shadow][vote-close] divergence', { v1: v1Norm, v2: v2Norm });
            }
          }
        } catch {}
        return originalSend(payload);
      };

      return v1Router(req, res, next);
    } catch (e) {
      console.error('[assembleias][shadow][vote-close] erro:', e);
      return res.status(500).json({ ok: false, error: 'Falha ao encerrar votação' });
    }
  });

  router.get('/api/assembleias/:id/execution/status', async (req, res, next) => {
    const path = `/api/assembleias/${encodeURIComponent(String(req.params?.id || ''))}/execution/status`;
    try {
      const isV2On = String(process.env.WDG_FLAG_ASSEMBLEIAS_V2 || '').trim() === '1';
      if (isV2On) {
        const result = await executionStatusLogic({
          req,
          res,
          shadow: false,
          deps: {
            mustAuth,
            mongoose,
            getOrCreateExecution,
            computeSessionClockMs,
            computeQuorum,
            voteSummary,
            safeStr,
            serializePresence
          }
        });
        if (result?.handled) return;
        return res.status(result.status).json(result.body);
      }

      const reqForV2 = cloneReqForShadow(req, 'GET', path);
      const shadowResState = { statusCode: 200, payload: null, handled: false };
      const shadowRes = {
        status(code) {
          shadowResState.statusCode = Number(code) || shadowResState.statusCode;
          return this;
        },
        json(payload) {
          shadowResState.payload = payload;
          shadowResState.handled = true;
          return this;
        }
      };

      const v2Shadow = await executionStatusLogic({
        req: reqForV2,
        res: shadowRes,
        shadow: true,
        deps: {
          mustAuth,
          mongoose,
          getOrCreateExecution,
          computeSessionClockMs,
          computeQuorum,
          voteSummary,
          safeStr,
          serializePresence
        }
      });

      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);

      res.json = (payload) => {
        try {
          const v1Norm = normalizeForCompare({ status: res.statusCode || 200, jsonBody: payload });
          const v2Norm = v2Shadow?.handled
            ? normalizeForCompare({ status: shadowResState.statusCode, jsonBody: shadowResState.payload })
            : normalizeForCompare({ status: v2Shadow.status, jsonBody: v2Shadow.body });
          if (JSON.stringify(v1Norm) !== JSON.stringify(v2Norm)) {
            console.error('[assembleias][shadow][status] divergence', { v1: v1Norm, v2: v2Norm });
          }
        } catch {}
        return originalJson(payload);
      };

      res.send = (payload) => {
        try {
          const contentType = String(res.getHeader('content-type') || '');
          let parsed = null;
          if (typeof payload === 'string' && /application\/json/i.test(contentType)) {
            try { parsed = JSON.parse(payload); } catch {}
          } else if (payload && typeof payload === 'object' && !Buffer.isBuffer(payload)) {
            parsed = payload;
          }
          if (parsed) {
            const v1Norm = normalizeForCompare({ status: res.statusCode || 200, jsonBody: parsed });
            const v2Norm = v2Shadow?.handled
              ? normalizeForCompare({ status: shadowResState.statusCode, jsonBody: shadowResState.payload })
              : normalizeForCompare({ status: v2Shadow.status, jsonBody: v2Shadow.body });
            if (JSON.stringify(v1Norm) !== JSON.stringify(v2Norm)) {
              console.error('[assembleias][shadow][status] divergence', { v1: v1Norm, v2: v2Norm });
            }
          }
        } catch {}
        return originalSend(payload);
      };

      return v1Router(req, res, next);
    } catch (e) {
      console.error('[assembleias][shadow][status] erro:', e);
      return res.status(500).json({ ok: false, error: 'Falha ao carregar status' });
    }
  });
  router.get('/api/assembleias/:id/execution/presence/me', async (req, res, next) => {
    const path = `/api/assembleias/${encodeURIComponent(String(req.params?.id || ''))}/execution/presence/me`;
    try {
      const isV2On = String(process.env.WDG_FLAG_ASSEMBLEIAS_V2 || '').trim() === '1';
      if (isV2On) {
        const result = await executionPresenceMeLogic({
          req,
          res,
          shadow: false,
          deps: {
            isPortalRequest,
            mustAuth,
            mongoose,
            getOrCreateExecution,
            getPortalPresenceKey,
            getPortalHabitacaoId,
            normalizePresenceKey,
            serializePresence
          }
        });
        if (result?.handled) return;
        return res.status(result.status).json(result.body);
      }

      const reqForV2 = cloneReqForShadow(req, 'GET', path);
      const shadowResState = { statusCode: 200, payload: null, handled: false };
      const shadowRes = {
        status(code) {
          shadowResState.statusCode = Number(code) || shadowResState.statusCode;
          return this;
        },
        json(payload) {
          shadowResState.payload = payload;
          shadowResState.handled = true;
          return this;
        }
      };

      const v2Shadow = await executionPresenceMeLogic({
        req: reqForV2,
        res: shadowRes,
        shadow: true,
        deps: {
          isPortalRequest,
          mustAuth,
          mongoose,
          getOrCreateExecution,
          getPortalPresenceKey,
          getPortalHabitacaoId,
          normalizePresenceKey,
          serializePresence
        }
      });

      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);

      res.json = (payload) => {
        try {
          const v1Norm = normalizeForCompare({ status: res.statusCode || 200, jsonBody: payload });
          const v2Norm = v2Shadow?.handled
            ? normalizeForCompare({ status: shadowResState.statusCode, jsonBody: shadowResState.payload })
            : normalizeForCompare({ status: v2Shadow.status, jsonBody: v2Shadow.body });
          if (JSON.stringify(v1Norm) !== JSON.stringify(v2Norm)) {
            console.error('[assembleias][shadow][presence/me] divergence', { v1: v1Norm, v2: v2Norm });
          }
        } catch {}
        return originalJson(payload);
      };

      res.send = (payload) => {
        try {
          const contentType = String(res.getHeader('content-type') || '');
          let parsed = null;
          if (typeof payload === 'string' && /application\/json/i.test(contentType)) {
            try { parsed = JSON.parse(payload); } catch {}
          } else if (payload && typeof payload === 'object' && !Buffer.isBuffer(payload)) {
            parsed = payload;
          }
          if (parsed) {
            const v1Norm = normalizeForCompare({ status: res.statusCode || 200, jsonBody: parsed });
            const v2Norm = v2Shadow?.handled
              ? normalizeForCompare({ status: shadowResState.statusCode, jsonBody: shadowResState.payload })
              : normalizeForCompare({ status: v2Shadow.status, jsonBody: v2Shadow.body });
            if (JSON.stringify(v1Norm) !== JSON.stringify(v2Norm)) {
              console.error('[assembleias][shadow][presence/me] divergence', { v1: v1Norm, v2: v2Norm });
            }
          }
        } catch {}
        return originalSend(payload);
      };

      return v1Router(req, res, next);
    } catch (e) {
      console.error('[assembleias][shadow][presence/me] erro:', e);
      return res.status(500).json({ ok: false, error: 'Falha ao carregar presença' });
    }
  });
  router.get('/api/assembleias/:id/execution/ata', async (req, res, next) => {
    const path = `/api/assembleias/${encodeURIComponent(String(req.params?.id || ''))}/execution/ata`;
    try {
      const isV2On = String(process.env.WDG_FLAG_ASSEMBLEIAS_V2 || '').trim() === '1';
      if (isV2On) {
        const result = await executionAtaLogic({
          req,
          res,
          shadow: false,
          deps: {
            mustControl,
            mongoose,
            CondAssembleia,
            getOrCreateExecution,
            computeQuorum,
            voteSummary,
            safeStr,
            writeAuditLog,
            getActorSource
          }
        });
        if (result?.handled) return;
        return res.status(result.status).json(result.body);
      }

      const reqForV2 = cloneReqForShadow(req, 'GET', path);
      const shadowResState = { statusCode: 200, payload: null, handled: false };
      const shadowRes = {
        status(code) {
          shadowResState.statusCode = Number(code) || shadowResState.statusCode;
          return this;
        },
        json(payload) {
          shadowResState.payload = payload;
          shadowResState.handled = true;
          return this;
        }
      };

      const v2Shadow = await executionAtaLogic({
        req: reqForV2,
        res: shadowRes,
        shadow: true,
        deps: {
          mustControl,
          mongoose,
          CondAssembleia,
          getOrCreateExecution,
          computeQuorum,
          voteSummary,
          safeStr,
          writeAuditLog,
          getActorSource
        }
      });

      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);

      res.json = (payload) => {
        try {
          const v1Norm = normalizeForCompare({ status: res.statusCode || 200, jsonBody: payload });
          const v2Norm = v2Shadow?.handled
            ? normalizeForCompare({ status: shadowResState.statusCode, jsonBody: shadowResState.payload })
            : normalizeForCompare({ status: v2Shadow.status, jsonBody: v2Shadow.body });
          if (JSON.stringify(v1Norm) !== JSON.stringify(v2Norm)) {
            console.error('[assembleias][shadow][ata] divergence', { v1: v1Norm, v2: v2Norm });
          }
        } catch {}
        return originalJson(payload);
      };

      res.send = (payload) => {
        try {
          const contentType = String(res.getHeader('content-type') || '');
          let parsed = null;
          if (typeof payload === 'string' && /application\/json/i.test(contentType)) {
            try { parsed = JSON.parse(payload); } catch {}
          } else if (payload && typeof payload === 'object' && !Buffer.isBuffer(payload)) {
            parsed = payload;
          }
          if (parsed) {
            const v1Norm = normalizeForCompare({ status: res.statusCode || 200, jsonBody: parsed });
            const v2Norm = v2Shadow?.handled
              ? normalizeForCompare({ status: shadowResState.statusCode, jsonBody: shadowResState.payload })
              : normalizeForCompare({ status: v2Shadow.status, jsonBody: v2Shadow.body });
            if (JSON.stringify(v1Norm) !== JSON.stringify(v2Norm)) {
              console.error('[assembleias][shadow][ata] divergence', { v1: v1Norm, v2: v2Norm });
            }
          }
        } catch {}
        return originalSend(payload);
      };

      return v1Router(req, res, next);
    } catch (e) {
      console.error('[assembleias][shadow][ata] erro:', e);
      return res.status(500).json({ ok: false, error: 'Falha ao gerar ata' });
    }
  });
  router.get('/api/assembleias/:id/execution/ata.pdf', async (req, res, next) => {
    const path = `/api/assembleias/${encodeURIComponent(String(req.params?.id || ''))}/execution/ata.pdf`;
    try {
      const isV2On = String(process.env.WDG_FLAG_ASSEMBLEIAS_V2 || '').trim() === '1';
      if (isV2On) {
        const result = await executionAtaPdfLogic({
          req,
          res,
          shadow: false,
          deps: {
            mustControl,
            mongoose,
            CondAssembleia,
            getOrCreateExecution,
            computeQuorum,
            voteSummary,
            safeStr,
            QRCode,
            PDFDocument,
            writeAuditLog,
            getActorSource
          }
        });
        if (result?.handled) return;
        if (result?.headers && typeof result.headers === 'object') {
          for (const [headerName, headerValue] of Object.entries(result.headers)) {
            res.setHeader(headerName, headerValue);
          }
        }
        if (result && typeof result.status === 'number') {
          if (result.body === undefined) return res.sendStatus(result.status);
          if (Buffer.isBuffer(result.body)) return res.status(result.status).send(result.body);
          return res.status(result.status).json(result.body);
        }
        return res.status(500).json({ ok: false, error: 'Falha ao exportar ata' });
      }

      const reqForV2 = cloneReqForShadow(req, 'GET', path);
      const shadowResState = { statusCode: 200, payload: null, handled: false, headers: {}, buffer: null };
      const shadowRes = {
        status(code) {
          shadowResState.statusCode = Number(code) || shadowResState.statusCode;
          return this;
        },
        setHeader(k, v) {
          shadowResState.headers[String(k).toLowerCase()] = String(v);
          return this;
        },
        json(payload) {
          shadowResState.payload = payload;
          shadowResState.handled = true;
          return this;
        },
        send(payload) {
          if (Buffer.isBuffer(payload)) shadowResState.buffer = payload;
          else if (payload && typeof payload === 'object') shadowResState.payload = payload;
          shadowResState.handled = true;
          return this;
        },
        get(name) {
          return shadowResState.headers[String(name || '').toLowerCase()];
        }
      };

      const v2Shadow = await executionAtaPdfLogic({
        req: reqForV2,
        res: shadowRes,
        shadow: true,
        deps: {
          mustControl,
          mongoose,
          CondAssembleia,
          getOrCreateExecution,
          computeQuorum,
          voteSummary,
          safeStr,
          QRCode,
          PDFDocument,
          writeAuditLog,
          getActorSource
        }
      });

      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);

      res.json = (payload) => {
        try {
          const v1Norm = normalizeForCompare({ status: res.statusCode || 200, jsonBody: payload });
          const v2Norm = v2Shadow?.handled
            ? normalizeForCompare({ status: shadowResState.statusCode, jsonBody: shadowResState.payload })
            : normalizeForCompare({ status: v2Shadow.status, jsonBody: v2Shadow.body });
          if (JSON.stringify(v1Norm) !== JSON.stringify(v2Norm)) {
            console.error('[assembleias][shadow][ata.pdf] divergence', { v1: v1Norm, v2: v2Norm });
          }
        } catch {}
        return originalJson(payload);
      };

      res.send = (payload) => {
        try {
          const contentType = String(res.getHeader('content-type') || '');
          if (!Buffer.isBuffer(payload)) {
            let parsed = null;
            if (typeof payload === 'string' && /application\/json/i.test(contentType)) {
              try { parsed = JSON.parse(payload); } catch {}
            } else if (payload && typeof payload === 'object') {
              parsed = payload;
            }
            if (parsed) {
              const v1Norm = normalizeForCompare({ status: res.statusCode || 200, jsonBody: parsed });
              const v2Norm = v2Shadow?.handled
                ? normalizeForCompare({ status: shadowResState.statusCode, jsonBody: shadowResState.payload })
                : normalizeForCompare({ status: v2Shadow.status, jsonBody: v2Shadow.body });
              if (JSON.stringify(v1Norm) !== JSON.stringify(v2Norm)) {
                console.error('[assembleias][shadow][ata.pdf] divergence', { v1: v1Norm, v2: v2Norm });
              }
            }
          }
        } catch {}
        return originalSend(payload);
      };

      return v1Router(req, res, next);
    } catch (e) {
      console.error('[assembleias][shadow][ata.pdf] erro:', e);
      return res.status(500).json({ ok: false, error: 'Falha ao exportar ata' });
    }
  });
  router.get('/health', (req, res) => res.json({ v: 2, ok: true }));
  return router;
}
