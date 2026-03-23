# Gestor - contrato runtime de status de usuário

Status: checkpointado
Classificacao: PONTO_DE_CONGELAMENTO_LOCAL

## Objetivo encerrado

- Registrar formalmente o contrato runtime real já congelado por suíte dedicada para o endpoint de status de usuário no Gestor.
- Fixar o owner efetivo atual, o envelope observável e as divergências de runtime relevantes já validadas.

## Rota auditada

- GET /gestor/api/usuarios/:id/status

## Owner runtime atual

- Owner runtime efetivo atual: router legado.
- Rota montada no corredor legado de usuários do Gestor em src/modules/gestor/app/routes/usuario.js.
- O wiring do app mantém usuarioRouter montado antes dos routers de API compartilhados em src/modules/gestor/app/gestor-app.js.
- Controller que atende a rota: statusUsuario em src/modules/gestor/app/controllers/userController.js.
- O shared router em src/shared/routes/userApi.js não define este caminho.

## Contrato observável congelado

### GET /gestor/api/usuarios/:id/status

- Sem sessão: 401 JSON com success=false, error='Não autenticado' e code='UNAUTHORIZED'.
- Autenticado sem privilégio consultando terceiro: 403 JSON com success=false, error='Acesso negado' e code='FORBIDDEN'.
- Self: 200 JSON com success=true e data no shape observado pela suíte.
- Admin consultando terceiro: 200 JSON com success=true e data no shape observado pela suíte.
- Id bem formado sem usuário correspondente: 404 JSON com success=false, error='Usuário não encontrado' e code='NOT_FOUND'.
- Erro interno: 500 JSON com success=false, error='Falha ao obter status' e code='SERVER_ERROR'.

## Shape observado de sucesso

- success
- data.id
- data.email
- data.role
- data.failed_login_attempts
- data.lock_until
- data.locked
- data.seconds_remaining
- data.minutes_remaining

## Divergências de runtime relevantes

- Um user simples não entra no Gestor nesse harness; para congelar o cenário autenticado sem privilégio a suíte usou um diretor autenticável, ainda insuficiente para consultar terceiro.
- No cenário self, o login bem-sucedido zera failed_login_attempts antes da consulta ao endpoint; o valor observado congelado para self ficou 0 mesmo quando o seed inicial partiu de 3.
- O estado bloqueado do alvo só ficou observável de forma estável no cenário admin consultando terceiro, porque um usuário com lock_until futuro não autentica para exercer o cenário self.

## Evidência executável

- Suíte dedicada: tests/gestor-usuarios-status-runtime-contract.test.js
- Execução focal validada: node --test .\tests\gestor-usuarios-status-runtime-contract.test.js
- Resultado validado: 6 testes, 6 passes, 0 falhas

## Classificação

- Este arquivo registra um ponto de congelamento local para este endpoint específico.
- Mudanças futuras neste caminho devem preservar primeiro o contrato público aqui descrito ou vir acompanhadas de nova decisão deliberada.