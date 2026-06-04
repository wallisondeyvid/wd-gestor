import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const VIEW_PATH = path.join(process.cwd(), 'views/gestor/esquecisenha.ejs');
const CLIENT_JS_PATH = path.join(process.cwd(), 'public/gestor/js/pages/esquecisenha.js');

const VIEW_SOURCE = fs.readFileSync(VIEW_PATH, 'utf8');
const CLIENT_JS_SOURCE = fs.readFileSync(CLIENT_JS_PATH, 'utf8');

test('gestor esqueci senha UI: tela publica pede apenas CPF e nao exibe confirmacao de email', () => {
  assert.match(VIEW_SOURCE, /name="cpf"/);
  assert.doesNotMatch(VIEW_SOURCE, /name="email"/);
  assert.doesNotMatch(VIEW_SOURCE, /emailGroup/);
  assert.doesNotMatch(VIEW_SOURCE, /confirma/i);
});

test('gestor esqueci senha UI: javascript nao consulta mais listagem publica de emails', () => {
  assert.doesNotMatch(CLIENT_JS_SOURCE, /api\/recover\/emails/);
  assert.doesNotMatch(CLIENT_JS_SOURCE, /emailSelecionado/);
  assert.doesNotMatch(CLIENT_JS_SOURCE, /emailConfirm/);
  assert.match(CLIENT_JS_SOURCE, /await solicitarReset\(\{ cpf: cpfInput\.value \}\)/);
});