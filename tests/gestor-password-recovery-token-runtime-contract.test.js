import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';

import { createPasswordRecoveryTokenData } from '../src/modules/gestor/app/data/auth/passwordRecoveryRequestDataFacade.js';
import { hashPasswordRecoveryToken } from '../src/modules/gestor/app/data-access/auth/passwordRecoveryTokenHash.js';
import { createServer } from '../src/server/createServer.js';
import User from '../src/core/models/user.js';
import PasswordReset from '../src/core/models/passwordReset.js';

process.env.NODE_ENV = 'test';
process.env.MONGO_MEMORY = '1';

const ORIGINAL_PASSWORD = 'Senha@123456';

let app;
let closeServer;
let passwordHash = '';
let sequence = 0;

function nextSequence() {
  sequence += 1;
  return sequence;
}

function buildUniqueEmail(prefix = 'gestor-recovery-runtime') {
  const id = nextSequence();
  return `${prefix}.${Date.now()}.${id}@example.com`;
}

function buildUniqueCpf() {
  const id = nextSequence();
  return String(10000000000 + id).slice(-11);
}

async function createUser({
  email = buildUniqueEmail('gestor-recovery-user'),
  nome = 'Recovery Runtime User',
  role = 'admin',
  globalRole = 'admin',
} = {}) {
  const payload = {
    email,
    senha: passwordHash,
    nome,
    cpf: buildUniqueCpf(),
    role,
    ativo: true,
    primeiro_acesso: false,
    senha_provisoria: false,
  };

  if (globalRole) payload.global_role = globalRole;

  return User.create(payload);
}

before(async () => {
  passwordHash = await bcrypt.hash(ORIGINAL_PASSWORD, Number(process.env.BCRYPT_MIN_ROUNDS || 12));

  const built = await createServer({ skipDb: false, deferErrorHandlers: true });
  app = built.app;
  closeServer = built.close;
  if (typeof built.registerErrorHandlers === 'function') {
    await Promise.resolve(built.registerErrorHandlers());
  }
});

beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
});

after(async () => {
  try {
    if (typeof closeServer === 'function') {
      await closeServer({ stopMemoryServer: true });
    }
  } catch {}
});

test('recovery runtime: GET com token cru recem-gerado encontra o reset e hash na URL nao funciona', async () => {
  const user = await createUser({ nome: 'Ana Runtime' });
  const rawToken = 'raw-token-runtime-1';
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  await createPasswordRecoveryTokenData({ userId: user._id, rawToken, expiresAt });

  const storedReset = await PasswordReset.findOne({ user_id: user._id }).lean();
  assert.ok(storedReset);
  assert.notEqual(storedReset.token, rawToken);
  assert.equal(storedReset.token, hashPasswordRecoveryToken(rawToken));

  const getRawRes = await request(app).get(`/gestor/reset-password/${rawToken}`);

  assert.equal(getRawRes.status, 200);
  assert.match(getRawRes.text, /Redefinição de Senha/);
  assert.match(getRawRes.text, /Ana/);
  assert.match(getRawRes.text, /name="token" value="raw-token-runtime-1"/);
  assert.doesNotMatch(getRawRes.text, /Erro ao validar token/);

  const tokenHash = hashPasswordRecoveryToken(rawToken);
  const getHashRes = await request(app).get(`/gestor/reset-password/${tokenHash}`);

  assert.equal(getHashRes.status, 200);
  assert.match(getHashRes.text, /Token inválido ou expirado/);
  assert.doesNotMatch(getHashRes.text, /name="token" value=/);
});

test('recovery runtime: POST com token cru altera senha, remove token usado e impede reutilizacao', async () => {
  const user = await createUser({ nome: 'Bruno Runtime' });
  const rawToken = 'raw-token-runtime-2';
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const novaSenha = 'NovaSenha@123';

  await createPasswordRecoveryTokenData({ userId: user._id, rawToken, expiresAt });

  const resetRes = await request(app)
    .post('/gestor/reset-password')
    .type('form')
    .send({ token: rawToken, senha: novaSenha, confirmarSenha: novaSenha });

  assert.equal(resetRes.status, 200);
  assert.match(resetRes.text, /Sua senha foi redefinida com sucesso/);

  const persistedUser = await User.findById(user._id).lean();
  assert.ok(persistedUser);
  assert.equal(await bcrypt.compare(novaSenha, persistedUser.senha), true);

  const deletedReset = await PasswordReset.findOne({ user_id: user._id }).lean();
  assert.equal(deletedReset, null);

  const reuseRes = await request(app)
    .post('/gestor/reset-password')
    .type('form')
    .send({ token: rawToken, senha: 'OutraSenha@123', confirmarSenha: 'OutraSenha@123' });

  assert.equal(reuseRes.status, 200);
  assert.match(reuseRes.text, /Token inválido ou expirado/);
});

test('recovery runtime: token de um usuario nao altera a senha de outro usuario', async () => {
  const alvo = await createUser({ nome: 'Carla Runtime' });
  const outro = await createUser({ nome: 'Diego Runtime' });
  const rawToken = 'raw-token-runtime-3';
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  await createPasswordRecoveryTokenData({ userId: alvo._id, rawToken, expiresAt });

  await request(app)
    .post('/gestor/reset-password')
    .type('form')
    .send({ token: rawToken, senha: 'SenhaDaCarla@123', confirmarSenha: 'SenhaDaCarla@123' });

  const persistedAlvo = await User.findById(alvo._id).lean();
  const persistedOutro = await User.findById(outro._id).lean();

  assert.ok(persistedAlvo);
  assert.ok(persistedOutro);
  assert.equal(await bcrypt.compare('SenhaDaCarla@123', persistedAlvo.senha), true);
  assert.equal(await bcrypt.compare(ORIGINAL_PASSWORD, persistedOutro.senha), true);
});

test('recovery runtime: token antigo e invalidado quando novo pedido e feito, mas o token novo continua valido', async () => {
  const user = await createUser({ nome: 'Eva Runtime' });
  const oldRawToken = 'raw-token-runtime-old';
  const newRawToken = 'raw-token-runtime-new';
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  await createPasswordRecoveryTokenData({ userId: user._id, rawToken: oldRawToken, expiresAt });
  await createPasswordRecoveryTokenData({ userId: user._id, rawToken: newRawToken, expiresAt });

  const allResets = await PasswordReset.find({ user_id: user._id }).lean();
  assert.equal(allResets.length, 1);
  assert.equal(allResets[0].token, hashPasswordRecoveryToken(newRawToken));

  const oldRes = await request(app).get(`/gestor/reset-password/${oldRawToken}`);
  assert.equal(oldRes.status, 200);
  assert.match(oldRes.text, /Token inválido ou expirado/);

  const newRes = await request(app).get(`/gestor/reset-password/${newRawToken}`);
  assert.equal(newRes.status, 200);
  assert.match(newRes.text, /Redefinição de Senha/);
  assert.doesNotMatch(newRes.text, /Erro ao validar token/);
});