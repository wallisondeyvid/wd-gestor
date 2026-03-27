# Checkpoint — Feedback status PATCH structural seam

Data: 2026-03-27.

Escopo validado:
- o owner do recorte continua em [src/modules/gestor/app/routes/feedbackApi.js](src/modules/gestor/app/routes/feedbackApi.js)
- o PATCH canônico /gestor/api/gestor/feedback/:feedbackId/status permanece registrado e injeta a nova service `updateFeedbackStatusService`
- o POST alias da mesma URL permanece registrado no caminho legado com `findFeedbackByIdAndUpdateSetNewLean`
- a service [src/modules/gestor/app/services/feedback/updateFeedbackStatus.service.js](src/modules/gestor/app/services/feedback/updateFeedbackStatus.service.js) delega para `findFeedbackByIdAndUpdateSetNewLeanRepo` com `createUnitScope({})`

Prova executável:
- [tests/gestor-feedback-status-patch-structural-seam.test.js](tests/gestor-feedback-status-patch-structural-seam.test.js)
- execução isolada esperada: `node --experimental-test-module-mocks --test .\tests\gestor-feedback-status-patch-structural-seam.test.js`

Não validado por este checkpoint:
- comportamento funcional público além do já coberto por [tests/feedbackApi.contract.test.js](tests/feedbackApi.contract.test.js)
- fluxos de resposta, delete, upload/anexo, create, GET admin, GET meus feedbacks ou detalhe
- qualquer alteração em produção, `api.db.js`, testes antigos ou checkpoints antigos