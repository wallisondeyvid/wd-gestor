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
Status: WRAPPER VALIDADO (flip binário por ENABLE_GESTOR_WRAPPER)
Risco: baixo
Testes: gestor.public-contract + gestor.handle-leak + gestor.root-compat + watchdog OK
Notas: contrato de rotas e compat root congelados (gestor-route-contract.md + gestor-compat-root.md)
