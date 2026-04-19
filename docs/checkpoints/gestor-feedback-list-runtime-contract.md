# Checkpoint: Gestor Feedback List Runtime Contract

## Snapshot

- corredor: GET /gestor/api/gestor/feedback
- owner vivo: src/modules/gestor/app/controllers/feedbackListApiController.js
- borda: requireLogin -> seedFeedbackAdminUnitScopeFromAuthContext em src/modules/gestor/app/routes/feedbackApi.js
- costura real de leitura observada: owner -> processAdminFeedbackListFilterCore -> findFeedbackByFilterSortCreatedAtDescLimit500Lean(access.feedbackQueryOptions) -> sanitizeFeedback
- suíte focal: tests/gestor-feedback-list-runtime-contract.test.js
- execução validada: node --test .\tests\gestor-feedback-list-runtime-contract.test.js

## Contrato runtime observado

- sem sessão: 401 JSON de não autenticado
- usuário não admin: 403 JSON Acesso negado antes da leitura
- admin contextual com unidade ativa correspondente ao feedback: 200 JSON, listagem restrita à unidade ativa e sanitização de resposta legada para string
- filtro de tipo com entrada normalizada: 200 JSON restrito ao tipo esperado
- tipo inválido: 400 JSON Tipo inválido antes da consulta final
- filtro de status com entrada normalizada: 200 JSON restrito ao status esperado
- status inválido: 400 JSON Status inválido antes da consulta final

## Tenant enforcement observado

- o GET canônico recebe unitScope contextualizado pela borda admin via auth context
- o owner propaga scopedUnitId para feedbackPolicy.ensureAdminAccess
- o owner executa a consulta final por findFeedbackByFilterSortCreatedAtDescLimit500Lean com access.feedbackQueryOptions
- a listagem pública observada respeita a unidade ativa do admin contextual
- o payload final passa por sanitizeFeedback item a item antes da resposta HTTP final

## Fora do recorte

- widget, create, upload, meus, detail, status, resposta e delete permaneceram fora deste recorte
- qualquer compat/alias fora deste GET permaneceu preservado e fora do microcut
- nenhum controller legado foi tocado

## Resultado do microcut

- o corredor GET canônico de listagem admin ficou congelado com prova runtime focal independente do contrato integrado grande
- a produção permaneceu inalterada neste recorte
- o delta deste microcut ficou restrito a:
  - tests/gestor-feedback-list-runtime-contract.test.js
  - docs/checkpoints/gestor-feedback-list-runtime-contract.md