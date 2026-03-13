# Recursos Unit Isolation Slice 1

## Objetivo encerrado

- Corrigir o contrato de isolamento por unidade no slice de Recursos, sem reabrir auth-context, middlewares, pages ou bridge ampla.

## Estado atual

- `POST /gestor/api/recursos` exige `unidade_id` explícito no body.
- `PUT /gestor/api/recursos/:id` exige `unidade_id` explícito no body.
- `GET /gestor/api/recursos` usa a unidade canônica apenas como âncora de escopo para montar o cluster acessível.
- `unidadeId` explícito dentro do escopo recorta a resposta.
- `unidadeId` fora do escopo retorna lista vazia.
- filtro de placa curta continua respeitado conforme contrato atual.

## Cobertura focal

- `tests/recurso.update.contract.test.js`
- `tests/recurso.unit-isolation.contract.test.js`

## Conclusão

- O slice de Recursos ficou coerente com o isolamento por unidade esperado.
- Novos patches nessa área só se justificam com repro concreta.
