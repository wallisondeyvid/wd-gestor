import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import bcrypt from 'bcryptjs';

// Preparar ambiente de teste
process.env.ENABLE_ESCALAS = '1';
process.env.MONGO_MEMORY = '1';

import { createServer } from '../src/server/createServer.js';
import Escala from '../src/core/models/escala.js';
import User from '../src/core/models/user.js';

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
      return true;
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
    }
  };
}

async function closeWithTeardownGuard(close, teardownGuard) {
  if (typeof close !== 'function') return;

  teardownGuard.startShutdown();
  try {
    await close({ stopMemoryServer: true });
  } catch (err) {
    if (!String(err?.message || err).includes('Connection was force closed')) {
      throw err;
    }
  }
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function oid(v){ return new mongoose.Types.ObjectId(v); }

async function loginReal(app) {
  const email = `teste.extracao.pontual.${Date.now()}@example.com`;
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
    nome: 'Teste Extracao Pontual'
  });

  const agent = request.agent(app);
  const loginRes = await agent
    .post('/gestor/login')
    .type('form')
    .send({ email, senha });

  assert.ok(loginRes.status >= 300 && loginRes.status < 400, `Login real deve redirecionar, recebido ${loginRes.status}`);
  return agent;
}

test('Extração pontual persiste e aparece em "sem recurso" apenas na alocação alvo', async () => {
  const { app, close } = await createServer();
  const teardownGuard = installTeardownSuppression();

  try {
    const agent = await loginReal(app);

    const unidadeId = oid();
    const dia = '2025-10-12';
    const outroDia = '2025-10-13';
    const turno = '08:00-17:00';
    const outroTurno = '20:00-22:00';
    const grupoId = 'G1';
    const equipeId = 'EQ1';
    const recursoId = 'R1';
    const funcId = oid();

    // Seed: escala com 2 turnos (um de teste e outro para verificar isolamento)
    const doc = await Escala.create({
      descricao: 'Escala Extração Pontual',
      classificacao: 'ORDINÁRIA',
      unidade_id: unidadeId,
      data_inicio: new Date('2025-10-01T00:00:00.000Z'),
      data_fim: new Date('2025-10-31T00:00:00.000Z'),
      grupos_turnos: [ { id: grupoId, turnos: [ { ini: '08:00', fim: '17:00' }, { ini: '20:00', fim: '22:00' } ] } ],
      equipes: [
        {
          id: equipeId,
          nome: 'EQ1',
          componentes: [],
          recursos: [
            {
              id: recursoId,
              equipeId,
              nome: 'RECURSO-1',
              // Alocado no dia/turno principal e também no outro turno apenas para checagem de isolamento
              alocacoes: [ { dia, turnoId: turno }, { dia, turnoId: outroTurno } ],
              atribuicoes: [ { membroFuncionarioId: String(funcId), nome: 'Fulano', dia, turnoId: turno } ]
            }
          ]
        }
      ]
    });

    // 1) Extração pontual do funcionario do recurso no dia/turno alvo
    const delRes = await agent
      .post(`/escalas/api/escalas/${String(doc._id)}/equipes/${equipeId}/recursos/${recursoId}/atribuicoes/${String(funcId)}/delete`)
      .send({ dia, turnoId: turno, extrair: true, escopo: 'alocacao' })
      .expect(200);
    assert.equal(delRes.body.ok, true, 'DELETE alias deve retornar ok=true');
    assert.ok(delRes.body.moved, 'Resposta deve informar objeto moved');
    assert.equal(String(delRes.body.moved.id), String(funcId), 'moved.id deve ser o funcionário extraído');

    // 2) GET diária no dia/turno extraído -> deve listar em funcionariosFora
    const res1 = await agent
      .get('/escalas/api/escalas/diaria')
      .query({ unidadeId: String(unidadeId), dia })
      .expect(200);
    assert.equal(res1.body.ok, true);
    const data1 = Array.isArray(res1.body.data) ? res1.body.data : [];
    const esc = data1.find(e => String(e.id) === String(doc._id)) || data1[0];
    assert.ok(esc, 'Escala do dia deve existir');
    const turnoNode = (esc.turnos || []).find(t => t && t.token === turno);
    assert.ok(turnoNode, 'Turno alvo deve existir');
    const equipeNode = (turnoNode.equipes || []).find(e => e && e.id === equipeId);
    assert.ok(equipeNode, 'Equipe deve estar presente');
    // Funcionário não deve mais constar nas atribuições do recurso neste turno
    const recursoNode = (equipeNode.recursos || []).find(r => r && r.id === recursoId);
    assert.ok(recursoNode, 'Recurso deve estar presente');
    const aindaAtrib = (recursoNode.atribuicoes || []).some(a => String(a.membroFuncionarioId) === String(funcId));
    assert.equal(aindaAtrib, false, 'Atribuição deve ter sido removida desta alocação');
    // Deve constar em funcionariosFora desta equipe
    const foraIds = (equipeNode.funcionariosFora || []).map(x => String(x.id));
    assert.ok(foraIds.includes(String(funcId)), 'Funcionário extraído deve aparecer em "sem recurso" na alocação');

    // 3) Outro turno no mesmo dia não deve listar em fora (isolamento por alocação)
    const turnoNode2 = (esc.turnos || []).find(t => t && t.token === outroTurno);
    assert.ok(turnoNode2, 'Outro turno deve existir');
    const equipeNode2 = (turnoNode2.equipes || []).find(e => e && e.id === equipeId);
    if (equipeNode2) {
      const foraIds2 = (equipeNode2.funcionariosFora || []).map(x => String(x.id));
      assert.equal(foraIds2.includes(String(funcId)), false, 'Isolamento: não deve constar em "fora" de outro turno');
    }

    // 4) Remover da lista "fora" usando DELETE componentes com dia/turno -> deve sumir
    const remFora = await agent
      .delete(`/escalas/api/escalas/${String(doc._id)}/equipes/${equipeId}/componentes/${String(funcId)}`)
      .query({ dia, turnoId: turno })
      .expect(200);
    assert.equal(remFora.body.ok, true, 'Remoção do fora deve retornar ok');

    const res2 = await agent
      .get('/escalas/api/escalas/diaria')
      .query({ unidadeId: String(unidadeId), dia })
      .expect(200);
    const data2 = Array.isArray(res2.body.data) ? res2.body.data : [];
    const esc2 = data2.find(e => String(e.id) === String(doc._id)) || data2[0];
    const turnoNodeAfter = (esc2.turnos || []).find(t => t && t.token === turno);
    const equipeAfter = turnoNodeAfter ? (turnoNodeAfter.equipes || []).find(e => e && e.id === equipeId) : null;
    const foraAfter = equipeAfter ? (equipeAfter.funcionariosFora || []) : [];
    assert.equal(foraAfter.some(x => String(x.id) === String(funcId)), false, 'Após remoção, não deve mais constar em "fora"');

    // Cleanup
    await mongoose.connection.dropDatabase();
  } finally {
    try {
      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
    }
  }
});
