# Checkpoint: Gestor Feedback Status Patch Runtime Contract

## Snapshot

- corredor: PATCH /gestor/api/gestor/feedback/:feedbackId/status
- owner vivo: src/modules/gestor/app/controllers/feedbackStatusApiController.js
- borda: requireLogin -> seedFeedbackAdminUnitScopeFromAuthContext em src/modules/gestor/app/routes/feedbackApi.js
- service seam: src/modules/gestor/app/services/feedback/updateFeedbackStatus.service.js
- data facade: src/modules/gestor/app/data/feedback/feedbackStatusDataFacade.js
- suíte focal: tests/gestor-feedback-status-patch-runtime-contract.test.js
- execução validada: node --test .\tests\gestor-feedback-status-patch-runtime-contract.test.js

## Contrato runtime observado

- sem sessão: 401 JSON de não autenticado
- usuário não admin: 403 JSON Acesso negado antes da mutação
- admin contextual com unidade ativa correspondente ao feedback: 200 JSON e persistência real do novo status
- admin contextual com unidade ativa fora do escopo do feedback: 404 JSON Feedback não encontrado e nenhuma mutação persistida
- status inválido: 400 JSON Status inválido antes da mutação

## Tenant enforcement observado

- o PATCH canônico recebe unitScope contextualizado pela borda admin via auth context
- o owner propaga scopedUnitId para feedbackPolicy.ensureAdminAccess
- o owner chama a service seam apenas pelo caminho canônico PATCH
- a data facade valida o feedback existente contra scopedUnitId antes de executar a mutação final
- o alvo fora do escopo é traduzido para 404 no contrato público observado

## Fora do recorte

- o POST alias /gestor/api/gestor/feedback/:feedbackId/status foi preservado e permaneceu fora deste microcut
- widget, create, upload, listagem, detail, resposta e delete permaneceram fora deste recorte
- nenhum controller legado foi tocado

## Resultado do microcut

- o corredor PATCH canônico de status admin ficou congelado com prova runtime focal independente do contrato integrado grande
- produção permaneceu inalterada neste recorte
- o delta deste microcut ficou restrito a:
  - tests/gestor-feedback-status-patch-runtime-contract.test.js
  - docs/checkpoints/gestor-feedback-status-patch-runtime-contract.md