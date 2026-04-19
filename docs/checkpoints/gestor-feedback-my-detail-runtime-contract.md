# Checkpoint: Gestor Feedback My Detail Runtime Contract

## Snapshot

- corredor: GET /gestor/api/feedback/meus/:feedbackId
- owner vivo: src/modules/gestor/app/controllers/feedbackMyDetailApiController.js
- borda: requireLogin -> requireUnitScope em src/modules/gestor/app/routes/feedbackApi.js
- costura real de leitura observada: owner -> findFeedbackByIdLean({ scopedUnitId, allowLegacyUnscoped: true }) -> feedbackPolicy.ensureCreatorOwnership
- suíte focal: tests/gestor-feedback-my-detail-runtime-contract.test.js
- execução validada: node --test .\tests\gestor-feedback-my-detail-runtime-contract.test.js

## Contrato runtime observado

- sem sessão: 401 JSON de não autenticado
- criador contextual na unidade ativa do feedback: 200 JSON com o documento do próprio usuário
- feedback do mesmo criador fora da unidade ativa: 404 JSON Feedback não encontrado
- feedback inexistente: 404 JSON Feedback não encontrado
- id malformado: 400 JSON ID inválido antes da leitura

## Tenant enforcement observado

- o GET canônico widget recebe unitScope pela borda requireUnitScope
- o owner propaga scopedUnitId para findFeedbackByIdLean com allowLegacyUnscoped=true
- o owner executa a verificação de ownership apenas após a leitura contextual do documento
- o alvo fora da unidade ativa é traduzido para 404 no contrato público observado

## Fora do recorte

- create, upload, meus list, status, resposta, list admin, detail admin e delete admin permaneceram fora deste recorte
- nenhum alias POST foi aberto neste microcut
- nenhum controller legado foi tocado

## Resultado do microcut

- o corredor GET canônico widget detail ficou congelado com prova runtime focal independente do contrato integrado grande
- a produção permaneceu inalterada neste recorte
- o delta deste microcut ficou restrito a:
  - tests/gestor-feedback-my-detail-runtime-contract.test.js
  - docs/checkpoints/gestor-feedback-my-detail-runtime-contract.md