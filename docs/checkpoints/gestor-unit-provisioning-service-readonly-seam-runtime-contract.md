# Checkpoint: Gestor Unit Provisioning Service Readonly Seam Runtime Contract

Data: 2026-03-27
Escopo: prova estrutural focal da nova seam read-only em [src/modules/gestor/app/services/UnitProvisioningService.js](src/modules/gestor/app/services/UnitProvisioningService.js)
Suite focal: [tests/gestor-unit-provisioning-service-readonly-seam.test.js](tests/gestor-unit-provisioning-service-readonly-seam.test.js)
Execucao focal: `node --test .\tests\gestor-unit-provisioning-service-readonly-seam.test.js`

## Wiring estrutural validado

- a fachada [src/modules/gestor/app/services/UnitProvisioningService.js](src/modules/gestor/app/services/UnitProvisioningService.js) passou a delegar `inspectUnitProvisioning` e `listUnitProvisioningAuditEvents` diretamente ao use case canonico
- as exportacoes `ensureUnitProvisioned`, `retryUnitProvisioning` e `isUnitProvisioningValidationError` permanecem vindo da bridge atual
- a superficie publica da fachada permanece hibrida de forma explicita e auditavel

## Comportamentos estruturais validados

- `inspectUnitProvisioning` continua exportado com o mesmo nome e repassa input e retorno ao use case canonico
- `listUnitProvisioningAuditEvents` continua exportado com o mesmo nome e repassa input e retorno ao use case canonico
- o slice read-only ficou desintermediado sem tocar nas operacoes com efeito externo

## Limite desta prova

- esta suite nao reabre controller, rota, middleware ou contrato HTTP
- esta suite nao mede comportamento funcional dos owners; ela valida apenas a costura estrutural da fachada read-only
- esta suite nao toca em `ensureUnitProvisioned`, `retryUnitProvisioning` ou `isUnitProvisioningValidationError`

## Decisao final

- a nova seam read-only de [src/modules/gestor/app/services/UnitProvisioningService.js](src/modules/gestor/app/services/UnitProvisioningService.js) ficou validada estruturalmente neste recorte
- com essa prova, o primeiro patch da retomada repository-first nesta fachada atinge congelamento intermediario

## Confirmacao explicita

- producao nao foi alterada nesta rodada, alem de [src/modules/gestor/app/services/UnitProvisioningService.js](src/modules/gestor/app/services/UnitProvisioningService.js) ja mudado anteriormente
- testes antigos nao foram alterados
- checkpoints antigos nao foram alterados
- controller, rota, middleware, contrato HTTP e operacoes com efeito externo da fachada permaneceram intactos