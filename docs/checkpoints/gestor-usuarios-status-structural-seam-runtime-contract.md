# Gestor - costura estrutural de statusUsuario para statusUsuarioLockStateOwnerService

Status: checkpointado
Classificacao: PONTO_DE_CONGELAMENTO_INTERMEDIARIO

## Objetivo encerrado

- Registrar somente a prova estrutural focal da nova costura controller -> service no subcorredor de lock state de statusUsuario.
- Fixar que o controller passou a delegar o bundle semantico de lock state ao owner service minimo, preservando o envelope JSON final.

## Costura auditada

- Controller: src/modules/gestor/app/controllers/userController.js
- Owner service: src/modules/gestor/app/services/usuarios/statusUsuarioLockStateOwner.service.js

## Comportamento estrutural validado

- statusUsuario continua dono do preflight ja existente:
  - autenticacao
  - autorizacao self/admin
  - carregamento do alvo por findUserByIdSelectAuthLockInfo(id)
  - ramo NOT_FOUND
  - envelope final de resposta
  - tratamento final de erro
- Apos carregar o user, statusUsuario delega ao owner service via statusUsuarioLockStateOwnerService({ user, now: new Date() }).
- O controller responde com o shape estrutural final:
  - success: true
  - data: result.data

## Semantica validada no owner service

- locked e calculado a partir de user.lock_until > now.
- seconds_remaining usa ceil da diferenca em segundos quando locked=true, ou 0 quando locked=false.
- minutes_remaining usa ceil sobre seconds_remaining quando locked=true, ou 0 quando locked=false.
- O bundle data retornado preserva:
  - id
  - email
  - role
  - failed_login_attempts com fallback para 0
  - lock_until com fallback para null
  - locked
  - seconds_remaining
  - minutes_remaining

## Evidencia executavel

- Suite dedicada: tests/gestor-usuarios-status-structural-seam.test.js
- Execucao focal validada: node --test .\tests\gestor-usuarios-status-structural-seam.test.js
- Resultado validado: 2 testes, 2 passes, 0 falhas

## Limite deliberado do checkpoint

- Este checkpoint nao revalida contrato HTTP publico, rota, middleware, autenticacao nem outros handlers do corredor de usuarios.
- O contrato runtime publico permanece congelado separadamente em docs/checkpoints/gestor-usuarios-status-runtime-contract.md.