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

  assert.match(
    source,
    /Se o e-mail já existir em outra unidade, o sistema reutiliza o usuário e cria apenas o vínculo desta unidade\./
  );
  assert.match(source, />\s*Criar ou vincular\s*</);
  assert.match(source, /result\?\.data\?\.outcome/);
  assert.match(source, /Usuário existente vinculado à unidade com sucesso!/);
  assert.match(source, /USER_MEMBERSHIP_DUPLICATE/);
  assert.match(source, /Este e-mail já está vinculado a esta unidade/);
});