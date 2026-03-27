# Checkpoint: Gestor Widget Feedback PUT Structural Seam Runtime Contract

Data: 2026-03-26
Escopo: prova estrutural minima da nova costura de PUT /gestor/api/gestor/widgets/feedback
Suite focal: tests/gestor-widget-feedback-put-structural-seam-runtime-contract.test.js
Execucao focal: node --experimental-test-module-mocks --test .\tests\gestor-widget-feedback-put-structural-seam-runtime-contract.test.js

## Costura validada

- O owner updateFeedbackWidgetVisibility em src/modules/gestor/app/controllers/widgetSettingsApiController.js usa updateFeedbackWidgetVisibilityService como caminho principal do PUT.
- O owner preserva alias portal_morador, coerção atual de enabled, bustWidgetEnabledCache e shape HTTP atual do PUT.
- O service updateFeedbackWidgetVisibilityService em src/modules/gestor/app/services/widgetSettings/updateFeedbackWidgetVisibility.service.js faz upsert e readback direto via WidgetSettingWriteRepository em escopo global.

## Fora do escopo

- GET /gestor/api/gestor/widgets/modules
- GET /gestor/api/gestor/widgets/feedback
- bridge compat residual fora do caminho principal do PUT