import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import request from 'supertest';
import bcrypt from 'bcryptjs';

import { createServer } from '../src/server/createServer.js';
import User from '../src/core/models/user.js';
import Feedback from '../src/core/models/feedback.js';

const TEST_SESSION_SEED_ENDPOINT = '/__tests__/seed-feedback-session';

const CANONICAL_CREATE_ENDPOINT = '/gestor/api/feedback';
const CANONICAL_UPLOAD_ENDPOINT = '/gestor/api/feedback/:feedbackId/anexo';
const CANONICAL_MY_LIST_ENDPOINT = '/gestor/api/feedback/meus';
const CANONICAL_MY_DETAIL_ENDPOINT = '/gestor/api/feedback/meus/:feedbackId';
const CANONICAL_ADMIN_LIST_ENDPOINT = '/gestor/api/gestor/feedback';
const CANONICAL_ADMIN_DETAIL_ENDPOINT = '/gestor/api/gestor/feedback/:feedbackId';
const CANONICAL_ADMIN_STATUS_ENDPOINT = '/gestor/api/gestor/feedback/:feedbackId/status';
const CANONICAL_ADMIN_REPLY_ENDPOINT = '/gestor/api/gestor/feedback/:feedbackId/resposta';
const CANONICAL_ADMIN_DELETE_ENDPOINT = '/gestor/api/gestor/feedback/:feedbackId';

const ROOT_COMPAT_ADMIN_LIST_ENDPOINT = '/api/gestor/feedback';

const FEEDBACK_ROUTE_FILE = 'src/modules/gestor/app/routes/feedbackApi.js';
const PROJECT_SRC_ROOT = 'src';

function installTeardownSuppression() {
  let shuttingDown = false;
  const originalEmit = process.emit;

  const shouldIgnore = (err) => {
    if (!shuttingDown) return false;
    return String(err?.message || err).includes('Connection was force closed');
  };

  const onUnhandledRejection = (err) => {
    if (shouldIgnore(err)) return;
    throw err instanceof Error ? err : new Error(String(err));
  };

  const onUncaughtException = (err) => {
    if (shouldIgnore(err)) return;
    throw err instanceof Error ? err : new Error(String(err));
  };

  process.emit = function patchedEmit(eventName, ...args) {
    if (
      (eventName === 'unhandledRejection' || eventName === 'uncaughtException')
      && shouldIgnore(args[0])
    ) {
      return false;
    }
    return originalEmit.call(this, eventName, ...args);
  };

  process.prependListener('unhandledRejection', onUnhandledRejection);
  process.prependListener('uncaughtException', onUncaughtException);

  return {
    startShutdown() {
      shuttingDown = true;
    },
    async remove() {
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setTimeout(resolve, 0));
      process.off('unhandledRejection', onUnhandledRejection);
      process.off('uncaughtException', onUncaughtException);
      process.emit = originalEmit;
    },
  };
}

async function closeWithTeardownGuard(close, teardownGuard) {
  if (typeof close !== 'function') return;

  teardownGuard.startShutdown();
  await close({ stopMemoryServer: true });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function installSessionSeedRoute(app) {
  app.get(TEST_SESSION_SEED_ENDPOINT, async (req, res) => {
    try {
      const email = String(req.query?.email || '').trim().toLowerCase();
      const role = String(req.query?.role || '').trim().toLowerCase();
      const foto = String(req.query?.foto || '').trim();

      if (!email) {
        return res.status(400).json({ success: false, error: 'EMAIL_REQUIRED' });
      }

      const user = await User.findOne({ email }).lean();
      if (!user) {
        return res.status(404).json({ success: false, error: 'USER_NOT_FOUND' });
      }

      req.session.user = {
        id: String(user._id),
        email: user.email,
        role: role || user.role || 'user',
        nome: user.nome || 'Feedback Contract User',
      };

      if (foto) req.session.user.foto = foto;

      req.session.save((err) => {
        if (err) {
          return res.status(500).json({ success: false, error: 'SESSION_SEED_FAILED' });
        }
        return res.status(204).end();
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: String(err?.message || err) });
    }
  });
}

async function seedAuthenticatedAgent(app, user, extras = {}) {
  const agent = request.agent(app);
  const seed = await agent
    .get(TEST_SESSION_SEED_ENDPOINT)
    .query({
      email: user.email,
      role: user.role,
      ...(extras.foto ? { foto: extras.foto } : {}),
    })
    .set('Connection', 'close');

  assert.equal(seed.status, 204, `Falha ao seedar sessao para ${user.email}`);
  return agent;
}

async function createTestUser({ role, marker }) {
  const unique = `${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
  const email = `${marker}.${role}.${unique}@feedback.contract.test`;
  const senha = await bcrypt.hash('Senha@123456', 10);
  const cpf = `${Date.now()}${Math.floor(Math.random() * 1000)}`.replace(/\D/g, '').slice(-11).padStart(11, '0');

  const user = await User.create({
    email,
    senha,
    cpf,
    nome: `Feedback Contract ${role}`,
    role,
    ativo: true,
    primeiro_acesso: false,
    senha_provisoria: false,
  });

  return user;
}

function expectUnauthorizedJson(res) {
  assert.equal(res.status, 401);
  assert.equal(res.body?.success, false);
  assert.equal(res.body?.code, 'UNAUTHORIZED');
  assert.equal(res.body?.error, 'Não autenticado');
}

function expectApiFailEnvelope(res, expectedStatus) {
  assert.equal(res.status, expectedStatus);
  assert.equal(res.body?.ok, false);
  assert.equal(res.body?.success, false);
  assert.equal(typeof res.body?.error, 'string');
}

function expectApiSuccessEnvelope(res, expectedStatus = 200) {
  assert.equal(res.status, expectedStatus);
  assert.equal(res.body?.ok, true);
  assert.equal(res.body?.success, true);
}

function feedbackRoute(relativePath) {
  return path.resolve(process.cwd(), FEEDBACK_ROUTE_FILE);
}

function withRouteParam(template, value) {
  return template.replace(':feedbackId', encodeURIComponent(String(value)));
}

function installOwnershipGuardrail() {
  const rootAbs = path.resolve(process.cwd(), PROJECT_SRC_ROOT);
  const targetAbs = path.resolve(process.cwd(), FEEDBACK_ROUTE_FILE);

  const files = [];

  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'wdgestor_snapshot' || entry.name === '.git') continue;
        walk(abs);
        continue;
      }

      if (!entry.isFile()) continue;
      if (!entry.name.endsWith('.js')) continue;
      files.push(abs);
    }
  };

  walk(rootAbs);

  const patterns = [
    {
      id: 'admin_feedback',
      regex: /router\.(?:get|post|patch|delete|put)\(\s*['"]\/api\/gestor\/feedback(?:\/|['"])/g,
      expectedMinMatchesInTarget: 8,
    },
    {
      id: 'user_feedback',
      regex: /router\.(?:get|post|patch|delete|put)\(\s*['"]\/api\/feedback(?:\/|['"])/g,
      expectedMinMatchesInTarget: 4,
    },
  ];

  for (const pattern of patterns) {
    const matchedFiles = [];
    let targetMatches = 0;

    for (const file of files) {
      let content;
      try {
        content = fs.readFileSync(file, 'utf8');
      } catch {
        continue;
      }

      const matches = content.match(pattern.regex);
      if (!matches || matches.length === 0) continue;

      matchedFiles.push(file);
      if (file === targetAbs) targetMatches += matches.length;
    }

    assert.equal(
      matchedFiles.length,
      1,
      `Ownership de ${pattern.id} mudou: esperado owner unico em ${FEEDBACK_ROUTE_FILE}; encontrados: ${matchedFiles.map((f) => path.relative(process.cwd(), f)).join(', ')}`,
    );

    assert.equal(
      matchedFiles[0],
      targetAbs,
      `Ownership de ${pattern.id} mudou: arquivo owner esperado ${FEEDBACK_ROUTE_FILE}`,
    );

    assert.ok(
      targetMatches >= pattern.expectedMinMatchesInTarget,
      `Assinatura de rotas ${pattern.id} encolheu abaixo do baseline esperado em ${FEEDBACK_ROUTE_FILE}`,
    );
  }
}

async function withEnvPatch(patch, run) {
  const previous = new Map();
  for (const [key, value] of Object.entries(patch)) {
    if (Object.prototype.hasOwnProperty.call(process.env, key)) {
      previous.set(key, process.env[key]);
    } else {
      previous.set(key, undefined);
    }
    if (value === null || value === undefined) delete process.env[key];
    else process.env[key] = String(value);
  }

  try {
    return await run();
  } finally {
    for (const [key, oldValue] of previous.entries()) {
      if (oldValue === undefined) delete process.env[key];
      else process.env[key] = oldValue;
    }
  }
}

function createTinyPngBuffer() {
  return Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000000020001e221bc330000000049454e44ae426082',
    'hex',
  );
}

async function createFeedbackViaApi(agent, payload = {}) {
  const res = await agent
    .post(CANONICAL_CREATE_ENDPOINT)
    .set('Accept', 'application/json')
    .set('Connection', 'close')
    .send({
      mensagem: payload.mensagem || `feedback-${Date.now()}`,
      tipo: payload.tipo || 'sugestao',
      ...(payload.extraBody || {}),
    });

  expectApiSuccessEnvelope(res, 200);
  return String(res.body?.id || res.body?.data?._id || '');
}

test('feedbackApi contrato efetivo + ownership (sem alterar produção)', async (t) => {
  const prevMongoMemory = process.env.MONGO_MEMORY;
  process.env.MONGO_MEMORY = '1';

  const teardownGuard = installTeardownSuppression();
  const { app, close, registerErrorHandlers } = await createServer({ skipDb: false, deferErrorHandlers: true });

  installSessionSeedRoute(app);
  registerErrorHandlers();

  const marker = `feedbackapi_contract_${Date.now()}`;
  const createdUserIds = [];

  const adminUser = await createTestUser({ role: 'admin', marker });
  const creatorUser = await createTestUser({ role: 'user', marker });
  const otherUser = await createTestUser({ role: 'user', marker });
  createdUserIds.push(adminUser._id, creatorUser._id, otherUser._id);

  const adminAgent = await seedAuthenticatedAgent(app, adminUser);
  const creatorAgent = await seedAuthenticatedAgent(app, creatorUser);
  const otherAgent = await seedAuthenticatedAgent(app, otherUser);
  const anonymous = request(app);

  const createdFeedbackIds = new Set();

  try {
    await t.test('Ownership guardrail: endpoints /api/feedback* e /api/gestor/feedback* seguem owner único em feedbackApi.js', async () => {
      installOwnershipGuardrail();
    });

    await t.test('Path efetivo canônico: /gestor/api/gestor/feedback sem sessão retorna 401 JSON', async () => {
      const res = await anonymous
        .get(CANONICAL_ADMIN_LIST_ENDPOINT)
        .set('Accept', 'application/json')
        .set('Connection', 'close');

      expectUnauthorizedJson(res);
    });

    await t.test('Compat root no harness de teste: /api/gestor/feedback fica 404 (redirect /api -> /gestor/api não é aplicado sob node --test)', async () => {
      const res = await anonymous
        .get(ROOT_COMPAT_ADMIN_LIST_ENDPOINT)
        .set('Accept', 'application/json')
        .set('Connection', 'close');

      assert.equal(
        res.status,
        404,
        'No runtime de testes atual, /api/gestor/feedback deve permanecer sem roteamento (compat root não exercida).',
      );
    });

    await t.test('POST /gestor/api/feedback: sucesso + 401 + 400 + 500(legacy validação)', async () => {
      const okRes = await creatorAgent
        .post(CANONICAL_CREATE_ENDPOINT)
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send({ mensagem: 'Mensagem de criação contrato', tipo: 'elogio' });

      expectApiSuccessEnvelope(okRes, 200);
      assert.equal(okRes.body?.created, true);
      assert.equal(typeof okRes.body?.id, 'string');
      assert.ok(okRes.body?.id, 'id criado deve existir');
      createdFeedbackIds.add(String(okRes.body.id));

      const unauthorized = await anonymous
        .post(CANONICAL_CREATE_ENDPOINT)
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send({ mensagem: 'Sem sessão' });
      expectUnauthorizedJson(unauthorized);

      const badRequest = await creatorAgent
        .post(CANONICAL_CREATE_ENDPOINT)
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send({ mensagem: '   ' });
      expectApiFailEnvelope(badRequest, 400);
      assert.equal(badRequest.body?.error, 'Mensagem é obrigatória.');

      // Comportamento atual: validação de schema (maxlength) cai no catch geral e retorna 500.
      const hugeMessage = 'x'.repeat(5001);
      const serverError = await creatorAgent
        .post(CANONICAL_CREATE_ENDPOINT)
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send({ mensagem: hugeMessage, tipo: 'erro' });
      expectApiFailEnvelope(serverError, 500);
      assert.equal(serverError.body?.error, 'Erro ao criar feedback.');
    });

    await t.test('POST /gestor/api/feedback: normaliza tipo e infere modulo por precedencia (module > contexto.url > referer)', async () => {
      const withModule = await creatorAgent
        .post(CANONICAL_CREATE_ENDPOINT)
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .set('Referer', 'https://app.local/referer/ignorado')
        .send({
          mensagem: 'create com module explicito',
          tipo: ' ELOGIO ',
          module: 'modulo_explicito',
          contexto: {
            url: 'https://app.local/contexto/ignorado',
            timezone: 'America/Sao_Paulo',
            user_agent: 'ctx-agent',
          },
        });

      expectApiSuccessEnvelope(withModule, 200);
      const withModuleId = String(withModule.body?.id || withModule.body?.data?._id || '');
      assert.ok(withModuleId, 'id criado deve existir no cenario com module explicito');
      createdFeedbackIds.add(withModuleId);
      assert.equal(withModule.body?.data?.tipo, 'elogio');
      assert.equal(withModule.body?.data?.origem?.modulo, 'modulo_explicito');

      const withContextUrl = await creatorAgent
        .post(CANONICAL_CREATE_ENDPOINT)
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send({
          mensagem: 'create com contexto para inferencia',
          contexto: {
            url: '/ouvidoria/painel',
            timezone: 'America/Sao_Paulo',
          },
        });

      expectApiSuccessEnvelope(withContextUrl, 200);
      const withContextUrlId = String(withContextUrl.body?.id || withContextUrl.body?.data?._id || '');
      assert.ok(withContextUrlId, 'id criado deve existir no cenario com contexto.url');
      createdFeedbackIds.add(withContextUrlId);
      assert.equal(withContextUrl.body?.data?.tipo, 'outro');
      assert.equal(withContextUrl.body?.data?.origem?.modulo, 'ouvidoria');
      assert.equal(withContextUrl.body?.data?.origem?.path, '/ouvidoria/painel');

      const withReferer = await creatorAgent
        .post(CANONICAL_CREATE_ENDPOINT)
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .set('Referer', 'https://app.local/atendimento/tela')
        .send({
          mensagem: 'create com inferencia por referer',
          tipo: 'erro',
        });

      expectApiSuccessEnvelope(withReferer, 200);
      const withRefererId = String(withReferer.body?.id || withReferer.body?.data?._id || '');
      assert.ok(withRefererId, 'id criado deve existir no cenario com referer');
      createdFeedbackIds.add(withRefererId);
      assert.equal(withReferer.body?.data?.origem?.modulo, 'atendimento');
      assert.equal(withReferer.body?.data?.origem?.path, '');
    });

    let creatorFeedbackId = '';
    let otherFeedbackId = '';

    await t.test('GET /gestor/api/feedback/meus e /meus/:id: sucesso + 401 + 403 + 404 + 500(id malformado)', async () => {
      creatorFeedbackId = await createFeedbackViaApi(creatorAgent, {
        mensagem: 'feedback do criador para contrato meus',
      });
      otherFeedbackId = await createFeedbackViaApi(otherAgent, {
        mensagem: 'feedback de outro usuário para contrato meus',
      });

      createdFeedbackIds.add(creatorFeedbackId);
      createdFeedbackIds.add(otherFeedbackId);

      const listUnauthorized = await anonymous
        .get(CANONICAL_MY_LIST_ENDPOINT)
        .set('Accept', 'application/json')
        .set('Connection', 'close');
      expectUnauthorizedJson(listUnauthorized);

      const myList = await creatorAgent
        .get(CANONICAL_MY_LIST_ENDPOINT)
        .set('Accept', 'application/json')
        .set('Connection', 'close');

      expectApiSuccessEnvelope(myList, 200);
      assert.ok(Array.isArray(myList.body?.data), 'GET meus deve retornar array em data');

      const returnedIds = new Set((myList.body?.data || []).map((item) => String(item?._id || item?.id || '')));
      assert.equal(returnedIds.has(creatorFeedbackId), true, 'GET meus deve conter feedback do criador');
      assert.equal(returnedIds.has(otherFeedbackId), false, 'GET meus não deve conter feedback de outro usuário');

      const myDetailOk = await creatorAgent
        .get(withRouteParam(CANONICAL_MY_DETAIL_ENDPOINT, creatorFeedbackId))
        .set('Accept', 'application/json')
        .set('Connection', 'close');

      expectApiSuccessEnvelope(myDetailOk, 200);
      assert.equal(String(myDetailOk.body?.data?._id || ''), creatorFeedbackId);

      const myDetailForbidden = await creatorAgent
        .get(withRouteParam(CANONICAL_MY_DETAIL_ENDPOINT, otherFeedbackId))
        .set('Accept', 'application/json')
        .set('Connection', 'close');

      expectApiFailEnvelope(myDetailForbidden, 403);
      assert.equal(myDetailForbidden.body?.error, 'Acesso negado.');

      const myDetailNotFound = await creatorAgent
        .get(withRouteParam(CANONICAL_MY_DETAIL_ENDPOINT, 'ffffffffffffffffffffffff'))
        .set('Accept', 'application/json')
        .set('Connection', 'close');

      expectApiFailEnvelope(myDetailNotFound, 404);
      assert.equal(myDetailNotFound.body?.error, 'Feedback não encontrado.');

      const myDetailBadRequest = await creatorAgent
        .get(withRouteParam(CANONICAL_MY_DETAIL_ENDPOINT, 'id-malformado'))
        .set('Accept', 'application/json')
        .set('Connection', 'close');

      expectApiFailEnvelope(myDetailBadRequest, 400);
      assert.equal(myDetailBadRequest.body?.error, 'ID inválido.');
    });

    let legacySanitizedFeedbackId = '';

    await t.test('GET admin list/detail: sucesso + 401 + 403 + 404 + 500(id malformado) + sanitização legado', async () => {
      const adminListUnauthorized = await anonymous
        .get(CANONICAL_ADMIN_LIST_ENDPOINT)
        .set('Accept', 'application/json')
        .set('Connection', 'close');
      expectUnauthorizedJson(adminListUnauthorized);

      const adminListForbidden = await creatorAgent
        .get(CANONICAL_ADMIN_LIST_ENDPOINT)
        .set('Accept', 'application/json')
        .set('Connection', 'close');
      expectApiFailEnvelope(adminListForbidden, 403);
      assert.equal(adminListForbidden.body?.error, 'Acesso negado.');

      const inserted = await Feedback.collection.insertOne({
        tipo: 'outro',
        status: 'novo',
        mensagem: 'legacy doc com resposta objeto',
        resposta: { texto: 'resposta legado objeto' },
        criadoPor: {
          userId: creatorUser._id,
          email: creatorUser.email,
          nome: creatorUser.nome,
          role: creatorUser.role,
        },
        origem: {
          modulo: 'gestor',
          path: '/gestor/feedback',
          userAgent: 'feedback-contract-test',
          timezone: 'America/Sao_Paulo',
        },
        anexos: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      legacySanitizedFeedbackId = String(inserted.insertedId);
      createdFeedbackIds.add(legacySanitizedFeedbackId);

      const adminListOk = await adminAgent
        .get(CANONICAL_ADMIN_LIST_ENDPOINT)
        .set('Accept', 'application/json')
        .set('Connection', 'close');

      expectApiSuccessEnvelope(adminListOk, 200);
      assert.ok(Array.isArray(adminListOk.body?.data), 'GET admin list deve retornar array em data');

      const legacyItem = (adminListOk.body?.data || []).find((item) => String(item?._id || item?.id || '') === legacySanitizedFeedbackId);
      assert.ok(legacyItem, 'Feedback legado inserido deve aparecer na listagem admin');
      assert.equal(typeof legacyItem.resposta, 'string', 'resposta deve ser normalizada para string na listagem admin');
      assert.equal(legacyItem.resposta, 'resposta legado objeto');

      const detailOk = await adminAgent
        .get(withRouteParam(CANONICAL_ADMIN_DETAIL_ENDPOINT, legacySanitizedFeedbackId))
        .set('Accept', 'application/json')
        .set('Connection', 'close');

      expectApiSuccessEnvelope(detailOk, 200);
      assert.equal(typeof detailOk.body?.data?.resposta, 'string', 'resposta deve ser normalizada para string no detalhe admin');
      assert.equal(detailOk.body?.data?.resposta, 'resposta legado objeto');

      const detailNotFound = await adminAgent
        .get(withRouteParam(CANONICAL_ADMIN_DETAIL_ENDPOINT, 'ffffffffffffffffffffffff'))
        .set('Accept', 'application/json')
        .set('Connection', 'close');

      expectApiFailEnvelope(detailNotFound, 404);
      assert.equal(detailNotFound.body?.error, 'Feedback não encontrado.');

      const detailBadRequest = await adminAgent
        .get(withRouteParam(CANONICAL_ADMIN_DETAIL_ENDPOINT, 'id-malformado'))
        .set('Accept', 'application/json')
        .set('Connection', 'close');

      expectApiFailEnvelope(detailBadRequest, 400);
      assert.equal(detailBadRequest.body?.error, 'ID inválido.');
    });

    await t.test('GET admin list: filtro por tipo normaliza entrada e restringe resultado', async () => {
      const elogioId = await createFeedbackViaApi(creatorAgent, {
        mensagem: 'feedback para filtro tipo elogio',
        tipo: 'ELOGIO',
      });
      const erroId = await createFeedbackViaApi(creatorAgent, {
        mensagem: 'feedback para filtro tipo erro',
        tipo: 'erro',
      });
      createdFeedbackIds.add(elogioId);
      createdFeedbackIds.add(erroId);

      const filteredByTipo = await adminAgent
        .get(CANONICAL_ADMIN_LIST_ENDPOINT)
        .query({ tipo: ' ELOGIO ' })
        .set('Accept', 'application/json')
        .set('Connection', 'close');

      expectApiSuccessEnvelope(filteredByTipo, 200);
      const filteredItems = filteredByTipo.body?.data || [];
      const returnedIds = new Set(filteredItems.map((item) => String(item?._id || item?.id || '')));
      assert.equal(returnedIds.has(elogioId), true, 'filtro tipo normalizado deve incluir feedback elogio');
      assert.equal(returnedIds.has(erroId), false, 'filtro tipo normalizado nao deve incluir feedback de outro tipo');
      for (const item of filteredItems) {
        assert.equal(item?.tipo, 'elogio', 'filtro tipo deve retornar apenas tipo normalizado esperado');
      }
    });

    await t.test('PATCH/POST status admin: sucesso + 401 + 403 + 404 + 500(id malformado)', async () => {
      const forStatus = await createFeedbackViaApi(creatorAgent, {
        mensagem: 'feedback para status patch/post',
      });
      createdFeedbackIds.add(forStatus);

      const patchOk = await adminAgent
        .patch(withRouteParam(CANONICAL_ADMIN_STATUS_ENDPOINT, forStatus))
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send({ status: 'resolvido' });

      expectApiSuccessEnvelope(patchOk, 200);
      assert.equal(patchOk.body?.data?.status, 'resolvido');

      const postOk = await adminAgent
        .post(withRouteParam(CANONICAL_ADMIN_STATUS_ENDPOINT, forStatus))
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send({ status: 'cancelado' });

      expectApiSuccessEnvelope(postOk, 200);
      assert.equal(postOk.body?.data?.status, 'cancelado');

      const unauthorized = await anonymous
        .patch(withRouteParam(CANONICAL_ADMIN_STATUS_ENDPOINT, forStatus))
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send({ status: 'novo' });
      expectUnauthorizedJson(unauthorized);

      const forbidden = await creatorAgent
        .patch(withRouteParam(CANONICAL_ADMIN_STATUS_ENDPOINT, forStatus))
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send({ status: 'novo' });
      expectApiFailEnvelope(forbidden, 403);
      assert.equal(forbidden.body?.error, 'Acesso negado.');

      const notFound = await adminAgent
        .patch(withRouteParam(CANONICAL_ADMIN_STATUS_ENDPOINT, 'ffffffffffffffffffffffff'))
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send({ status: 'novo' });

      expectApiFailEnvelope(notFound, 404);
      assert.equal(notFound.body?.error, 'Feedback não encontrado.');

      const badRequest = await adminAgent
        .patch(withRouteParam(CANONICAL_ADMIN_STATUS_ENDPOINT, 'id-malformado'))
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send({ status: 'novo' });

      expectApiFailEnvelope(badRequest, 400);
      assert.equal(badRequest.body?.error, 'ID inválido.');
    });

    await t.test('PATCH status admin + GET admin list: normalizacao de status observavel no filtro', async () => {
      const emAndamentoId = await createFeedbackViaApi(creatorAgent, {
        mensagem: 'feedback para status em andamento normalizado',
      });
      const resolvidoId = await createFeedbackViaApi(creatorAgent, {
        mensagem: 'feedback para status resolvido no contraste',
      });
      createdFeedbackIds.add(emAndamentoId);
      createdFeedbackIds.add(resolvidoId);

      const patchEmAndamento = await adminAgent
        .patch(withRouteParam(CANONICAL_ADMIN_STATUS_ENDPOINT, emAndamentoId))
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send({ status: ' Em Andamento ' });

      expectApiSuccessEnvelope(patchEmAndamento, 200);
      assert.equal(patchEmAndamento.body?.data?.status, 'em_andamento');

      const patchResolvido = await adminAgent
        .patch(withRouteParam(CANONICAL_ADMIN_STATUS_ENDPOINT, resolvidoId))
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send({ status: 'resolvido' });

      expectApiSuccessEnvelope(patchResolvido, 200);
      assert.equal(patchResolvido.body?.data?.status, 'resolvido');

      const filteredByStatus = await adminAgent
        .get(CANONICAL_ADMIN_LIST_ENDPOINT)
        .query({ status: ' Em Andamento ' })
        .set('Accept', 'application/json')
        .set('Connection', 'close');

      expectApiSuccessEnvelope(filteredByStatus, 200);
      const filteredItems = filteredByStatus.body?.data || [];
      const returnedIds = new Set(filteredItems.map((item) => String(item?._id || item?.id || '')));
      assert.equal(returnedIds.has(emAndamentoId), true, 'filtro status normalizado deve incluir feedback em_andamento');
      assert.equal(returnedIds.has(resolvidoId), false, 'filtro status normalizado nao deve incluir feedback com outro status');
      for (const item of filteredItems) {
        assert.equal(item?.status, 'em_andamento', 'filtro status deve retornar apenas status normalizado esperado');
      }
    });

    await t.test('PATCH/POST resposta admin: sucesso + 401 + 403 + 404 + 500(id malformado)', async () => {
      const forReply = await createFeedbackViaApi(creatorAgent, {
        mensagem: 'feedback para resposta patch/post',
      });
      createdFeedbackIds.add(forReply);

      const patchOk = await adminAgent
        .patch(withRouteParam(CANONICAL_ADMIN_REPLY_ENDPOINT, forReply))
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send({ resposta: 'Resposta via PATCH' });

      expectApiSuccessEnvelope(patchOk, 200);
      assert.equal(patchOk.body?.data?.resposta, 'Resposta via PATCH');
      assert.equal(patchOk.body?.data?.status, 'respondido');

      const postOk = await adminAgent
        .post(withRouteParam(CANONICAL_ADMIN_REPLY_ENDPOINT, forReply))
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send({ resposta: 'Resposta via POST' });

      expectApiSuccessEnvelope(postOk, 200);
      assert.equal(postOk.body?.data?.resposta, 'Resposta via POST');
      assert.equal(postOk.body?.data?.status, 'respondido');

      const unauthorized = await anonymous
        .patch(withRouteParam(CANONICAL_ADMIN_REPLY_ENDPOINT, forReply))
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send({ resposta: 'x' });
      expectUnauthorizedJson(unauthorized);

      const forbidden = await creatorAgent
        .patch(withRouteParam(CANONICAL_ADMIN_REPLY_ENDPOINT, forReply))
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send({ resposta: 'x' });
      expectApiFailEnvelope(forbidden, 403);
      assert.equal(forbidden.body?.error, 'Acesso negado.');

      const notFound = await adminAgent
        .patch(withRouteParam(CANONICAL_ADMIN_REPLY_ENDPOINT, 'ffffffffffffffffffffffff'))
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send({ resposta: 'x' });

      expectApiFailEnvelope(notFound, 404);
      assert.equal(notFound.body?.error, 'Feedback não encontrado.');

      const badRequest = await adminAgent
        .patch(withRouteParam(CANONICAL_ADMIN_REPLY_ENDPOINT, 'id-malformado'))
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send({ resposta: 'x' });

      expectApiFailEnvelope(badRequest, 400);
      assert.equal(badRequest.body?.error, 'ID inválido.');
    });

    await t.test('DELETE/POST delete admin: sucesso + 401 + 403 + 400 + 404 + 500(id malformado)', async () => {
      const forDeleteByDelete = await createFeedbackViaApi(creatorAgent, {
        mensagem: 'feedback para DELETE',
      });
      createdFeedbackIds.add(forDeleteByDelete);

      const byDelete = await adminAgent
        .delete(withRouteParam(CANONICAL_ADMIN_DELETE_ENDPOINT, forDeleteByDelete))
        .set('Accept', 'application/json')
        .set('Connection', 'close');

      expectApiSuccessEnvelope(byDelete, 200);
      assert.equal(byDelete.body?.data?.deleted, true);
      assert.equal(String(byDelete.body?.data?.id || ''), forDeleteByDelete);
      createdFeedbackIds.delete(forDeleteByDelete);

      const forDeleteByPost = await createFeedbackViaApi(creatorAgent, {
        mensagem: 'feedback para POST delete compat',
      });
      createdFeedbackIds.add(forDeleteByPost);

      const byPost = await adminAgent
        .post(withRouteParam(CANONICAL_ADMIN_DELETE_ENDPOINT, forDeleteByPost))
        .set('Accept', 'application/json')
        .set('Connection', 'close');

      expectApiSuccessEnvelope(byPost, 200);
      assert.equal(byPost.body?.data?.deleted, true);
      assert.equal(String(byPost.body?.data?.id || ''), forDeleteByPost);
      createdFeedbackIds.delete(forDeleteByPost);

      const unauthorized = await anonymous
        .delete(withRouteParam(CANONICAL_ADMIN_DELETE_ENDPOINT, creatorFeedbackId))
        .set('Accept', 'application/json')
        .set('Connection', 'close');
      expectUnauthorizedJson(unauthorized);

      const forbidden = await creatorAgent
        .delete(withRouteParam(CANONICAL_ADMIN_DELETE_ENDPOINT, creatorFeedbackId))
        .set('Accept', 'application/json')
        .set('Connection', 'close');
      expectApiFailEnvelope(forbidden, 403);
      assert.equal(forbidden.body?.error, 'Acesso negado.');

      const invalidSpaceId = await adminAgent
        .delete(withRouteParam(CANONICAL_ADMIN_DELETE_ENDPOINT, '   '))
        .set('Accept', 'application/json')
        .set('Connection', 'close');
      expectApiFailEnvelope(invalidSpaceId, 400);
      assert.equal(invalidSpaceId.body?.error, 'ID inválido.');

      const notFound = await adminAgent
        .delete(withRouteParam(CANONICAL_ADMIN_DELETE_ENDPOINT, 'ffffffffffffffffffffffff'))
        .set('Accept', 'application/json')
        .set('Connection', 'close');
      expectApiFailEnvelope(notFound, 404);
      assert.equal(notFound.body?.error, 'Feedback não encontrado.');

      const badRequest = await adminAgent
        .delete(withRouteParam(CANONICAL_ADMIN_DELETE_ENDPOINT, 'id-malformado'))
        .set('Accept', 'application/json')
        .set('Connection', 'close');
      expectApiFailEnvelope(badRequest, 400);
      assert.equal(badRequest.body?.error, 'ID inválido.');
    });

    await t.test('POST /gestor/api/feedback/:id/anexo: sucesso + acesso URL + 401 + 403 + 400 + 404 + 503(blob) + 500(fs)', async () => {
      const forUpload = await createFeedbackViaApi(creatorAgent, {
        mensagem: 'feedback para upload de anexo',
      });
      createdFeedbackIds.add(forUpload);

      const tinyPng = createTinyPngBuffer();

      const unauthorized = await anonymous
        .post(withRouteParam(CANONICAL_UPLOAD_ENDPOINT, forUpload))
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .attach('anexo', tinyPng, 'anon.png');
      expectUnauthorizedJson(unauthorized);

      const invalidId = await creatorAgent
        .post(withRouteParam(CANONICAL_UPLOAD_ENDPOINT, '   '))
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .attach('anexo', tinyPng, 'invalid-id.png');
      expectApiFailEnvelope(invalidId, 400);
      assert.equal(invalidId.body?.error, 'ID inválido.');

      const notFound = await creatorAgent
        .post(withRouteParam(CANONICAL_UPLOAD_ENDPOINT, 'ffffffffffffffffffffffff'))
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .attach('anexo', tinyPng, 'not-found.png');
      expectApiFailEnvelope(notFound, 404);
      assert.equal(notFound.body?.error, 'Feedback não encontrado.');

      const missingFile = await creatorAgent
        .post(withRouteParam(CANONICAL_UPLOAD_ENDPOINT, forUpload))
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send({});
      expectApiFailEnvelope(missingFile, 400);
      assert.equal(missingFile.body?.error, 'Arquivo ausente.');

      const forbidden = await otherAgent
        .post(withRouteParam(CANONICAL_UPLOAD_ENDPOINT, forUpload))
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .attach('anexo', tinyPng, 'forbidden.png');
      expectApiFailEnvelope(forbidden, 403);
      assert.equal(forbidden.body?.error, 'Acesso negado.');

      const success = await withEnvPatch(
        {
          VERCEL: '',
          BLOB_READ_WRITE_TOKEN: '',
          WDGESTOR_DB_DADOS_READ_WRITE_TOKEN: '',
          VERCEL_BLOB_RW_TOKEN: '',
        },
        async () => creatorAgent
          .post(withRouteParam(CANONICAL_UPLOAD_ENDPOINT, forUpload))
          .set('Accept', 'application/json')
          .set('Connection', 'close')
          .attach('anexo', tinyPng, 'ok-local.png'),
      );

      expectApiSuccessEnvelope(success, 200);
      const anexos = success.body?.data?.anexos || [];
      assert.ok(Array.isArray(anexos), 'anexos deve ser array');
      assert.ok(anexos.length >= 1, 'upload deve acrescentar ao menos um anexo');
      const lastAnexo = anexos[anexos.length - 1] || {};
      assert.equal(typeof lastAnexo.url, 'string');
      assert.match(lastAnexo.url, /^\/gestor\/uploads\/feedback\//, 'url de anexo deve usar caminho público /gestor/uploads/feedback/*');

      const staticAccess = await request(app)
        .get(lastAnexo.url)
        .set('Connection', 'close');
      assert.equal(staticAccess.status, 200, `Acesso ao anexo via URL pública deve funcionar (${lastAnexo.url})`);

      const blobUnavailable = await withEnvPatch(
        {
          VERCEL: '1',
          BLOB_READ_WRITE_TOKEN: '',
          WDGESTOR_DB_DADOS_READ_WRITE_TOKEN: '',
          VERCEL_BLOB_RW_TOKEN: '',
        },
        async () => creatorAgent
          .post(withRouteParam(CANONICAL_UPLOAD_ENDPOINT, forUpload))
          .set('Accept', 'application/json')
          .set('Connection', 'close')
          .attach('anexo', tinyPng, 'blob-unavailable.png'),
      );

      expectApiFailEnvelope(blobUnavailable, 503);
      assert.equal(blobUnavailable.body?.code, 'BLOB_NOT_CONFIGURED');

      const originalWriteFileSync = fs.writeFileSync;
      let forcedFsError;
      try {
        fs.writeFileSync = () => {
          throw new Error('FORCED_FS_WRITE_FAILURE');
        };

        forcedFsError = await withEnvPatch(
          {
            VERCEL: '',
            BLOB_READ_WRITE_TOKEN: '',
            WDGESTOR_DB_DADOS_READ_WRITE_TOKEN: '',
            VERCEL_BLOB_RW_TOKEN: '',
          },
          async () => creatorAgent
            .post(withRouteParam(CANONICAL_UPLOAD_ENDPOINT, forUpload))
            .set('Accept', 'application/json')
            .set('Connection', 'close')
            .attach('anexo', tinyPng, 'forced-fs-error.png'),
        );
      } finally {
        fs.writeFileSync = originalWriteFileSync;
      }

      expectApiFailEnvelope(forcedFsError, 500);
      assert.equal(forcedFsError.body?.error, 'Erro ao anexar arquivo.');
    });

    await t.test('POST /gestor/api/feedback/:id/anexo: aceita campo alternativo "file" (pickFile)', async () => {
      const forUploadWithAltField = await createFeedbackViaApi(creatorAgent, {
        mensagem: 'feedback para upload com campo file',
      });
      createdFeedbackIds.add(forUploadWithAltField);

      const tinyPng = createTinyPngBuffer();

      const uploadWithFileField = await withEnvPatch(
        {
          VERCEL: '',
          BLOB_READ_WRITE_TOKEN: '',
          WDGESTOR_DB_DADOS_READ_WRITE_TOKEN: '',
          VERCEL_BLOB_RW_TOKEN: '',
        },
        async () => creatorAgent
          .post(withRouteParam(CANONICAL_UPLOAD_ENDPOINT, forUploadWithAltField))
          .set('Accept', 'application/json')
          .set('Connection', 'close')
          .attach('file', tinyPng, 'campo-file.png'),
      );

      expectApiSuccessEnvelope(uploadWithFileField, 200);
      const anexos = uploadWithFileField.body?.data?.anexos || [];
      assert.ok(Array.isArray(anexos), 'anexos deve ser array no upload com campo alternativo');
      assert.ok(anexos.length >= 1, 'upload com campo alternativo deve adicionar anexo');

      const lastAnexo = anexos[anexos.length - 1] || {};
      assert.equal(typeof lastAnexo.url, 'string');
      assert.match(lastAnexo.url, /^\/gestor\/uploads\/feedback\//, 'upload com campo alternativo deve manter URL publica padrao');
    });
  } finally {
    try {
      try {
        await Feedback.deleteMany({ _id: { $in: [...createdFeedbackIds] } });
      } catch {
        // noop
      }

      try {
        await User.deleteMany({ _id: { $in: createdUserIds } });
      } catch {
        // noop
      }

      try {
        const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'feedback');
        if (fs.existsSync(uploadsDir)) {
          fs.rmSync(uploadsDir, { recursive: true, force: true });
        }
      } catch {
        // noop
      }

      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
      if (prevMongoMemory === undefined) delete process.env.MONGO_MEMORY;
      else process.env.MONGO_MEMORY = prevMongoMemory;
    }
  }
});
