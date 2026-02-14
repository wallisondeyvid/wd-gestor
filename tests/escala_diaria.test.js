import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import bcrypt from 'bcryptjs';

// Preparar ambiente para montar módulo Escalas e usar DB em memória
process.env.ENABLE_ESCALAS = '1';
process.env.MONGO_MEMORY = '1';

import { createServer } from '../src/server/createServer.js';
import Escala from '../src/core/models/escala.js';
import User from '../src/core/models/user.js';
import { disconnectMongo } from '../src/core/db/connect.js';

after(async () => {
  await disconnectMongo({ stopMemoryServer: true });
});

// Util helpers
function oid(v){ return new mongoose.Types.ObjectId(v); }

async function loginReal(app) {
  const email = `teste.escala.diaria.${Date.now()}@example.com`;
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
    nome: 'Teste Escala Diaria'
  });

  const agent = request.agent(app);
  const loginRes = await agent
    .post('/gestor/login')
    .type('form')
    .send({ email, senha });

  assert.ok(loginRes.status >= 300 && loginRes.status < 400, `Login real deve redirecionar, recebido ${loginRes.status}`);
  return agent;
}

test('GET /escalas/api/escalas/diaria retorna atribuicoes/refeicoes do mapa legado para o dia/turno', async (t) => {
  const { app } = await createServer();
  const agent = await loginReal(app);

  const unidadeId = oid();
  const dia = '2025-10-12';
  const turno = '08:00-17:00';
  const grupoId = 'G1';
  const equipeId = 'EQ1';
  const recursoId = 'R1';
  const funcId = oid();

  // Seed: escala com 1 grupo/turno, 1 equipe, 1 recurso alocado no dia/turno
  const doc = await Escala.create({
    descricao: 'Escala Teste Diária',
    classificacao: 'ORDINÁRIA',
    unidade_id: unidadeId,
    data_inicio: new Date('2025-10-01T00:00:00.000Z'),
    data_fim: new Date('2025-10-31T00:00:00.000Z'),
    grupos_turnos: [ { id: grupoId, turnos: [ { ini: '08:00', fim: '17:00' } ] } ],
    equipes: [
      {
        id: equipeId,
        nome: 'EQ1',
        componentes: [ { id: String(funcId), funcionario_id: String(funcId), nome: 'Fulano' } ],
        recursos: [
          {
            id: recursoId,
            equipeId,
            nome: 'RECURSO-1',
            // Alocado no dia/turno
            alocacoes: [ { dia, turnoId: turno } ],
            // Array de atribuicoes vazio para forçar suplemento pelo mapa legado
            atribuicoes: [],
            atribuicoesRecurso: {
              [`${dia}__${turno}`]: [ { funcionarioId: String(funcId), nome: 'Fulano', atribuicao: 'Operador' } ]
            },
            // Array de refeicoes vazio para forçar suplemento pelo mapa legado
            refeicoes: [],
            refeicoesRecurso: {
              [`${dia}__${turno}`]: [ { ini: '12:00', fim: '13:00', computavel: false, tipo: 'ALMOCO' } ]
            }
          }
        ]
      }
    ],
    alocacao: {}
  });

  // Chamar endpoint diário
  const res = await agent
    .get('/escalas/api/escalas/diaria')
    .query({ unidadeId: String(unidadeId), dia })
    .expect(200);

  assert.equal(res.body.ok, true, 'ok deve ser true');
  const data = Array.isArray(res.body.data) ? res.body.data : [];
  assert.ok(data.length >= 1, 'deve retornar ao menos uma escala');
  const esc = data.find(e => String(e.id) === String(doc._id)) || data[0];
  assert.ok(esc.turnos && esc.turnos.length, 'deve retornar turnos');
  const turnoObj = esc.turnos.find(t => t && t.token === turno);
  assert.ok(turnoObj, 'turno alvo deve existir');
  const equipe = (turnoObj.equipes || []).find(e => e && e.id === equipeId);
  assert.ok(equipe, 'equipe deve estar presente no turno');
  const recurso = (equipe.recursos || []).find(r => r && (r.id === recursoId || r.nome === 'RECURSO-1'));
  assert.ok(recurso, 'recurso deve ser incluído no turno');
  // Atribuições devem ter sido suplementadas a partir do mapa legado
  assert.ok(Array.isArray(recurso.atribuicoes), 'atribuicoes deve ser array');
  assert.ok(recurso.atribuicoes.length >= 1, 'deve ter ao menos 1 atribuicao');
  const at = recurso.atribuicoes[0];
  assert.equal(at.dia, dia, 'atribuicao.dia');
  assert.equal(at.turnoId, turno, 'atribuicao.turnoId');
  assert.equal(String(at.membroFuncionarioId), String(funcId), 'atribuicao.membroFuncionarioId');
  // Refeições devem ser retornadas pré-filtradas para o turno com computavel normalizado
  assert.ok(Array.isArray(recurso.refeicoes), 'refeicoes deve ser array');
  assert.ok(recurso.refeicoes.length >= 1, 'deve ter ao menos 1 refeicao');
  const meal = recurso.refeicoes[0];
  assert.equal(meal.ini, '12:00');
  assert.equal(meal.fim, '13:00');
  assert.equal(meal.computavel, false);

  // Cleanup conexão
  await mongoose.connection.dropDatabase();
});

test('GET diária respeita filtro por unidade e dia', async () => {
  const { app } = await createServer();
  const agent = await loginReal(app);
  const unidade1 = oid();
  const unidade2 = oid();
  const dia = '2025-10-13';
  // Escala na unidade2 não deve aparecer quando pedimos unidade1
  await Escala.create({
    descricao: 'Outra Escala',
    classificacao: 'ORDINÁRIA',
    unidade_id: unidade2,
    data_inicio: new Date('2025-10-01T00:00:00.000Z'),
    data_fim: new Date('2025-10-31T00:00:00.000Z'),
    grupos_turnos: [ { id: 'G', turnos: [ { ini: '08:00', fim: '17:00' } ] } ],
    equipes: []
  });

  const res = await agent
    .get('/escalas/api/escalas/diaria')
    .query({ unidadeId: String(unidade1), dia })
    .expect(200);

  assert.equal(res.body.ok, true);
  const data = Array.isArray(res.body.data) ? res.body.data : [];
  // Sem escalas para unidade1
  assert.equal(data.length, 0);
});
