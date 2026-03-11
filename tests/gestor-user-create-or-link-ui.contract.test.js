import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const viewPath = path.join(__dirname, '..', 'views', 'gestor', 'usuarios.ejs');

test('usuarios.ejs comunica create-or-link no formulário e nos feedbacks da tela', () => {
  const source = fs.readFileSync(viewPath, 'utf8');

  assert.match(source, /Como funciona o vínculo multiunidade:/);
  assert.match(source, /E-mail novo cria o usuário e o vínculo da unidade atual\./);
  assert.match(source, /E-mail já existente em outra unidade adiciona o vínculo à unidade atual\./);
  assert.match(source, /E-mail já vinculado nesta unidade gera aviso e não duplica o vínculo\./);
  assert.match(
    source,
    /Se o e-mail já existir em outra unidade, o sistema reutiliza o usuário e cria apenas o vínculo desta unidade\./
  );
  assert.match(source, /Se já estiver vinculado nesta unidade, a tela exibirá um aviso e não duplicará o vínculo\./);
  assert.match(source, />\s*Criar usuário ou adicionar vínculo\s*</);
  assert.match(source, /result\?\.data\?\.outcome/);
  assert.match(source, /Usuário existente vinculado à unidade atual com sucesso!/);
  assert.match(source, /Usuário criado e vinculado à unidade com sucesso!/);
  assert.match(source, /USER_MEMBERSHIP_DUPLICATE/);
  assert.match(source, /Nenhum vínculo duplicado foi criado\./);
  assert.match(source, /showAlert\(errorMessage, alertType\)/);
});