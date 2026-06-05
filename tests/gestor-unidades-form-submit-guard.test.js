import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const FORM_SUBMIT_PATH = path.join(process.cwd(), 'public/gestor/js/pages/form-submit-unidade.js');

function createMockForm() {
  return {
    listeners: new Map(),
    addEventListener(type, handler) {
      const handlers = this.listeners.get(type) || [];
      handlers.push(handler);
      this.listeners.set(type, handlers);
    },
  };
}

function createTarget({ tagName, type = '', form, role = '', isContentEditable = false } = {}) {
  return {
    tagName,
    type,
    form,
    role,
    isContentEditable,
    getAttribute(name) {
      if (name === 'role') return role;
      return null;
    },
  };
}

function createKeydownEvent(target, extra = {}) {
  return {
    key: 'Enter',
    target,
    defaultPrevented: false,
    isComposing: false,
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    ...extra,
  };
}

function loadFormSubmitScript() {
  const source = fs.readFileSync(FORM_SUBMIT_PATH, 'utf8');
  const form = createMockForm();
  const documentListeners = new Map();
  const document = {
    readyState: 'complete',
    body: {
      getAttribute(name) {
        if (name === 'data-base-path') return '/gestor';
        return null;
      },
    },
    addEventListener(type, handler) {
      const handlers = documentListeners.get(type) || [];
      handlers.push(handler);
      documentListeners.set(type, handlers);
    },
    getElementById(id) {
      if (id === 'cadastroUnidadeForm') return form;
      return null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };

  const context = {
    console: { debug() {}, warn() {}, error() {} },
    document,
    window: {
      location: { pathname: '/gestor/unidades' },
      Validators: {},
      localStorage: { getItem() { return null; } },
    },
    DOMParser: class {},
    FileReader: class {},
    fetch: async () => ({ ok: true, text: async () => '{}', json: async () => ({}) }),
    alert() {},
    CustomEvent: class {},
    Event: class {
      constructor(type, init = {}) {
        this.type = type;
        this.bubbles = !!init.bubbles;
      }
    },
    sessionStorage: { removeItem() {} },
    setTimeout(fn) {
      fn();
      return 0;
    },
    clearTimeout() {},
  };
  context.window.window = context.window;
  context.window.document = document;
  context.window.setTimeout = context.setTimeout;
  context.window.clearTimeout = context.clearTimeout;
  context.window.fetch = context.fetch;
  context.window.alert = context.alert;
  context.window.CustomEvent = context.CustomEvent;
  context.window.Event = context.Event;
  context.window.sessionStorage = context.sessionStorage;

  vm.runInNewContext(source, context, { filename: FORM_SUBMIT_PATH });

  return {
    form,
    context,
  };
}

test('form-submit-unidade bloqueia Enter implícito em campos comuns e preserva acionamento explícito', () => {
  const { form, context } = loadFormSubmitScript();

  const submitHandlers = form.listeners.get('submit') || [];
  const keydownHandlers = form.listeners.get('keydown') || [];

  assert.equal(submitHandlers.length, 1);
  assert.equal(keydownHandlers.length, 1);
  assert.equal(submitHandlers[0], context.window.cadastrarUnidade);

  const keydown = keydownHandlers[0];

  const inputEvent = createKeydownEvent(createTarget({ tagName: 'INPUT', type: 'text', form }));
  keydown(inputEvent);
  assert.equal(inputEvent.defaultPrevented, true);

  const selectEvent = createKeydownEvent(createTarget({ tagName: 'SELECT', form }));
  keydown(selectEvent);
  assert.equal(selectEvent.defaultPrevented, true);

  const textareaEvent = createKeydownEvent(createTarget({ tagName: 'TEXTAREA', form }));
  keydown(textareaEvent);
  assert.equal(textareaEvent.defaultPrevented, false);

  const submitButtonEvent = createKeydownEvent(createTarget({ tagName: 'BUTTON', type: 'submit', form }));
  keydown(submitButtonEvent);
  assert.equal(submitButtonEvent.defaultPrevented, false);
});
