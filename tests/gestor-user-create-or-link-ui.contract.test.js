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
  const roleIndex = source.indexOf('id="roleSelect"');
  const unidadeIndex = source.indexOf('id="unidadeSelect"');
  const emailIndex = source.indexOf('id="emailUsuario"');
  const nomeIndex = source.indexOf('id="nomeUsuario"');
  const cpfIndex = source.indexOf('id="cpfUsuario"');
  const funcionarioIndex = source.indexOf('id="funcionarioSelect"');

  assert.match(source, /Identidade global/);
  assert.match(source, /unidades vinculadas/);
  assert.match(source, /Vínculos ainda não sincronizados/);
  assert.match(source, /Acesso global/);
  assert.match(source, /Sem vínculo contextual necessário\./);
  assert.match(source, /wdg-user-memberships/);
  assert.match(source, /membership\.unidade_nome \|\| membership\.unidade_id/);
  assert.match(source, /Cadastro legado sem user_memberships sincronizados\./);
  assert.match(source, /Como funciona o vínculo multiunidade:/);
  assert.match(source, /E-mail novo cria o usuário e o vínculo da unidade atual\./);
  assert.match(source, /E-mail já existente em outra unidade adiciona o vínculo à unidade atual\./);
  assert.match(source, /E-mail já vinculado nesta unidade gera aviso e não duplica o vínculo\./);
  assert.match(source, /O e-mail é a chave operacional do fluxo\./);
  assert.match(source, /Depois da validação, os demais campos serão liberados com base nesta identidade\./);
  assert.match(source, />\s*Criar usuário ou adicionar vínculo\s*</);
  assert.match(source, /Adicionar vínculo à unidade/);
  assert.match(source, /Criar usuário e vincular unidade/);
  assert.match(source, /result\?\.data\?\.outcome/);
  assert.match(source, /Usuário existente vinculado à unidade atual com sucesso!/);
  assert.match(source, /Usuário criado e vinculado à unidade com sucesso!/);
  assert.match(source, /USER_MEMBERSHIP_DUPLICATE/);
  assert.match(source, /Nenhum vínculo duplicado foi criado\./);
  assert.match(source, /showAlert\(errorMessage, alertType\)/);
  assert.match(source, /emailPrecheckCard/);
  assert.match(source, /\/api\/usuarios\/check-email\?email=/);
  assert.match(source, /Novo usuário será criado/);
  assert.match(source, /Este e-mail já existe globalmente/);
  assert.match(source, /Nome e CPF foram carregados automaticamente/);
  assert.match(source, /Disponível após validar o e-mail\./);
  assert.match(source, /-- Selecione o nível de acesso --/);
  assert.match(source, />Master</);
  assert.match(source, /Selecione o nível de acesso primeiro\./);
  assert.match(source, /CPF divergente da identidade/);
  assert.match(source, /e-mail divergente da identidade/);
  assert.match(source, /nome divergente da identidade/);
  assert.match(source, /Nome alinhado ao Funcionário selecionado para manter consistência\./);
  assert.match(source, /já vinculada a este usuário/);
  assert.match(source, /Este usuário já está vinculado a todas as unidades disponíveis para este formulário\./);
  assert.match(source, /Para adicionar novo vínculo, selecione User ou Diretor e uma unidade disponível\./);
  assert.match(source, /id="emailUsuario"[^>]*disabled/);
  assert.match(source, /id="nomeUsuario"[^>]*disabled/);
  assert.match(source, /id="cpfUsuario"[^>]*disabled/);
  assert.match(source, /id="funcionarioSelect"[^>]*disabled/);
  assert.ok(roleIndex >= 0 && unidadeIndex > roleIndex && emailIndex > unidadeIndex && nomeIndex > emailIndex && cpfIndex > nomeIndex && funcionarioIndex > cpfIndex);
});

test('usuarios.ejs preserva a unidade e usa modal de erro quando o e-mail já está vinculado à mesma unidade', () => {
  const source = fs.readFileSync(viewPath, 'utf8');

  assert.match(source, /id="usrEmailAlreadyLinkedModal"/);
  assert.match(source, /E-mail já vinculado à unidade/);
  assert.match(source, /id="usrEmailAlreadyLinkedOk"/);
  assert.match(source, /showSameUnitDuplicateModal/);
  assert.match(source, /Este e-mail já está vinculado à unidade selecionada\./);
  assert.match(source, /Nenhum novo vínculo foi criado porque este vínculo já existe\./);
  assert.match(source, /Erro: este e-mail já está vinculado à unidade selecionada\./);
  assert.doesNotMatch(source, /unidadeSelect\.value\s*=\s*''/);
  assert.doesNotMatch(source, /foi removida da seleção/);
});
