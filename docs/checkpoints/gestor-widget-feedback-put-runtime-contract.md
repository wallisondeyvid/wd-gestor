# Checkpoint: Gestor Widget Feedback PUT Runtime Contract

Data: 2026-04-19
Escopo: congelamento minimo e focal do corredor PUT /gestor/api/gestor/widgets/feedback

## Corredor validado

- Montagem do subapp Gestor em /gestor via src/modules/gestor/app/gestor-app.js.
- Borda do corredor em src/modules/gestor/app/routes/widgetSettingsApi.js com PUT /api/gestor/widgets/feedback protegido por requireLogin e requireRole(['admin'], { allowMasterImplicit: true }).
- Owner vivo em src/modules/gestor/app/controllers/widgetSettingsApiController.js via updateFeedbackWidgetVisibility.
- Costura real de escrita em src/modules/gestor/app/services/widgetSettings/updateFeedbackWidgetVisibility.service.js via updateFeedbackWidgetVisibilityService.
- Persistencia real observada pelo service via src/modules/gestor/app/db/api.db.js -> updateWidgetSettingsFeedbackModuleEnabledUpsert / findWidgetSettingsFeedbackLean -> src/modules/gestor/app/repositories/WidgetSettingWriteRepository.js.

## Contrato runtime observado

- 401 JSON sem sessao no PUT canonico /gestor/api/gestor/widgets/feedback.
- 403 JSON para usuario autenticado sem role admin/master.
- 400 com erro de validacao quando module esta ausente.
- 400 com erro de validacao quando module nao pertence a lista conhecida.
- 200 autenticado como admin preservando alias portal_morador, coerção atual de enabled via !!req.body?.enabled e readback final enabledByModule.
- A escrita real persiste row widget=feedback/module=portal-morador com enabled=true quando o payload envia enabled='false', preservando o contrato atual do owner.
- 500 quando a escrita interna falha no caminho real de upsert.

## Prova focal criada

- tests/gestor-widget-feedback-put-runtime-contract.test.js
- Execucao validada com node --test .\\tests\\gestor-widget-feedback-put-runtime-contract.test.js
- Resultado observado: 6 testes, 6 passes, 0 falhas.

## Necessidade de microcut em producao

- Nao houve necessidade real de microcut em logica de producao.
- O corredor ja comportava um freeze focal limpo no estado atual.

## Estado final

- O recorte ficou limpo para o alvo unico PUT /gestor/api/gestor/widgets/feedback.
- A producao permaneceu inalterada nesta rodada.
- Nao houve expansao para GET /gestor/api/gestor/widgets/feedback, GET /gestor/api/gestor/widgets/modules ou qualquer outra familia.