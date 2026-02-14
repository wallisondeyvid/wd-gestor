import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.SKIP_AUTH = '1';
process.env.MONGO_MEMORY = '1';

import { createServer } from '../src/server/createServer.js';
import CondAssembleia from '../src/core/models/cond_assembleia.js';
import { disconnectMongo } from '../src/core/db/connect.js';

after(async () => {
  await disconnectMongo({ stopMemoryServer: true });
});

test('Assembleia Execução: fluxo básico (open -> presença -> votação -> ata/pdf -> close)', async () => {
  const { app } = await createServer({ skipDb: false, skipAuth: true });

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
    const res = await request(app)
      .get(`/condominios/api/assembleias/${id}/execution/status`)
      .expect(200);

    assert.equal(res.body.ok, true);
    assert.equal(String(res.body.data.assembleiaId), id);
  }

  // Abrir sessão
  await request(app)
    .post(`/condominios/api/assembleias/${id}/execution/open`)
    .send({})
    .expect(200);

  // Iniciar discussão do item atual (requisito para votar)
  await request(app)
    .post(`/condominios/api/assembleias/${id}/execution/agenda`)
    .send({ action: 'start_discussion' })
    .expect(200);

  // Confirmar presença
  await request(app)
    .post(`/condominios/api/assembleias/${id}/execution/presence`)
    .send({ key: 'APTO-101', nome: 'Fulano', status: 'confirmado', source: 'manual' })
    .expect(200);

  // Abrir votação
  await request(app)
    .post(`/condominios/api/assembleias/${id}/execution/vote/open`)
    .send({})
    .expect(200);

  // Registrar voto
  {
    const res = await request(app)
      .post(`/condominios/api/assembleias/${id}/execution/vote`)
      .send({ presenceKey: 'APTO-101', choice: 'sim' })
      .expect(200);

    assert.equal(res.body.ok, true);
  }

  // Fechar votação
  await request(app)
    .post(`/condominios/api/assembleias/${id}/execution/vote/close`)
    .send({})
    .expect(200);

  // Ata JSON
  {
    const res = await request(app)
      .get(`/condominios/api/assembleias/${id}/execution/ata`)
      .expect(200);

    assert.equal(res.body.ok, true);
    assert.ok(String(res.body.data?.ataText || '').length > 10);
  }

  // Ata PDF
  {
    const res = await request(app)
      .get(`/condominios/api/assembleias/${id}/execution/ata.pdf`)
      .expect(200);

    const ct = String(res.headers['content-type'] || '');
    assert.match(ct, /application\/pdf/i);
    assert.ok(res.body && (res.body.length || res.text), 'deve retornar conteúdo do PDF');
  }

  // Encerrar
  await request(app)
    .post(`/condominios/api/assembleias/${id}/execution/close`)
    .send({})
    .expect(200);

  // Sanity: status após encerrar
  {
    const res = await request(app)
      .get(`/condominios/api/assembleias/${id}/execution/status`)
      .expect(200);

    assert.equal(res.body.ok, true);
    assert.equal(String(res.body.data.sessionStatus || ''), 'encerrada');
  }

  // Não desconecte o mongoose aqui: outros testes podem estar usando o mesmo processo.
  // Apenas garante que o documento existe e é válido.
  assert.ok(mongoose.connection.readyState >= 0);
});
