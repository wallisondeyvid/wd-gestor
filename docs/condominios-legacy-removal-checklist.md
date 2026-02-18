# Condomínios Legacy Removal Checklist

- Pré-requisitos:
  - Contrato congelado em `docs/condominios-route-contract.md`
  - Wrapper ON/OFF validado com testes verdes
  - Alias `/condominio` validado nos dois modos

- Passos de remoção:
  - Remover entrada do módulo legado do `registry` (manter apenas wrapper)
  - Manter alias `/condominio` apontando para o módulo ativo
  - Reexecutar testes de contrato/paridade/open handles

- Rollback:
  - Restaurar registro do módulo legado no `registry`
  - Desabilitar wrapper via `ENABLE_CONDOMINIOS_WRAPPER!=1`
  - Reexecutar suíte de validação
