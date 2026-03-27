# Checkpoint: Gestor Auth Primeiro Acesso Post Structural Seam

Data: 2026-03-27
Escopo: prova estrutural minima da nova costura de POST /gestor/primeiroacesso
Suite focal: tests/gestor-auth-primeiro-acesso-post-structural-seam.test.js
Execucao focal: node --experimental-test-module-mocks --test .\tests\gestor-auth-primeiro-acesso-post-structural-seam.test.js

## Costura validada

- O owner primeiroAcessoPost em [src/modules/gestor/app/controllers/authController.js](src/modules/gestor/app/controllers/authController.js) continua dono do contrato publico e encaminha o miolo mutacional para primeiroAcessoExecutionService.
- O owner preserva o mapeamento estrutural minimo dos resultados do service fino para os redirects publicos do recorte, incluindo not_found e save_failed.
- O service [src/modules/gestor/app/services/auth/primeiroAcessoExecution.service.js](src/modules/gestor/app/services/auth/primeiroAcessoExecution.service.js) consulta o usuario via findUserByIdRepo com escopo global, aplica a mutacao de primeiro acesso no documento e persiste pelo proprio save do documento.

## Matriz coberta pela suite

- o owner encaminha userId, senhaHash e maxTimeMS ao service fino no caminho feliz
- o owner preserva os redirects estruturais minimos para not_found e save_failed
- o service consulta o repositorio real esperado em escopo global e usa maxTimeMS quando disponivel
- o service nao tenta salvar quando o primeiro acesso ja foi concluido
- o service retorna save_failed quando o save do documento falha

## Limite desta prova

- esta suite nao revalida o contrato funcional ja congelado em [tests/gestor-auth-primeiro-acesso-post-runtime-contract.test.js](tests/gestor-auth-primeiro-acesso-post-runtime-contract.test.js)
- esta suite nao reabre login, logout, auth/context, select-unit, switch-unit, reset-password, esqueci-senha, remember-me, lockout, biometria ou debug
- esta suite nao toca em [src/modules/gestor/app/db/auth.db.js](src/modules/gestor/app/db/auth.db.js)

## Decisao final

- A nova costura estrutural owner -> service -> repository/save de POST /gestor/primeiroacesso ficou validada localmente neste microcorte