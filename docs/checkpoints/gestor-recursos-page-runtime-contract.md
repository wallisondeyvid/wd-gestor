# Checkpoint: Gestor Recursos Page Runtime Contract

## Escopo

- caracterizacao runtime conservadora de GET /gestor/recursos
- suite focal: tests/gestor-recursos-page-runtime-contract.test.js
- execucao focal: node --test .\tests\gestor-recursos-page-runtime-contract.test.js

## Corredor congelado

- borda viva: GET /gestor/recursos em src/modules/gestor/app/routes/pagesRouter.js
- owner vivo: paginaRecursos em src/modules/gestor/app/controllers/views/pagesController.js
- bundle inicial: loadPaginaRecursosBundle em src/modules/gestor/app/services/recursos/loadPaginaRecursosBundle.service.js
- costura de persistencia do bundle: recursosPageBundleDataFacade em src/modules/gestor/app/data/recursos/recursosPageBundleDataFacade.js

## Contrato runtime observado

- sem sessao, GET /gestor/recursos termina em 200 HTML da tela de login por interceptacao publica do redirect
- com usuario nao privilegiado e unidade contextual ativa, a pagina renderiza 200 HTML e expoe apenas a unidade contextual atual no select inicial
- com usuario privilegiado sem unidade contextual efetiva, o corredor vivo para na borda com 400 JSON { success: false, error: 'UNIDADE_ID_REQUIRED' }
- isso confirma que o fallback privilegiado global existente no owner bundle nao e alcancado por esta borda viva nas condicoes testadas
- com banco indisponivel e sessao/contexto validos, a pagina preserva render 200 HTML com fallback observavel e sem unidades carregadas

## Prova ja existente preservada

- a costura estrutural service -> data facade -> repository do bundle ja estava congelada em docs/checkpoints/gestor-recursos-page-bundle-data-facade-segunda-fatia-macro.md
- este recorte nao reabre GET /gestor/api/recursos nem qualquer outro endpoint CRUD da familia Recursos

## Delta desta rodada

- nova suite runtime focal da pagina: tests/gestor-recursos-page-runtime-contract.test.js
- novo checkpoint focal: docs/checkpoints/gestor-recursos-page-runtime-contract.md
- producao inalterada

## Classificacao conservadora

- GET /gestor/recursos fica consolidado no nivel de contrato runtime da borda viva e do fallback observavel da pagina