## GET /gestor/api/unidades/cluster

Status: checkpointado
Classificacao: MICRO_PASSO_SEGURO consumido

## Objetivo encerrado

- Consolidar documentalmente o contrato minimo real de GET /gestor/api/unidades/cluster no caminho montado atual do app.
- Encerrar o micro-passo sem patch de producao, sem novo teste adicional e sem abrir outra frente.

## Caminho canonico

- Caminho canonico: GET /gestor/api/unidades/cluster.
- Mount real: src/modules/gestor/app/gestor-app.js monta apiRouter antes de miscApiRouter, entao o caminho publico bate primeiro em src/modules/gestor/app/routes/api.js.
- Rota viva montada: src/modules/gestor/app/routes/api.js -> router.get('/api/unidades/cluster', withLoginAndRequiredUnitScope(unidadesCluster)).
- Controller vivo: src/modules/gestor/app/controllers/apiController.js -> unidadesCluster.
- Este checkpoint registra apenas o caminho montado real do app.

## Estado atual

- O endpoint publico permanece exposto pelo mount real em src/modules/gestor/app/gestor-app.js.
- O handler efetivo do caminho publico permanece em src/modules/gestor/app/controllers/apiController.js -> unidadesCluster.
- O caminho publico passa por requireLogin e requireUnitScope antes de chegar ao handler.
- O contrato minimo agora esta congelado por suite focal propria em tests/unidadesCluster.contract.test.js.
- Nao houve patch de producao.

## Contrato minimo agora congelado

- Sem sessao: 401 JSON com success=false, error="Não autenticado" e code="UNAUTHORIZED".
- unidade_id ausente: 400 JSON com ok=false, error="Parametro unidade_id ausente" e success=false.
- Dentro do contexto ativo: 200 JSON com ok=true, total coerente e unidades no topo do body.
- Fora do contexto ativo: 200 JSON com ok=true, total=0 e unidades=[].

## Cobertura validada

- Arquivo de teste: tests/unidadesCluster.contract.test.js.
- Suite focal propria do caminho montado real:
  - GET /gestor/api/unidades/cluster retorna 401 sem sessao.
  - GET /gestor/api/unidades/cluster retorna 400 com unidade_id ausente.
  - GET /gestor/api/unidades/cluster retorna 200 dentro do contexto ativo com ok, total e unidades no topo.
  - GET /gestor/api/unidades/cluster retorna 200 fora do contexto ativo com lista vazia.
- O checkpoint registra apenas fatos ja validados no caminho montado real do app.

## Conclusao

- GET /gestor/api/unidades/cluster tem contrato minimo real congelado no caminho montado atual do app.
- O corte desta rodada permanece estritamente documental.
- Nao houve alteracao em producao.
- Classificacao final: MICRO_PASSO_SEGURO consumido.