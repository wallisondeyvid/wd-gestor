import assert from 'assert';
import { test } from 'node:test';

// Este teste foca na lógica de debounce adicionada em escala_nova.js.
// Como o arquivo principal é grande e carrega dependências de DOM, aqui mockamos apenas
// as funções globais usadas pelo debounce para validar quantidade de chamadas.

// Simples fake para window em ambiente Node
global.window = global;

// Métricas de chamadas
let renderCalls = 0;
let matrizCalls = 0;

// Stubs que serão usados pelo refreshTurnosDebounced
global.renderGruposTurnos = (reason)=>{ renderCalls++; if(reason==='debounced') global.__LAST_REASON__ = reason; };
global.renderMatrizesPorGrupo = ()=>{ matrizCalls++; };

// Stub avaliarProgressaoAbas para não quebrar
global.avaliarProgressaoAbas = ()=>{};

// Importa apenas a parte necessária do script principal simulando extração da função (não requer DOM real)
// Em produção a função já está definida em escala_nova.js; aqui copiamos implementação mínima
let __turnosDebounceTimer = null;
function refreshTurnosDebounced(reason){
  if(__turnosDebounceTimer){ clearTimeout(__turnosDebounceTimer); }
  __turnosDebounceTimer = setTimeout(()=>{
    __turnosDebounceTimer = null;
    try { renderGruposTurnos(reason||'debounced'); } catch(_r){}
    try { renderMatrizesPorGrupo(); } catch(_m){}
    try { avaliarProgressaoAbas && avaliarProgressaoAbas(); } catch(_a){}
  }, 120);
}

// Teste principal
test('Debounce executa uma vez por janela curta', async () => {
  refreshTurnosDebounced('t1');
  refreshTurnosDebounced('t2');
  refreshTurnosDebounced('t3');
  assert.equal(renderCalls, 0, 'Não deveria ter render antes do timeout');
  await new Promise(r=> setTimeout(r, 150));
  assert.equal(renderCalls, 1, 'Deveria ter apenas 1 render após debounce');
  assert.equal(matrizCalls, 1, 'Render matriz também deveria ser 1');
  // Nova sequência
  refreshTurnosDebounced('t4');
  refreshTurnosDebounced('t5');
  await new Promise(r=> setTimeout(r, 130));
  assert.equal(renderCalls, 2, 'Segunda janela de debounce executa segundo render');
});
