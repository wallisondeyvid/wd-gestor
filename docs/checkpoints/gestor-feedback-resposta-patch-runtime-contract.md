# Checkpoint: Gestor Feedback Resposta Patch Runtime Contract

## Snapshot

- corredor: PATCH /gestor/api/gestor/feedback/:feedbackId/resposta
- owner vivo: src/modules/gestor/app/controllers/feedbackRespostaApiController.js
- borda: requireLogin -> seedFeedbackAdminUnitScopeFromAuthContext em src/modules/gestor/app/routes/feedbackApi.js
- costura de persistência observada: owner -> processUpdateFeedbackRespostaCore -> findFeedbackByIdAndUpdateSetNewLean injetado pela rota
- suíte focal: tests/gestor-feedback-resposta-patch-runtime-contract.test.js
- execução validada: node --test .\tests\gestor-feedback-resposta-patch-runtime-contract.test.js

## Contrato runtime observado

- sem sessão: 401 JSON de não autenticado
- usuário não admin: 403 JSON Acesso negado antes da mutação
- admin contextual com unidade ativa correspondente ao feedback: 200 JSON, persistência real da resposta e transição para status respondido
- admin contextual com unidade ativa fora do escopo do feedback: 404 JSON Feedback não encontrado e nenhuma mutação persistida
- resposta em branco: 200 JSON com normalização para string vazia e preservação do status novo
- resposta acima do limite: 400 JSON Resposta deve ter no máximo 4000 caracteres antes da mutação

## Tenant enforcement observado

- o PATCH canônico recebe unitScope contextualizado pela borda admin via auth context
- o owner propaga scopedUnitId para feedbackPolicy.ensureAdminAccess
- o owner encapsula a mutação final passando access.feedbackMutationOptions para o mutador injetado
- o alvo fora do escopo é traduzido para 404 no contrato público observado

## Fora do recorte

- o POST alias /gestor/api/gestor/feedback/:feedbackId/resposta foi preservado e permaneceu fora deste microcut
- widget, create, upload, meus, listagem, detail, status e delete permaneceram fora deste recorte
- nenhum controller legado foi tocado

## Resultado do microcut

- o corredor PATCH canônico de resposta admin ficou congelado com prova runtime focal independente do contrato integrado grande
- a produção permaneceu inalterada neste recorte
- o delta deste microcut ficou restrito a:
  - tests/gestor-feedback-resposta-patch-runtime-contract.test.js
  - docs/checkpoints/gestor-feedback-resposta-patch-runtime-contract.md