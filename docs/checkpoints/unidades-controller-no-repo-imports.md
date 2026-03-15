# Unidades controller - sem imports diretos de repository

## Objetivo encerrado

- Remover imports diretos de repository em `unidadeApiController.js`.
- Reaproveitar apenas fachadas permitidas pela arquitetura atual.

## Estado atual

- `unidadeApiController.js` não importa mais `UnidadeReadRepository` diretamente.
- O controller passou a usar wrappers já expostos pela fachada permitida.
- Guardrail estrutural correspondente ficou verde.
- Validação funcional focal e parity permaneceram verdes.

## Arquivo alterado

- `src/modules/gestor/app/controllers/unidadeApiController.js`

## Cobertura validada

- `node --test tests/architecture/no-repository-imports-in-gestor-controllers.test.js`
- `node --test tests/gestor-setor-recurso-unit-scope-canonical.test.js`
- `npm run parity`

## Conclusão

- O slice de Unidades ficou mais aderente aos guardrails sem abrir nova camada nem relaxar arquitetura.
- Novos patches nessa área só se justificam com repro concreta.
