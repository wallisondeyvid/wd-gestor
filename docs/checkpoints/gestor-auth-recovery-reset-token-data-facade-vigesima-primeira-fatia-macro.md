# Checkpoint: Gestor Auth Recovery Reset Token Data Facade Vigesima Primeira Fatia Macro

## Snapshot

- Branch: migration/refactor-core
- HEAD: f425431
- Worktree: limpo antes da criacao deste checkpoint

## Familia consolidada

- Auth recovery reset token

## Fronteira provada

- service -> data facade -> repository
- controller, rota e contrato HTTP permanecem preservados

## Arquivos do recorte

- src/modules/gestor/app/data/auth/resetPasswordExecutionDataFacade.js
- src/modules/gestor/app/services/auth/passwordRecovery.service.js
- tests/gestor-auth-recovery-reset-token-owner-structural-seam.test.js

## Guardrails preservados

- services do Gestor continuam sem importar repositories diretamente
- services do Gestor continuam sem importar usecases diretamente
- services do Gestor continuam sem importar db diretamente fora de legacy
- a seam publica do recovery reset token permaneceu estavel com o teste focal preservando a delegacao do owner, o payload minimo de reset por token e o render HTTP final

## Motivo de parada

- Esta vigesima primeira fatia consolidou apenas a dependencia material remanescente da bridge no subcorredor de reset por token, sem tocar em producao fora do recorte consolidado, testes adicionais, controller, rota, contrato HTTP, auth.db.js, compat layers adicionais ou repositories fora da fronteira provada.
- O service ficou apenas reroteado em resetPasswordByTokenService para a facade dedicada, enquanto a nova facade concentrou somente a leitura canonica do password reset por token, a leitura canonica do usuario por id, a escrita explicita da nova senha e a remocao canonica do token apos sucesso, preservando token invalido, token expirado, usuario inexistente, falha de persistencia e o sucesso final esperado pelo owner.