# Checkpoint: Gestor Feedback My List Runtime Contract

## Snapshot

- corredor: GET /gestor/api/feedback/meus
- owner vivo: src/modules/gestor/app/controllers/feedbackMyListApiController.js
- borda: requireLogin -> requireUnitScope em src/modules/gestor/app/routes/feedbackApi.js
- costura real de leitura observada: owner -> feedbackPolicy.buildMyFeedbackFilter({ currentUser, scopedUnitId }) -> findFeedbackByFilterSortCreatedAtDescLimit200Lean(filter)
- suíte focal: tests/gestor-feedback-my-list-runtime-contract.test.js
- execução validada: node --test .\tests\gestor-feedback-my-list-runtime-contract.test.js

## Contrato runtime observado

- sem sessão: 401 JSON de não autenticado
- criador na unidade ativa: 200 JSON com array em data
- feedback do criador na unidade ativa aparece na listagem
- feedback de outro usuário na mesma unidade ativa não aparece
- feedback do mesmo criador fora da unidade ativa não aparece
- feedback legado do mesmo criador sem unidade_id permanece visível no contrato atual

## Tenant enforcement observado

- o GET canônico widget recebe unitScope pela borda requireUnitScope
- o owner delega a montagem do filtro para feedbackPolicy.buildMyFeedbackFilter
- a policy combina ownership do criador com unidade ativa e fallback legado para unidade_id ausente ou nulo
- o owner executa a leitura por findFeedbackByFilterSortCreatedAtDescLimit200Lean(filter) sem options adicionais
- no runtime atual, o isolamento observável do corredor fica preservado pelo filtro produzido na policy

## Fora do recorte

- create, upload, status, resposta, detail admin, list admin e delete admin permaneceram fora deste recorte
- GET /gestor/api/feedback/meus/:feedbackId permaneceu fechado e não foi reaberto
- nenhum alias POST foi aberto neste microcut
- nenhum controller legado foi tocado

## Resultado do microcut

- o corredor GET canônico widget list ficou congelado com prova runtime focal independente do contrato integrado grande
- a produção permaneceu inalterada neste recorte
- o delta deste microcut ficou restrito a:
  - tests/gestor-feedback-my-list-runtime-contract.test.js
  - docs/checkpoints/gestor-feedback-my-list-runtime-contract.md