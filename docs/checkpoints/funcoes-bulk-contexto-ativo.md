# Funções Bulk Update - contexto ativo

## Objetivo encerrado

- Restringir o bulk update de Funções ao contexto ativo do request no Gestor.

## Estado atual

- `POST /gestor/api/funcoes/bulk-update` agora resolve o principal contextual uma vez e usa esse contexto no lookup por id.
- No caminho híbrido/single-db, funções fora do principal contextual retornam como não encontradas e não são alteradas.
- O comportamento foi validado por suíte focal.

## Arquivos alterados

- `src/modules/gestor/app/controllers/funcaoApiController.js`
- `tests/gestor-funcionarios-funcoes-unit-scope-canonical.test.js`

## Cobertura focal

- `node --test tests/gestor-funcionarios-funcoes-unit-scope-canonical.test.js`

## Conclusão

- O hotspot residual de bulk update em Funções saiu do estado híbrido frouxo e passou a respeitar o contexto ativo.
- Novos patches nessa área só se justificam com repro concreta.
