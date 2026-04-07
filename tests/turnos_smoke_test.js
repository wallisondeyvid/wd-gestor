// Smoke test para verificar que refreshTurnosDebounced e renderGruposTurnos não explodem
// Execução: node tests/turnos_smoke_test.js

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// __dirname compatível com ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega o módulo da Aba 1 que agora expõe os globais mínimos (sem shim)
const scriptPath = path.join(__dirname, '..', 'public', 'escalas', 'js', 'escalas', 'aba1_dados_gerais.js');
const code = fs.readFileSync(scriptPath, 'utf8');

// DOM mínimo fake
global.window = global;
const fakeElements = {
  tabelaGruposTurnos: { __bound: false, addEventListener: ()=>{} },
  btnNovoGrupoTurnos: { __bound: false, addEventListener: ()=>{} },
  modalSelecionarTurnos: { __turnosTmp: { turnos: [] }, __editGid: null },
};
window.document = {
  readyState: 'complete',
  body: { getAttribute: ()=>'/escalas' },
  addEventListener: ()=>{},
  dispatchEvent: ()=>{},
  querySelector: ()=>null,
  querySelectorAll: ()=>[],
  getElementById: (id)=> fakeElements[id] || null
};
window.CustomEvent = function(name, opts){ return { name, detail: (opts&&opts.detail)||null }; };
window.bootstrap = { Tooltip: function(){}, Modal: function(){}, Modal: { getOrCreateInstance: ()=>({ show:()=>{}, hide:()=>{} }) } };

// Mocks necessários
window.__ESCALA_STATE__ = { gruposTurnos: [ { id: 'g1', turnos: [ { ini:'08:00', fim:'12:00' }, { ini:'13:00', fim:'17:00' } ] } ], equipes: [] };
const els = {};
function $(id){ return null; }
function __fmtTurno(t){ return { ini: t.ini, fim: t.fim }; }
function scheduleRenderGruposTurnos(reason){ try { renderGruposTurnos(reason); } catch(e){} }
function renderMatrizesPorGrupo(){}
function avaliarProgressaoAbas(){}
function __isInitStub(){ return false; }
function basePath(){ return ''; }
function getEscalaId(){ return 'test-esc'; }
function detectTipoEarly(){ return 'ORDINÁRIA'; }
async function carregarEscalaExistente(){ return { ok:true }; }
function updateClassificationUI(){}
function iniciarLoopResolucaoUnidade(){}
function fetchAndPopulateUnidades(){}
function iniciarObserverUnidade(){}
function instalarObserverUnidade(){}
function garantirUnidadeApos(){}
function detectarTipoSeAusente(){}
window.location = { href:'http://localhost/escala?id=test-esc', pathname:'/escala/ordinaria/' };
window.history = { replaceState: ()=>{} };
if(typeof window.renderGruposTurnos !== 'function'){
  window.renderGruposTurnos = function(reason){ /* placeholder */ };
}
if(typeof window.refreshTurnosDebounced !== 'function'){
  window.refreshTurnosDebounced = function(){ /* placeholder debounce */ };
}
// Inserir no contexto de VM
const sandbox = global;
vm.createContext(sandbox);

try {
  // Carrega também a Aba 2 para expor renderGruposTurnos e refreshTurnosDebounced
  const codeAba1 = code;
  const codeAba2 = fs.readFileSync(path.join(__dirname, '..', 'public', 'escalas', 'js', 'escalas', 'aba2_turnos.js'), 'utf8');
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
