# Checkpoint: Gestor Unidade Provisioning Status Owner Structural Seam Runtime Contract

Data: 2026-03-27
Escopo: prova estrutural focal da costura controller -> service do owner read-only `getUnidadeProvisioningStatus` em [src/modules/gestor/app/controllers/unidadeApiController.js](src/modules/gestor/app/controllers/unidadeApiController.js)
Suite focal: [tests/gestor-unidade-provisioning-status-owner-structural-seam.test.js](tests/gestor-unidade-provisioning-status-owner-structural-seam.test.js)
Execucao focal: `node --test .\tests\gestor-unidade-provisioning-status-owner-structural-seam.test.js`

## Wiring estrutural validado

- `getUnidadeProvisioningStatus` passou a delegar o fluxo semantico ao service owner [src/modules/gestor/app/services/unidades/getUnidadeProvisioningStatusOwner.service.js](src/modules/gestor/app/services/unidades/getUnidadeProvisioningStatusOwner.service.js)
- o controller continua dono do contrato HTTP, convertendo `kind` semantico em `badRequest`, `notFound` e `ok`
- o controller continua aplicando `normalizeProvisioningSnapshotResponse(snapshot)` apenas no ramo de sucesso

## Comportamentos estruturais validados

- o controller repassa apenas `unidadeId` e um callback minimo de autorizacao para o service owner
- o service owner preserva o shape semantico tipado com ramos `bad_request`, `not_found`, `forbidden` e `ok`
- o service owner continua chamando `inspectUnitProvisioning` apenas com `{ unidadeId }`

## Limite desta prova

- esta suite nao reabre `getUnidadeProvisioningEvents`, `retryUnidadeProvisioning`, escrita, rota, middleware ou contrato HTTP
- esta suite nao mede o comportamento funcional completo do endpoint no app real; ela valida apenas a costura estrutural controller -> service deste owner read-only
- nenhuma outra area de producao foi alterada nesta rodada

## Decisao final

- a nova costura controller -> service de `getUnidadeProvisioningStatus` ficou validada estruturalmente neste recorte
- com essa prova, o primeiro patch da desintermediacao controller -> service neste corredor atinge congelamento intermediario

## Confirmacao explicita

- producao nao foi alterada nesta rodada, alem de [src/modules/gestor/app/controllers/unidadeApiController.js](src/modules/gestor/app/controllers/unidadeApiController.js) e [src/modules/gestor/app/services/unidades/getUnidadeProvisioningStatusOwner.service.js](src/modules/gestor/app/services/unidades/getUnidadeProvisioningStatusOwner.service.js) ja mudados anteriormente
- testes antigos nao foram alterados
- checkpoints antigos nao foram alterados
- `getUnidadeProvisioningEvents`, `retryUnidadeProvisioning`, rota, middleware e contrato HTTP permaneceram intactos