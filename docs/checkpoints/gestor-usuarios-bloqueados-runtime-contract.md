# Gestor - contrato runtime de usuários bloqueados

Status: checkpointado
Classificacao: PONTO_DE_CONGELAMENTO_LOCAL

## Objetivo encerrado

- Registrar formalmente o contrato runtime real congelado por suíte dedicada para o endpoint de listagem de usuários bloqueados no Gestor.
- Fixar o owner efetivo atual, o envelope observável e o shape real da lista retornada em runtime.

## Rota auditada

- GET /gestor/api/usuarios/bloqueados

## Owner runtime atual

- Owner runtime efetivo atual: router legado.
- Rota montada no corredor legado de usuários do Gestor em src/modules/gestor/app/routes/usuario.js.
- O wiring do app mantém usuarioRouter montado antes dos routers de API compartilhados em src/modules/gestor/app/gestor-app.js.
- Controller que atende a rota: listLockedUsers em src/modules/gestor/app/controllers/userController.js.

## Contrato observável congelado

### GET /gestor/api/usuarios/bloqueados

- Sem sessão: 401 JSON com success=false, error='Não autenticado' e code='UNAUTHORIZED'.
- Autenticado sem privilégio suficiente: 403 JSON com success=false, error='Acesso negado' e code='FORBIDDEN'.
- Sucesso: 200 JSON com success=true, total e data.
- Erro interno: 500 JSON com success=false, error='Falha ao listar bloqueados' e code='SERVER_ERROR'.

## Shape observado de sucesso

- success
- total
- data como array
- Cada item observado no array contém:
  - _id
  - email
  - failed_login_attempts
  - lock_until
  - role

## Observações de runtime relevantes

- O endpoint é JSON only em todos os cenários congelados.
- A listagem inclui apenas usuários com lock_until futuro no momento da consulta.
- O total observado em runtime acompanha a cardinalidade de data.
- Para representar fielmente o runtime autenticado sem privilégio, a suíte usou um diretor autenticável, que entra no Gestor mas continua sem permissão para esta rota.
- Não houve divergência adicional entre contrato teórico lido e runtime observado na execução focal; a suíte fechou verde na primeira rodada.

## Evidência executável

- Suíte dedicada: tests/gestor-usuarios-bloqueados-runtime-contract.test.js
- Execução focal validada: node --test .\tests\gestor-usuarios-bloqueados-runtime-contract.test.js
- Resultado validado: 6 testes, 6 passes, 0 falhas

## Classificação

- Este arquivo registra um ponto de congelamento local para este endpoint específico.
- Nenhum microrefactor interno foi aplicado nesta rodada; o melhor patch foi nenhum.
- Mudanças futuras neste caminho devem preservar primeiro o contrato público aqui descrito ou vir acompanhadas de nova decisão deliberada.