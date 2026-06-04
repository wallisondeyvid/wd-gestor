import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ejs from 'ejs';

const LOGIN_VIEW_PATH = path.join(process.cwd(), 'views/gestor/logingestor.ejs');
const RECOVERY_VIEW_PATH = path.join(process.cwd(), 'views/gestor/esquecisenha.ejs');
const RESET_VIEW_PATH = path.join(process.cwd(), 'views/gestor/reset-password.ejs');
const RESET_ERROR_VIEW_PATH = path.join(process.cwd(), 'views/gestor/reset-password-error.ejs');
const CONTACT_VIEW_PATH = path.join(process.cwd(), 'views/gestor/contato.ejs');
const LOGIN_JS_PATH = path.join(process.cwd(), 'public/gestor/js/pages/login.js');
const RECOVERY_JS_PATH = path.join(process.cwd(), 'public/gestor/js/pages/esquecisenha.js');

const LOGIN_VIEW_SOURCE = fs.readFileSync(LOGIN_VIEW_PATH, 'utf8');
const RECOVERY_VIEW_SOURCE = fs.readFileSync(RECOVERY_VIEW_PATH, 'utf8');
const RESET_VIEW_SOURCE = fs.readFileSync(RESET_VIEW_PATH, 'utf8');
const RESET_ERROR_VIEW_SOURCE = fs.readFileSync(RESET_ERROR_VIEW_PATH, 'utf8');
const CONTACT_VIEW_SOURCE = fs.readFileSync(CONTACT_VIEW_PATH, 'utf8');
const LOGIN_JS_SOURCE = fs.readFileSync(LOGIN_JS_PATH, 'utf8');
const RECOVERY_JS_SOURCE = fs.readFileSync(RECOVERY_JS_PATH, 'utf8');

test('public auth UI: login mantém atributos básicos de acessibilidade e links públicos do fluxo', async () => {
  const html = await ejs.render(LOGIN_VIEW_SOURCE, {
    basePath: '/gestor',
    moduleLabel: 'Gestor',
  }, { filename: LOGIN_VIEW_PATH, async: true });

  assert.match(html, /name="email"/);
  assert.match(html, /autocomplete="username"/);
  assert.match(html, /name="senha"/);
  assert.match(html, /autocomplete="current-password"/);
  assert.match(html, /id="toggleSenha"/);
  assert.match(html, /aria-label="Mostrar senha"/);
  assert.match(html, /data-loading-label="Entrando\.\.\."/);
  assert.match(html, /href="\/gestor\/esquecisenha"/);
  assert.match(html, /href="\/gestor\/contato"/);
  assert.match(html, /Módulo Gestor/);
  assert.match(LOGIN_JS_SOURCE, /submitBtn\.disabled = true/);
  assert.match(LOGIN_JS_SOURCE, /aria-busy/);
});

test('public auth UI: recuperação mantém CPF-only, confirmação amigável e atributos de entrada esperados', async () => {
  const html = await ejs.render(RECOVERY_VIEW_SOURCE, {
    basePath: '/gestor',
    solicitacaoRecebida: false,
    recoveryMessage: null,
  }, { filename: RECOVERY_VIEW_PATH, async: true });

  assert.match(html, /Recuperação de senha/);
  assert.match(html, /name="cpf"/);
  assert.match(html, /inputmode="numeric"/);
  assert.match(html, /autocomplete="off"/);
  assert.match(html, /id="cpfHelp"/);
  assert.match(html, /data-loading-label="Enviando solicitação\.\.\."/);
  assert.match(html, /Voltar ao Login/);
  assert.doesNotMatch(html, /name="email"/);
  assert.match(RECOVERY_JS_SOURCE, /showConfirmationState/);
  assert.match(RECOVERY_JS_SOURCE, /aria-busy/);
});

test('public auth UI: reset renderiza campos esperados com autocomplete new-password e ação principal consistente', async () => {
  const html = await ejs.render(RESET_VIEW_SOURCE, {
    basePath: '/gestor',
    token: 'token-placeholder',
    userName: 'Ana',
  }, { filename: RESET_VIEW_PATH, async: true });

  assert.match(html, /Definir nova senha/);
  assert.match(html, /name="senha"/);
  assert.match(html, /name="confirmarSenha"/);
  assert.match(html, /autocomplete="new-password"/);
  assert.match(html, /Salvar nova senha/);
  assert.match(html, /data-loading-label="Salvando nova senha\.\.\."/);
  assert.match(html, /Voltar ao Login/);
});

test('public auth UI: reset error e contato preservam links públicos consistentes', async () => {
  const errorHtml = await ejs.render(RESET_ERROR_VIEW_SOURCE, {
    basePath: '/gestor',
    title: 'Link inválido',
    message: 'Token inválido ou expirado',
    showRetry: true,
  }, { filename: RESET_ERROR_VIEW_PATH, async: true });

  const contactHtml = await ejs.render(CONTACT_VIEW_SOURCE, {
    basePath: '/gestor',
  }, { filename: CONTACT_VIEW_PATH, async: true });

  assert.match(errorHtml, /Link inválido ou expirado/);
  assert.match(errorHtml, /Tentar Novamente/);
  assert.match(errorHtml, /Voltar ao Login/);
  assert.match(contactHtml, /Precisa de ajuda\?/);
  assert.match(contactHtml, /Voltar ao Login/);
});