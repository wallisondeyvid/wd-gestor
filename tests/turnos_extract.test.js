import assert from 'node:assert';
import { test } from 'node:test';

// Vamos depender da presença global de TurnosData. Carregamos o arquivo que define.
// Como o ambiente de teste Node não injeta window por padrão, criaremos um mock mínimo.

if (typeof global.window === 'undefined') {
  global.window = global;
}

// Carrega módulo principal se existir (path relativo conforme estrutura). Ajuste se necessário.
import '../public/escalas/js/turnos_data.js';

function runExtract(payload){
  assert.ok(window.TurnosData && typeof window.TurnosData.extractGruposFromPayload === 'function', 'API TurnosData não disponível');
  return window.TurnosData.extractGruposFromPayload(payload);
}

function normGrupo(g){
  return {
    nome: g.nome || g.name || g.titulo || g.title || g.descricao || g.description || g.label || g.id || 'grupo',
    turnos: (Array.isArray(g.turnos)? g.turnos: g.lista || g.list || g.items || []).map(t=>({
      ini: t.ini || t.inicio || t.start || t.hora_inicio || t.horaInicio || t.hi,
      fim: t.fim || t.termino || t.end || t.hora_fim || t.horaFim || t.hf
    })).filter(t=> t.ini && t.fim)
  };
}

// Casos de teste

test('Extrai grupos_turnos estruturado', () => {
  const payload = { grupos_turnos: [ { nome: 'A', turnos: [ { ini: '08:00', fim: '12:00' }, { ini: '13:00', fim: '17:00' } ] }, { nome:'B', turnos:[{ ini:'07:00', fim:'11:00' }] } ] };
  const grupos = runExtract(payload);
  assert.equal(grupos.length, 2);
  assert.deepEqual(grupos[0].turnos[0], { ini: '08:00', fim: '12:00' });
});

test('Extrai turnos_simples para um grupo padrão', () => {
  const payload = { turnos_simples: [ { inicio: '06:00', termino:'10:00' }, { inicio:'10:00', termino:'14:00' } ] };
  const grupos = runExtract(payload);
  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].turnos.length, 2);
  assert.deepEqual(grupos[0].turnos[1], { ini: '10:00', fim: '14:00' });
});

test('Extrai grupos aninhados profundos', () => {
  const payload = { dados: { escala: { grupos: [ { titulo:'X', lista:[{ hi:'08:00', hf:'09:30' }] }, { titulo:'Y', turnos:[{ inicio:'09:30', termino:'11:00' }, { inicio:'11:00', termino:'12:30' }] } ] } } };
  const grupos = runExtract(payload);
  assert.equal(grupos.length, 2);
  assert.deepEqual(grupos[1].turnos[1], { ini: '11:00', fim: '12:30' });
});

test('Retorna vazio para payload sem pistas', () => {
  const payload = { nada: true, vazio: [] };
  const grupos = runExtract(payload);
  assert.equal(grupos.length, 0);
});

test('Normaliza campos variados dentro dos turnos', () => {
  const payload = { grupos_turnos: [ { nome:'Mix', turnos:[ { start:'07:00', end:'09:00' }, { hora_inicio:'09:00', hora_fim:'11:00' }, { hi:'11:00', hf:'13:00' } ] } ] };
  const grupos = runExtract(payload);
  assert.equal(grupos[0].turnos.length, 3);
  assert.deepEqual(grupos[0].turnos[2], { ini:'11:00', fim:'13:00' });
});

// Edge: duplicados e ordenação - depende de implementação interna; aqui só verifica coleta bruta

test('Ignora turnos inválidos sem horário completo', () => {
  const payload = { grupos_turnos: [ { nome:'Inv', turnos:[ { inicio:'05:00' }, { termino:'06:00' }, { inicio:'07:00', termino:'07:00' }, { inicio:'07:00', termino:'08:00' } ] } ] };
  const grupos = runExtract(payload);
  assert.equal(grupos[0].turnos.length, 1);
  assert.deepEqual(grupos[0].turnos[0], { ini:'07:00', fim:'08:00' });
});
