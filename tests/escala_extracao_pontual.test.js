import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';

// Preparar ambiente de teste
process.env.ENABLE_ESCALAS = '1';
process.env.SKIP_AUTH = '1';
process.env.MONGO_MEMORY = '1';

import { createServer } from '../src/server/createServer.js';
import Escala from '../src/core/models/escala.js';
import { disconnectMongo } from '../src/core/db/connect.js';

after(async () => {
  await disconnectMongo({ stopMemoryServer: true });
});

function oid(v){ return new mongoose.Types.ObjectId(v); }

test('Extração pontual persiste e aparece em "sem recurso" apenas na alocação alvo', async () => {
  const { app } = await createServer();

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
  const delRes = await request(app)
    .post(`/api/escalas/${String(doc._id)}/equipes/${equipeId}/recursos/${recursoId}/atribuicoes/${String(funcId)}/delete`)
    .send({ dia, turnoId: turno, extrair: true, escopo: 'alocacao' })
    .expect(200);
  assert.equal(delRes.body.ok, true, 'DELETE alias deve retornar ok=true');
  assert.ok(delRes.body.moved, 'Resposta deve informar objeto moved');
  assert.equal(String(delRes.body.moved.id), String(funcId), 'moved.id deve ser o funcionário extraído');

  // 2) GET diária no dia/turno extraído -> deve listar em funcionariosFora
  const res1 = await request(app)
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
  const remFora = await request(app)
    .delete(`/api/escalas/${String(doc._id)}/equipes/${equipeId}/componentes/${String(funcId)}`)
    .query({ dia, turnoId: turno })
    .expect(200);
  assert.equal(remFora.body.ok, true, 'Remoção do fora deve retornar ok');

  const res2 = await request(app)
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
});
