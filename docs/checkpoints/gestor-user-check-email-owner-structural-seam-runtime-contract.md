# Checkpoint: Gestor User Check Email Owner Structural Seam Runtime Contract

Data: 2026-03-27
Escopo: prova estrutural minima da nova costura controller -> service read-only de GET /gestor/api/usuarios/check-email entre [src/modules/gestor/app/controllers/userController.js](src/modules/gestor/app/controllers/userController.js) e [src/modules/gestor/app/services/usuarios/checkUsuarioEmailOwner.service.js](src/modules/gestor/app/services/usuarios/checkUsuarioEmailOwner.service.js)
Suite focal: [tests/gestor-user-check-email-owner-structural-seam.test.js](tests/gestor-user-check-email-owner-structural-seam.test.js)
Execucao focal: node --test .\tests\gestor-user-check-email-owner-structural-seam.test.js

## Costura validada

- o owner [checkUsuarioEmail](src/modules/gestor/app/controllers/userController.js) passou a delegar o miolo semantico read-only para [src/modules/gestor/app/services/usuarios/checkUsuarioEmailOwner.service.js](src/modules/gestor/app/services/usuarios/checkUsuarioEmailOwner.service.js)
- o controller preserva o shape estrutural do payload publico final no caminho feliz
- o service preserva os dois ramos semanticos `exists=false` e `exists=true`

## Matriz coberta pela suite

- delegacao do controller ao novo service owner com e-mail normalizado
- preservacao estrutural do payload final com `exists`, `membershipsSummary`, `linkedUnidadeIds` e `blockedUnidadeIds`
- ramo `exists=false` sem lookup adicional de memberships e unidades
- ramo `exists=true` com lookups de memberships e unidades e resumo semantico coerente

## Limite desta prova

- esta suite nao reabre toggle, delete, create, update, statusUsuario, unlockUsuario ou obterUsuarioAtual
- esta suite nao reabre rota, middleware, autenticacao ou contrato HTTP amplo do endpoint
- esta suite nao substitui a cobertura funcional existente de [tests/gestor-user-check-email.test.js](tests/gestor-user-check-email.test.js)

## Decisao final

- a nova costura controller -> service de `checkUsuarioEmail` ficou validada estruturalmente neste recorte
- com essa prova, o primeiro patch minimo desta frente no owner read-only de check-email atinge congelamento intermediario