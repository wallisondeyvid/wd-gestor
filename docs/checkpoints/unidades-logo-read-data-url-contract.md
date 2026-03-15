## GET /gestor/api/unidades/:id/logo

Status: checkpointado
Classificacao: MICRO_PASSO_SEGURO

## Objetivo encerrado

- Congelar o ramo acessivel por Data URL de GET /gestor/api/unidades/:id/logo.
- Consolidar a prova positiva minima sem tocar em producao.

## Estado atual

- A rota do endpoint permanece em src/modules/gestor/app/routes/unidadeApi.js.
- O controller do endpoint permanece em src/modules/gestor/app/controllers/unidadeApiController.js -> getUnidadeLogo.
- O helper contextual usado pelo fluxo continua sendo ensureCanAccessUnidade.
- O bloqueio fora do contexto ativo ja existia e permanece coberto em tests/gestor-unidades-writes-misc-unit-scope-canonical.test.js.
- Agora existe tambem prova positiva minima do ramo Data URL acessivel no mesmo arquivo de testes.
- O contrato observado nesse ramo ficou congelado como: status 200, content-type coerente com a Data URL usada e corpo binario nao vazio.
- Nao houve patch em producao.

## Arquivo alterado

- tests/gestor-unidades-writes-misc-unit-scope-canonical.test.js

## Cobertura validada

- node --test --test-name-pattern "GET /gestor/api/unidades/:id/logo retorna binario de Data URL para unidade acessivel" tests/gestor-unidades-writes-misc-unit-scope-canonical.test.js

## Conclusao

- O ramo Data URL acessivel de GET /gestor/api/unidades/:id/logo ficou congelado.
- O endpoint agora possui prova negativa de bloqueio fora do contexto e prova positiva minima de leitura acessivel por Data URL.
- Nenhum ajuste em controller, bridge, repository ou upload foi necessario.
- Novos ajustes nessa area so devem ocorrer com repro concreta.