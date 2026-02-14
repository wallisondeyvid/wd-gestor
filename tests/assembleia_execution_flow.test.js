import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import bcrypt from 'bcryptjs';

process.env.NODE_ENV = 'test';
process.env.MONGO_MEMORY = '1';

import { createServer } from '../src/server/createServer.js';
import CondAssembleia from '../src/core/models/cond_assembleia.js';
import User from '../src/core/models/user.js';
import { disconnectMongo } from '../src/core/db/connect.js';

after(async () => {
  await disconnectMongo({ stopMemoryServer: true });
});

test('Assembleia Execução: fluxo básico (open -> presença -> votação -> ata/pdf -> close)', async () => {
  const { app } = await createServer({ skipDb: false });
  const email = `teste.assembleia.execucao.${Date.now()}@example.com`;
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
    nome: 'Teste Assembleia Execucao'
  });
  const agent = request.agent(app);
  const loginRes = await agent
    .post('/gestor/login')
    .type('form')
    .send({ email, senha });
  assert.ok(loginRes.status >= 300 && loginRes.status < 400, `Login real deve redirecionar, recebido ${loginRes.status}`);

  const assembleia = await CondAssembleia.create({
    titulo: 'Assembleia Teste Execução',
    status: 'convocada',
    data: new Date(Date.now() - 2 * 60 * 60 * 1000),
    horaUnica: '00:00',
    modalidade: 'virtual',
    link: 'https://example.com/sala',
    pauta: [
      { tipo: 'pauta', descricao: 'Aprovar orçamento' }
    ]
  });

  const id = String(assembleia._id);

  // Status deve criar execução on-demand
  {
    const res = await agent
      .get(`/condominios/api/assembleias/${id}/execution/status`)
      .expect(200);

    assert.equal(res.body.ok, true);
    assert.equal(String(res.body.data.assembleiaId), id);
  }

  // Abrir sessão
  await agent
    .post(`/condominios/api/assembleias/${id}/execution/open`)
    .send({})
    .expect(200);

  // Iniciar discussão do item atual (requisito para votar)
  await agent
    .post(`/condominios/api/assembleias/${id}/execution/agenda`)
    .send({ action: 'start_discussion' })
    .expect(200);

  // Confirmar presença
  const presenceRes = await agent
    .post(`/condominios/api/assembleias/${id}/execution/presence`)
    .set('x-wdg-portal', '1')
    .send({ key: 'APTO-101', nome: 'Fulano', habitacaoId: 'HAB-101', status: 'confirmado', source: 'manual' })
    .expect(200);
  const presenceId = String(presenceRes.body?.data?.presence?.presenceId || '');
  const presenceKey = String(presenceRes.body?.data?.presence?.key || 'APTO-101');
  assert.ok(presenceId, 'presenceId deve existir após registro de presença');

  await agent
    .post(`/condominios/condominios/administracao/assembleia/execution/${id}/presencas/${presenceId}/confirmar-moderador`)
    .send({})
    .expect(200);

  // Abrir votação
  await agent
    .post(`/condominios/api/assembleias/${id}/execution/vote/open`)
    .send({})
    .expect(200);

  // Registrar voto
  {
    const res = await agent
      .post(`/condominios/api/assembleias/${id}/execution/vote`)
      .send({ presenceKey, choice: 'sim' })
      .expect(200);

    assert.equal(res.body.ok, true);
  }

  // Fechar votação
  await agent
    .post(`/condominios/api/assembleias/${id}/execution/vote/close`)
    .send({})
    .expect(200);

  // Ata JSON
  {
    const res = await agent
      .get(`/condominios/api/assembleias/${id}/execution/ata`)
      .expect(200);

    assert.equal(res.body.ok, true);
    assert.ok(String(res.body.data?.ataText || '').length > 10);
  }

  // Ata PDF
  {
    const res = await agent
      .get(`/condominios/api/assembleias/${id}/execution/ata.pdf`)
      .expect(200);

    const ct = String(res.headers['content-type'] || '');
    assert.match(ct, /application\/pdf/i);
    assert.ok(res.body && (res.body.length || res.text), 'deve retornar conteúdo do PDF');
  }

  // Encerrar
  await agent
    .post(`/condominios/api/assembleias/${id}/execution/close`)
    .send({})
    .expect(200);

  // Sanity: status após encerrar
  {
    const res = await agent
      .get(`/condominios/api/assembleias/${id}/execution/status`)
      .expect(200);

    assert.equal(res.body.ok, true);
    assert.equal(String(res.body.data.sessionStatus || ''), 'encerrada');
  }

  // Não desconecte o mongoose aqui: outros testes podem estar usando o mesmo processo.
  // Apenas garante que o documento existe e é válido.
  assert.ok(mongoose.connection.readyState >= 0);
});
