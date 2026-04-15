## Portal Morador
Status: MIGRADO
Tipo: wrapper estrutural
Risco: baixo
Testes: verdes

## Condomínios
Status: WRAPPER VALIDADO (flip binário por ENABLE_CONDOMINIOS_WRAPPER)
Risco: baixo
Testes: verdes (OFF/ON + contrato de rotas idêntico)
Notas: alias /condominio preservado

## Clínica
Status: MIGRADO (auditado)
Risco: baixo
Testes: clinica.public-contract + watchdog OK
Notas: contrato de rotas congelado (clinica-route-contract.md)

## Gestor
Status: HIBRIDO CONTROLADO (wrapper validado + infra tenant-aware existente)
Risco: medio-baixo
Testes: gestor.public-contract + gestor.handle-leak + gestor.root-compat + watchdog OK; suites focais verdes nos slices checkpointados
Notas:
 Concluido: infra tenant-aware em src/shared/db/ com resolveConnection e resolveModel sustentando routing multi-db/tenant; reducao local da bridge checkpointada em checkpoint-bridge-subfase-1 e bridge-subfase-2; pages/auth-context checkpointado em checkpoint-pages-auth-context-subfase-1 com requireLogin, requireRole e requireUnitScope priorizando contexto canonico nos fluxos criticos; paginas principais em modo context-first com fallback legado controlado; leitura contextual de Unidades com reducao local da bridge checkpointada em checkpoint-unidades-read-slice-1 e checkpoint-unidades-read-slice-2; Recursos com isolamento por unidade corrigido e checkpointado em 913c2cd e checkpoint-recursos-unit-isolation-slice-1, incluindo listagem isolada por unidade e exigencia de unidade_id explicito em create/update; baseline documental atual em 25a8208 com a vigesima segunda fatia macro de Auth login pre-auth gate checkpointada, consolidando a fronteira service -> data facade -> repository e fechando o corredor sem tocar em controller, rota, contrato HTTP ou auth.db.js.
