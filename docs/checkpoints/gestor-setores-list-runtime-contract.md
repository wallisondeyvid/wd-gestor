# Checkpoint: Gestor Setores List Runtime Contract

Data: 2026-04-19

## Escopo congelado

- GET /gestor/api/setores

Sem reabrir:

- GET /gestor/api/setores/unidade/:unidadeId
- GET /gestor/api/setores/:id
- POST /gestor/api/setores
- PUT /gestor/api/setores/:id
- DELETE /gestor/api/setores/:id
- endpoints de debug
- frontend

## Arquivos focais

- Produção: src/modules/gestor/app/controllers/setorApiController.js
- Produção: src/modules/gestor/app/controllers/utils/listSetoresCore.js
- Suite: tests/gestor-setores-list-runtime-contract.test.js
- Suite: tests/gestor-setores-list-owner-structural-seam.test.js
- Guardrail associado: tests/gestor-setor-recurso-unit-scope-canonical.test.js

## Winner runtime congelado

- No caminho montado real, GET /gestor/api/setores exige unitScope canônico para usuário não privilegiado antes de alcançar o owner.
- Dentro do owner, a decisão de escopo material da listagem fica separada do enriquecimento de payload.
- Quando existe unitScope canônico, a listagem nasce integralmente de req.unitScope.unidadeId.
- query unidade_id só permanece como filtro material no ramo privilegiado sem contexto canônico.
- listSetoresCore permanece restrito ao enriquecimento do payload da lista, incluindo unidade_nome, unidade_label e unidade_id_raw.

## Contrato observado

- Diretor sem contexto canônico ativo no caminho montado real recebe 400 com error = UNIDADE_ID_REQUIRED.
- Diretor com unitScope ativo recebe apenas setores da unidade canônica atual.
- Admin sem contexto canônico pode continuar usando unidade_id pela query sem competir com o caminho canônico do corredor principal.
- Falhas externas relevantes continuam colapsando em 500 com envelope padronizado.

## Conclusão

- O microeixo de listagem agora fica endurecido com unitScope como fonte autoritativa no winner runtime do caminho montado real.
- A decisão de escopo material foi isolada do enriquecimento de payload sem alterar o contrato público observado.