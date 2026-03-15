## GET /gestor/api/modulos

Status: checkpointado
Classificacao: MICRO_PASSO_SEGURO consumido

## Objetivo encerrado

- Consolidar documentalmente o contrato minimo real de GET /gestor/api/modulos.
- Encerrar o micro-passo sem patch de producao, sem novo teste adicional e sem abrir CRUD de Modulos.

## Caminho canonico

- Caminho canonico: GET /gestor/api/modulos.
- Rota: src/modules/gestor/app/routes/moduloApi.js.
- Controller: src/modules/gestor/app/controllers/moduloApiController.js -> listarModulos.
- Autenticacao: requireLogin aplicado no router de Modulos.

## Estado atual

- O endpoint permanece em src/modules/gestor/app/routes/moduloApi.js com GET /api/modulos.
- O controller do endpoint permanece em src/modules/gestor/app/controllers/moduloApiController.js -> listarModulos.
- O endpoint usa requireLogin e nao adiciona requireUnitScope nessa rota.
- O contrato minimo agora esta congelado por teste focal proprio em tests/moduloApi.contract.test.js.
- Nao houve patch de producao.

## Contrato minimo agora congelado

- Sem sessao: 401 JSON com success=false, error="Não autenticado" e code="UNAUTHORIZED".
- Selecao pendente: 409 JSON com success=false, authenticated=true, error="Seleção de unidade pendente", code="GESTOR_SELECTION_REQUIRED", needsUnitSelection=true e redirect="/gestor/login?step=select".
- Sucesso minimo: 200 JSON com success=true, data como array e nomes coerentes com os modulos da unidade ativa.

## Cobertura validada

- Arquivo de teste: tests/moduloApi.contract.test.js.
- Cenarios congelados no teste focal proprio:
  - GET /gestor/api/modulos retorna 401 JSON sem sessao.
  - GET /gestor/api/modulos retorna 409 JSON com selecao pendente.
  - GET /gestor/api/modulos retorna sucesso minimo com modulos da unidade ativa.
- Execucao focal validada: node --test tests/moduloApi.contract.test.js.

## Conclusao

- GET /gestor/api/modulos agora tem contrato minimo real congelado por teste focal proprio.
- O corte desta rodada fecha apenas a lacuna de cobertura do endpoint.
- Nao houve alteracao em producao.
- Classificacao final: MICRO_PASSO_SEGURO consumido.