# WD Gestor

## Modelo Oficial de Execução da Assembleia

Versão: 1.0 Gerado em: 18/02/2026 22:35:36

------------------------------------------------------------------------

# 1. Estados Formais da Assembleia

A assembleia possui estados determinísticos:

-   AGENDADA
-   ABERTA
-   EM_PAUTA
-   EM_VOTACAO
-   ENCERRADA
-   FINALIZADA
-   CANCELADA

Nenhuma transição fora da máquina de estados é permitida.

------------------------------------------------------------------------

# 2. Máquina de Estados

AGENDADA -\> ABERTA\
ABERTA -\> EM_PAUTA\
EM_PAUTA -\> EM_VOTACAO\
EM_VOTACAO -\> EM_PAUTA\
EM_PAUTA -\> ENCERRADA\
ENCERRADA -\> FINALIZADA\
AGENDADA -\> CANCELADA

Transições inválidas devem gerar erro de domínio.

------------------------------------------------------------------------

# 3. Lock do Mediador

-   Apenas um usuário pode operar a assembleia.
-   Lock é adquirido ao iniciar (estado ABERTA).
-   Lock expira por:
    -   Finalização
    -   Encerramento manual
    -   Timeout configurável
-   Lock deve ser persistido no banco.

Campos sugeridos: - executionLock.active - executionLock.userId -
executionLock.startedAt

------------------------------------------------------------------------

# 4. Modelo Mínimo de Dados

assembleia: - tipo: presencial \| virtual \| hibrida - estadoAtual -
configuracaoQuorum - configuracaoVotacao - executionLock - pautas\[\] -
presencas\[\] - votacoes\[\] - logEventos\[\]

------------------------------------------------------------------------

# 5. Endpoints Essenciais

POST /assembleias/:id/start\
POST /assembleias/:id/open-pauta\
POST /assembleias/:id/open-votacao\
POST /assembleias/:id/close-votacao\
POST /assembleias/:id/encerrar\
POST /assembleias/:id/finalizar

Todos devem validar: - Lock do mediador - Estado atual - Regras de
domínio

------------------------------------------------------------------------

# 6. Auditoria

Toda ação deve gerar log imutável contendo: - userId - ação -
timestamp - estadoAnterior - estadoNovo

------------------------------------------------------------------------

# 7. Princípios

-   O WD Gestor adapta-se ao regimento do condomínio.
-   Nenhuma regra fixa deve ser imposta.
-   Configurações devem ser definidas antes da convocação.

------------------------------------------------------------------------

Documento base para implementação segura da Execução da Assembleia.
