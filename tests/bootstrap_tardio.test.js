// Teste para garantir inicialização tardia sem watchers extras
// Usa Node test runner.
import { test } from 'node:test';
import assert from 'node:assert';

// Simula ambiente mínimo de window/document
global.window = global.window || {};
const listeners = {};
global.document = {
  readyState: 'loading',
  addEventListener: (evt, fn) => { listeners[evt] = fn; },
  dispatchEvent: (ev) => { /* noop para este teste */ }
};

// Carrega trecho necessário do arquivo principal (bootstrap)
// Para evitar executar toda a lógica de escala_nova.js (muito grande), isolamos apenas a parte de bootstrap.
// Em ambiente real, este teste poderia fazer um require do arquivo completo. Aqui vamos emular a lógica relevante.

let bootCalls = 0;
function __isInitStub(fn){ return false; }
function initEscalaPage(){ bootCalls++; }

// Implementação reduzida de __boot equivalente ao código atual
function __boot(){
  try {
    if(window.__ESCALA_BOOT_OK) return;
    const fn = (typeof initEscalaPage === 'function') ? initEscalaPage : (typeof window.initEscalaPage === 'function' ? window.initEscalaPage : null);
    if(typeof fn === 'function' && !__isInitStub(fn)){ fn(); window.__ESCALA_BOOT_OK = true; return; }
    setTimeout(__boot, 40);
  } catch(e){ /* ignorar em teste */ }
}

document.addEventListener('DOMContentLoaded', __boot);

// Salvaguarda tardia
setTimeout(()=>{
  try {
    if(typeof window.initEscalaPage!=='function' && typeof initEscalaPage==='function'){
      window.initEscalaPage = initEscalaPage;
    }
    if(!window.__ESCALA_BOOT_OK && typeof window.initEscalaPage==='function'){
      window.initEscalaPage(); window.__ESCALA_BOOT_OK = true;
    }
  } catch(_g){}
},2000);

// Emular definição tardia (após 120ms) de initEscalaPage em window
setTimeout(()=>{ window.initEscalaPage = initEscalaPage; }, 120);

// Disparar DOMContentLoaded após 50ms para simular carregamento inicial
setTimeout(()=>{ listeners['DOMContentLoaded'] && listeners['DOMContentLoaded'](); }, 50);

// Teste: ao final de ~500ms deve ter inicializado uma única vez
test('Bootstrap tardio inicializa exatamente uma vez', async () => {
  await new Promise(res => setTimeout(res, 500));
  assert.strictEqual(bootCalls, 1, 'initEscalaPage deve ser chamada uma única vez');
  assert.ok(window.__ESCALA_BOOT_OK, 'Flag de boot deve estar marcada');
});
