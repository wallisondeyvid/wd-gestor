# Checkpoint: Gestor Auth Recovery Reset Render Data Facade Decima Nona Fatia Macro

## Snapshot

- Branch: migration/refactor-core
- HEAD: cb1be54
- Worktree: limpo antes da criacao deste checkpoint

## Familia consolidada

- Auth recovery reset render

## Fronteira provada

- service -> data facade -> repository
- controller, rota e contrato HTTP permanecem preservados

## Arquivos do recorte

- src/modules/gestor/app/data/auth/resetPasswordRenderDataFacade.js
- src/modules/gestor/app/services/auth/passwordRecovery.service.js
- tests/gestor-auth-recovery-reset-token-owner-structural-seam.test.js

## Guardrails preservados

- services do Gestor continuam sem importar repositories diretamente
- services do Gestor continuam sem importar usecases diretamente
- services do Gestor continuam sem importar db diretamente fora de legacy
- a seam publica do recovery reset render permaneceu estavel com o teste focal preservando a delegacao do owner, o payload minimo por token e o render HTTP final

## Motivo de parada

- Esta decima nona fatia consolidou a dependencia material remanescente da bridge apenas no subcorredor de render de reset de senha sem tocar em controller, rota, contrato HTTP, auth.db.js, compat layers adicionais, repositories fora do recorte ou suites adicionais.
- O service ficou apenas reroteado no subcorredor loadResetPasswordRenderModelService para a facade dedicada e a nova facade concentrou somente as leituras canonicas de password reset por token e nome do usuario por id, preservando token inexistente, token expirado, usuario inexistente e o view model final esperado pelo owner.