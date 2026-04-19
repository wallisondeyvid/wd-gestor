# Checkpoint: Gestor Widget Feedback GET Runtime Contract

Data: 2026-04-19
Escopo: congelamento minimo e focal do corredor GET /gestor/api/gestor/widgets/feedback

## Corredor validado

- Montagem do subapp Gestor em /gestor via src/modules/gestor/app/gestor-app.js.
- Borda do corredor em src/modules/gestor/app/routes/widgetSettingsApi.js com GET /api/gestor/widgets/feedback protegido por requireLogin.
- Owner vivo em src/modules/gestor/app/controllers/widgetSettingsApiController.js via getFeedbackWidgetVisibility.
- Costura real de leitura em src/modules/gestor/app/services/widgetSettings/readFeedbackWidgetVisibility.service.js via readFeedbackWidgetVisibilityPayload.
- Persistencia real observada pelo service via src/modules/gestor/app/db/api.db.js -> findWidgetSettingsFeedbackLean -> src/modules/gestor/app/repositories/WidgetSettingWriteRepository.js.

## Contrato runtime observado

- 401 JSON sem sessao no GET canonico /gestor/api/gestor/widgets/feedback.
- 200 autenticado retornando ok=true e enabledByModule com defaults true para modulos conhecidos sem row persistida.
- Rows persistidas de widget=feedback sobrepoem os defaults por modulo.
- Alias de query portal_morador continua normalizado para portal-morador.
- Quando module aponta para modulo desconhecido, o corredor retorna 200 com enabled=true por default.
- Falha interna de leitura continua traduzida para 500 com ok=false, error='Erro ao carregar configuração do widget.' e success=false no shape HTTP final observado.

## Prova focal criada

- tests/gestor-widget-feedback-get-runtime-contract.test.js
- Execucao validada com node --test .\\tests\\gestor-widget-feedback-get-runtime-contract.test.js
- Resultado observado: 4 testes, 4 passes, 0 falhas.

## Necessidade de microcut em producao

- Nao houve necessidade real de microcut em logica de producao.
- A unica correcao ocorreu na propria prova focal para refletir o shape de erro 500 efetivamente observado no runtime final.

## Estado final

- O recorte ficou limpo para o alvo unico GET /gestor/api/gestor/widgets/feedback.
- A producao permaneceu inalterada nesta rodada.
- Nao houve expansao para PUT /gestor/api/gestor/widgets/feedback, GET /gestor/api/gestor/widgets/modules ou qualquer outra familia.