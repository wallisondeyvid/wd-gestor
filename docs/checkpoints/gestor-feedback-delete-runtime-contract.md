# Checkpoint: Gestor Feedback Delete Runtime Contract

## Snapshot

- corredor: DELETE /gestor/api/gestor/feedback/:feedbackId
- owner vivo: src/modules/gestor/app/controllers/feedbackDeleteApiController.js
- borda: requireLogin -> seedFeedbackAdminUnitScopeFromAuthContext em src/modules/gestor/app/routes/feedbackApi.js
- costura real de mutação observada: owner -> findFeedbackByIdAndDeleteLean(access.feedbackMutationOptions) -> processFeedbackDeleteCleanupCore
- suíte focal: tests/gestor-feedback-delete-runtime-contract.test.js
- execução validada: node --test .\tests\gestor-feedback-delete-runtime-contract.test.js

## Contrato runtime observado

- sem sessão: 401 JSON de não autenticado
- usuário não admin: 403 JSON Acesso negado antes da mutação
- admin contextual com unidade ativa correspondente ao feedback: 200 JSON, deleted=true e remoção real do documento
- admin contextual com unidade ativa fora do escopo do feedback: 404 JSON Feedback não encontrado e preservação do documento
- id malformado: 400 JSON ID inválido antes da mutação

## Tenant enforcement observado

- o DELETE canônico recebe unitScope contextualizado pela borda admin via auth context
- o owner propaga scopedUnitId para feedbackPolicy.ensureAdminAccess
- o owner executa a mutação principal por findFeedbackByIdAndDeleteLean com access.feedbackMutationOptions
- o alvo fora do escopo é traduzido para 404 no contrato público observado
- o cleanup técnico roda apenas após o delete principal por processFeedbackDeleteCleanupCore

## Fora do recorte

- o POST alias /gestor/api/gestor/feedback/:feedbackId foi preservado e permaneceu fora deste microcut
- widget, create, upload, meus, listagem, status, resposta e detail permaneceram fora deste recorte
- nenhum controller legado foi tocado

## Resultado do microcut

- o corredor DELETE canônico admin ficou congelado com prova runtime focal independente do contrato integrado grande
- a produção permaneceu inalterada neste recorte
- o delta deste microcut ficou restrito a:
  - tests/gestor-feedback-delete-runtime-contract.test.js
  - docs/checkpoints/gestor-feedback-delete-runtime-contract.md