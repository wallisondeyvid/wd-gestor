# Checkpoint: Gestor Widget Feedback GET Read Service Structural Seam Runtime Contract

Data: 2026-04-13
Commit consolidado: e85a0d0
Escopo: microcorte estrito do GET /gestor/api/gestor/widgets/feedback

## Recorte executado

- O owner `getFeedbackWidgetVisibility` em `src/modules/gestor/app/controllers/widgetSettingsApiController.js` deixou de concentrar leitura/cache local.
- A leitura passou a delegar para `readFeedbackWidgetVisibilityPayload` em `src/modules/gestor/app/services/widgetSettings/readFeedbackWidgetVisibility.service.js`.
- O cache observável do GET foi preservado no novo corredor fino de leitura.

## Arquivos tocados

- `src/modules/gestor/app/controllers/widgetSettingsApiController.js`
- `src/modules/gestor/app/services/widgetSettings/readFeedbackWidgetVisibility.service.js`
- `tests/gestor-widget-feedback-get-owner-structural-seam.test.js`

## Contrato preservado

- A rota `src/modules/gestor/app/routes/widgetSettingsApi.js` permaneceu delegation-only.
- O GET preservou alias `portal_morador`, defaults por módulo, shape HTTP e tratamento de erro 500.
- O PUT não foi reaberto; permaneceu com o mesmo fluxo funcional observável.
- O freeze amplo de `tests/widgetSettings.contract.test.js` permaneceu compatível com o recorte.

## Motivo de parada

- O objetivo desta rodada era apenas desintermediar a leitura do GET com o menor blast radius possível.
- O restante do corredor de widget settings não justifica continuação imediata por inércia: `listWidgetModules` é resíduo pequeno e o PUT já está em costura própria.

## Próximo passo sugerido

- Sair de widget settings e reavaliar a próxima microfrente repository-first do Gestor a partir do HEAD limpo atual, em vez de continuar limpando este corredor por inércia.