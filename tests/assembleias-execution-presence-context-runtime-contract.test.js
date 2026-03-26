import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcryptjs';

process.env.NODE_ENV = 'test';
process.env.MONGO_MEMORY = '1';
process.env.WDG_FLAG_ASSEMBLEIAS_V2 = '1';

import { createServer } from '../src/server/createServer.js';
import CondAssembleia from '../src/core/models/cond_assembleia.js';
import User from '../src/core/models/user.js';
import { disconnectMongo } from '../src/core/db/connect.js';

after(async () => {
  await disconnectMongo({ stopMemoryServer: true });
});

async function criarAssembleia() {
  const assembleia = await CondAssembleia.create({
    titulo: 'Assembleia Teste Presence Context',
    status: 'convocada',
    data: new Date(Date.now() - 2 * 60 * 60 * 1000),
    horaUnica: '00:00',
    modalidade: 'virtual',
    link: 'https://example.com/sala',
    pauta: [
      { tipo: 'pauta', descricao: 'Aprovar orçamento' }
    ]
  });
  return String(assembleia._id);
}

async function autenticarGestor(agent) {
  const email = `teste.assembleia.presence.${Date.now()}@example.com`;
  const senha = 'Senha@123456';
  const cpf = String(Date.now()).slice(-11).padStart(11, '0');
  const senhaHash = await bcrypt.hash(senha, 10);

  await User.create({
    email,
    senha: senhaHash,
    cpf,
    role: 'master',
    ativo: true,
    primeiro_acesso: false,
    senha_provisoria: false,
    nome: 'Teste Assembleia Presence Context'
  });

  const loginRes = await agent
    .post('/gestor/login')
    .type('form')
    .send({ email, senha });

  assert.ok(loginRes.status >= 300 && loginRes.status < 400, `Login real deve redirecionar, recebido ${loginRes.status}`);
}

async function abrirSessao(agent, assembleiaId) {
  await agent
    .get(`/condominios/api/assembleias/${assembleiaId}/execution/status`)
    .expect(200);

  await agent
    .post(`/condominios/api/assembleias/${assembleiaId}/execution/open`)
    .send({})
    .expect(200);
}

test('POST /condominios/api/assembleias/:id/execution/presence exige autenticacao minima mesmo com x-wdg-portal', async () => {
  const { app } = await createServer({ skipDb: false });
  const assembleiaId = await criarAssembleia();

  const res = await request(app)
    .post(`/condominios/api/assembleias/${assembleiaId}/execution/presence`)
    .set('x-wdg-portal', '1')
    .send({ key: 'APTO-101', nome: 'Fulano', habitacaoId: 'HAB-101', status: 'confirmado', source: 'manual' })
    .expect(401);

  assert.equal(res.body?.ok, false);
  assert.equal(res.body?.error, 'Não autenticado');
});

test('POST /condominios/api/assembleias/:id/execution/presence aceita sessao de gestor mesmo com x-wdg-portal sem portalUser dedicado', async () => {
  const { app } = await createServer({ skipDb: false });
  const agent = request.agent(app);
  const assembleiaId = await criarAssembleia();

  await autenticarGestor(agent);
  await abrirSessao(agent, assembleiaId);

  const res = await agent
    .post(`/condominios/api/assembleias/${assembleiaId}/execution/presence`)
    .set('x-wdg-portal', '1')
    .send({ key: 'APTO-101', nome: 'Fulano', habitacaoId: 'HAB-101', status: 'confirmado', source: 'manual' })
    .expect(200);

  assert.equal(res.body?.ok, true);
  assert.ok(String(res.body?.data?.presence?.presenceId || '').length > 0);
  assert.ok(String(res.body?.data?.presence?.key || '').length > 0);
});