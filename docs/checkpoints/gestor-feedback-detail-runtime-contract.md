# Checkpoint: Gestor Feedback Detail Runtime Contract

## Snapshot

- corredor: GET /gestor/api/gestor/feedback/:feedbackId
- owner vivo: src/modules/gestor/app/controllers/feedbackDetailApiController.js
- borda: requireLogin -> seedFeedbackAdminUnitScopeFromAuthContext em src/modules/gestor/app/routes/feedbackApi.js
- costura real de leitura observada: owner -> findFeedbackByIdLean(access.feedbackQueryOptions) -> processAdminFeedbackDetailCore
- suíte focal: tests/gestor-feedback-detail-runtime-contract.test.js
- execução validada: node --test .\tests\gestor-feedback-detail-runtime-contract.test.js

## Contrato runtime observado

- sem sessão: 401 JSON de não autenticado
- usuário não admin: 403 JSON Acesso negado antes da leitura
- admin contextual com unidade ativa correspondente ao feedback: 200 JSON e normalização de resposta legada para string
- admin contextual com unidade ativa fora do escopo do feedback: 404 JSON Feedback não encontrado
- id malformado: 400 JSON ID inválido antes da leitura

## Tenant enforcement observado

- o GET canônico recebe unitScope contextualizado pela borda admin via auth context
- o owner propaga scopedUnitId para feedbackPolicy.ensureAdminAccess
- o owner lê o documento por findFeedbackByIdLean com access.feedbackQueryOptions
- o alvo fora do escopo é traduzido para 404 no contrato público observado
- o payload final passa por processAdminFeedbackDetailCore antes da resposta HTTP final

## Fora do recorte

- widget, create, upload, meus, listagem, status, resposta e delete permaneceram fora deste recorte
- qualquer compat/alias fora deste GET permaneceu preservado e fora do microcut
- nenhum controller legado foi tocado

## Resultado do microcut

- o corredor GET canônico de detail admin ficou congelado com prova runtime focal independente do contrato integrado grande
- a produção permaneceu inalterada neste recorte
- o delta deste microcut ficou restrito a:
  - tests/gestor-feedback-detail-runtime-contract.test.js
  - docs/checkpoints/gestor-feedback-detail-runtime-contract.md