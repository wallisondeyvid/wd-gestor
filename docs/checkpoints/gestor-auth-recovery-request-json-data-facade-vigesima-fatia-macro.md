# Checkpoint: Gestor Auth Recovery Request Json Data Facade Vigesima Fatia Macro

## Snapshot

- Branch: migration/refactor-core
- HEAD: 379c9ea
- Worktree: limpo antes da criacao deste checkpoint

## Familia consolidada

- Auth recovery request/list JSON

## Fronteira provada

- service -> data facade -> repository
- controller, rota e contrato HTTP permanecem preservados

## Arquivos do recorte

- src/modules/gestor/app/data/auth/passwordRecoveryRequestDataFacade.js
- src/modules/gestor/app/services/auth/passwordRecovery.service.js
- tests/gestor-auth-recovery-request-owner-structural-seam.test.js

## Guardrails preservados

- services do Gestor continuam sem importar repositories diretamente
- services do Gestor continuam sem importar usecases diretamente
- services do Gestor continuam sem importar db diretamente fora de legacy
- a seam publica do recovery request/list JSON permaneceu estavel com o teste focal preservando a delegacao do owner, o payload minimo de recovery por CPF e o status/body HTTP final

## Motivo de parada

- Esta vigesima fatia consolidou apenas a dependencia material remanescente da bridge no subcorredor JSON de recuperacao de senha, sem tocar em producao fora do recorte consolidado, testes adicionais, controller, rota, contrato HTTP, auth.db.js, compat layers adicionais ou repositories fora da fronteira provada.
- O service ficou apenas reroteado no helper de carga por CPF e na criacao do token de recovery para a facade dedicada, enquanto a nova facade concentrou somente as leituras canonicas de usuarios por CPF, fallback por funcionarios e a escrita canonica do password reset, preservando CPF invalido, nenhum usuario, multiplos usuarios, e-mail nao associado e o payload HTTP final esperado pelo owner.