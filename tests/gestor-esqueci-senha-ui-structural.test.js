import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ejs from 'ejs';

const VIEW_PATH = path.join(process.cwd(), 'views/gestor/esquecisenha.ejs');
const CLIENT_JS_PATH = path.join(process.cwd(), 'public/gestor/js/pages/esquecisenha.js');

const VIEW_SOURCE = fs.readFileSync(VIEW_PATH, 'utf8');
const CLIENT_JS_SOURCE = fs.readFileSync(CLIENT_JS_PATH, 'utf8');

test('gestor esqueci senha UI: tela publica pede apenas CPF e nao exibe confirmacao de email', () => {
  assert.match(VIEW_SOURCE, /name="cpf"/);
  assert.doesNotMatch(VIEW_SOURCE, /name="email"/);
  assert.doesNotMatch(VIEW_SOURCE, /emailGroup/);
  assert.doesNotMatch(VIEW_SOURCE, /emailSelecionado|emailConfirm|Confirmação de e-mail/i);
});

test('gestor esqueci senha UI: view tolera locals ausentes ou legados sem quebrar e usa basePath correto', async () => {
  const html = await ejs.render(VIEW_SOURCE, {
    basePath: '/condominios',
    moduleLabel: 'Gestão de Condomínio',
  }, { filename: VIEW_PATH, async: true });

  assert.match(html, /Módulo Gestão de Condomínio/);
  assert.match(html, /href="\/condominios\/login"/);
  assert.match(html, /href="\/condominios\/esquecisenha"/);
  assert.doesNotMatch(html, /ReferenceError|debugLink|name="email"|token|hash/i);
});

test('gestor esqueci senha UI: view aceita flags legadas de sucesso e erro sem depender de nomes novos', async () => {
  const successHtml = await ejs.render(VIEW_SOURCE, {
    basePath: '/escalas',
    moduleLabel: 'Escalas',
    sucesso: true,
  }, { filename: VIEW_PATH, async: true });

  const errorHtml = await ejs.render(VIEW_SOURCE, {
    basePath: '/escalas',
    moduleLabel: 'Escalas',
    erro: 'Erro inesperado',
  }, { filename: VIEW_PATH, async: true });

  assert.match(successHtml, /Solicitação recebida/);
  assert.match(successHtml, /href="\/escalas\/login"/);
  assert.match(errorHtml, /Erro inesperado/);
});

test('gestor esqueci senha UI: view renderiza estado de confirmacao amigavel quando solicitacao foi recebida', async () => {
  const html = await ejs.render(VIEW_SOURCE, {
    basePath: '/gestor',
    solicitacaoRecebida: true,
    recoveryMessage: 'Se os dados informados corresponderem a um usuário cadastrado, enviaremos as instruções de recuperação.',
  }, { filename: VIEW_PATH, async: true });

  assert.match(html, /Solicitação recebida/);
  assert.match(html, /Verifique sua caixa de entrada e também a pasta de spam\./);
  assert.match(html, /Fazer nova solicitação/);
  assert.match(html, /Voltar ao Login/);
});

test('gestor esqueci senha UI: javascript nao consulta mais listagem publica de emails', () => {
  assert.doesNotMatch(CLIENT_JS_SOURCE, /api\/recover\/emails/);
  assert.doesNotMatch(CLIENT_JS_SOURCE, /emailSelecionado/);
  assert.doesNotMatch(CLIENT_JS_SOURCE, /emailConfirm/);
  assert.match(CLIENT_JS_SOURCE, /await solicitarReset\(\{ cpf: cpfInput\.value \}\)/);
  assert.match(CLIENT_JS_SOURCE, /ev\.preventDefault\(\)/);
  assert.match(CLIENT_JS_SOURCE, /showConfirmationState\(/);
});