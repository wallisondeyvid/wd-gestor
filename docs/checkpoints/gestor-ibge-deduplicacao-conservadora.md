# Diagnóstico objetivo
O corredor sombreado de IBGE em miscApi foi removido do wiring sem alterar o contrato externo vencedor de GET /gestor/api/ibge. Classificação: DEDUPLICACAO_CONSERVADORA_SEM_MUDANCA_DE_CONTRATO.

---

## Recorte aplicado
- removida a rota /ibge de src/modules/gestor/app/routes/miscApi.js
- preservado o controller alternativo em src/modules/gestor/app/controllers/miscApiController.js
- preservado o corredor /unidades/cluster em miscApi
- preservado o vencedor runtime externo em src/modules/gestor/app/routes/api.js

## Justificativa
- apiRouter continua montado antes de miscApiRouter em src/modules/gestor/app/gestor-app.js
- o contrato runtime vencedor de GET /gestor/api/ibge já estava congelado
- não apareceu consumidor real do comportamento alternativo sombreado

## Provas focais
- tests/gestor-ibge-runtime-contract.test.js
- tests/gestor-ibge-misc-router-structural.test.js
- tests/miscApi.test.js

## Conclusão
- o contrato externo vencedor permaneceu inalterado
- a duplicação no wiring foi reduzida
- nenhum front foi alterado