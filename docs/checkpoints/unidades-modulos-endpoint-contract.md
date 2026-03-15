## GET /gestor/api/unidades/:id/modulos

Status: checkpointado
Classificacao: MICRO_PASSO_SEGURO
Objetivo encerrado: congelar o contrato funcional minimo real do endpoint sem patch de producao.

## Caminho real

- Rota: src/modules/gestor/app/routes/unidadeApi.js
- Controller: src/modules/gestor/app/controllers/unidadeApiController.js -> getUnidadeModulos
- Autorizacao: ensureCanAccessUnidade
- Wrapper: src/modules/gestor/app/services/apiDbBridgeService.js -> src/modules/gestor/app/services/legacy/apiDbBridgeService.js -> src/modules/gestor/app/db/api.db.js
- Repository: src/modules/gestor/app/repositories/UnidadeReadRepository.js -> findUnidadeByIdWithModulosAcessiveisRepo

## Contrato minimo agora coberto

- Caso feliz acessivel: 200, success=true, data como array, itens com _id, nome e status.
- Unidade acessivel sem modulosAcessiveis: 200, success=true, data=[].
- Unidade inexistente apos login e contexto valido: 404, success=false, code=NOT_FOUND, message="Unidade não encontrada".
- Unidade fora do contexto ativo: 400, success=false, code=BAD_REQUEST, message="Acesso à unidade não autorizado".

## Cenarios congelados

- tests/gestor-auth-modulos-endpoint-context.test.js cobre o caso feliz e os tres cenarios adicionais do endpoint.
- node --test tests/gestor-auth-modulos-endpoint-context.test.js verde.
- node --test tests/gestor-unidades-*.test.js verde.
- npm run parity verde.

## Patch de producao

- Nenhum.
- Nenhum ajuste em controller, bridge, repository ou guardrails foi necessario.

## Conclusao

- O endpoint agora tem trilho funcional minimo suficiente.
- O objetivo desta rodada fica encerrado somente no escopo de contrato funcional do endpoint.