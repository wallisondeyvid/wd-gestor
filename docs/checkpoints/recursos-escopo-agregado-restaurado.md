# Recursos - agregação por escopo restaurada

## Objetivo encerrado

- Restaurar o contrato efetivo de listagem de Recursos por escopo acessível.

## Estado atual

- `GET /gestor/api/recursos` sem `unidadeId` agrega os recursos do escopo acessível do diretor.
- O comportamento voltou a ficar coerente com a suíte de contrato de Recursos.
- O ajuste ficou restrito ao controller de Recursos.

## Arquivo alterado

- `src/modules/gestor/app/controllers/recursoApiController.js`

## Cobertura validada

- `node --test tests/recurso.unit-isolation.contract.test.js`
- `npm run parity`

## Conclusão

- O contrato de Recursos por escopo acessível foi restaurado e consolidado no branch.
- Novos ajustes nessa área só devem ocorrer com repro concreta.
