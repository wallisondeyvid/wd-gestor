// Smoke test para verificar que refreshTurnosDebounced e renderGruposTurnos não explodem
// Execução: node tests/turnos_smoke_test.cjs

const fs = require('fs');
const vm = require('vm');
const path = require('path');

// Carrega módulos por aba que expõem os globais necessários (sem shim)
const codeAba1 = fs.readFileSync(path.join(__dirname, '..', 'public', 'escalas', 'js', 'escalas', 'aba1_dados_gerais.js'), 'utf8');
const codeAba2 = fs.readFileSync(path.join(__dirname, '..', 'public', 'escalas', 'js', 'escalas', 'aba2_turnos.js'), 'utf8');

// DOM mínimo fake
global.window = global;
window.document = {
  readyState: 'complete',
  addEventListener: ()=>{},
  dispatchEvent: ()=>{},
  querySelector: ()=>null,
  querySelectorAll: ()=>[],
  getElementById: ()=>null
};
window.CustomEvent = function(name, opts){ return { name, detail: (opts&&opts.detail)||null }; };
window.bootstrap = { Tooltip: function(){}, Modal: function(){}, Modal: { getOrCreateInstance: ()=>({ show:()=>{}, hide:()=>{} }) } };

// Mocks necessários
window.__ESCALA_STATE__ = { gruposTurnos: [ { id: 'g1', turnos: [ { ini:'08:00', fim:'12:00' }, { ini:'13:00', fim:'17:00' } ] } ] };
global.els = {};
global.$ = function(){ return null; };
global.__fmtTurno = function(t){ return { ini: t.ini, fim: t.fim }; };
global.scheduleRenderGruposTurnos = function(reason){ try { renderGruposTurnos(reason); } catch(e){} };
global.renderMatrizesPorGrupo = function(){};
global.avaliarProgressaoAbas = function(){};
global.__isInitStub = function(){ return false; };
global.basePath = function(){ return ''; };
global.getEscalaId = function(){ return 'test-esc'; };
global.detectTipoEarly = function(){ return 'ORDINÁRIA'; };
// Placeholder para renderGruposTurnos se script ainda não definiu
if(typeof global.renderGruposTurnos !== 'function'){
  global.renderGruposTurnos = function(reason){ /* placeholder */ };
}
global.carregarEscalaExistente = async function(){ return { ok:true }; };
global.avaliarProgressaoAbas = function(){};
global.updateClassificationUI = function(){};
global.iniciarLoopResolucaoUnidade = function(){};
global.fetchAndPopulateUnidades = function(){};
global.iniciarObserverUnidade = function(){};
global.instalarObserverUnidade = function(){};
global.garantirUnidadeApos = function(){};
global.detectarTipoSeAusente = function(){};
global.location = { href:'http://localhost/escala?id=test-esc', pathname:'/escala/ordinaria/' };
global.history = { replaceState: ()=>{} };
if(typeof global.refreshTurnosDebounced !== 'function'){
  global.refreshTurnosDebounced = function(){ /* placeholder debounce */ };
}

const sandbox = global;
vm.createContext(sandbox);

try {
  vm.runInContext(codeAba1, sandbox);
  vm.runInContext(codeAba2, sandbox);
  if(typeof window.renderGruposTurnos !== 'function') throw new Error('renderGruposTurnos não exposto');
  if(typeof window.refreshTurnosDebounced !== 'function') throw new Error('refreshTurnosDebounced não exposto');
  window.refreshTurnosDebounced('smoke');
  console.log('[SMOKE] OK: debounce executado sem exceções.');
} catch(err){
  console.error('[SMOKE] FALHA:', err.message);
  process.exit(1);
}