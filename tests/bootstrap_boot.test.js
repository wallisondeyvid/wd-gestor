import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function createDomStubs() {
  const listeners = {};
  const makeEl = () => ({
    style: {},
    dataset: {},
    value: '',
    innerHTML: '',
    textContent: '',
    className: '',
  classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
    options: [],
    setAttribute: () => {},
    getAttribute: () => null,
    removeAttribute: () => {},
    appendChild: () => {},
    removeChild: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => null,
    focus: () => {},
    blur: () => {},
    click: () => {},
    remove: () => {},
  });
  const document = {
    readyState: 'loading',
    addEventListener: (name, fn) => {
      listeners[name] = fn;
    },
    removeEventListener: (name) => { delete listeners[name]; },
    dispatchEvent: (evt) => {
      const fn = listeners[evt?.type];
      if (typeof fn === 'function') fn(evt);
    },
    createElement: (tag) => ({ tagName: String(tag).toUpperCase(), ...makeEl() }),
    getElementById: () => makeEl(),
    querySelector: () => null,
    querySelectorAll: () => [],
    body: { appendChild: () => {} },
    _listeners: listeners,
  };
  class CustomEvent {
    constructor(type, opts) {
      this.type = type;
      this.detail = opts?.detail;
    }
  }
  const window = {
    document,
    __ESCALA_BOOT_OK: false,
    __ESCALA_FLAGS__: {},
    addEventListener: () => {},
    removeEventListener: () => {},
    fetch: async () => ({ ok: true, json: async () => ({}), text: async () => '' }),
    alert: () => {},
    navigator: {},
    sessionStorage: {
      _s: new Map(),
      getItem(k) { return this._s.has(k) ? this._s.get(k) : null; },
      setItem(k, v) { this._s.set(k, String(v)); },
      removeItem(k) { this._s.delete(k); },
      clear() { this._s.clear(); },
    },
  location: { href: 'http://localhost/escalas/nova/ordinaria', pathname: '/escalas/nova/ordinaria', search: '' },
    localStorage: {
      _s: new Map(),
      getItem(k) { return this._s.has(k) ? this._s.get(k) : null; },
      setItem(k, v) { this._s.set(k, String(v)); },
      removeItem(k) { this._s.delete(k); },
      clear() { this._s.clear(); },
    },
    performance: { now: () => Date.now() },
    bootstrap: {
      Tooltip: class Tooltip { constructor(){} dispose(){} },
      Modal: class Modal { static getOrCreateInstance(){ return { show(){}, hide(){}, dispose(){} }; } },
    },
    flatpickr: (..._args) => ({ destroy(){} }),
  };
  // APIs globais adicionais
  const MutationObserver = class { constructor(){ } observe(){ } disconnect(){ } };
  const Event = class { constructor(type){ this.type = type; } };
  // Helpers
  function basePath(){ return ''; }
  function getEscalaId(){ return null; }

  function detectTipoEarly(){ return 'ORDINÁRIA'; }
  function obterQueryId(){ return null; }
  return { window, document, CustomEvent, MutationObserver, Event, basePath, getEscalaId, detectTipoEarly, obterQueryId };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test.skip('bootstrap ativa flag de boot com DOMContentLoaded (sem watchers extras) [SKIPPED: harness DOM simplificado pendente]', async (t) => {
  // Isolar globals por teste
  const prevWindow = global.window;
  const prevDocument = global.document;
  const prevCustomEvent = global.CustomEvent;
  const prevMutationObserver = global.MutationObserver;
  const prevEvent = global.Event;
  const prevBasePath = global.basePath;
  const prevGetEscalaId = global.getEscalaId;
  const prevDetectTipoEarly = global.detectTipoEarly;
  const prevObterQueryId = global.obterQueryId;
  const prevFlatpickr = global.flatpickr;

  try {
    const { window, document, CustomEvent, MutationObserver, Event, basePath, getEscalaId, detectTipoEarly, obterQueryId } = createDomStubs();
    global.window = window;
    global.document = document;
    global.location = window.location;
    global.CustomEvent = CustomEvent;
    global.MutationObserver = MutationObserver;
    global.Event = Event;
    global.basePath = basePath;
    global.getEscalaId = getEscalaId;
    global.detectTipoEarly = detectTipoEarly;
    global.obterQueryId = obterQueryId;
    global.flatpickr = window.flatpickr;
  global.bootstrap = window.bootstrap;
  global.fetch = window.fetch;
  global.iniciarLoopResolucaoUnidade = () => {};
  global.renderMatrizesPorGrupo = () => {};

    // Neutraliza timers globais para evitar atividade pós-teste
    const noTimer = (fn, ms) => { if (typeof fn === 'function' && (!ms || ms <= 0)) { try { fn(); } catch {} } return 0; };
    global.setTimeout = noTimer;
    global.setInterval = () => 0;
    global.clearTimeout = () => {};
    global.clearInterval = () => {};

    // Importa o script após stubs prontos
  // Carrega a Aba 1 (que define os globais mínimos) no lugar do shim
  const fileUrl = pathToFileURL(path.resolve('public/escalas/js/escalas/aba1_dados_gerais.js')).href;
    await import(fileUrl);

    // Dispara DOMContentLoaded para iniciar __boot
    document.dispatchEvent({ type: 'DOMContentLoaded' });

    // Aguarda até 1s pelo boot
    const startedAt = Date.now();
    while (!window.__ESCALA_BOOT_OK && Date.now() - startedAt < 1200) {
      await sleep(40);
    }

    assert.equal(window.__ESCALA_BOOT_OK, true, 'flag de boot deve estar true');
  } finally {
    // Não restauramos os globals para evitar timers assíncronos do script acionarem erros após o término do teste.
    // Caso precise isolar mais, considerar mock de timers em execução.
  }
});
