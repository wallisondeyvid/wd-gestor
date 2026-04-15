# Checkpoint: Gestor Auth Login Pre-Auth Gate Data Facade Vigesima Segunda Fatia Macro

## Snapshot

- Branch: migration/refactor-core
- HEAD: 40928f0
- Worktree: limpo antes da criacao deste checkpoint

## Familia consolidada

- Auth login pre-auth gate

## Fronteira provada

- service -> data facade -> repository

## Arquivos do recorte

- src/modules/gestor/app/data/auth/loginPreAuthGateDataFacade.js
- src/modules/gestor/app/services/auth/evaluateLoginPreAuthGate.service.js
- tests/gestor-auth-login-pre-auth-gate-structural-seam.test.js

## Guardrails preservados

- services do Gestor continuam sem importar repositories diretamente
- services do Gestor continuam sem importar usecases diretamente
- services do Gestor continuam sem importar db diretamente fora de legacy
- o owner permanece delegando o gate pre-auth ao service dedicado, e a fronteira publica do login segue preservada antes da abertura de sessao

## Motivo de parada

- Esta vigesima segunda fatia consolidou apenas a dependencia material remanescente do login pre-auth gate, sem tocar em producao fora do recorte, testes adicionais, controller, rota, contrato HTTP, auth.db.js, compat layers ou repositories fora da fronteira provada.
- O service ficou apenas reroteado para a facade dedicada, enquanto a nova facade concentrou somente a leitura canonica do usuario por email para login e a persistencia explicita do estado de lockout via repository, preservando usuario inexistente, usuario suspenso, bloqueio ativo, senha incorreta, reset de bloqueio expirado, reset final apos sucesso e bypass de master.